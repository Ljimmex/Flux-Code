import type { ProviderKind } from './types';
import type { ProviderAdapterShape } from './ProviderAdapter';

/**
 * Central registry of all provider adapters.
 * Maps ProviderKind → concrete adapter implementation.
 *
 * Aligned with T3 Code ProviderAdapterRegistry.
 */
export class ProviderAdapterRegistry {
  private adapters = new Map<ProviderKind, ProviderAdapterShape>();

  /** Register an adapter (called at server startup). */
  register(adapter: ProviderAdapterShape): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /** Get adapter by ProviderKind. */
  get(provider: ProviderKind): ProviderAdapterShape {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider kind: ${provider}`);
    }
    return adapter;
  }

  /** List all registered provider kinds. */
  listProviders(): ProviderKind[] {
    return Array.from(this.adapters.keys());
  }

  /** Get all registered adapters. */
  getAllAdapters(): ProviderAdapterShape[] {
    return Array.from(this.adapters.values());
  }

  setBinaryPath(kind: ProviderKind, path: string): void {
    const adapter = this.adapters.get(kind);
    if (adapter) adapter.setBinaryPath(path);
  }
}
