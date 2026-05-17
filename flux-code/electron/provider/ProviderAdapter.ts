import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderAdapterCapabilities,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSendTurnInput,
  ProviderTurnStartResult,
  ProviderThreadSnapshot,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from './types';

/**
 * Every provider MUST implement this interface.
 * The rest of the system (ProviderService, IPC handlers) works
 * exclusively through this interface — knows nothing about CLI specifics.
 *
 * Aligned with T3 Code ProviderAdapterShape, adapted to Promise-based runtime.
 */
export interface ProviderAdapterShape {
  /** Provider identifier */
  readonly provider: ProviderKind;

  /** Static capabilities of this provider */
  readonly capabilities: ProviderAdapterCapabilities;

  /** Custom binary path (e.g. /usr/local/bin/codex). Falls back to command name. */
  binaryPath: string;

  /** Override the binary path used for spawn/exec. */
  setBinaryPath(path: string): void;

  /** Check if CLI is installed and authenticated. Called on startup and periodically. */
  probe(): Promise<ProviderStatus>;

  // ─── Sessions ─────────────────────────────────────────────────────────────

  /** Start a new session (or resume via resumeCursor). */
  startSession(input: ProviderSessionStartInput): Promise<ProviderSession>;

  /** Stop a specific session. */
  stopSession(threadId: number): Promise<void>;

  /** Stop ALL sessions managed by this adapter. */
  stopAll(): Promise<void>;

  // ─── Turns ────────────────────────────────────────────────────────────────

  /** Send user message to the agent. */
  sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult>;

  /** Interrupt active turn. */
  interruptTurn(threadId: number, turnId?: string): Promise<void>;

  // ─── Approvals / User Input ───────────────────────────────────────────────

  /** Respond to an approval request (e.g. agent wants to run a command). */
  respondToRequest(
    threadId: number,
    requestId: string,
    decision: ProviderApprovalDecision,
  ): Promise<void>;

  /** Respond to a user-input request (e.g. agent asks for password). */
  respondToUserInput(
    threadId: number,
    requestId: string,
    answers: ProviderUserInputAnswers,
  ): Promise<void>;

  // ─── Thread state ─────────────────────────────────────────────────────────

  /** Read full conversation history. */
  readThread(threadId: number): Promise<ProviderThreadSnapshot>;

  /** Rollback conversation by N turns. */
  rollbackThread(threadId: number, numTurns: number): Promise<ProviderThreadSnapshot>;

  // ─── Session queries ──────────────────────────────────────────────────────

  /** List all active sessions for this adapter. */
  listSessions(): Promise<readonly ProviderSession[]>;

  /** Check if adapter has an active session for threadId. */
  hasSession(threadId: number): Promise<boolean>;

  // ─── Events ───────────────────────────────────────────────────────────────

  /** Subscribe to events from this adapter. Returns unsubscribe function. */
  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void;
}

// Re-export for backward-compat in files that imported ProviderAdapter
export type ProviderAdapter = ProviderAdapterShape;

// Minimal status type used by adapters internally (full type lives in types.ts)
export type ProviderStatus = import('./types').ProviderStatus;
