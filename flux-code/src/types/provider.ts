export type ProviderKind =
  | 'codex'
  | 'claude'
  | 'opencode'
  | 'ollama'
  | 'kimi'
  | 'gemini';

export type ProviderStatus =
  | { kind: 'not-installed' }
  | { kind: 'not-authenticated'; installCmd: string }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

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
