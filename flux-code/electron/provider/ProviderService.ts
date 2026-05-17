import type { ProviderAdapterRegistry } from './ProviderAdapterRegistry';
import type { ProviderKind, ProviderRuntimeEvent } from './types';
import type { ProviderAdapter } from './ProviderAdapter';

interface ThreadSession {
  provider: ProviderKind;
  sessionId: string;
}

/**
 * Facade over adapters — manages threadId → sessionId → adapter mapping.
 */
export class ProviderService {
  private threadSessions = new Map<number, ThreadSession>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  constructor(private registry: ProviderAdapterRegistry) {}

  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ProviderRuntimeEvent) {
    this.eventHandlers.forEach((h) => h(event));
  }

  async startSession(params: {
    threadId: number;
    provider: ProviderKind;
    model: string;
    projectPath: string;
    systemPrompt?: string;
  }): Promise<string> {
    const existing = this.threadSessions.get(params.threadId);
    if (existing) {
      await this.stopSession(params.threadId);
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const adapter = this.registry.getAdapter(params.provider);

    // Subscribe to adapter events and forward
    adapter.onEvent((event) => {
      this.emit(event);
    });

    await adapter.startSession({
      sessionId,
      threadId: params.threadId,
      projectPath: params.projectPath,
      model: params.model,
      systemPrompt: params.systemPrompt,
    });

    this.threadSessions.set(params.threadId, { provider: params.provider, sessionId });
    return sessionId;
  }

  async sendTurn(threadId: number, turnId: string, prompt: string, contextFiles?: string[]): Promise<void> {
    const binding = this.threadSessions.get(threadId);
    if (!binding) throw new Error(`No active session for thread ${threadId}`);

    const adapter = this.registry.getAdapter(binding.provider);
    await adapter.sendTurn({
      sessionId: binding.sessionId,
      turnId,
      prompt,
      contextFiles,
    });
  }

  async interruptTurn(threadId: number): Promise<void> {
    const binding = this.threadSessions.get(threadId);
    if (!binding) return;
    const adapter = this.registry.getAdapter(binding.provider);
    await adapter.interruptTurn(binding.sessionId);
  }

  async respondToApproval(threadId: number, requestId: string, approved: boolean): Promise<void> {
    const binding = this.threadSessions.get(threadId);
    if (!binding) return;
    const adapter = this.registry.getAdapter(binding.provider);
    await adapter.respondToApproval(binding.sessionId, requestId, approved);
  }

  async stopSession(threadId: number): Promise<void> {
    const binding = this.threadSessions.get(threadId);
    if (!binding) return;
    const adapter = this.registry.getAdapter(binding.provider);
    await adapter.stopSession(binding.sessionId);
    this.threadSessions.delete(threadId);
  }

  async stopAllSessions(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.threadSessions.keys()).map((threadId) => this.stopSession(threadId)),
    );
  }

  getActiveSession(threadId: number): ThreadSession | undefined {
    return this.threadSessions.get(threadId);
  }
}
