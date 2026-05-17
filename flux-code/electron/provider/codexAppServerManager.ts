import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type {
  ProviderRuntimeEvent,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSendTurnInput,
  ProviderTurnStartResult,
  ProviderApprovalDecision,
} from './types';
import { generateEventId, generateTurnId } from './types';

// ─── JSON-RPC types ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// ─── Recoverable resume errors (T3 Code spec) ───────────────────────────────

const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
  'not found',
  'missing thread',
  'no such thread',
  'unknown thread',
  'does not exist',
];

function isRecoverableThreadResumeError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((s) => msg.includes(s));
}

// ─── Manager ────────────────────────────────────────────────────────────────

interface ActiveContext {
  threadId: number;
  process: ChildProcess;
  abortCtrl: AbortController;
  internalThreadId?: string; // Codex-internal thread id (used for resume)
}

/**
 * Manages the Codex CLI in `app-server` mode.
 * Communicates via JSON-RPC over stdio.
 *
 * Aligned with T3 Code codexAppServerManager.
 */
export class CodexAppServerManager {
  private binaryPath = 'codex';
  private homePath: string | undefined;

  private contexts = new Map<number, ActiveContext>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  private reqIdCounter = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  setBinaryPath(path: string) {
    this.binaryPath = path || 'codex';
  }

  setHomePath(path: string | undefined) {
    this.homePath = path;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();
    const ctx = this.spawnContext(input.threadId);

    try {
      // 1. JSON-RPC initialize handshake
      await this.sendRequest(ctx, 'initialize', {
        protocolVersion: '2026-01-01',
        clientInfo: { name: 'flux-code', version: '1.0.0' },
      });

      // 2. thread/start or thread/resume
      let internalThreadId: string | undefined;
      let threadOpenMethod: 'thread/start' | 'thread/resume';

      const threadStartParams = {
        workspaceRoot: input.cwd,
        model: input.model,
        reasoning_effort: 'medium',
        collaboration_mode: this.buildCollaborationMode(input),
      };

      if (input.resumeCursor) {
        try {
          threadOpenMethod = 'thread/resume';
          const res = (await this.sendRequest(ctx, 'thread/resume', {
            threadId: input.resumeCursor,
            ...threadStartParams,
          })) as { threadId?: string };
          internalThreadId = res.threadId ?? String(input.resumeCursor);
        } catch (err) {
          if (!isRecoverableThreadResumeError(err)) throw err;

          // Emit fallback event (T3 spec)
          this.emit({
            id: generateEventId(),
            kind: 'session',
            provider: 'codex',
            threadId: input.threadId,
            createdAt: new Date().toISOString(),
            method: 'session/threadResumeFallback',
            message: String(err),
          });

          threadOpenMethod = 'thread/start';
          const res = (await this.sendRequest(ctx, 'thread/start', threadStartParams)) as {
            threadId?: string;
          };
          internalThreadId = res.threadId;
        }
      } else {
        threadOpenMethod = 'thread/start';
        const res = (await this.sendRequest(ctx, 'thread/start', threadStartParams)) as {
          threadId?: string;
        };
        internalThreadId = res.threadId;
      }

      ctx.internalThreadId = internalThreadId;

      this.emit({
        id: generateEventId(),
        kind: 'session',
        provider: 'codex',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'session/ready',
        payload: { internalThreadId, threadOpenMethod },
      });

      return {
        provider: 'codex',
        status: 'ready',
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        model: input.model,
        cwd: input.cwd,
        resumeCursor: internalThreadId,
        createdAt: now,
        updatedAt: now,
      };
    } catch (err: any) {
      this.killContext(ctx);
      throw new Error(`Codex session failed: ${err?.message ?? String(err)}`);
    }
  }

