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

export const PROVIDER_AUTH_INSTRUCTIONS: Record<ProviderKind, string[]> = {
  codex: ['npm install -g @openai/codex', 'codex login'],
  claude: ['npm install -g @anthropic-ai/claude-code', 'claude auth login'],
  opencode: ['npm install -g opencode-ai', 'opencode config set provider moonshot'],
  ollama: ['# Install Ollama from ollama.com', 'ollama pull llama3.3'],
  kimi: ['npm install -g kimi-cli', 'kimi-cli auth login'],
  gemini: ['npm install -g @google/gemini-cli', 'gemini auth login'],
};
