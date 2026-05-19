import { type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { spawnCli } from './spawnCli';
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

    const turnId = input.turnId || generateTurnId();

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

    // Build args: all flags FIRST, then positional message LAST
    const args: string[] = ['run', '--model', fullModelId, '--dangerously-skip-permissions', '--format', 'json'];

    if (state.variant) {
      // Some variants like 'max' may not be supported by opencode CLI
      const safeVariant = state.variant === 'max' ? 'high' : state.variant;
      args.push('--variant', safeVariant);
    }

    // Positional message argument must come LAST after all flags
    args.push(prompt);

    console.log('[OpenCodeAdapter] Spawning:', this.binaryPath, JSON.stringify(args));
    console.log('[OpenCodeAdapter] cwd:', state.cwd);

    const proc = spawnCli(this.binaryPath, args, {
      cwd: state.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });

    this.sessions.set(input.threadId, { process: proc, turnId });

    let stdoutAccum = '';
    let stderrAccum = '';
    const openToolIds = new Set<string>();

    // Parse stderr for synthetic tool events (OpenCode progress/status info)
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

      // Detect ERROR logs
      if (line.includes('ERROR ') && line.includes('error=')) {
        console.error('[OpenCodeAdapter] Detected error in stderr:', line);
        let errorMsg = 'An error occurred during execution';
        const errorJsonMatch = line.match(/error=({.*})/);
        if (errorJsonMatch) {
          try {
            const errObj = JSON.parse(errorJsonMatch[1]);
            if (errObj.error) {
               const name = errObj.error.name || 'Error';
               let details = errObj.error.message || errObj.error.reason || errObj.error.responseBody;
               
               // If it's a RetryError, try to extract the root cause from the nested errors array
               if (name === 'AI_RetryError' && Array.isArray(errObj.error.errors) && errObj.error.errors.length > 0) {
                 const rootErr = errObj.error.errors[0];
                 details = rootErr.message || rootErr.reason || rootErr.responseBody || 'API Call failed';
               }
               
               if (typeof details === 'object') details = JSON.stringify(details);
               errorMsg = `${name}: ${details || 'API Call failed'}`;
            }
          } catch (e) {}
        } else {
           errorMsg = line;
        }

        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'opencode',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/turn',
          message: errorMsg,
        });

        if (line.includes('AI_APICallError') || line.includes('maxRetriesExceeded')) {
          // Kill process to prevent hanging
          try {
             if (proc && !proc.killed) {
               proc.kill();
             }
          } catch (e) {}
        }
      }
    });

    // Parse stdout — with --format json, each line is a JSON event
    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (rawLine) => {
      // Strip ANSI escape codes
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
      if (!line.trim()) return;
      stdoutAccum += line + '\n';

      // Try to parse as JSON event (--format json mode)
      try {
        const event = JSON.parse(line);
        // OpenCode JSON events have a 'type' field
        if (event.type === 'text' && event.content) {
          this.emit({
            id: generateEventId(),
            kind: 'notification',
            provider: 'opencode',
            threadId: input.threadId,
            createdAt: new Date().toISOString(),
            method: 'item/agentMessage/delta',
            turnId,
            textDelta: event.content,
          });
          return;
        }
        // Tool call events
        if (event.type === 'tool_call' || event.type === 'tool_use') {
          const toolId = event.id || `tool-${Date.now()}`;
          const toolName = event.name || event.tool || 'tool';
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
            toolName: toolName.toLowerCase().replace(/_/g, '-'),
            payload: event.input || event.arguments || {},
          });
          return;
        }
        // Tool result events
        if (event.type === 'tool_result') {
          const toolId = event.tool_call_id || event.id || '';
          if (toolId && openToolIds.has(toolId)) {
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'opencode',
              threadId: input.threadId,
              createdAt: new Date().toISOString(),
              method: 'item/tool/completed',
              turnId,
              itemId: toolId,
              payload: { result: event.content || event.output || '' },
            });
            openToolIds.delete(toolId);
          }
          return;
        }
        // If JSON but unknown type, check for content/text fields
        if (event.content || event.text || event.message) {
          const text = event.content || event.text || event.message;
          if (typeof text === 'string' && text.trim()) {
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'opencode',
              threadId: input.threadId,
              createdAt: new Date().toISOString(),
              method: 'item/agentMessage/delta',
              turnId,
              textDelta: text,
            });
          }
          return;
        }
      } catch {
        // Not JSON — treat as plain text output (fallback for default format)
      }

      // Fallback: emit raw text line as message delta
      console.log('[OpenCodeAdapter] stdout line (raw):', line);
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

    proc.on('exit', (code, signal) => {
      console.log('[OpenCodeAdapter] proc exit code:', code, 'signal:', signal, 'stderr length:', stderrAccum.length, 'stdout length:', stdoutAccum.length);
      console.log('[OpenCodeAdapter] stderr full:', stderrAccum.trim() || '(empty)');
      console.log('[OpenCodeAdapter] stdout raw (first 500 chars):', JSON.stringify(stdoutAccum.slice(0, 500)));
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
