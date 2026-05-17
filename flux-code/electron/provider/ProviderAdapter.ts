import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderStatus,
  SessionStartOpts,
  TurnSendOpts,
} from './types';

/**
 * Every provider MUST implement this interface.
 * The rest of the system (ProviderService, IPC handlers) works
 * exclusively through this interface — knows nothing about CLI specifics.
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;

  /** Check if CLI is installed and authenticated. Called on startup and every 30s. */
  probe(): Promise<ProviderStatus>;

  /** Create a new agent session. Spawns CLI subprocess or initializes SDK. */
  startSession(opts: SessionStartOpts): Promise<void>;

  /** Resume an existing session (after server restart). */
  resumeSession(opts: SessionStartOpts): Promise<void>;

  /** Send prompt to active session. */
  sendTurn(opts: TurnSendOpts): Promise<void>;

  /** Interrupt active turn (Ctrl+C). Session stays ready. */
  interruptTurn(sessionId: string): Promise<void>;

  /** Respond to an approval request. */
  respondToApproval(sessionId: string, requestId: string, approved: boolean): Promise<void>;

  /** Stop session completely and release resources. */
  stopSession(sessionId: string): Promise<void>;

  /** Subscribe to events from provider. Returns unsubscribe function. */
  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void;
}
