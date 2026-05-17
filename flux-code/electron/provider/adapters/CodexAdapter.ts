import { execSync } from 'child_process';
import type { ProviderAdapterShape } from '../ProviderAdapter';
import { CodexAppServerManager } from '../codexAppServerManager';
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
import { generateEventId } from '../types';
import {
  CODEX_MODELS,
  CODEX_DEFAULT_MODEL,
  type CodexAccountSnapshot,
  type CodexModelOptions,
  probeCodexAccount,
  resolveCodexModelForAccount,
  getCliVersion,
} from '../../model';

const CODEX_MODEL_SLUGS = CODEX_MODELS.map((m) => m.slug);

/**
 * Codex CLI adapter — reference implementation using `codex app-server` JSON-RPC over stdio.
 *
 * Aligned with T3 Code CodexAdapter (section 10).
 */
export class CodexAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'codex';
  readonly capabilities = { sessionModelSwitch: 'restart-session' as const };
  binaryPath = 'codex';

  private manager = new CodexAppServerManager();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();
  private accountCache: CodexAccountSnapshot | null = null;

  constructor() {
    this.manager.onEvent((event) => this.emit(event));
  }

  setBinaryPath(path: string) {
    this.binaryPath = path || 'codex';
    this.manager.setBinaryPath(this.binaryPath);
  }

  async probe(): Promise<ProviderStatus> {
    const version = getCliVersion(this.binaryPath);
    try {
      const opts = { timeout: 5_000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} --version`, opts);
    } catch {
      return { kind: 'not-installed', models: CODEX_MODEL_SLUGS, version };
    }

    try {
      const opts = { timeout: 5_000, stdio: 'ignore' as const };
      if (process.platform === 'win32') (opts as any).shell = true;
      execSync(`${this.binaryPath} auth status`, opts);
    } catch (err: any) {
      if (err.code === 'ENOENT' || (err.message && err.message.includes('auth status'))) {
        // auth status may not exist in some versions — assume ready
      } else {
        return { kind: 'not-authenticated', installCmd: 'codex login', models: CODEX_MODEL_SLUGS, version };
      }
    }

    // Probe account to know Spark eligibility (best-effort)
    this.accountCache = probeCodexAccount(this.binaryPath);

    return { kind: 'ready', models: CODEX_MODEL_SLUGS, version };
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const account = this.accountCache ?? probeCodexAccount(this.binaryPath);
    const resolvedModel = resolveCodexModelForAccount(input.model, account);

    const modelOptions: CodexModelOptions = (input as any).modelOptions ?? {};

    const homePath = input.providerOptions?.codex?.homePath;
    if (homePath) this.manager.setHomePath(homePath);

    const session = await this.manager.startSession({
      ...input,
      model: resolvedModel,
      // Pass reasoning_effort and fast mode through collaboration_mode or similar
      providerOptions: {
        ...input.providerOptions,
        codex: {
          ...input.providerOptions?.codex,
          // Adapter-specific overrides consumed by CodexAppServerManager
          effort: modelOptions.effort ?? 'medium',
          fastMode: modelOptions.fastMode ?? false,
        },
      },
    });

    return session;
  }

  async stopSession(threadId: number): Promise<void> {
    return this.manager.stopSession(threadId);
  }

  async stopAll(): Promise<void> {
    return this.manager.stopAll();
  }

  // ─── Turns ────────────────────────────────────────────────────────────────

  async sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult> {
    return this.manager.sendTurn(input);
  }

  async interruptTurn(threadId: number, turnId?: string): Promise<void> {
    return this.manager.interruptTurn(threadId, turnId);
  }

  // ─── Approvals / User Input ───────────────────────────────────────────────

  async respondToRequest(
    threadId: number,
    requestId: string,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    return this.manager.respondToRequest(threadId, requestId, decision);
  }

  async respondToUserInput(
    threadId: number,
    requestId: string,
    answers: ProviderUserInputAnswers,
  ): Promise<void> {
    return this.manager.respondToUserInput(threadId, requestId, answers);
  }

  // ─── Thread state ─────────────────────────────────────────────────────────

  async readThread(threadId: number): Promise<ProviderThreadSnapshot> {
    return this.manager.readThread(threadId);
  }

  async rollbackThread(threadId: number, numTurns: number): Promise<ProviderThreadSnapshot> {
    return this.manager.rollbackThread(threadId, numTurns);
  }

  // ─── Session queries ──────────────────────────────────────────────────────

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return this.manager.listContexts().map((c) => ({
      provider: 'codex' as const,
      status: 'ready' as const,
      runtimeMode: 'approval-required' as const,
      threadId: c.threadId,
      resumeCursor: c.internalThreadId,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async hasSession(threadId: number): Promise<boolean> {
    return this.manager.hasContext(threadId);
  }

  // ─── Events ───────────────────────────────────────────────────────────────

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
