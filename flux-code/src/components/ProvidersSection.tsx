import { useState } from 'react';
import { useProviderStore } from '../stores/providerStore';
import { PROVIDER_DISPLAY_NAMES, PROVIDER_AUTH_INSTRUCTIONS, type ProviderKind } from '../types/provider';
import {
  RefreshCw, ChevronDown, AlertCircle,
  CodexIcon, OllamaIcon, OpenCodeIcon, ClaudeIcon, KimiIcon, GeminiIcon,
} from './icons';

type StatusKind = 'not-installed' | 'not-authenticated' | 'ready' | 'error';

const PROVIDER_ICONS: Record<ProviderKind, React.ComponentType<{ size?: number; className?: string }>> = {
  codex: CodexIcon,
  claude: ClaudeIcon,
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

const ALL_PROVIDERS: ProviderKind[] = ['codex', 'claude', 'opencode', 'ollama', 'kimi', 'gemini'];

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

function InfoCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  );
}

function ProviderCard({
  kind, status, models, expanded, onToggle, onProbe, enabled, onToggleEnabled,
}: {
  kind: ProviderKind;
  status: any;
  models: string[];
  expanded: boolean;
  onToggle: () => void;
  onProbe: () => void;
  enabled: boolean;
  onToggleEnabled: () => void;
}) {
  const Icon = PROVIDER_ICONS[kind];
  const displayName = PROVIDER_DISPLAY_NAMES[kind];
  const instructions = PROVIDER_AUTH_INSTRUCTIONS[kind];
  const statusKind = (status?.kind as StatusKind) ?? 'not-installed';
  const statusColor = STATUS_COLORS[statusKind];
  const isReady = statusKind === 'ready';
  const isNotAuth = statusKind === 'not-authenticated';
  const isNotInstalled = statusKind === 'not-installed';
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [newModel, setNewModel] = useState('');
  const { modelMeta, setModelMeta, moveModel, binaryPaths, setBinaryPath } = useProviderStore();
  const binaryPath = binaryPaths[kind] ?? '';

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setApiKey('');
    onProbe();
  };

  const handleBinaryPathChange = (value: string) => {
    setBinaryPath(kind, value);
    window.electronAPI.provider.setBinaryPath(kind, value);
  };

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
            <span className="provider-name">{displayName}</span>
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
          {/* Binary path */}
          <div className="provider-field">
            <label className="provider-label">Binary path</label>
            <input
              className="settings-input"
              placeholder={kind === 'ollama' ? 'ollama' : kind === 'kimi' ? 'kimi-cli' : kind}
              value={binaryPath}
              onChange={(e) => handleBinaryPathChange(e.target.value)}
            />
            <span className="provider-hint">Path to the {displayName} binary. Leave blank to use default.</span>
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
                  const hasReasoning = meta.reasoning ?? false;
                  if (isHidden) return null;
                  return (
                    <div key={model} className="provider-model-row">
                      <div className="provider-model-left">
                        <span className="provider-model-name">{model}</span>
                        {hasReasoning && (
                          <span className="provider-model-info" title="Supports reasoning">
                            <InfoCircle /> Reasoning
                          </span>
                        )}
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
                <button className="settings-btn" onClick={() => { if (newModel.trim()) setNewModel(''); }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span>Add</span></button>
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
  const { statuses, models, enabledProviders, toggleProvider } = useProviderStore();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

  const handleProbe = async (kind: ProviderKind) => {
    await window.electronAPI.provider.probe(kind);
  };

  const handleRefreshAll = async () => {
    for (const kind of ALL_PROVIDERS) {
      await handleProbe(kind);
    }
    setLastRefreshed(new Date());
  };

  return (
    <>
      <div className="settings-group-header">
        <span className="settings-group-title">Providers</span>
        <div className="settings-group-actions">
          <span className="settings-group-meta">Refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="settings-icon-btn" onClick={handleRefreshAll} title="Refresh all providers"><RefreshCw size={14} /></button>
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
          />
        ))}
      </div>
    </>
  );
}
