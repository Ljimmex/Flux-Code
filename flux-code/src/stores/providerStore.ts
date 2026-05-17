import { create } from 'zustand';
import { DEFAULT_MODEL, type ProviderKind } from '../types/provider';

export type ProviderStatus =
  | { kind: 'not-installed' }
  | { kind: 'not-authenticated'; installCmd: string }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

interface ProviderState {
  // Status of each provider from HealthService
  statuses: Record<string, ProviderStatus>;
  // Model cache from HealthService
  models: Record<string, string[]>;
  // Active provider and model for new conversations
  activeProvider: ProviderKind;
  activeModel: string;
  // Streaming state
  streamingTurnId: string | null;
  streamingContent: string;
  isStreaming: boolean;
  // Error toast
  error: string | null;

  // Actions
  setStatus: (kind: ProviderKind, status: ProviderStatus) => void;
  setModels: (kind: ProviderKind, models: string[]) => void;
  setActiveProvider: (kind: ProviderKind) => void;
  setActiveModel: (model: string) => void;
  appendStreamChunk: (turnId: string, text: string) => void;
  endStreaming: () => void;
  setError: (error: string | null) => void;
}

export const useProviderStore = create<ProviderState>((set) => ({
  statuses: {},
  models: {},
  activeProvider: 'ollama',
  activeModel: DEFAULT_MODEL['ollama'],
  streamingTurnId: null,
  streamingContent: '',
  isStreaming: false,
  error: null,

  setStatus: (kind, status) =>
    set((s) => ({ statuses: { ...s.statuses, [kind]: status } })),

  setModels: (kind, models) =>
    set((s) => ({ models: { ...s.models, [kind]: models } })),

  setActiveProvider: (kind) =>
    set((s) => {
      const available = s.models[kind] ?? [];
      const defaultModel = DEFAULT_MODEL[kind];
      return {
        activeProvider: kind,
        activeModel: available.includes(defaultModel) ? defaultModel : (available[0] ?? defaultModel),
      };
    }),

  setActiveModel: (model) => set({ activeModel: model }),

  appendStreamChunk: (turnId, text) =>
    set((s) => ({
      streamingTurnId: turnId,
      streamingContent: s.streamingTurnId === turnId ? s.streamingContent + text : text,
      isStreaming: true,
    })),

  endStreaming: () =>
    set({
      streamingTurnId: null,
      streamingContent: '',
      isStreaming: false,
    }),

  setError: (error) => set({ error }),
}));
