import type { ProviderKind, ProviderStatus } from './types';
import { FALLBACK_MODELS } from './types';
import type { ProviderAdapterRegistry } from './ProviderAdapterRegistry';

/**
 * Health service — probes each installed provider.
 * Dynamic model cache: each adapter's probe() returns actual models from CLI/API.
 *
 * Aligned with T3 Code ProviderHealth.
 */
export class HealthService {
  private statuses = new Map<ProviderKind, ProviderStatus>();
  private modelCache = new Map<ProviderKind, string[]>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private registry: ProviderAdapterRegistry,
    private onStatusChange: (kind: ProviderKind, status: ProviderStatus) => void,
    private onModelsChange: (kind: ProviderKind, models: string[]) => void,
  ) {}

  async start() {
    await this.probeAll();
    this.intervalId = setInterval(() => this.probeAll(), 30_000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getStatus(kind: ProviderKind): ProviderStatus {
    return this.statuses.get(kind) ?? { kind: 'not-installed' };
  }

  getAllStatuses(): Record<string, ProviderStatus> {
    return Object.fromEntries(this.statuses);
  }

  getModels(kind: ProviderKind): string[] {
    return this.modelCache.get(kind) ?? FALLBACK_MODELS[kind] ?? [];
  }

  getAllModels(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const kind of this.registry.listProviders()) {
      result[kind] = this.getModels(kind);
    }
    return result;
  }

  async probeOne(kind: ProviderKind): Promise<void> {
    const adapter = this.registry.get(kind);
    try {
      const status = await adapter.probe();
      this.updateStatus(kind, status, true);
    } catch (err) {
      this.updateStatus(kind, {
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      }, true);
    }
  }

  private async probeAll() {
    await Promise.allSettled(
      this.registry.getAllAdapters().map(async (adapter) => {
        try {
          const status = await adapter.probe();
          this.updateStatus(adapter.provider, status);
        } catch (err) {
          this.updateStatus(adapter.provider, {
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  private updateStatus(kind: ProviderKind, status: ProviderStatus, forceBroadcast = false) {
    const prev = this.statuses.get(kind);
    this.statuses.set(kind, status);

    // Cache models from any status variant that provides them
    const modelList =
      status.kind === 'ready'
        ? status.models
        : (status as any).models;
    if (Array.isArray(modelList) && modelList.length > 0) {
      const prevModels = this.modelCache.get(kind);
      this.modelCache.set(kind, modelList);
      if (JSON.stringify(prevModels) !== JSON.stringify(modelList) || forceBroadcast) {
        this.onModelsChange(kind, modelList);
      }
    }

    if (JSON.stringify(prev) !== JSON.stringify(status) || forceBroadcast) {
      this.onStatusChange(kind, status);
    }
  }
}
