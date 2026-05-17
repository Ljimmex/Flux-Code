import type { ProviderAdapter } from '../ProviderAdapter';
import type {
  ProviderKind, ProviderRuntimeEvent, ProviderStatus,
  SessionStartOpts, TurnSendOpts,
} from '../types';

const KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

interface SessionState {
  model: string;
  projectPath: string;
  history: Array<{ role: string; content: string }>;
  abortCtrl: AbortController;
  turnId: string | null;
}

/**
 * Kimi (Moonshot AI) adapter.
 * Uses REST API with OpenAI-compatible format.
 * API key stored locally in ~/.config/kimi/auth.json or env var.
 */
export class KimiAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'kimi';

  private sessions = new Map<string, SessionState>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    const apiKey = this.readApiKey();
    if (!apiKey) {
      return { kind: 'not-authenticated', installCmd: 'kimi-cli auth login' };
    }

    try {
      const res = await fetch(`${KIMI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { kind: 'not-authenticated', installCmd: 'kimi-cli auth login' };
      }
      const data = await res.json() as { data: Array<{ id: string }> };
      const models = data.data.map((m) => m.id).filter((id) => id.startsWith('kimi'));
      return { kind: 'ready', models: models.length ? models : ['kimi-k2.6', 'kimi-k2.5'] };
    } catch {
      return { kind: 'error', message: 'Cannot connect to api.moonshot.ai' };
    }
  }

  async startSession(opts: SessionStartOpts): Promise<void> {
    this.emit({ type: 'session.starting', sessionId: opts.sessionId });
    this.sessions.set(opts.sessionId, {
      model: opts.model,
      projectPath: opts.projectPath,
      history: opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : [],
      abortCtrl: new AbortController(),
      turnId: null,
    });
    this.emit({ type: 'session.ready', sessionId: opts.sessionId });
  }

  async resumeSession(opts: SessionStartOpts): Promise<void> {
    await this.startSession(opts);
  }

  async sendTurn(opts: TurnSendOpts): Promise<void> {
    const session = this.sessions.get(opts.sessionId);
    if (!session) throw new Error(`Session ${opts.sessionId} not found`);

    const apiKey = this.readApiKey();
    if (!apiKey) {
      this.emit({ type: 'turn.error', sessionId: opts.sessionId, turnId: opts.turnId, message: 'No Kimi API key configured' });
      return;
    }

    session.turnId = opts.turnId;
    this.emit({ type: 'turn.started', sessionId: opts.sessionId, turnId: opts.turnId });

    let fullPrompt = opts.prompt;
    if (opts.contextFiles?.length) {
      const fileContents = await this.readFiles(opts.contextFiles);
      fullPrompt = `${fileContents}\n\n---\n\n${opts.prompt}`;
    }

    session.history.push({ role: 'user', content: fullPrompt });

    try {
      const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
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
              this.emit({ type: 'content.delta', sessionId: opts.sessionId, turnId: opts.turnId, text: token });
            }
          } catch { /* ignore malformed */ }
        }
      }

      session.history.push({ role: 'assistant', content: fullContent });
      this.emit({ type: 'turn.completed', sessionId: opts.sessionId, turnId: opts.turnId });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.emit({ type: 'turn.error', sessionId: opts.sessionId, turnId: opts.turnId, message: err.message || 'Unknown Kimi error' });
    } finally {
      session.turnId = null;
    }
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.abortCtrl.abort();
    session.abortCtrl = new AbortController();
  }

  async respondToApproval(): Promise<void> {
    // Kimi doesn't have approvals
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.abortCtrl.abort();
    this.sessions.delete(sessionId);
    this.emit({ type: 'session.stopped', sessionId });
  }

  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ProviderRuntimeEvent) {
    this.eventHandlers.forEach((h) => h(event));
  }

  private readApiKey(): string | null {
    try {
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const authFile = path.join(os.homedir(), '.config', 'kimi', 'auth.json');
      if (fs.existsSync(authFile)) {
        const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        return data.apiKey ?? null;
      }
    } catch { /* ignore */ }
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
