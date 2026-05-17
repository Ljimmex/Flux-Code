import { create } from 'zustand';
import { DEFAULT_MODEL, type ProviderKind } from '../types/provider';

export type ProviderStatus =
  | { kind: 'not-installed' }
  | { kind: 'not-authenticated'; installCmd: string }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

const ENABLED_KEY = 'flux:providers:enabled';
const MODEL_META_KEY = 'flux:providers:modelMeta';
const BINARY_PATHS_KEY = 'flux:providers:binaryPaths';

function loadEnabled(): Record<ProviderKind, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    codex: true,
    claude: true,
    opencode: true,
    ollama: true,
    kimi: true,
    gemini: true,
  };
}

function saveEnabled(enabled: Record<ProviderKind, boolean>) {
  localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
}

export interface ModelMeta {
  favorite?: boolean;
  hidden?: boolean;
  order?: number;
  reasoning?: boolean;
}

function loadModelMeta(): Record<string, ModelMeta> {
  try {
    const raw = localStorage.getItem(MODEL_META_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveModelMeta(meta: Record<string, ModelMeta>) {
  localStorage.setItem(MODEL_META_KEY, JSON.stringify(meta));
}

function loadBinaryPaths(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BINARY_PATHS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveBinaryPaths(paths: Record<string, string>) {
  localStorage.setItem(BINARY_PATHS_KEY, JSON.stringify(paths));
}

interface ProviderState {
  // Status of each provider from HealthService
  statuses: Record<string, ProviderStatus>;
  // Model cache from HealthService
  models: Record<string, string[]>;
  // Enabled/disabled per provider
  enabledProviders: Record<ProviderKind, boolean>;
  // Per-model metadata (favorite, hidden, order, reasoning)
  modelMeta: Record<string, ModelMeta>;
  // Custom binary paths per provider
  binaryPaths: Record<string, string>;
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
  toggleProvider: (kind: ProviderKind) => void;
  setModelMeta: (modelId: string, meta: Partial<ModelMeta>) => void;
  moveModel: (provider: ProviderKind, model: string, direction: 'up' | 'down') => void;
  setBinaryPath: (kind: ProviderKind, path: string) => void;
  setActiveProvider: (kind: ProviderKind) => void;
  setActiveModel: (model: string) => void;
  appendStreamChunk: (turnId: string, text: string) => void;
  endStreaming: () => void;
  setError: (error: string | null) => void;
}

export const useProviderStore = create<ProviderState>((set) => ({
  statuses: {},
  models: {},
  enabledProviders: loadEnabled(),
  modelMeta: loadModelMeta(),
  binaryPaths: loadBinaryPaths(),
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

  toggleProvider: (kind) =>
    set((s) => {
      const next = { ...s.enabledProviders, [kind]: !s.enabledProviders[kind] };
      saveEnabled(next);
      return { enabledProviders: next };
    }),

  setModelMeta: (modelId, meta) =>
    set((s) => {
      const next = { ...s.modelMeta, [modelId]: { ...s.modelMeta[modelId], ...meta } };
      saveModelMeta(next);
      return { modelMeta: next };
    }),

  moveModel: (provider, model, direction) =>
    set((s) => {
      const list = s.models[provider] ?? [];
      const idx = list.indexOf(model);
      if (idx < 0) return s;
      const newIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(list.length - 1, idx + 1);
      if (newIdx === idx) return s;
      const newList = [...list];
      [newList[idx], newList[newIdx]] = [newList[newIdx], newList[idx]];
      // Save order in meta
      const meta = { ...s.modelMeta };
      newList.forEach((m, i) => {
        meta[`${provider}:${m}`] = { ...meta[`${provider}:${m}`], order: i };
      });
      saveModelMeta(meta);
      return { models: { ...s.models, [provider]: newList }, modelMeta: meta };
    }),

  setBinaryPath: (kind, path) =>
    set((s) => {
      const next = { ...s.binaryPaths, [kind]: path };
      saveBinaryPaths(next);
      return { binaryPaths: next };
    }),

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
