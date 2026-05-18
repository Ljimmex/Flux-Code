/**
 * Provider system contracts — aligned with T3 Code architecture.
 * Shared types, schemas and constants for all adapters.
 * CLI-first, BYOK (Bring Your Own Key) — keys never stored in app DB.
 */

// ─── ProviderKind ───────────────────────────────────────────────────────────

export type ProviderKind =
  | 'codex'
  | 'claudeCode'
  | 'opencode'
  | 'ollama'
  | 'kimi'
  | 'gemini';

// ─── Session & Runtime ──────────────────────────────────────────────────────

export type ProviderSessionStatus =
  | 'connecting'
  | 'ready'
  | 'running'
  | 'error'
  | 'closed';

export type RuntimeMode = 'full-access' | 'approval-required';

export interface ProviderSession {
  provider: ProviderKind;
  status: ProviderSessionStatus;
  runtimeMode: RuntimeMode;
  threadId: number;
  model?: string;
  cwd?: string;
  resumeCursor?: unknown;
  activeTurnId?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  lastError?: string;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export type ProviderEventKind = 'session' | 'notification' | 'request' | 'error';

export type ProviderEventMethod =
  // session lifecycle
  | 'session/connecting'
  | 'session/threadOpenRequested'
  | 'session/threadResumeFallback'
  | 'session/ready'
  | 'session/closed'
  // turn lifecycle
  | 'turn/started'
  | 'turn/completed'
  // streaming / content
  | 'item/agentMessage/delta'
  | 'item/thinking/delta'
  | 'item/tool/started'
  | 'item/tool/completed'
  // approvals / user input
  | 'request/command'
  | 'request/file-read'
  | 'request/file-change'
  | 'request/user-input'
  // errors
  | 'error/session'
  | 'error/protocol'
  | 'error/turn';

export interface ProviderRuntimeEvent {
  id: string;
  kind: ProviderEventKind;
  provider: ProviderKind;
  threadId: number;
  createdAt: string; // ISO 8601
  method: ProviderEventMethod;
  message?: string;
  turnId?: string;
  itemId?: string;
  requestId?: string;
  requestKind?: string;
  textDelta?: string;
  toolName?: string;
  payload?: unknown;
}

// ─── Capabilities ───────────────────────────────────────────────────────────

export type ProviderSessionModelSwitchMode =
  | 'in-session'
  | 'restart-session'
  | 'unsupported';

export interface ProviderAdapterCapabilities {
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface ProviderSessionStartInput {
  threadId: number;
  provider?: ProviderKind;
  cwd?: string;
  model?: string;
  resumeCursor?: unknown;
  runtimeMode: RuntimeMode;
  interactionMode?: 'default' | 'plan';
  providerOptions?: {
    [provider: string]: {
      binaryPath?: string;
      homePath?: string;
      serverUrl?: string;
      serverPassword?: string;
      env?: Record<string, string>;
      effort?: 'low' | 'medium' | 'high';
      fastMode?: boolean;
      variant?: string;
      [key: string]: unknown;
    };
  };
  systemPrompt?: string;
}

export interface ProviderSendTurnInput {
  threadId: number;
  input?: string;
  attachments?: ChatAttachment[];
  model?: string;
  interactionMode?: 'default' | 'plan';
}

export interface ChatAttachment {
  path: string;
  mimeType?: string;
}

export interface ProviderTurnStartResult {
  turnId: string;
  resumeCursor?: unknown;
}

export interface ProviderThreadSnapshot {
  turns: ProviderThreadTurn[];
}

export interface ProviderThreadTurn {
  turnId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

// ─── Approval / Request decisions ───────────────────────────────────────────

export type ProviderApprovalDecision = 'allow' | 'deny';

export interface ProviderUserInputAnswers {
  [fieldId: string]: string;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class ProviderSessionError extends Error {
  constructor(public readonly reason: string) {
    super(`ProviderSessionError: ${reason}`);
    this.name = 'ProviderSessionError';
  }
}

export class ProviderValidationError extends Error {
  constructor(public readonly reason: string) {
    super(`ProviderValidationError: ${reason}`);
    this.name = 'ProviderValidationError';
  }
}

// ─── Health / Probe ─────────────────────────────────────────────────────────

export type ProviderStatus =
  | { kind: 'not-installed'; models?: string[]; version?: string }
  | { kind: 'not-authenticated'; installCmd: string; models?: string[]; version?: string }
  | { kind: 'ready'; models: string[]; version?: string }
  | { kind: 'error'; message: string; models?: string[]; version?: string };

// ─── Fallback data ──────────────────────────────────────────────────────────

export const FALLBACK_MODELS: Record<ProviderKind, string[]> = {
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
  claudeCode: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7'],
  opencode: [
    'big-pickle',
    'deepseek-v4-flash-free',
    'glm-4.7-free',
    'glm-5-free',
    'grok-code',
    'hy3-preview-free',
    'kimi-k2.5-free',
    'ling-2.6-flash-free',
    'mimo-v2-flash-free',
    'mimo-v2-omni-free',
    'mimo-v2-pro-free',
    'minimax-m2.1-free',
    'minimax-m2.5-free',
    'nemotron-3-super-free',
    'qwen3.6-plus-free',
    'ring-2.6-1t-free',
    'trinity-large-preview-free',
  ],
  ollama: ['llama3.3', 'llama3.2', 'mistral'],
  kimi: ['kimi-code/kimi-for-coding', 'kimi-code/kimi-for-coding,thinking'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

export const DEFAULT_MODEL: Record<ProviderKind, string> = {
  codex: 'codex-mini-latest',
  claudeCode: 'claude-sonnet-4-6',
  opencode: 'deepseek-v4-flash-free',
  ollama: 'llama3.3',
  kimi: 'kimi-code/kimi-for-coding',
  gemini: 'gemini-2.5-pro',
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: 'OpenAI Codex',
  claudeCode: 'Claude Code (Anthropic)',
  opencode: 'OpenCode',
  ollama: 'Ollama (Local Models)',
  kimi: 'Kimi (Moonshot AI)',
  gemini: 'Gemini (Google)',
};

export const PROVIDER_AUTH_INSTRUCTIONS: Record<ProviderKind, string[]> = {
  codex: ['npm install -g @openai/codex', 'codex login'],
  claudeCode: ['npm install -g @anthropic-ai/claude-code', 'claude auth login'],
  opencode: ['npm install -g opencode-ai', 'opencode config set provider moonshot'],
  ollama: ['# Install Ollama from ollama.com', 'ollama pull llama3.3', 'ollama pull mistral'],
  kimi: ['npm install -g kimi-cli', 'kimi-cli auth login'],
  gemini: ['npm install -g @google/gemini-cli', 'gemini auth login'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

let _eventIdCounter = 0;
export function generateEventId(): string {
  return `evt-${Date.now()}-${++_eventIdCounter}`;
}

export function generateTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
