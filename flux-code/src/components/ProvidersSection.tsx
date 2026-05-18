import { useState } from 'react';
import { useProviderStore } from '../stores/providerStore';
import { PROVIDER_DISPLAY_NAMES, PROVIDER_AUTH_INSTRUCTIONS, type ProviderKind } from '../types/provider';
import {
  RefreshCw, ChevronDown, AlertCircle, ArrowUpCircle,
  CodexIcon, OllamaIcon, OpenCodeIcon, ClaudeIcon, KimiIcon, GeminiIcon,
} from './icons';
import ProviderUpdateModal from './ProviderUpdateModal';

type StatusKind = 'not-installed' | 'not-authenticated' | 'ready' | 'error';

const PROVIDER_ICONS: Record<ProviderKind, React.ComponentType<{ size?: number; className?: string }>> = {
  codex: CodexIcon,
  claudeCode: ClaudeIcon,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
  kimi: KimiIcon,
  gemini: GeminiIcon,
};

const STATUS_COLORS: Record<StatusKind, string> = {
  ready: '#23c55e',
  'not-installed': '#6b7280',
  'not-authenticated': '#f59e0b',
  error: '#f85149',
};

const ALL_PROVIDERS: ProviderKind[] = ['codex', 'claudeCode', 'opencode', 'ollama', 'kimi', 'gemini'];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onChange}
      aria-pressed={checked}
      disabled={disabled}
      title={disabled ? 'Provider not installed' : undefined}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}

function StarBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button className="model-action-btn" onClick={onClick} title={active ? 'Unfavorite' : 'Favorite'}>
      <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={active ? 'currentColor' : 'none'} />
      </svg>
    </button>
  );
}

function ArrowUpBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="model-action-btn" onClick={onClick} title="Move up">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
    </button>
  );
}

function ArrowDownBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="model-action-btn" onClick={onClick} title="Move down">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
  );
}

function EyeOffBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="model-action-btn" onClick={onClick} title="Hide from picker">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
        <line x1="2" x2="22" y1="2" y2="22"/>
      </svg>
    </button>
  );
}

const ACCENT_PRESETS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

const PROVIDER_INSTALL_COMMANDS: Record<ProviderKind, string | undefined> = {
  codex: 'npm install -g @openai/codex@latest',
  claudeCode: 'npm install -g @anthropic-ai/claude-code@latest',
  opencode: 'npm install -g opencode-ai@latest',
  ollama: undefined,
  kimi: 'npm install -g kimi-cli@latest',
  gemini: 'npm install -g @google/gemini-cli@latest',
};