  async stopSession(threadId: number): Promise<void> {
    const ctx = this.contexts.get(threadId);
    if (!ctx) return;
    this.killContext(ctx);
    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'codex',
      threadId,
      createdAt: new Date().toISOString(),
      method: 'session/closed',
    });
  }

  async stopAll(): Promise<void> {
    for (const threadId of Array.from(this.contexts.keys())) {
      await this.stopSession(threadId);
    }
  }

  // ─── Turns ────────────────────────────────────────────────────────────────

  async sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult> {
    const ctx = this.contexts.get(input.threadId);
    if (!ctx) throw new Error(`No Codex context for thread ${input.threadId}`);

    const turnId = generateTurnId();

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'codex',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    // Send user message
    await this.sendRequest(ctx, 'conversation/item/create', {
      role: 'user',
      content: input.input ?? '',
      // Attachments are passed as a custom extension if supported
      attachments: input.attachments?.map((a) => ({ type: 'file', path: a.path })),
    });

    // Codex app-server streams deltas via notifications handled in onLine
    return { turnId, resumeCursor: ctx.internalThreadId };
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const ctx = this.contexts.get(threadId);
    if (!ctx) return;
    try {
      await this.sendRequest(ctx, 'conversation/turn/stop', {});
    } catch {
      // Fallback: SIGINT
      ctx.process.kill('SIGINT');
    }
  }

  // ─── Approvals ────────────────────────────────────────────────────────────

  async respondToRequest(
    threadId: number,
    requestId: string,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const ctx = this.contexts.get(threadId);
    if (!ctx) return;
    await this.sendRequest(ctx, 'command/respond', {
      requestId,
      approved: decision === 'allow',
    });
  }

  async respondToUserInput(threadId: number, requestId: string, answers: Record<string, string>): Promise<void> {
    const ctx = this.contexts.get(threadId);
    if (!ctx) return;
    await this.sendRequest(ctx, 'user-input/respond', {
      requestId,
      answers,
    });
  }

  // ─── Thread state ─────────────────────────────────────────────────────────

  async readThread(_threadId: number): Promise<import('./types').ProviderThreadSnapshot> {
    // Codex app-server does not expose a simple readThread in the public docs.
    // In a full implementation this would call conversation/history or similar.
    return { turns: [] };
  }

  async rollbackThread(_threadId: number, _numTurns: number): Promise<import('./types').ProviderThreadSnapshot> {
    // Not exposed in simplified protocol.
    return { turns: [] };
  }

  hasContext(threadId: number): boolean {
    return this.contexts.has(threadId);
  }

  listContexts(): Array<{ threadId: number; internalThreadId?: string }> {
    return Array.from(this.contexts.values()).map((c) => ({
      threadId: c.threadId,
      internalThreadId: c.internalThreadId,
    }));
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // ─── Internal: process management ─────────────────────────────────────────

  private spawnContext(threadId: number, extraEnv?: Record<string, string>): ActiveContext {
    const abortCtrl = new AbortController();
    const proc = spawn(this.binaryPath, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(extraEnv ?? {}),
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ...(this.homePath ? { CODEX_HOME: this.homePath } : {}),
      },
    });

    const ctx: ActiveContext = { threadId, process: proc, abortCtrl };
    this.contexts.set(threadId, ctx);

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => this.onLine(ctx, line));

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'codex',
        threadId,
        createdAt: new Date().toISOString(),
        method: 'error/protocol',
        message: text.trim(),
      });
    });

    proc.on('error', (err) => {
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'codex',
        threadId,
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
          provider: 'codex',
          threadId,
          createdAt: new Date().toISOString(),
          method: 'error/session',
          message: `Codex app-server exited with code ${code}`,
        });
      }
      this.contexts.delete(threadId);
    });

    return ctx;
  }

  private killContext(ctx: ActiveContext) {
    try {
      ctx.process.kill('SIGTERM');
    } catch {
      // ignore
    }
    this.contexts.delete(ctx.threadId);
  }

  // ─── Internal: JSON-RPC ───────────────────────────────────────────────────

  private sendRequest(ctx: ActiveContext, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.reqIdCounter;
      const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      const line = JSON.stringify(payload) + '\n';

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC timeout: ${method}`));
      }, 60_000);

      this.pending.set(id, { resolve, reject, timer });

      try {
        ctx.process.stdin!.write(line);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  private onLine(ctx: ActiveContext, line: string) {
    if (!line.trim()) return;
    let msg: JsonRpcResponse | JsonRpcNotification;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    // Response
    if ('id' in msg && typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if ('error' in msg && msg.error) {
          pending.reject(new Error(msg.error.message ?? 'JSON-RPC error'));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Notification
    const notif = msg as JsonRpcNotification;
    this.handleNotification(ctx, notif.method, notif.params);
  }

  private handleNotification(ctx: ActiveContext, method: string, params: unknown) {
    const p = params as Record<string, any> | undefined;
    const threadId = ctx.threadId;
    const createdAt = new Date().toISOString();

    switch (method) {
      case 'notification/conversation/item/streaming': {
        const delta = p?.delta?.content ?? p?.content ?? '';
        if (delta) {
          this.emit({
            id: generateEventId(),
            kind: 'notification',
            provider: 'codex',
            threadId,
            createdAt,
            method: 'item/agentMessage/delta',
            turnId: p?.turnId,
            textDelta: String(delta),
          });
        }
        break;
      }

      case 'notification/conversation/completed': {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'turn/completed',
          turnId: p?.turnId,
        });
        break;
      }

      case 'notification/tool/started': {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'item/tool/started',
          turnId: p?.turnId,
          itemId: p?.toolCallId,
        });
        break;
      }

      case 'notification/tool/completed': {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'item/tool/completed',
          turnId: p?.turnId,
          itemId: p?.toolCallId,
        });
        break;
      }

      case 'notification/request/command': {
        this.emit({
          id: generateEventId(),
          kind: 'request',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'request/command',
          requestId: p?.requestId,
          message: p?.description,
        });
        break;
      }

      case 'notification/request/file-read': {
        this.emit({
          id: generateEventId(),
          kind: 'request',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'request/file-read',
          requestId: p?.requestId,
          message: p?.path,
        });
        break;
      }

      case 'notification/request/file-change': {
        this.emit({
          id: generateEventId(),
          kind: 'request',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'request/file-change',
          requestId: p?.requestId,
          message: p?.description,
        });
        break;
      }

      case 'notification/request/user-input': {
        this.emit({
          id: generateEventId(),
          kind: 'request',
          provider: 'codex',
          threadId,
          createdAt,
          method: 'request/user-input',
          requestId: p?.requestId,
          message: p?.prompt,
        });
        break;
      }

      default:
        // Unknown notification — ignore
        break;
    }
  }

  private buildCollaborationMode(input: ProviderSessionStartInput): {
    mode: 'default' | 'plan';
    settings: { model: string; reasoning_effort: string; developer_instructions: string };
  } {
    return {
      mode: input.interactionMode === 'plan' ? 'plan' : 'default',
      settings: {
        model: input.model ?? 'codex-1',
        reasoning_effort: 'medium',
        developer_instructions: input.systemPrompt ?? '',
      },
    };
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
