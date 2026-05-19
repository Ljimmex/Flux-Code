import https from 'https';
import type { ProviderKind } from './types';

const PROVIDER_NPM_PACKAGES: Record<ProviderKind, string | undefined> = {
  codex: '@openai/codex',
  claudeCode: '@anthropic-ai/claude-code',
  opencode: 'opencode-ai',
  ollama: undefined,
  kimi: 'kimi-cli',
  antigravity: undefined,
};

export const PROVIDER_INSTALL_COMMANDS: Record<ProviderKind, string | undefined> = {
  codex: 'npm install -g @openai/codex@latest',
  claudeCode: 'npm install -g @anthropic-ai/claude-code@latest',
  opencode: 'npm install -g opencode-ai@latest',
  ollama: undefined,
  kimi: 'uv tool upgrade kimi-cli --no-cache',
  antigravity: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
};

export interface ProviderUpdateInfo {
  current?: string;
  latest?: string;
  hasUpdate: boolean;
}

function fetchNpmLatestVersion(packageName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    https
      .get(url, { timeout: 10_000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (typeof json.version === 'string') {
              resolve(json.version);
            } else {
              resolve(undefined);
            }
          } catch {
            resolve(undefined);
          }
        });
      })
      .on('error', () => resolve(undefined))
      .on('timeout', () => resolve(undefined));
  });
}

function fetchPypiLatestVersion(packageName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    https
      .get(url, { timeout: 10_000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (typeof json.info?.version === 'string') {
              resolve(json.info.version);
            } else {
              resolve(undefined);
            }
          } catch {
            resolve(undefined);
          }
        });
      })
      .on('error', () => resolve(undefined))
      .on('timeout', () => resolve(undefined));
  });
}

function extractSemver(input: string): string | undefined {
  const match = input.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match[0] : undefined;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export async function checkProviderUpdates(
  statuses: Record<string, { version?: string }>,
): Promise<Record<string, ProviderUpdateInfo>> {
  const result: Record<string, ProviderUpdateInfo> = {};
  const entries = Object.entries(statuses) as [ProviderKind, { version?: string }][];

  await Promise.all(
    entries.map(async ([kind, status]) => {
      const currentRaw = status?.version;
      if (!currentRaw) {
        result[kind] = { current: undefined, hasUpdate: false };
        return;
      }

      const current = extractSemver(currentRaw);
      let latest: string | undefined;

      if (kind === 'kimi') {
        latest = await fetchPypiLatestVersion('kimi-cli');
      } else {
        const pkg = PROVIDER_NPM_PACKAGES[kind];
        if (pkg) {
          latest = await fetchNpmLatestVersion(pkg);
        }
      }

      if (!current || !latest) {
        result[kind] = { current: currentRaw, latest, hasUpdate: false };
        return;
      }

      const hasUpdate = compareSemver(current, latest) < 0;
      result[kind] = { current, latest, hasUpdate };
    }),
  );

  return result;
}
