import { create } from 'zustand';
import { DEFAULT_MODEL, type ProviderKind } from '../types/provider';

export type ProviderStatus =
  | { kind: 'not-installed' }
  | { kind: 'not-authenticated'; installCmd: string }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

export interface CodexModelOptions {
  fastMode?: boolean;
  effort?: 'low' | 'medium' | 'high';
}

export interface ClaudeModelOptions {
  effort: 'low' | 'medium' | 'medium-high' | 'ultrathink';
  thinking: boolean;
  fastMode: boolean;
}

export interface ProviderDraft {
  model?: string;
  modelOptions?: CodexModelOptions | ClaudeModelOptions | Record<string, unknown>;
  homePath?: string;
  shadowHomePath?: string;
}

const ENABLED_KEY = 'flux:providers:enabled';
const MODEL_META_KEY = 'flux:providers:modelMeta';
const BINARY_PATHS_KEY = 'flux:providers:binaryPaths';
const DRAFTS_KEY = 'flux:providers:drafts';
const LABELS_KEY = 'flux:providers:labels';
const ACCENTS_KEY = 'flux:providers:accents';
const ENV_KEY = 'flux:providers:env';
const SERVER_URLS_KEY = 'flux:providers:serverUrls';
const SERVER_PASSWORDS_KEY = 'flux:providers:serverPasswords';

function loadEnabled(): Record<ProviderKind, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    codex: true,
    claudeCode: true,
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

function loadDrafts(): Record<ProviderKind, ProviderDraft> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    codex: { model: DEFAULT_MODEL.codex },
    claudeCode: { model: DEFAULT_MODEL.claudeCode },
    opencode: { model: DEFAULT_MODEL.opencode },
    ollama: { model: DEFAULT_MODEL.ollama },
    kimi: { model: DEFAULT_MODEL.kimi },
    gemini: { model: DEFAULT_MODEL.gemini },
  };
}

function saveDrafts(drafts: Record<ProviderKind, ProviderDraft>) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function loadRecord(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveRecord(key: string, data: Record<string, string>) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadEnv(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveEnv(data: Record<string, Record<string, string>>) {
  localStorage.setItem(ENV_KEY, JSON.stringify(data));
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
  // Persisted draft per provider (model + options)
  providerDrafts: Record<ProviderKind, ProviderDraft>;
  // Custom display labels per provider
  providerLabels: Record<string, string>;
  // Accent colors per provider (hex)
  accentColors: Record<string, string>;
  // Environment variables per provider
  envVars: Record<string, Record<string, string>>;
  // Server URLs per provider
  serverUrls: Record<string, string>;
  // Server passwords per provider
  serverPasswords: Record<string, string>;
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
  setProviderDraft: (kind: ProviderKind, draft: Partial<ProviderDraft>) => void;
  setModelOptions: (kind: ProviderKind, options: ProviderDraft['modelOptions']) => void;
  setProviderLabel: (kind: ProviderKind, label: string) => void;
  setAccentColor: (kind: ProviderKind, color: string) => void;
  setEnvVar: (kind: ProviderKind, key: string, value: string) => void;
  removeEnvVar: (kind: ProviderKind, key: string) => void;
  setServerUrl: (kind: ProviderKind, url: string) => void;
  setServerPassword: (kind: ProviderKind, password: string) => void;
  setHomePath: (kind: ProviderKind, path: string) => void;
  setShadowHomePath: (kind: ProviderKind, path: string) => void;
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
  providerDrafts: loadDrafts(),
  providerLabels: loadRecord(LABELS_KEY),
  accentColors: loadRecord(ACCENTS_KEY),
  envVars: loadEnv(),
  serverUrls: loadRecord(SERVER_URLS_KEY),
  serverPasswords: loadRecord(SERVER_PASSWORDS_KEY),
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

  setProviderDraft: (kind, draft) =>
    set((s) => {
      const next = {
        ...s.providerDrafts,
        [kind]: { ...s.providerDrafts[kind], ...draft },
      };
      saveDrafts(next);
      return { providerDrafts: next };
    }),

  setModelOptions: (kind, options) =>
    set((s) => {
      const next = {
        ...s.providerDrafts,
        [kind]: { ...s.providerDrafts[kind], modelOptions: options },
      };
      saveDrafts(next);
      return { providerDrafts: next };
    }),

  setProviderLabel: (kind, label) =>
    set((s) => {
      const next = { ...s.providerLabels, [kind]: label };
      saveRecord(LABELS_KEY, next);
      return { providerLabels: next };
    }),

  setAccentColor: (kind, color) =>
    set((s) => {
      const next = { ...s.accentColors, [kind]: color };
      saveRecord(ACCENTS_KEY, next);
      return { accentColors: next };
    }),

  setEnvVar: (kind, key, value) =>
    set((s) => {
      const next = { ...s.envVars, [kind]: { ...s.envVars[kind], [key]: value } };
      saveEnv(next);
      return { envVars: next };
    }),

  removeEnvVar: (kind, key) =>
    set((s) => {
      const providerEnv = { ...s.envVars[kind] };
      delete providerEnv[key];
      const next = { ...s.envVars, [kind]: providerEnv };
      saveEnv(next);
      return { envVars: next };
    }),

  setServerUrl: (kind, url) =>
    set((s) => {
      const next = { ...s.serverUrls, [kind]: url };
      saveRecord(SERVER_URLS_KEY, next);
      return { serverUrls: next };
    }),

  setServerPassword: (kind, password) =>
    set((s) => {
      const next = { ...s.serverPasswords, [kind]: password };
      saveRecord(SERVER_PASSWORDS_KEY, next);
      return { serverPasswords: next };
    }),

  setHomePath: (kind, path) =>
    set((s) => {
      const next = { ...s.providerDrafts, [kind]: { ...s.providerDrafts[kind], homePath: path } };
      saveDrafts(next);
      return { providerDrafts: next };
    }),

  setShadowHomePath: (kind, path) =>
    set((s) => {
      const next = { ...s.providerDrafts, [kind]: { ...s.providerDrafts[kind], shadowHomePath: path } };
      saveDrafts(next);
      return { providerDrafts: next };
    }),

  setActiveProvider: (kind) =>
    set((s) => {
      const available = s.models[kind] ?? [];
      const draft = s.providerDrafts[kind];
      const desiredModel = draft?.model ?? DEFAULT_MODEL[kind];
      const activeModel = available.includes(desiredModel) ? desiredModel : (available[0] ?? DEFAULT_MODEL[kind]);
      return {
        activeProvider: kind,
        activeModel,
      };
    }),

  setActiveModel: (model) =>
    set((s) => {
      const kind = s.activeProvider;
      const nextDrafts = {
        ...s.providerDrafts,
        [kind]: { ...s.providerDrafts[kind], model },
      };
      saveDrafts(nextDrafts);
      return { activeModel: model, providerDrafts: nextDrafts };
    }),

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
