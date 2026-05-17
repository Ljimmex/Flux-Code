/**
 * Provider system contracts — shared types for all adapters.
 * CLI-first, BYOK (Bring Your Own Key) — keys never stored in app DB.
 */

export type ProviderKind =
  | 'codex'
  | 'claude'
  | 'opencode'
  | 'ollama'
  | 'kimi'
  | 'gemini';

export type ProviderRuntimeEvent =
  | { type: 'session.starting'; sessionId: string }
  | { type: 'session.ready'; sessionId: string }
  | { type: 'session.error'; sessionId: string; message: string }
  | { type: 'session.stopped'; sessionId: string }
  | { type: 'turn.started'; sessionId: string; turnId: string }
  | { type: 'content.delta'; sessionId: string; turnId: string; text: string }
  | { type: 'content.thinking'; sessionId: string; turnId: string; text: string }
  | { type: 'turn.completed'; sessionId: string; turnId: string }
  | { type: 'turn.error'; sessionId: string; turnId: string; message: string }
  | { type: 'approval.requested'; sessionId: string; turnId: string; requestId: string; description: string; fileDiff?: string }
  | { type: 'file.changed'; sessionId: string; path: string; kind: 'created' | 'modified' | 'deleted' };

export type ProviderStatus =
  | { kind: 'not-installed' }
  | { kind: 'not-authenticated'; installCmd: string }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

export interface SessionStartOpts {
  sessionId: string;
  threadId: number;
  projectPath: string;
  model: string;
  systemPrompt?: string;
  resumeToken?: string;
}

export interface TurnSendOpts {
  sessionId: string;
  turnId: string;
  prompt: string;
  contextFiles?: string[];
}

/**
 * Static fallback models — used when probe() hasn't returned yet
 * or CLI is unavailable. Real catalog lives in HealthService.modelCache.
 */
export const FALLBACK_MODELS: Record<ProviderKind, string[]> = {
  codex: ['codex-1', 'o3', 'o4-mini'],
  claude: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'],
  opencode: ['kimi-k2.6', 'claude-opus-4', 'gpt-4o'],
  ollama: ['llama3.3', 'llama3.2', 'mistral'],
  kimi: ['kimi-k2.6', 'kimi-k2.5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

export const DEFAULT_MODEL: Record<ProviderKind, string> = {
  codex: 'codex-1',
  claude: 'claude-sonnet-4',
  opencode: 'kimi-k2.6',
  ollama: 'llama3.3',
  kimi: 'kimi-k2.6',
  gemini: 'gemini-2.5-pro',
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: 'OpenAI Codex',
  claude: 'Claude Code (Anthropic)',
  opencode: 'OpenCode',
  ollama: 'Ollama (Local Models)',
  kimi: 'Kimi (Moonshot AI)',
  gemini: 'Gemini (Google)',
};

export const PROVIDER_AUTH_INSTRUCTIONS: Record<ProviderKind, string[]> = {
  codex: ['npm install -g @openai/codex', 'codex login'],
  claude: ['npm install -g @anthropic-ai/claude-code', 'claude auth login'],
  opencode: ['npm install -g opencode-ai', 'opencode config set provider moonshot'],
  ollama: ['# Install Ollama from ollama.com', 'ollama pull llama3.3', 'ollama pull mistral'],
  kimi: ['npm install -g kimi-cli', 'kimi-cli auth login'],
  gemini: ['npm install -g @google/gemini-cli', 'gemini auth login'],
};
