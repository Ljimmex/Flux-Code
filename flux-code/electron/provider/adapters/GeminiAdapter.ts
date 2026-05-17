import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
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
import { getCliVersion } from '../../model';
import { generateEventId, generateTurnId } from '../types';

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

/**
 * Gemini adapter.
 * Spawns `gemini` CLI subprocess.
 */
export class GeminiAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'gemini';
  readonly capabilities = { sessionModelSwitch: 'restart-session' as const };
  binaryPath = 'gemini';

  setBinaryPath(path: string) {
    this.binaryPath = path || 'gemini';
  }

  private sessions = new Map<number, {
    process: ChildProcess;
    turnId: string | null;
    abortCtrl: AbortController;
  }>();

  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    const version = getCliVersion(this.binaryPath);
    try {
      const opts = { timeout: 5000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} --version`, opts);
    } catch {
      return { kind: 'not-installed', models: MODELS, version };
    }

    try {
      const opts = { timeout: 5000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} auth status`, opts);
      return { kind: 'ready', models: MODELS, version };
    } catch (err: any) {
      if (err.code === 'ENOENT' || (err.message && err.message.includes('auth status'))) {
        return { kind: 'ready', models: MODELS, version };
      }
      return { kind: 'not-authenticated', installCmd: 'gemini auth login', models: MODELS, version };
    }
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'gemini',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const extraEnv = input.providerOptions?.gemini?.env;
    const proc = spawn(this.binaryPath, ['--model', input.model ?? MODELS[0]], {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(extraEnv ?? {}), FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    const abortCtrl = new AbortController();
    this.sessions.set(input.threadId, { process: proc, turnId: null, abortCtrl });

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      const session = this.sessions.get(input.threadId);
      if (session?.turnId && line.trim()) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'gemini',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/agentMessage/delta',
          turnId: session.turnId,
          textDelta: line + '\n',
        });
      }
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'gemini',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/session',
          message: text.trim(),
        });
      }
    });

    proc.on('error', (err) => {
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'gemini',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/session',
        message: err.message,
      });
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'gemini',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/session',
          message: `Gemini exited with code ${code}`,
        });
      }
      this.sessions.delete(input.threadId);
    });

    return {
      provider: 'gemini',
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
    session.process.kill('SIGTERM');
    this.sessions.delete(threadId);
    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'gemini',
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

    const turnId = generateTurnId();
    session.turnId = turnId;

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'gemini',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    const prompt = (input.input ?? '') + '\n';
    session.process.stdin!.write(prompt);

    setTimeout(() => {
      if (session.turnId === turnId) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'gemini',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'turn/completed',
          turnId,
        });
        session.turnId = null;
      }
    }, 100);

    return { turnId };
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    session.process.kill('SIGINT');
  }

  async respondToRequest(threadId: number, _requestId: string, decision: ProviderApprovalDecision): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    session.process.stdin!.write(decision === 'allow' ? 'y\n' : 'n\n');
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Not supported in simplified CLI adapter
  }

  async readThread(_threadId: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async rollbackThread(_threadId: number, _numTurns: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessions.entries()).map(([threadId, s]) => ({
      provider: 'gemini' as const,
      status: 'ready' as const,
      runtimeMode: 'approval-required' as const,
      threadId,
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
}
