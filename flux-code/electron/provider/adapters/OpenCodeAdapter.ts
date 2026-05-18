import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { execSync, exec } from 'child_process';
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
  type OpenCodeModel,
  checkOpenCodeVersion,
  fetchOpenCodeModels,
  getCliVersion,
} from '../../model';

/**
 * OpenCode adapter.
 *
 * OpenCode CLI defaults to TUI mode which does not work with piped stdio.
 * We use `opencode run` (non-interactive) per turn — each sendTurn spawns
 * a new process. Session state (model, cwd, variant) is kept in-memory.
 */
export class OpenCodeAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'opencode';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'opencode';

  /** Tracks in-flight run processes per thread */
  private sessions = new Map<number, {
    process: ChildProcess;
    turnId: string;
  }>();

  /** Lightweight session state (no live process) */
  private sessionState = new Map<number, {
    model?: string;
    cwd: string;
    runtimeMode?: string;
    variant?: string;
  }>();

  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();
  private modelCache: OpenCodeModel[] | null = null;

  setBinaryPath(path: string) {
    this.binaryPath = path || 'opencode';
  }

  async probe(): Promise<ProviderStatus> {
    const version = getCliVersion(this.binaryPath);
    const versionCheck = checkOpenCodeVersion(this.binaryPath);
    if (!versionCheck.ok) {
      if (versionCheck.reason === 'not_installed') {
        return { kind: 'not-installed', version };
      }
      return {
        kind: 'error',
        message: versionCheck.reason === 'version_too_old'
          ? `OpenCode ${versionCheck.version} is too old. Minimum: 1.14.19`
          : 'Unknown OpenCode version error',
        version,
      };
    }

    // Fetch dynamic models via --json (aligned with T3 Code)
    const models = await fetchOpenCodeModels(this.binaryPath);
    this.modelCache = models;
    // Models cached for variant lookup
    if (models.length === 0) {
      return { kind: 'ready', models: [], version };
    }
    return { kind: 'ready', models: models.map((m) => m.id), version };
  }

  /** Return cached model metadata (including variants). */
  getCachedModels(): OpenCodeModel[] {
    return this.modelCache ?? [];
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    // Note: session/connecting and session/ready are emitted by ProviderService
    // via ProviderSessionDirectory. Adapter should NOT emit them to avoid duplicates.

    const model = input.model ?? 'deepseek-v4-flash-free';

    // Store lightweight state — no persistent process for OpenCode
    this.sessionState.set(input.threadId, {
      model,
      cwd: input.cwd ?? '.',
      runtimeMode: input.runtimeMode,
      variant: input.providerOptions?.opencode?.variant as string | undefined,
    });

    return {
      provider: 'opencode',
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
    const inflight = this.sessions.get(threadId);
    if (inflight) {
      inflight.process.kill('SIGTERM');
      this.sessions.delete(threadId);
    }
    this.sessionState.delete(threadId);
    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'opencode',
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
    const state = this.sessionState.get(input.threadId);
    if (!state) {
      throw new Error(`No session state for thread ${input.threadId}. Call startSession first.`);
    }

    const turnId = generateTurnId();

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'opencode',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    const prompt = input.input ?? '';

    // opencode run requires provider/model format (e.g. opencode/deepseek-v4-flash-free)
    const modelId = state.model ?? 'deepseek-v4-flash-free';
    const fullModelId = modelId.includes('/') ? modelId : `opencode/${modelId}`;
    console.log('[OpenCodeAdapter] Using model:', fullModelId);

    const args: string[] = ['run', '--model', fullModelId, prompt];

    if (state.variant) {
      args.push('--variant', state.variant);
    }

    console.log('[OpenCodeAdapter] Spawning:', this.binaryPath, args.join(' '));

    const proc = spawn(this.binaryPath, args, {
      cwd: state.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: fullModelId }),
      },
    });

    this.sessions.set(input.threadId, { process: proc, turnId });

    let stdoutAccum = '';
    let stderrAccum = '';
    const openToolIds = new Set<string>();

    // Parse stderr for synthetic tool events (OpenCode doesn't emit structured events)
    const stderrRl = createInterface({ input: proc.stderr! });
    stderrRl.on('line', (rawLine) => {
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (!line) return;
      stderrAccum += line + '\n';
      console.log('[OpenCodeAdapter] stderr:', line);

      // → Read <path>
      const readMatch = line.match(/^→\s*Read\s+(.+)$/i);
      if (readMatch) {
        const path = readMatch[1].trim();
        const toolId = `read-${path}`;
        openToolIds.add(toolId);
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/started',
          turnId,
          itemId: toolId,
          toolName: 'read_file',
          payload: { path, command: line },
        });
        return;
      }

      // → Edit <path>  or  → Write <path>
      const editMatch = line.match(/^→\s*(?:Edit|Write)\s+(.+)$/i);
      if (editMatch) {
        const path = editMatch[1].trim();
        const toolId = `edit-${path}`;
        openToolIds.add(toolId);
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/started',
          turnId,
          itemId: toolId,
          toolName: 'str_replace_editor',
          payload: { path, command: line },
        });
        return;
      }

      // ✱ Glob "<pattern>" N matches
      const globMatch = line.match(/^✱\s*Glob\s+"(.+?)"\s+(.+)$/i);
      if (globMatch) {
        const pattern = globMatch[1];
        const toolId = `glob-${pattern}`;
        openToolIds.add(toolId);
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/started',
          turnId,
          itemId: toolId,
          toolName: 'bash',
          payload: { command: line },
        });
        return;
      }

      // → Bash <cmd>  or  → Run <cmd>
      const runMatch = line.match(/^→\s*(?:Bash|Run|Shell)\s+(.+)$/i);
      if (runMatch) {
        const cmd = runMatch[1].trim();
        const toolId = `run-${cmd}`;
        openToolIds.add(toolId);
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/started',
          turnId,
          itemId: toolId,
          toolName: 'bash',
          payload: { command: line },
        });
        return;
      }
    });

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (rawLine) => {
      // Strip ANSI escape codes (e.g. [0m, [91m) so markdown parsers work correctly
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
      console.log('[OpenCodeAdapter] stdout line:', line);
      stdoutAccum += line + '\n';
      if (line.trim()) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/agentMessage/delta',
          turnId,
          textDelta: line + '\n',
        });
      }
    });

    proc.on('error', (err) => {
      console.error('[OpenCodeAdapter] proc error:', err.message);
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'opencode',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        message: err.message,
      });
      this.sessions.delete(input.threadId);
    });

    let completedEmitted = false;
    const emitCompleted = () => {
      if (completedEmitted) return;
      completedEmitted = true;

      // Close all open synthetic tool events
      for (const itemId of openToolIds) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/completed',
          turnId,
          itemId,
        });
      }
      openToolIds.clear();

      this.emit({
        id: generateEventId(),
        kind: 'notification',
        provider: 'opencode',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'turn/completed',
        turnId,
      });
    };

    proc.on('exit', (code) => {
      console.log('[OpenCodeAdapter] proc exit code:', code, 'stderr:', stderrAccum.trim() || '(empty)', 'stdout:', stdoutAccum.trim() || '(empty)');
      console.log('[OpenCodeAdapter] stdout raw (first 300 chars):', JSON.stringify(stdoutAccum.slice(0, 300)));
      if (code !== 0 && code !== null) {
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/turn',
          message: `OpenCode exited with code ${code}. stderr: ${stderrAccum.trim() || '(empty)'}`,
        });
      }
      emitCompleted();
      this.sessions.delete(input.threadId);
    });

    console.log('[OpenCodeAdapter] proc.pid:', proc.pid);

    // Safety timeout — kill opencode if it hangs for > 30s (free models can be slow)
    const safetyTimeout = setTimeout(() => {
      console.warn('[OpenCodeAdapter] Safety timeout (30s) — killing hung process for thread', input.threadId);
      proc.kill('SIGTERM');
    }, 30_000);
    proc.on('exit', () => clearTimeout(safetyTimeout));

    return { turnId };
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const inflight = this.sessions.get(threadId);
    if (!inflight) return;
    inflight.process.kill('SIGINT');
  }

  async respondToRequest(threadId: number, _requestId: string, _decision: ProviderApprovalDecision): Promise<void> {
    // opencode run is non-interactive — approvals are handled by the CLI internally
    const inflight = this.sessions.get(threadId);
    if (!inflight) return;
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Not supported in run mode
  }

  async readThread(_threadId: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async rollbackThread(_threadId: number, _numTurns: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessionState.entries()).map(([threadId, state]) => ({
      provider: 'opencode' as const,
      status: 'ready' as const,
      runtimeMode: (state.runtimeMode ?? 'approval-required') as any,
      threadId,
      model: state.model,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async hasSession(threadId: number): Promise<boolean> {
    return this.sessionState.has(threadId);
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
