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

const KIMI_FALLBACK_MODELS = [
  'kimi-code/kimi-for-coding',
  'kimi-code/kimi-for-coding,thinking',
];

interface KimiSession {
  process: ChildProcess;
  sessionId: string;
  turnId: string | null;
  abortCtrl: AbortController;
  models: string[];
  pendingReqs: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  reqId: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Kimi (Moonshot AI) adapter using `kimi acp` — Agent Client Protocol over stdio.
 */
export class KimiAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'kimi';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'kimi';

  private sessions = new Map<number, KimiSession>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  setBinaryPath(path: string) {
    this.binaryPath = path || 'kimi';
  }

  async probe(): Promise<ProviderStatus> {
    try {
      const opts = { timeout: 5_000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} --version`, opts);
    } catch {
      return { kind: 'not-installed', models: KIMI_FALLBACK_MODELS };
    }

    // Try a quick ACP initialize to check auth status
    try {
      const authCheck = await this.quickAcpProbe();
      if (authCheck?.authRequired) {
        return {
          kind: 'not-authenticated',
          installCmd: 'kimi login',
          models: authCheck.models ?? KIMI_FALLBACK_MODELS,
        };
      }
      return {
        kind: 'ready',
        models: authCheck?.models ?? KIMI_FALLBACK_MODELS,
      };
    } catch {
      // If ACP probe fails, assume ready (CLI is installed)
      return { kind: 'ready', models: KIMI_FALLBACK_MODELS };
    }
  }

  /** Quick ACP initialize to detect auth status and available models. */
  private quickAcpProbe(): Promise<{ authRequired?: boolean; models?: string[] } | null> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, ['acp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          resolve(null);
        }
      }, 8_000);

      proc.stdout?.on('data', (d) => {
        stdout += d.toString();
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as JsonRpcResponse;
            if (msg.id === 1) {
              clearTimeout(timer);
              if (!resolved) {
                resolved = true;
                proc.kill();
                if (msg.error) {
                  if (msg.error.code === -32000) {
                    resolve({ authRequired: true });
                  } else {
                    reject(new Error(msg.error.message));
                  }
                } else if (msg.result && typeof msg.result === 'object') {
                  const result = msg.result as any;
                  // Extract models from initialize response if available
                  resolve({ models: KIMI_FALLBACK_MODELS });
                } else {
                  resolve({});
                }
              }
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      });

      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (err) => {
        clearTimeout(timer);
        if (!resolved) { resolved = true; reject(err); }
      });
      proc.on('exit', () => {
        clearTimeout(timer);
        if (!resolved) { resolved = true; resolve(null); }
      });

      const initReq: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
          clientInfo: { name: 'flux-code', version: '0.1.0' },
        },
      };
      proc.stdin!.write(JSON.stringify(initReq) + '\n');
    });
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: now,
      method: 'session/connecting',
    });

    const proc = spawn(this.binaryPath, ['acp'], {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    const session: KimiSession = {
      process: proc,
      sessionId: '',
      turnId: null,
      abortCtrl: new AbortController(),
      models: KIMI_FALLBACK_MODELS,
      pendingReqs: new Map(),
      reqId: 0,
    };

    this.sessions.set(input.threadId, session);

    // Start stdout reader
    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => this.handleLine(input.threadId, line));

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'kimi',
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
        provider: 'kimi',
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
          provider: 'kimi',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/session',
          message: `Kimi ACP exited with code ${code}`,
        });
      }
      this.sessions.delete(input.threadId);
    });

    // Handshake: initialize
    await this.sendRequest(input.threadId, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      clientInfo: { name: 'flux-code', version: '0.1.0' },
    });

    // Create session
    const sessionRes = (await this.sendRequest(input.threadId, 'session/new', {
      cwd: input.cwd ?? process.cwd(),
      mcpServers: [],
    })) as { sessionId: string; models?: { availableModels?: Array<{ modelId: string; name: string }> } };

    session.sessionId = sessionRes.sessionId;
    if (sessionRes.models?.availableModels) {
      session.models = sessionRes.models.availableModels.map((m) => m.modelId);
    }

    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'session/ready',
    });

    return {
      provider: 'kimi',
      status: 'ready',
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model: input.model ?? session.models[0] ?? KIMI_FALLBACK_MODELS[0],
      cwd: input.cwd,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
    };
  }

  async stopSession(threadId: number): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;

    // Close session if supported
    if (session.sessionId) {
      try {
        await this.sendRequest(threadId, 'session/close', { sessionId: session.sessionId });
      } catch {
        // ignore
      }
    }

    session.process.kill('SIGTERM');
    this.sessions.delete(threadId);
    this.emit({
      id: generateEventId(),
      kind: 'session',
      provider: 'kimi',
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
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    // Send prompt asynchronously
    this.runPromptTurn(input.threadId, turnId, input.input ?? '', input.attachments).catch((err) => {
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        turnId,
        message: err.message || 'Kimi prompt failed',
      });
    });

    return { turnId };
  }

  private async runPromptTurn(
    threadId: number,
    turnId: string,
    text: string,
    attachments?: Array<{ path: string; mimeType?: string }>,
  ): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;

    const promptBlocks: Array<{ type: string; text?: string; resource?: unknown }> = [];

    // Read attached files
    if (attachments?.length) {
      const fs = await import('fs/promises');
      const path = await import('path');
      for (const att of attachments) {
        try {
          const content = await fs.readFile(path.resolve(att.path), 'utf8');
          promptBlocks.push({
            type: 'resource',
            resource: {
              uri: `file://${att.path}`,
              mimeType: att.mimeType ?? 'text/plain',
              text: content,
            },
          });
        } catch {
          // skip unreadable attachments
        }
      }
    }

    promptBlocks.push({ type: 'text', text });

    const res = (await this.sendRequest(threadId, 'session/prompt', {
      sessionId: session.sessionId,
      prompt: promptBlocks,
    })) as { stopReason?: string };

    session.turnId = null;

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'kimi',
      threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/completed',
      turnId,
    });
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session || !session.sessionId) return;
    this.sendNotification(threadId, 'session/cancel', { sessionId: session.sessionId });
  }

  async respondToRequest(_threadId: number, _requestId: string, _decision: ProviderApprovalDecision): Promise<void> {
    // Permissions are auto-allowed for now; handled inline in handleLine.
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Not used by Kimi ACP in YOLO mode.
  }

  async readThread(threadId: number): Promise<ProviderThreadSnapshot> {
    // ACP doesn't expose conversation history directly.
    return { turns: [] };
  }

  async rollbackThread(_threadId: number, _numTurns: number): Promise<ProviderThreadSnapshot> {
    // Not supported by ACP directly.
    return { turns: [] };
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessions.entries()).map(([threadId, s]) => ({
      provider: 'kimi' as const,
      status: 'ready' as const,
      runtimeMode: 'full-access' as const,
      threadId,
      model: s.models[0] ?? KIMI_FALLBACK_MODELS[0],
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
      try { h(event); } catch { /* ignore */ }
    }
  }

  // ─── JSON-RPC helpers ───────────────────────────────────────────────────────

  private sendRequest(threadId: number, method: string, params: unknown): Promise<unknown> {
    const session = this.sessions.get(threadId);
    if (!session) return Promise.reject(new Error('Session not found'));

    const id = ++session.reqId;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      session.pendingReqs.set(id, { resolve, reject });
      session.process.stdin!.write(JSON.stringify(req) + '\n', (err) => {
        if (err) {
          session.pendingReqs.delete(id);
          reject(err);
        }
      });
    });
  }

  private sendNotification(threadId: number, method: string, params: unknown): void {
    const session = this.sessions.get(threadId);
    if (!session) return;
    const notif: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    session.process.stdin!.write(JSON.stringify(notif) + '\n');
  }

  private handleLine(threadId: number, line: string) {
    if (!line.trim()) return;
    let msg: JsonRpcResponse | JsonRpcNotification | JsonRpcRequest;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    const session = this.sessions.get(threadId);
    if (!session) return;

    // Handle response to pending request
    if ('id' in msg && typeof msg.id === 'number') {
      const pending = session.pendingReqs.get(msg.id);
      if (pending) {
        session.pendingReqs.delete(msg.id);
        if ('error' in msg && (msg as JsonRpcResponse).error) {
          pending.reject(new Error((msg as JsonRpcResponse).error!.message));
        } else {
          pending.resolve((msg as JsonRpcResponse).result);
        }
      }
      return;
    }

    // Handle notifications
    if ('method' in msg && !('id' in msg)) {
      this.handleNotification(threadId, msg as JsonRpcNotification);
    }
  }

  private handleNotification(threadId: number, notif: JsonRpcNotification) {
    const session = this.sessions.get(threadId);
    if (!session) return;

    if (notif.method === 'session/update') {
      const params = (notif.params ?? {}) as any;
      const update = params.update ?? {};
      const sessionId = params.sessionId;
      if (sessionId !== session.sessionId) return;

      const turnId = session.turnId;
      if (!turnId) return;

      switch (update.sessionUpdate) {
        case 'agent_message_chunk': {
          const text = update.content?.text ?? '';
          if (text) {
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'kimi',
              threadId,
              createdAt: new Date().toISOString(),
              method: 'item/agentMessage/delta',
              turnId,
              textDelta: text,
            });
          }
          break;
        }
        case 'agent_thought_chunk': {
          const text = update.content?.text ?? '';
          if (text) {
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'kimi',
              threadId,
              createdAt: new Date().toISOString(),
              method: 'item/thinking/delta',
              turnId,
              textDelta: text,
            });
          }
          break;
        }
        case 'tool_call': {
          this.emit({
            id: generateEventId(),
            kind: 'notification',
            provider: 'kimi',
            threadId,
            createdAt: new Date().toISOString(),
            method: 'item/tool/started',
            turnId,
            itemId: update.toolCallId,
            toolName: mapToolKind(update.kind),
            payload: {
              title: update.title,
              kind: update.kind,
              status: update.status,
              rawInput: update.rawInput,
            },
          });
          break;
        }
        case 'tool_call_update': {
          const isDone = update.status === 'completed' || update.status === 'failed';
          if (isDone) {
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'kimi',
              threadId,
              createdAt: new Date().toISOString(),
              method: 'item/tool/completed',
              turnId,
              itemId: update.toolCallId,
              payload: {
                status: update.status,
                content: update.content,
                rawOutput: update.rawOutput,
              },
            });
          }
          break;
        }
        case 'plan': {
          // Could emit as thinking or ignore
          break;
        }
        default:
          break;
      }
      return;
    }

    if (notif.method === 'session/request_permission') {
      const params = (notif.params ?? {}) as any;
      const reqId = (notif as any).id;
      if (reqId !== undefined) {
        // Auto-allow for now
        const resp = {
          jsonrpc: '2.0',
          id: reqId,
          result: {
            outcome: { outcome: 'selected', optionId: 'allow-once' },
          },
        };
        session.process.stdin!.write(JSON.stringify(resp) + '\n');
      }
      return;
    }
  }
}

function mapToolKind(kind: string): string {
  switch (kind) {
    case 'read': return 'read_file';
    case 'edit': return 'str_replace_editor';
    case 'delete': return 'bash';
    case 'move': return 'bash';
    case 'search': return 'bash';
    case 'execute': return 'bash';
    case 'think': return 'thinking';
    case 'fetch': return 'bash';
    default: return 'tool';
  }
}
