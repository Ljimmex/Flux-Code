import { useEffect } from 'react';
import { useProviderStore } from '../stores/providerStore';

/**
 * Listen to provider IPC events and update the Zustand store.
 * Aligned with T3 Code ProviderRuntimeEvent schema.
 * Mount once in the root component (App.tsx).
 */
export function useProviderEvents() {
  const { setStatus, setModels, appendStreamChunk, endStreaming, setError, setAvailableUpdates, setModelVariants, activeModel, setModelOptions, providerDrafts } = useProviderStore();

  useEffect(() => {
    // Load initial statuses and models
    window.electronAPI.provider.getStatuses().then((statuses) => {
      Object.entries(statuses).forEach(([kind, status]) => {
        setStatus(kind as any, status as any);
      });
    });
    window.electronAPI.provider.getModels().then((models) => {
      Object.entries(models).forEach(([kind, list]) => {
        setModels(kind as any, list);
      });
      // Fetch OpenCode model variants if opencode models are present
      if (models['opencode'] && models['opencode'].length > 0) {
        window.electronAPI.provider.getOpenCodeModels().then((meta) => {
          meta.forEach((m) => {
            if (m.variants) {
              setModelVariants(m.id, m.variants);
            }
          });
          // Auto-select first variant for current model only if none is set yet
          const currentVariant = (providerDrafts['opencode']?.modelOptions as Record<string, unknown> | undefined)?.variant as string | undefined;
          if (!currentVariant) {
            const currentMeta = meta.find((m) => m.id === activeModel);
            if (currentMeta?.variants) {
              const keys = Object.keys(currentMeta.variants);
              if (keys.length > 0) {
                setModelOptions('opencode', { variant: keys[0] });
              }
            }
          }
        }).catch(() => {});
      }
      // Fetch Kimi model variants if kimi models are present
      if (models['kimi'] && models['kimi'].length > 0) {
        window.electronAPI.provider.getKimiModels().then((meta) => {
          meta.forEach((m: any) => {
            if (m.variants) {
              setModelVariants(m.id, m.variants);
            }
          });
          // Auto-select first variant for current model only if none is set yet
          const currentVariant = (providerDrafts['kimi']?.modelOptions as Record<string, unknown> | undefined)?.variant as string | undefined;
          if (!currentVariant) {
            const currentMeta = meta.find((m: any) => m.id === activeModel);
            if (currentMeta?.variants) {
              const keys = Object.keys(currentMeta.variants);
              if (keys.length > 0) {
                setModelOptions('kimi', { variant: keys[0] });
              }
            }
          }
        }).catch(() => {});
      }
    });

    const unsubEvent = window.electronAPI.onProviderEvent((event) => {
      // T3 Code event schema: event.kind + event.method
      if (event.kind === 'notification' && event.method === 'item/agentMessage/delta') {
        if (event.turnId && event.textDelta && event.threadId != null) {
          appendStreamChunk(event.threadId, event.turnId, event.textDelta);
        }
        return;
      }

      if (event.kind === 'notification' && event.method === 'turn/completed') {
        if (event.threadId != null) {
          endStreaming(event.threadId);
        }
        window.dispatchEvent(new CustomEvent('provider:turn-completed', { detail: { threadId: event.threadId } }));
        return;
      }

      if (event.kind === 'error' && event.method === 'error/turn') {
        if (event.threadId != null) {
          endStreaming(event.threadId);
        }
        setError(event.message ?? 'Turn error');
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (event.kind === 'error' && event.method === 'error/session') {
        setError(event.message ?? 'Session error');
        setTimeout(() => setError(null), 5000);
        return;
      }
    });

    const unsubStatus = window.electronAPI.onProviderStatus(({ kind, status }) => {
      setStatus(kind as any, status);
    });

    const unsubModels = window.electronAPI.onProviderModels(({ kind, models }) => {
      setModels(kind as any, models);
      if (kind === 'opencode' && models.length > 0) {
        window.electronAPI.provider.getOpenCodeModels().then((meta) => {
          meta.forEach((m) => {
            if (m.variants) {
              setModelVariants(m.id, m.variants);
            }
          });
          // Only update variant if none is set yet (avoid overriding user choice on periodic refresh)
          const currentVariant = (providerDrafts['opencode']?.modelOptions as Record<string, unknown> | undefined)?.variant as string | undefined;
          if (!currentVariant) {
            const currentMeta = meta.find((m) => m.id === activeModel);
            if (currentMeta?.variants) {
              const keys = Object.keys(currentMeta.variants);
              if (keys.length > 0) {
                setModelOptions('opencode', { variant: keys[0] });
              }
            }
          }
        }).catch(() => {});
      }
      if (kind === 'kimi' && models.length > 0) {
        window.electronAPI.provider.getKimiModels().then((meta) => {
          meta.forEach((m: any) => {
            if (m.variants) {
              setModelVariants(m.id, m.variants);
            }
          });
          // Only update variant if none is set yet
          const currentVariant = (providerDrafts['kimi']?.modelOptions as Record<string, unknown> | undefined)?.variant as string | undefined;
          if (!currentVariant) {
            const currentMeta = meta.find((m: any) => m.id === activeModel);
            if (currentMeta?.variants) {
              const keys = Object.keys(currentMeta.variants);
              if (keys.length > 0) {
                setModelOptions('kimi', { variant: keys[0] });
              }
            }
          }
        }).catch(() => {});
      }
    });

    const unsubUpdates = window.electronAPI.onProviderUpdates((updates) => {
      setAvailableUpdates(updates);
    });

    // Check for CLI updates on startup
    window.electronAPI.provider.checkUpdates().then((updates) => {
      setAvailableUpdates(updates);
    }).catch(() => {
      // ignore
    });

    return () => {
      unsubEvent();
      unsubStatus();
      unsubModels();
      unsubUpdates();
    };
  }, []);
}
