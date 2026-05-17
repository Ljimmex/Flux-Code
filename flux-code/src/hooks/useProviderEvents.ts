import { useEffect } from 'react';
import { useProviderStore } from '../stores/providerStore';

/**
 * Listen to provider IPC events and update the Zustand store.
 * Aligned with T3 Code ProviderRuntimeEvent schema.
 * Mount once in the root component (App.tsx).
 */
export function useProviderEvents() {
  const { setStatus, setModels, appendStreamChunk, endStreaming, setError } = useProviderStore();

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
    });

    const unsubEvent = window.electronAPI.onProviderEvent((event) => {
      // T3 Code event schema: event.kind + event.method
      if (event.kind === 'notification' && event.method === 'item/agentMessage/delta') {
        if (event.turnId && event.textDelta) {
          appendStreamChunk(event.turnId, event.textDelta);
        }
        return;
      }

      if (event.kind === 'notification' && event.method === 'turn/completed') {
        endStreaming();
        return;
      }

      if (event.kind === 'error' && event.method === 'error/turn') {
        endStreaming();
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
    });

    return () => {
      unsubEvent();
      unsubStatus();
      unsubModels();
    };
  }, []);
}
