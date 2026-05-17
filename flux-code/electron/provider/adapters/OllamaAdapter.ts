import { type ChildProcess } from 'child_process';
import type { ProviderAdapter } from '../ProviderAdapter';
import type {
  ProviderKind, ProviderRuntimeEvent, ProviderStatus,
  SessionStartOpts, TurnSendOpts,
} from '../types';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

interface SessionState {
  model: string;
  projectPath: string;
  history: Array<{ role: string; content: string }>;
  abortCtrl: AbortController;
  turnId: string | null;
}

export class OllamaAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'ollama';

  private sessions = new Map<string, SessionState>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json() as { models?: Array<{ name: string; size: number }> };
      if (!Array.isArray(data.models) || data.models.length === 0) {
        return { kind: 'not-authenticated', installCmd: 'ollama pull llama3.3' };
      }
      const models = data.models.sort((a, b) => b.size - a.size).map((m) => m.name);
      return { kind: 'ready', models };
    } catch {
      return { kind: 'not-installed' };
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

    session.turnId = opts.turnId;
    this.emit({ type: 'turn.started', sessionId: opts.sessionId, turnId: opts.turnId });

    let fullPrompt = opts.prompt;
    if (opts.contextFiles?.length) {
      const fileContents = await this.readFiles(opts.contextFiles);
      fullPrompt = `${fileContents}\n\n---\n\n${opts.prompt}`;
    }

    session.history.push({ role: 'user', content: fullPrompt });

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
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
              this.emit({ type: 'content.delta', sessionId: opts.sessionId, turnId: opts.turnId, text: token });
            }
            if (data.done) { reader.cancel(); break; }
          } catch { /* ignore malformed lines */ }
        }
      }

      session.history.push({ role: 'assistant', content: fullContent });
      this.emit({ type: 'turn.completed', sessionId: opts.sessionId, turnId: opts.turnId });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      let message = err.message || 'Unknown Ollama error';
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        message = `Ollama is not running. Start it with: ollama serve`;
      }
      this.emit({ type: 'turn.error', sessionId: opts.sessionId, turnId: opts.turnId, message });
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
    // Ollama doesn't have approvals
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
