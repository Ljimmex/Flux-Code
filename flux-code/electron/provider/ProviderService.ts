import type { ProviderAdapterRegistry } from './ProviderAdapterRegistry';
import type { ProviderSessionDirectory } from './ProviderSessionDirectory';
import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSendTurnInput,
  ProviderTurnStartResult,
  ProviderAdapterCapabilities,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from './types';
import { ProviderSessionError, generateEventId } from './types';

/**
 * Unified facade over adapters.
 * Manages threadId → session routing and merges event streams from all adapters.
 *
 * Aligned with T3 Code ProviderService.
 */
export class ProviderService {
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();
  private unsubAdapterFns: Array<() => void> = [];
  private registeredAdapters = new Set<string>();

  constructor(
    private registry: ProviderAdapterRegistry,
    private directory: ProviderSessionDirectory,
  ) {
    // Subscribe to directory changes and forward as events
    this.directory.onEvent((dirEvent) => {
      if (dirEvent.type === 'registered') {
        this.emit({
          id: generateEventId(),
          kind: 'session',
          provider: dirEvent.session.provider,
          threadId: dirEvent.session.threadId,
          createdAt: new Date().toISOString(),
          method: 'session/connecting',
        });
      } else if (dirEvent.type === 'updated') {
        const s = dirEvent.session;
        if (s.status === 'ready') {
          this.emit({
            id: generateEventId(),
            kind: 'session',
            provider: s.provider,
            threadId: s.threadId,
            createdAt: new Date().toISOString(),
            method: 'session/ready',
          });
        } else if (s.status === 'error') {
          this.emit({
            id: generateEventId(),
            kind: 'error',
            provider: s.provider,
            threadId: s.threadId,
            createdAt: new Date().toISOString(),
            method: 'error/session',
            message: s.lastError,
          });
        }
      } else if (dirEvent.type === 'removed') {
        const s = this.directory.get(dirEvent.threadId);
        // s is already removed, but we can emit a generic closed event
        this.emit({
          id: generateEventId(),
          kind: 'session',
          provider: s?.provider ?? 'codex',
          threadId: dirEvent.threadId,
          createdAt: new Date().toISOString(),
          method: 'session/closed',
        });
      }
    });
  }

  // ─── Event subscription ───────────────────────────────────────────────────

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

  /** Attach an adapter so its events are merged into the global stream. */
  private attachAdapterEvents(adapter: import('./ProviderAdapter').ProviderAdapterShape) {
    const unsub = adapter.onEvent((event) => {
      this.emit(event);
    });
    this.unsubAdapterFns.push(unsub);
  }

  /** Call once for every adapter you want to listen to. */
  registerAdapterEvents(adapter: import('./ProviderAdapter').ProviderAdapterShape) {
    if (this.registeredAdapters.has(adapter.provider)) return;
    this.registeredAdapters.add(adapter.provider);
    this.attachAdapterEvents(adapter);
  }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const existing = this.directory.get(input.threadId);
    if (existing) {
      await this.stopSession({ threadId: input.threadId });
    }

    const provider = input.provider ?? 'codex';
    const adapter = this.registry.get(provider);

    // Ensure adapter events are wired
    this.registerAdapterEvents(adapter);

    const now = new Date().toISOString();
    const preSession: ProviderSession = {
      provider,
      status: 'connecting',
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model: input.model,
      cwd: input.cwd,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
    };
    this.directory.register(preSession);

    try {
      const session = await adapter.startSession(input);
      this.directory.update(input.threadId, { ...session, status: session.status ?? 'ready' });
      return this.directory.get(input.threadId)!;
    } catch (err: any) {
      this.directory.update(input.threadId, {
        status: 'error',
        lastError: err?.message ?? String(err),
      });
      throw err;
    }
  }

  async stopSession(input: { threadId: number }): Promise<void> {
    const session = this.directory.get(input.threadId);
    if (!session) return;

    const adapter = this.registry.get(session.provider);
    await adapter.stopSession(input.threadId);
    this.directory.remove(input.threadId);
  }

  async stopAllSessions(): Promise<void> {
    const sessions = this.directory.list();
    await Promise.allSettled(
      sessions.map((s) => this.stopSession({ threadId: s.threadId })),
    );
  }

  // ─── Turns ────────────────────────────────────────────────────────────────

  async sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult> {
    const session = this.directory.get(input.threadId);
    if (!session) {
      throw new ProviderSessionError(`No active session for thread ${input.threadId}`);
    }

    const adapter = this.registry.get(session.provider);
    this.directory.update(input.threadId, { status: 'running', activeTurnId: undefined });

    try {
      const result = await adapter.sendTurn(input);
      this.directory.update(input.threadId, { activeTurnId: result.turnId });
      return result;
    } catch (err: any) {
      this.directory.update(input.threadId, {
        status: 'error',
        lastError: err?.message ?? String(err),
      });
      throw err;
    }
  }

  async interruptTurn(input: { threadId: number; turnId?: string }): Promise<void> {
    const session = this.directory.get(input.threadId);
    if (!session) return;

    const adapter = this.registry.get(session.provider);
    await adapter.interruptTurn(input.threadId, input.turnId);
  }

  // ─── Approvals / User Input ───────────────────────────────────────────────

  async respondToRequest(input: {
    threadId: number;
    requestId: string;
    decision: ProviderApprovalDecision;
  }): Promise<void> {
    const session = this.directory.get(input.threadId);
    if (!session) {
      throw new ProviderSessionError(`No active session for thread ${input.threadId}`);
    }
    const adapter = this.registry.get(session.provider);
    await adapter.respondToRequest(input.threadId, input.requestId, input.decision);
  }

  async respondToUserInput(input: {
    threadId: number;
    requestId: string;
    answers: ProviderUserInputAnswers;
  }): Promise<void> {
    const session = this.directory.get(input.threadId);
    if (!session) {
      throw new ProviderSessionError(`No active session for thread ${input.threadId}`);
    }
    const adapter = this.registry.get(session.provider);
    await adapter.respondToUserInput(input.threadId, input.requestId, input.answers);
  }

  // ─── Conversation management ──────────────────────────────────────────────

  async rollbackConversation(input: {
    threadId: number;
    numTurns: number;
  }): Promise<void> {
    const session = this.directory.get(input.threadId);
    if (!session) {
      throw new ProviderSessionError(`No active session for thread ${input.threadId}`);
    }
    const adapter = this.registry.get(session.provider);
    await adapter.rollbackThread(input.threadId, input.numTurns);
  }

  async readThread(threadId: number): Promise<import('./types').ProviderThreadSnapshot> {
    const session = this.directory.get(threadId);
    if (!session) {
      throw new ProviderSessionError(`No active session for thread ${threadId}`);
    }
    const adapter = this.registry.get(session.provider);
    return adapter.readThread(threadId);
  }

  // ─── Metadata ─────────────────────────────────────────────────────────────

  listSessions(): ProviderSession[] {
    return this.directory.list();
  }

  async getCapabilities(provider: ProviderKind): Promise<ProviderAdapterCapabilities> {
    const adapter = this.registry.get(provider);
    return adapter.capabilities;
  }

  getActiveSession(threadId: number): ProviderSession | undefined {
    return this.directory.get(threadId);
  }
}
