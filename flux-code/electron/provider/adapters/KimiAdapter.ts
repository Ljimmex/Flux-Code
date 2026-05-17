import type { ProviderAdapterShape } from '../ProviderAdapter';
import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderStatus,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSendTurnInput,
  ProviderTurnStartResult,
  ProviderThreadSnapshot,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from '../types';
import { generateEventId, generateTurnId } from '../types';

const KIMI_DEFAULT_URL = 'https://api.moonshot.ai/v1';

interface SessionState {
  model: string;
  projectPath: string;
  history: Array<{ role: string; content: string }>;
  abortCtrl: AbortController;
  turnId: string | null;
  baseUrl: string;
}

/**
 * Kimi (Moonshot AI) adapter.
 * Uses REST API with OpenAI-compatible format.
 */
export class KimiAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'kimi';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'kimi-cli';

  setBinaryPath(_path: string) {
    // Kimi uses REST API; binary path is not used for spawn.
  }

  private sessions = new Map<number, SessionState>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    const apiKey = this.readApiKey();
    const fallbackModels = ['kimi-k2.6', 'kimi-k2.5'];
    if (!apiKey) {
      return { kind: 'not-authenticated', installCmd: 'kimi-cli auth login', models: fallbackModels };
    }
    return { kind: 'ready', models: fallbackModels };
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const baseUrl = input.providerOptions?.kimi?.serverUrl ?? KIMI_DEFAULT_URL;
    this.sessions.set(input.threadId, {
      model: input.model ?? 'kimi-k2.6',
      projectPath: input.cwd ?? '',
      history: input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : [],
      abortCtrl: new AbortController(),
      turnId: null,
      baseUrl,
    });

    return {
      provider: 'kimi',
      status: 'ready',
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model: input.model,
      cwd: input.cwd,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
    };
  }

  async stopSession(threadId: number): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    session.abortCtrl.abort();
    this.sessions.delete(threadId);
    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'kimi',
      threadId,
      createdAt: new Date().toISOString(),
      method: 'session/closed',
    });
  }

  async stopAll(): Promise<void> {
    for (const threadId of Array.from(this.sessions.keys())) {
      await this.stopSession(threadId);
    }
  }

  async sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult> {
    const session = this.sessions.get(input.threadId);
    if (!session) throw new Error(`Session for thread ${input.threadId} not found`);

    const apiKey = this.readApiKey();
    if (!apiKey) {
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        message: 'No Kimi API key configured',
      });
      return { turnId: generateTurnId() };
    }

    const turnId = generateTurnId();
    session.turnId = turnId;

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    let fullPrompt = input.input ?? '';
    if (input.attachments?.length) {
      const fileContents = await this.readFiles(input.attachments.map((a) => a.path));
      fullPrompt = `${fileContents}\n\n---\n\n${fullPrompt}`;
    }

    session.history.push({ role: 'user', content: fullPrompt });

    try {
      const res = await fetch(`${session.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: session.model,
          messages: session.history,
          stream: true,
        }),
        signal: session.abortCtrl.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Kimi error (${res.status}): ${text}`);
      }

      if (!res.body) throw new Error('Kimi returned empty response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        if (session.abortCtrl.signal.aborted) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.trim() || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              fullContent += token;
              this.emit({
                id: generateEventId(),
                kind: 'notification',
                provider: 'kimi',
                threadId: input.threadId,
                createdAt: new Date().toISOString(),
                method: 'item/agentMessage/delta',
                turnId,
                textDelta: token,
              });
            }
          } catch { /* ignore malformed */ }
        }
      }

      session.history.push({ role: 'assistant', content: fullContent });
      this.emit({
        id: generateEventId(),
        kind: 'notification',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'turn/completed',
        turnId,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        session.turnId = null;
        return { turnId };
      }
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        turnId,
        message: err.message || 'Unknown Kimi error',
      });
    } finally {
      session.turnId = null;
    }

    return { turnId };
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    session.abortCtrl.abort();
    session.abortCtrl = new AbortController();
  }

  async respondToRequest(_threadId: number, _requestId: string, _decision: ProviderApprovalDecision): Promise<void> {
    // Kimi doesn't have approvals
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Kimi doesn't have user-input requests
  }

  async readThread(threadId: number): Promise<ProviderThreadSnapshot> {
    const session = this.sessions.get(threadId);
    if (!session) return { turns: [] };
    return {
      turns: session.history.map((m, i) => ({
        turnId: `turn-${i}`,
        role: m.role as any,
        content: m.content,
        createdAt: new Date().toISOString(),
      })),
    };
  }

  async rollbackThread(threadId: number, numTurns: number): Promise<ProviderThreadSnapshot> {
    const session = this.sessions.get(threadId);
    if (!session) return { turns: [] };
    const removeCount = numTurns * 2;
    session.history = session.history.slice(0, Math.max(1, session.history.length - removeCount));
    return this.readThread(threadId);
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessions.entries()).map(([threadId, s]) => ({
      provider: 'kimi' as const,
      status: 'ready' as const,
      runtimeMode: 'full-access' as const,
      threadId,
      model: s.model,
      activeTurnId: s.turnId ?? undefined,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async hasSession(threadId: number): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ProviderRuntimeEvent) {
    for (const h of this.eventHandlers) {
      try {
        h(event);
      } catch {
        // ignore
      }
    }
  }

  private readApiKey(): string | null {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const candidates = [
      path.join(os.homedir(), '.config', 'kimi', 'auth.json'),
      path.join(os.homedir(), '.kimi', 'auth.json'),
      process.env.APPDATA ? path.join(process.env.APPDATA, 'kimi', 'auth.json') : '',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'kimi', 'auth.json') : '',
    ];

    for (const authFile of candidates) {
      if (!authFile) continue;
      try {
        if (fs.existsSync(authFile)) {
          const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
          if (data.apiKey) return data.apiKey;
        }
      } catch { /* ignore */ }
    }

    return process.env.MOONSHOT_API_KEY ?? null;
  }

  saveApiKey(apiKey: string): void {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const authFile = path.join(os.homedir(), '.config', 'kimi', 'auth.json');
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    fs.writeFileSync(authFile, JSON.stringify({ apiKey }, null, 2), { mode: 0o600 });
  }

  private async readFiles(paths: string[]): Promise<string> {
    const fsPromises = await import('fs/promises');
    const path = await import('path');
    const contents = await Promise.allSettled(
      paths.map(async (p) => {
        const content = await fsPromises.readFile(path.resolve(p), 'utf8');
        return `// File: ${p}\n\`\`\`\n${content}\n\`\`\``;
      }),
    );
    return contents
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value)
      .join('\n\n');
  }
}
