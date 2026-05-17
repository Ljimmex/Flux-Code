import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import type { ProviderAdapter } from '../ProviderAdapter';
import type {
  ProviderKind, ProviderRuntimeEvent, ProviderStatus,
  SessionStartOpts, TurnSendOpts,
} from '../types';

/**
 * Claude Code adapter.
 * Spawns `claude` CLI subprocess and translates output to ProviderRuntimeEvents.
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'claude';

  private sessions = new Map<string, {
    process: ChildProcess;
    turnId: string | null;
    abortCtrl: AbortController;
  }>();

  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    try {
      execSync('claude --version', { timeout: 5000, stdio: 'ignore', shell: process.platform === 'win32' || undefined } as any);
    } catch {
      return { kind: 'not-installed' };
    }

    try {
      execSync('claude auth status', { timeout: 5000, stdio: 'ignore', shell: process.platform === 'win32' || undefined } as any);
      return { kind: 'ready', models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'] };
    } catch {
      return { kind: 'not-authenticated', installCmd: 'claude auth login' };
    }
  }

  async startSession(opts: SessionStartOpts): Promise<void> {
    this.emit({ type: 'session.starting', sessionId: opts.sessionId });

    const proc = spawn('claude', ['--model', opts.model], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    const abortCtrl = new AbortController();
    this.sessions.set(opts.sessionId, { process: proc, turnId: null, abortCtrl });

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      const session = this.sessions.get(opts.sessionId);
      if (session?.turnId && line.trim()) {
        this.emit({ type: 'content.delta', sessionId: opts.sessionId, turnId: session.turnId, text: line + '\n' });
      }
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        this.emit({ type: 'session.error', sessionId: opts.sessionId, message: text.trim() });
      }
    });

    proc.on('error', (err) => {
      this.emit({ type: 'session.error', sessionId: opts.sessionId, message: err.message });
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.emit({ type: 'session.error', sessionId: opts.sessionId, message: `Claude exited with code ${code}` });
      }
      this.sessions.delete(opts.sessionId);
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

    const prompt = opts.prompt + '\n';
    session.process.stdin!.write(prompt);

    setTimeout(() => {
      if (session.turnId === opts.turnId) {
        this.emit({ type: 'turn.completed', sessionId: opts.sessionId, turnId: opts.turnId });
        session.turnId = null;
      }
    }, 100);
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.process.kill('SIGINT');
  }

  async respondToApproval(sessionId: string, _requestId: string, approved: boolean): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.process.stdin!.write(approved ? 'y\n' : 'n\n');
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.process.kill('SIGTERM');
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
}
