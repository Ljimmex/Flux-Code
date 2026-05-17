import { useEffect } from 'react';
import { useProviderStore } from '../stores/providerStore';

/**
 * Listen to provider IPC events and update the Zustand store.
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
      switch (event.type) {
        case 'content.delta':
          appendStreamChunk(event.turnId, event.text);
          break;
        case 'turn.completed':
          endStreaming();
          break;
        case 'turn.error':
          endStreaming();
          setError(event.message);
          setTimeout(() => setError(null), 5000);
          break;
        case 'session.error':
          setError(event.message);
          setTimeout(() => setError(null), 5000);
          break;
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
