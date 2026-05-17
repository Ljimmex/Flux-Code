import type { ProviderSession } from './types';
import { ProviderSessionError } from './types';

export type ProviderSessionDirectoryEvent =
  | { type: 'registered'; session: ProviderSession }
  | { type: 'updated'; session: ProviderSession }
  | { type: 'removed'; threadId: number };

/**
 * In-memory registry of all active sessions.
 * Enables per-threadId routing to the correct adapter.
 *
 * Aligned with T3 Code ProviderSessionDirectory.
 */
export class ProviderSessionDirectory {
  private sessions = new Map<number, ProviderSession>();
  private listeners = new Set<(event: ProviderSessionDirectoryEvent) => void>();

  register(session: ProviderSession): void {
    this.sessions.set(session.threadId, session);
    this.emit({ type: 'registered', session });
  }

  update(threadId: number, updates: Partial<ProviderSession>): void {
    const existing = this.sessions.get(threadId);
    if (!existing) {
      throw new ProviderSessionError(`No session found for threadId ${threadId}`);
    }
    const updated: ProviderSession = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(threadId, updated);
    this.emit({ type: 'updated', session: updated });
  }

  get(threadId: number): ProviderSession | undefined {
    return this.sessions.get(threadId);
  }

  remove(threadId: number): void {
    this.sessions.delete(threadId);
    this.emit({ type: 'removed', threadId });
  }

  list(): ProviderSession[] {
    return Array.from(this.sessions.values());
  }

  onEvent(handler: (event: ProviderSessionDirectoryEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(event: ProviderSessionDirectoryEvent) {
    for (const h of this.listeners) {
      try {
        h(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}
