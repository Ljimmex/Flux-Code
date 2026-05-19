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
import { generateEventId, generateTurnId } from '../types';
import {
  CLAUDE_MODELS,
  type ClaudeModelOptions,
  type ClaudeCapabilities,
  normalizeClaudeModel,
  probeClaudeCapabilities,
  getCliVersion,
} from '../../model';

const CLAUDE_MODEL_SLUGS = CLAUDE_MODELS.map((m) => m.slug);

/**
 * Claude Code adapter.
 * Spawns `claude` CLI subprocess and translates output to ProviderRuntimeEvents.
 */
export class ClaudeAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'claudeCode';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'claude';

  private sessions = new Map<number, {
    process: ChildProcess;
    turnId: string | null;
    abortCtrl: AbortController;
    lastOutputTime: number;
  }>();

  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();
  private capabilitiesCache: ClaudeCapabilities | null = null;

  setBinaryPath(path: string) {
    this.binaryPath = path || 'claude';
  }

  async probe(): Promise<ProviderStatus> {
    const version = getCliVersion(this.binaryPath);
    try {
      const opts = { timeout: 5_000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} --version`, opts);
    } catch {
      return { kind: 'not-installed', models: CLAUDE_MODEL_SLUGS, version };
    }

    try {
      const opts = { timeout: 5_000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} auth status`, opts);
    } catch (err: any) {
      if (err.code === 'ENOENT' || (err.message && err.message.includes('auth status'))) {
        // some versions don't have auth status
      } else {
        return { kind: 'not-authenticated', installCmd: 'claude auth login', models: CLAUDE_MODEL_SLUGS, version };
      }
    }

    this.capabilitiesCache = probeClaudeCapabilities(this.binaryPath);
    return { kind: 'ready', models: CLAUDE_MODEL_SLUGS, version };
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const resolvedModel = normalizeClaudeModel(input.model ?? '');
    const modelOptions: ClaudeModelOptions = (input as any).modelOptions ?? { effort: 'medium', thinking: false, fastMode: false };

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'claudeCode',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const args = ['--model', resolvedModel];
    if (modelOptions.fastMode) args.push('--fast-mode');
    if (modelOptions.thinking && this.capabilitiesCache?.supportsThinking) args.push('--thinking');

    const extraEnv = input.providerOptions?.claudeCode?.env;
    const proc = spawn(this.binaryPath, args, {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(extraEnv ?? {}), FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    const abortCtrl = new AbortController();
    this.sessions.set(input.threadId, { process: proc, turnId: null, abortCtrl, lastOutputTime: Date.now() });

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      const session = this.sessions.get(input.threadId);
      if (session) {
        session.lastOutputTime = Date.now();
      }
      if (session?.turnId && line.trim()) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'claudeCode',
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
          provider: 'claudeCode',
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
        provider: 'claudeCode',
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
          provider: 'claudeCode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/session',
          message: `Claude exited with code ${code}`,
        });
      }
      this.sessions.delete(input.threadId);
    });

    return {
      provider: 'claudeCode',
      status: 'ready',
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model: resolvedModel,
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
      provider: 'claudeCode',
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
      provider: 'claudeCode',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    const prompt = (input.input ?? '') + '\n';
    session.process.stdin!.write(prompt);

    // Emit turn/completed after idle timeout (no stdout for 15s)
    const IDLE_TIMEOUT = 15000;
    const checkIdle = setInterval(() => {
      const s = this.sessions.get(input.threadId);
      if (s && s.turnId === turnId && Date.now() - s.lastOutputTime > IDLE_TIMEOUT) {
        clearInterval(checkIdle);
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'claudeCode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'turn/completed',
          turnId,
        });
        s.turnId = null;
      }
    }, 1000);

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
      provider: 'claudeCode' as const,
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
