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

const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

interface SessionState {
  model: string;
  projectPath: string;
  history: Array<{ role: string; content: string }>;
  abortCtrl: AbortController;
  turnId: string | null;
  baseUrl: string;
}

/**
 * Ollama adapter.
 * Uses local HTTP server (not subprocess spawn for chat).
 */
export class OllamaAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'ollama';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'ollama';

  setBinaryPath(_path: string) {
    // Ollama uses a local HTTP server; binary path is not used for spawn.
  }

  private sessions = new Map<number, SessionState>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    try {
      const res = await fetch(`${OLLAMA_DEFAULT_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json() as { models?: Array<{ name: string; size: number }> };
      if (!Array.isArray(data.models) || data.models.length === 0) {
        return { kind: 'not-authenticated', installCmd: 'ollama pull llama3.3', models: ['llama3.3', 'llama3.2', 'mistral'] };
      }
      const models = data.models.sort((a, b) => b.size - a.size).map((m) => m.name);
      return { kind: 'ready', models };
    } catch {
      return { kind: 'not-installed', models: ['llama3.3', 'llama3.2', 'mistral'] };
    }
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'ollama',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const baseUrl = input.providerOptions?.ollama?.serverUrl ?? OLLAMA_DEFAULT_URL;
    this.sessions.set(input.threadId, {
      model: input.model ?? 'llama3.3',
      projectPath: input.cwd ?? '',
      history: input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : [],
      abortCtrl: new AbortController(),
      turnId: null,
      baseUrl,
    });

    return {
      provider: 'ollama',
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
      provider: 'ollama',
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

    const turnId = input.turnId || generateTurnId();
    session.turnId = turnId;

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'ollama',
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
      const response = await fetch(`${session.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: session.model,
          messages: session.history,
          stream: true,
        }),
        signal: session.abortCtrl.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama error (${response.status}): ${text}`);
      }

      if (!response.body) throw new Error('Ollama returned empty response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        if (session.abortCtrl.signal.aborted) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const token = data.message?.content || '';
            if (token) {
              fullContent += token;
              this.emit({
                id: generateEventId(),
                kind: 'notification',
                provider: 'ollama',
                threadId: input.threadId,
                createdAt: new Date().toISOString(),
                method: 'item/agentMessage/delta',
                turnId,
                textDelta: token,
              });
            }
            if (data.done) { reader.cancel(); break; }
          } catch { /* ignore malformed lines */ }
        }
      }

      session.history.push({ role: 'assistant', content: fullContent });
      this.emit({
        id: generateEventId(),
        kind: 'notification',
        provider: 'ollama',
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
      let message = err.message || 'Unknown Ollama error';
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        message = 'Ollama is not running. Start it with: ollama serve';
      }
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'ollama',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        turnId,
        message,
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
    // Ollama doesn't have approvals
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Ollama doesn't have user-input requests
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
    // Each turn = 2 messages (user + assistant). Remove last N*2 messages.
    const removeCount = numTurns * 2;
    session.history = session.history.slice(0, Math.max(1, session.history.length - removeCount));
    return this.readThread(threadId);
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessions.entries()).map(([threadId, s]) => ({
      provider: 'ollama' as const,
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

  private async readFiles(paths: string[]): Promise<string> {
    const fs = await import('fs/promises');
    const contents = await Promise.allSettled(
      paths.map(async (p) => {
        const content = await fs.readFile(p, 'utf8');
        return `// File: ${p}\n\`\`\`\n${content}\n\`\`\``;
      }),
    );
    return contents
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value)
      .join('\n\n');
  }
}
