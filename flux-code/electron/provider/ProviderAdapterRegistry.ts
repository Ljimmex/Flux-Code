import type { ProviderKind } from './types';
import type { ProviderAdapter } from './ProviderAdapter';
import { CodexAdapter } from './adapters/CodexAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { OllamaAdapter } from './adapters/OllamaAdapter';
import { OpenCodeAdapter } from './adapters/OpenCodeAdapter';

/**
 * Central registry of all provider adapters.
 * This is the ONLY place where a new provider is added.
 */
export class ProviderAdapterRegistry {
  private adapters = new Map<ProviderKind, ProviderAdapter>();

  constructor() {
    this.register(new CodexAdapter());
    this.register(new ClaudeAdapter());
    this.register(new OllamaAdapter());
    this.register(new OpenCodeAdapter());
  }

  private register(adapter: ProviderAdapter) {
    this.adapters.set(adapter.kind, adapter);
  }

  getAdapter(kind: ProviderKind): ProviderAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) throw new Error(`Unknown provider kind: ${kind}`);
    return adapter;
  }

  getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getKinds(): ProviderKind[] {
    return Array.from(this.adapters.keys());
  }
}
