/**
 * Model contracts and normalization — aligned with T3 Code.
 * This file replaces hardcoded model arrays in adapters.
 */

import { execSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════════
//  Codex
// ═══════════════════════════════════════════════════════════════════════════════

export const CODEX_DEFAULT_MODEL = 'gpt-5.3-codex';

export const CODEX_MODELS = [
  { slug: 'gpt-5.5', label: 'GPT-5.5' },
  { slug: 'gpt-5.4', label: 'GPT-5.4' },
  { slug: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { slug: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', default: true },
  { slug: 'gpt-5.2', label: 'GPT-5.2' },
  { slug: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { slug: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { slug: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
] as const;

export type CodexModelSlug = (typeof CODEX_MODELS)[number]['slug'];

export type CodexPlanType = 'free' | 'go' | 'plus' | 'pro' | 'team' | 'enterprise';

export interface CodexAccountSnapshot {
  readonly type: 'apiKey' | 'chatgpt' | 'unknown';
  readonly planType: CodexPlanType | null;
  readonly sparkEnabled: boolean;
}

export const CODEX_SPARK_DISABLED_PLAN_TYPES = new Set<CodexPlanType>([
  'free',
  'go',
  'plus',
]);

export interface CodexModelOptions {
  fastMode?: boolean;
  effort?: 'low' | 'medium' | 'high';
}

export function resolveCodexModelForAccount(
  model: string | undefined,
  _account: CodexAccountSnapshot,
): string {
  return model ?? CODEX_DEFAULT_MODEL;
}

/** Probe Codex account type by asking CLI. Best-effort — never throws. */
export function probeCodexAccount(binaryPath: string): CodexAccountSnapshot {
  try {
    const opts: { timeout: number; encoding: 'utf8'; stdio: ['pipe', 'pipe', 'pipe'] } = { timeout: 8_000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    if (process.platform === 'win32') (opts as any).shell = true;
    const out = execSync(`${binaryPath} account info --json`, opts);
    const data = JSON.parse(out) as { plan?: string; type?: string };
    const planType = (data.plan ?? null) as CodexPlanType | null;
    return {
      type: (data.type as any) ?? 'unknown',
      planType,
      sparkEnabled: planType ? !CODEX_SPARK_DISABLED_PLAN_TYPES.has(planType) : false,
    };
  } catch {
    // Fallback: assume free tier / no spark
    return { type: 'unknown', planType: null, sparkEnabled: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Claude Code
// ═══════════════════════════════════════════════════════════════════════════════

export const CLAUDE_MODELS = [
  { slug: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', aliases: [], default: false, tier: 'fast' },
  { slug: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', aliases: [], default: true, tier: 'balanced' },
  { slug: 'claude-opus-4-5', label: 'Claude Opus 4.5', aliases: [], default: false, tier: 'powerful' },
  { slug: 'claude-opus-4-6', label: 'Claude Opus 4.6', aliases: [], default: false, tier: 'powerful' },
  { slug: 'claude-opus-4-7', label: 'Claude Opus 4.7', aliases: [], default: false, tier: 'powerful' },
] as const;

export type ClaudeModelSlug = (typeof CLAUDE_MODELS)[number]['slug'];

export const CLAUDE_ALIAS_MAP: Record<string, ClaudeModelSlug> = {};

export function normalizeClaudeModel(raw: string): ClaudeModelSlug {
  if (raw in CLAUDE_ALIAS_MAP) {
    return CLAUDE_ALIAS_MAP[raw];
  }
  const known = CLAUDE_MODELS.find((m) => m.slug === raw);
  if (known) return known.slug;
  return 'claude-sonnet-4-6';
}

export const CLAUDE_CODE_EFFORT_OPTIONS = [
  { value: 'low' as const, label: 'Low', description: 'Szybszy, mniej dokładny' },
  { value: 'medium' as const, label: 'Medium', description: 'Zbalansowany' },
  { value: 'medium-high' as const, label: 'High', description: 'Dokładniejszy' },
  { value: 'ultrathink' as const, label: 'Ultrathink', description: 'Maksymalne reasoning' },
] as const;

export type ClaudeEffort = (typeof CLAUDE_CODE_EFFORT_OPTIONS)[number]['value'];

export interface ClaudeModelOptions {
  effort: ClaudeEffort;
  thinking: boolean;
  fastMode: boolean;
}

export interface ClaudeCapabilities {
  supportsThinking: boolean;
  supportsUltrathink: boolean;
}

/** Probe installed Claude CLI version to detect capabilities. */
export function probeClaudeCapabilities(binaryPath: string): ClaudeCapabilities {
  try {
    const opts: { timeout: number; encoding: 'utf8'; stdio: ['pipe', 'pipe', 'pipe'] } = { timeout: 10_000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    if (process.platform === 'win32') (opts as any).shell = true;
    const out = execSync(`${binaryPath} --version`, opts).trim();
    // Parse semver-like version from output (e.g. "claude 1.8.2" or "1.8.2")
    const match = out.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { supportsThinking: false, supportsUltrathink: false };
    const [maj, min, pat] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    const supportsThinking = maj > 1 || (maj === 1 && min >= 5);
    const supportsUltrathink = maj > 1 || (maj === 1 && min >= 7);
    return { supportsThinking, supportsUltrathink };
  } catch {
    return { supportsThinking: false, supportsUltrathink: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OpenCode
// ═══════════════════════════════════════════════════════════════════════════════

export interface OpenCodeModel {
  id: string; // "provider/model-id"
  name: string;
  provider: string;
  contextSize?: number;
}

export const OPENCODE_MINIMUM_VERSION = '1.14.19';

/** Default models bundled with OpenCode CLI (shown when dynamic fetch fails). */
export const OPENCODE_DEFAULT_MODELS: OpenCodeModel[] = [
  { id: 'big-pickle', name: 'Big Pickle', provider: 'opencode' },
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash Free', provider: 'opencode' },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free', provider: 'opencode' },
  { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super Free', provider: 'opencode' },
  { id: 'qwen3.6-plus-free', name: 'Qwen3.6 Plus Free', provider: 'opencode' },
];

/**
 * Fetch models from OpenCode CLI.
 * Tries `opencode models <provider>` and falls back to the static default list.
 */
export async function fetchOpenCodeModels(binaryPath: string): Promise<OpenCodeModel[]> {
  try {
    const { spawn } = await import('child_process');
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(binaryPath, ['models', 'opencode'], {
        timeout: 15_000,
        shell: process.platform === 'win32',
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d; });
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`opencode models exited ${code}: ${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });

    // Parse plain-text output line-by-line.
    // We look for lines that start with an indented bullet or a model name.
    const lines = result.split('\n');
    const parsed: OpenCodeModel[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip headers, help text, or lines that look like CLI flags
      if (trimmed.startsWith('Options:') || trimmed.startsWith('-') || trimmed.startsWith('Positionals:')) continue;
      if (trimmed.startsWith('opencode') || trimmed.startsWith('provider') || trimmed.startsWith('list')) continue;
      // Heuristic: take the first token as the ID, rest as name
      const parts = trimmed.split(/\s{2,}/); // split on 2+ spaces
      const id = parts[0].toLowerCase().replace(/\s+/g, '-');
      const name = parts.length > 1 ? parts[0] : parts[0];
      if (id && !parsed.find((m) => m.id === id)) {
        parsed.push({ id, name: name || id, provider: 'opencode' });
      }
    }

    return parsed.length > 0 ? parsed : OPENCODE_DEFAULT_MODELS;
  } catch {
    return OPENCODE_DEFAULT_MODELS;
  }
}

/** Check if installed OpenCode version meets minimum requirement. */
export function checkOpenCodeVersion(binaryPath: string): { ok: boolean; version?: string; reason?: string } {
  try {
    const opts: { timeout: number; encoding: 'utf8'; stdio: ['pipe', 'pipe', 'pipe'] } = { timeout: 5_000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
    if (process.platform === 'win32') (opts as any).shell = true;
    const out = execSync(`${binaryPath} --version`, opts).trim();
    const match = out.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { ok: false, version: out, reason: 'unparsable_version' };
    const [maj, min, pat] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    const version = `${maj}.${min}.${pat}`;
    const minMaj = 1, minMin = 14, minPat = 19;
    const ok = maj > minMaj || (maj === minMaj && min > minMin) || (maj === minMaj && min === minMin && pat >= minPat);
    return ok ? { ok: true, version } : { ok: false, version, reason: 'version_too_old' };
  } catch {
    return { ok: false, reason: 'not_installed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Generic helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function getCliVersion(binaryPath: string): string | undefined {
  try {
    const opts: { timeout: number; encoding: 'utf8'; stdio: ['pipe', 'pipe', 'pipe'] } = {
      timeout: 5_000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    };
    if (process.platform === 'win32') (opts as any).shell = true;
    const out = execSync(`${binaryPath} --version`, opts).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

export function getDefaultModelSlug(provider: 'codex' | 'claudeCode'): string {
  if (provider === 'codex') return CODEX_DEFAULT_MODEL;
  return 'claude-sonnet-4-6';
}