function ProviderCard({
  kind, status, models, expanded, onToggle, onProbe, enabled, onToggleEnabled,
  updateInfo,
  onOpenUpdate,
}: {
  kind: ProviderKind;
  status: any;
  models: string[];
  expanded: boolean;
  onToggle: () => void;
  onProbe: () => void;
  enabled: boolean;
  onToggleEnabled: () => void;
  updateInfo?: { current?: string; latest?: string; hasUpdate: boolean };
  onOpenUpdate: () => void;
}) {
  const Icon = PROVIDER_ICONS[kind];
  const defaultDisplayName = PROVIDER_DISPLAY_NAMES[kind];
  const instructions = PROVIDER_AUTH_INSTRUCTIONS[kind];
  const statusKind = (status?.kind as StatusKind) ?? 'not-installed';
  const statusColor = STATUS_COLORS[statusKind];
  const isReady = statusKind === 'ready';
  const isNotAuth = statusKind === 'not-authenticated';
  const isNotInstalled = statusKind === 'not-installed';
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [newModel, setNewModel] = useState('');
  const [addingEnv, setAddingEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const {
    modelMeta, setModelMeta, moveModel,
    binaryPaths, setBinaryPath,
    providerLabels, setProviderLabel,
    accentColors, setAccentColor,
    envVars, setEnvVar, removeEnvVar,
    serverUrls, setServerUrl,
    serverPasswords, setServerPassword,
    providerDrafts, setHomePath, setShadowHomePath,
  } = useProviderStore();
  const binaryPath = binaryPaths[kind] ?? '';
  const label = providerLabels[kind] ?? '';
  const accent = accentColors[kind] ?? '';
  const providerEnv = envVars[kind] ?? {};
  const serverUrl = serverUrls[kind] ?? '';
  const serverPassword = serverPasswords[kind] ?? '';
  const draft = providerDrafts[kind] ?? {};
  const homePath = draft.homePath ?? '';
  const shadowHomePath = draft.shadowHomePath ?? '';

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setApiKey('');
    onProbe();
  };

  const handleBinaryPathChange = (value: string) => {
    setBinaryPath(kind, value);
    window.electronAPI.provider.setBinaryPath(kind, value);
  };

  const displayName = label.trim() || defaultDisplayName;

  const sortedModels = [...models].sort((a, b) => {
    const orderA = modelMeta[`${kind}:${a}`]?.order ?? 0;
    const orderB = modelMeta[`${kind}:${b}`]?.order ?? 0;
    return orderA - orderB;
  });

  return (
    <div className={`provider-card ${expanded ? 'expanded' : ''}`}>
      <div className="provider-header">
        <div className="provider-info">
          <div className="provider-icon-wrap">
            <Icon size={20} />
            <span className="provider-status-dot-icon" style={{ backgroundColor: statusColor }} title={statusKind.replace('-', ' ')} />
          </div>
          <div className="provider-name-group">
            <span className="provider-name">
              {displayName}
              {status?.version && <span className="provider-version">{status.version}</span>}
              {updateInfo?.hasUpdate && (
                <button className="provider-update-badge" onClick={(e) => { e.stopPropagation(); onOpenUpdate(); }} title={`Update available: ${updateInfo.latest}`}>
                  <ArrowUpCircle size={12} />
                  <span>New</span>
                </button>
              )}
            </span>
            <span className="provider-status">
              {isReady
                ? `${models.length} models available`
                : isNotInstalled
                ? 'Not installed'
                : isNotAuth
                ? 'Not authenticated — setup required'
                : status?.message || 'Checking...'}
            </span>
          </div>
        </div>

        <div className="provider-actions">
          <button className="provider-chevron" onClick={onToggle} title={expanded ? 'Collapse' : 'Expand'}>
            <ChevronDown size={16} className={expanded ? 'rotated' : ''} />
          </button>
          <Toggle checked={enabled} onChange={onToggleEnabled} disabled={isNotInstalled} />
        </div>
      </div>

      {expanded && (
        <div className="provider-details">
          {/* Display name */}
          <div className="provider-field">
            <label className="provider-label">Display name</label>
            <input
              className="settings-input"
              placeholder={defaultDisplayName}
              value={label}
              onChange={(e) => setProviderLabel(kind, e.target.value)}
            />
            <span className="provider-hint">Optional label shown in the provider list.</span>
          </div>

          {/* Accent color */}
          <div className="provider-field">
            <label className="provider-label">Accent color</label>
            <div className="provider-colors">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`provider-color-dot ${accent === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setAccentColor(kind, c)}
                  title={c}
                />
              ))}
            </div>
            <span className="provider-hint">Used to distinguish this instance in picker rails and model lists.</span>
          </div>

          {/* Binary path */}
          <div className="provider-field">
            <label className="provider-label">Binary path</label>
            <input
              className="settings-input"
              placeholder={kind === 'ollama' ? 'ollama' : kind === 'kimi' ? 'kimi-cli' : kind}
              value={binaryPath}
              onChange={(e) => handleBinaryPathChange(e.target.value)}
            />
            <span className="provider-hint">Path to the {defaultDisplayName} binary. Leave blank to use default.</span>
          </div>

          {/* Codex-specific paths */}
          {kind === 'codex' && (
            <>
              <div className="provider-field">
                <label className="provider-label">CODEX_HOME path</label>
                <input
                  className="settings-input"
                  placeholder="~/.codex"
                  value={homePath}
                  onChange={(e) => setHomePath(kind, e.target.value)}
                />
                <span className="provider-hint">Custom Codex home and config directory.</span>
              </div>
              <div className="provider-field">
                <label className="provider-label">Shadow home path</label>
                <input
                  className="settings-input"
                  placeholder="~/.codex-t3/personal"
                  value={shadowHomePath}
                  onChange={(e) => setShadowHomePath(kind, e.target.value)}
                />
                <span className="provider-hint">Account-specific Codex home. Keeps auth.json separate while sharing state from CODEX_HOME.</span>
              </div>
            </>
          )}

          {/* Server URL */}
          <div className="provider-field">
            <label className="provider-label">Server URL</label>
            <input
              className="settings-input"
              placeholder="http://127.0.0.1:4096"
              value={serverUrl}
              onChange={(e) => setServerUrl(kind, e.target.value)}
            />
            <span className="provider-hint">Leave blank to let Flux Code spawn the server when needed.</span>
          </div>

          {/* Server password */}
          <div className="provider-field">
            <label className="provider-label">Server password</label>
            <input
              className="settings-input"
              type="password"
              placeholder="Optional"
              value={serverPassword}
              onChange={(e) => setServerPassword(kind, e.target.value)}
            />
            <span className="provider-hint">Stored in plain text on disk.</span>
          </div>

          {/* Environment variables */}
          <div className="provider-field">
            <div className="provider-env-header">
              <label className="provider-label">Environment variables</label>
              <button className="settings-btn small" onClick={() => setAddingEnv(true)}>+ Add</button>
            </div>
            <span className="provider-hint">Add variables to pass API keys, base URLs, or other per-instance CLI settings.</span>
            <div className="provider-env-list">
              {Object.entries(providerEnv).map(([k, v]) => (
                <div key={k} className="provider-env-item">
                  <span className="provider-env-key">{k}</span>
                  <span className="provider-env-sep">=</span>
                  <span className="provider-env-val">{v}</span>
                  <button className="provider-env-remove" onClick={() => removeEnvVar(kind, k)} title="Remove">×</button>
                </div>
              ))}
              {addingEnv && (
                <div className="provider-env-add">
                  <input className="settings-input" placeholder="KEY" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} autoFocus />
                  <input className="settings-input" placeholder="value" value={newEnvValue} onChange={(e) => setNewEnvValue(e.target.value)} />
                  <button
                    className="settings-btn"
                    disabled={!newEnvKey.trim()}
                    onClick={() => {
                      setEnvVar(kind, newEnvKey.trim(), newEnvValue);
                      setNewEnvKey('');
                      setNewEnvValue('');
                      setAddingEnv(false);
                    }}
                  >
                    Add
                  </button>
                  <button className="settings-btn ghost" onClick={() => { setAddingEnv(false); setNewEnvKey(''); setNewEnvValue(''); }}>Cancel</button>
                </div>
              )}
            </div>
          </div>

          {/* Auth instructions */}
          {(isNotInstalled || isNotAuth) && (
            <div className="provider-field">
              <label className="provider-label">Setup instructions</label>
              <div className="provider-instructions">
                {instructions.map((cmd: string, i: number) => (
                  <code key={i} className="provider-instruction-cmd">
                    {cmd.startsWith('#') ? cmd.slice(1).trim() : `$ ${cmd}`}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* API key for Kimi */}
          {kind === 'kimi' && (
            <div className="provider-field">
              <label className="provider-label">API Key</label>
              <div className="provider-apikey-row">
                <input className="settings-input" type={showKey ? 'text' : 'password'} placeholder="sk-moon-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                <button className="settings-btn" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button>
                <button className="settings-btn" onClick={handleSaveApiKey} disabled={!apiKey.trim()}>Save</button>
              </div>
            </div>
          )}

          {/* Models list */}
          {sortedModels.length > 0 && (
            <div className="provider-field">
              <label className="provider-label">Models</label>
              <span className="provider-hint">{sortedModels.length} models available.</span>
              <div className="provider-model-rows">
                {sortedModels.map((model) => {
                  const meta = modelMeta[`${kind}:${model}`] ?? {};
                  const isFav = meta.favorite ?? false;
                  const isHidden = meta.hidden ?? false;
                  if (isHidden) return null;
                  return (
                    <div key={model} className="provider-model-row">
                      <div className="provider-model-left">
                        <span className="provider-model-info-icon" title="Model">○</span>
                        <span className="provider-model-name">{model}</span>
                      </div>
                      <div className="provider-model-actions">
                        <StarBtn active={isFav} onClick={() => setModelMeta(`${kind}:${model}`, { favorite: !isFav })} />
                        <ArrowUpBtn onClick={() => moveModel(kind, model, 'up')} />
                        <ArrowDownBtn onClick={() => moveModel(kind, model, 'down')} />
                        <EyeOffBtn onClick={() => setModelMeta(`${kind}:${model}`, { hidden: true })} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hidden models toggle */}
              {sortedModels.some(m => modelMeta[`${kind}:${m}`]?.hidden) && (
                <div className="provider-hidden-models">
                  <span className="provider-hint">Hidden models:</span>
                  {sortedModels.filter(m => modelMeta[`${kind}:${m}`]?.hidden).map(m => (
                    <button key={m} className="provider-hidden-chip" onClick={() => setModelMeta(`${kind}:${m}`, { hidden: false })}>
                      {m} (show)
                    </button>
                  ))}
                </div>
              )}

              {/* Add model */}
              <div className="provider-model-add">
                <input className="settings-input" placeholder="model-name" value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newModel.trim()) { setNewModel(''); } }} />
                <button className="settings-btn" onClick={() => { if (newModel.trim()) setNewModel(''); }}>+ Add</button>
              </div>
            </div>
          )}

          {status?.kind === 'error' && (
            <div className="provider-field">
              <div className="provider-error-box"><AlertCircle size={14} /><span>{status.message}</span></div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function ProvidersSection() {
  const { statuses, models, enabledProviders, toggleProvider, availableUpdates, setAvailableUpdates } = useProviderStore();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [updateModalProvider, setUpdateModalProvider] = useState<ProviderKind | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleProbe = async (kind: ProviderKind) => {
    await window.electronAPI.provider.probe(kind);
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      for (const kind of ALL_PROVIDERS) {
        await handleProbe(kind);
      }
    } finally {
      setIsRefreshing(false);
      setLastRefreshed(new Date());
      // Re-check updates so badges disappear when CLIs are now up-to-date
      try {
        const updates = await window.electronAPI.provider.checkUpdates();
        setAvailableUpdates(updates);
      } catch {
        // ignore
      }
    }
  };

  const activeUpdate = updateModalProvider ? availableUpdates[updateModalProvider] : undefined;
  const activeCommand = updateModalProvider ? PROVIDER_INSTALL_COMMANDS[updateModalProvider] : undefined;

  return (
    <>
      <div className="settings-group-header">
        <span className="settings-group-title">Providers</span>
        <div className="settings-group-actions">
          <span className="settings-group-meta">Refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <button className={`settings-icon-btn ${isRefreshing ? 'spinning' : ''}`} onClick={handleRefreshAll} disabled={isRefreshing} title="Refresh all providers"><RefreshCw size={14} className={isRefreshing ? 'spin' : ''} /></button>
        </div>
      </div>
      <div className="providers-section">
        {ALL_PROVIDERS.map((kind) => (
          <ProviderCard
            key={kind}
            kind={kind}
            status={statuses[kind]}
            models={models[kind] ?? []}
            expanded={expandedProvider === kind}
            onToggle={() => setExpandedProvider(expandedProvider === kind ? null : kind)}
            onProbe={() => handleProbe(kind)}
            enabled={enabledProviders[kind] ?? true}
            onToggleEnabled={() => toggleProvider(kind)}
            updateInfo={availableUpdates[kind]}
            onOpenUpdate={() => setUpdateModalProvider(kind)}
          />
        ))}
      </div>

      {updateModalProvider && activeUpdate?.hasUpdate && activeCommand && (
        <ProviderUpdateModal
          kind={updateModalProvider}
          current={activeUpdate.current ?? 'unknown'}
          latest={activeUpdate.latest ?? 'unknown'}
          installCommand={activeCommand}
          onClose={() => setUpdateModalProvider(null)}
          onUpdate={async () => {
            const result = await window.electronAPI.provider.updateCli(updateModalProvider);
            if (result.success) {
              await handleProbe(updateModalProvider);
            }
            return result;
          }}
        />
      )}
    </>
  );
}
