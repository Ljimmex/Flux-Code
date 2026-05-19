import { spawn } from 'child_process';
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
import { generateEventId, generateTurnId } from '../types';

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

/**
 * Antigravity CLI adapter.
 * Uses `agy --print` for non-interactive prompts.
 */
export class AntigravityAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'antigravity';
  readonly capabilities = { sessionModelSwitch: 'restart-session' as const };
  binaryPath = 'agy';

  setBinaryPath(path: string) {
    this.binaryPath = path || 'agy';
  }

  private sessions = new Map<number, {
    turnId: string | null;
    abortCtrl: AbortController;
    cwd: string;
  }>();

  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  async probe(): Promise<ProviderStatus> {
    try {
      const opts = { timeout: 5000, encoding: 'utf8' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      const version = execSync(`${this.binaryPath} --version`, opts).toString().trim();
      return { kind: 'ready', models: MODELS, version };
    } catch {
      return { kind: 'not-installed', models: MODELS };
    }
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'antigravity',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const abortCtrl = new AbortController();
    this.sessions.set(input.threadId, { turnId: null, abortCtrl, cwd: input.cwd || '.' });

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'antigravity',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'session/ready',
    });

    return {
      provider: 'antigravity',
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
      provider: 'antigravity',
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
      provider: 'antigravity',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    const args = ['--print', input.input ?? ''];
    if (process.platform !== 'win32') {
      // On non-Windows, auto-approve to avoid interactive prompts in print mode
      args.push('--dangerously-skip-permissions');
    }

    const proc = spawn(this.binaryPath, args, {
      cwd: session.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'antigravity',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        message: err.message,
        turnId,
      });
    });

    proc.on('exit', (code) => {
      const text = stdout || stderr;

      if (code !== 0 && !text) {
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'antigravity',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/turn',
          message: stderr || `Antigravity exited with code ${code}`,
          turnId,
        });
        this.emitTurnCompleted(input.threadId, turnId);
        return;
      }

      if (text) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'antigravity',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/agentMessage/delta',
          turnId,
          textDelta: text,
        });
      }

      this.emitTurnCompleted(input.threadId, turnId);
    });

    return { turnId };
  }

  private emitTurnCompleted(threadId: number, turnId: string) {
    const session = this.sessions.get(threadId);
    if (session?.turnId === turnId) {
      this.emit({
        id: generateEventId(),
        kind: 'notification',
        provider: 'antigravity',
        threadId,
        createdAt: new Date().toISOString(),
        method: 'turn/completed',
        turnId,
      });
      session.turnId = null;
    }
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    session.abortCtrl.abort();
  }

  async respondToRequest(threadId: number, _requestId: string, _decision: ProviderApprovalDecision): Promise<void> {
    // Antigravity --print mode doesn't support interactive approvals
    const session = this.sessions.get(threadId);
    if (!session) return;
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Not supported in print mode
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
      provider: 'antigravity' as const,
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
