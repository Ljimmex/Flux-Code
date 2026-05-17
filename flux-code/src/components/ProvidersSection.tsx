import { useState } from 'react';
import { useProviderStore } from '../stores/providerStore';
import { PROVIDER_DISPLAY_NAMES, PROVIDER_AUTH_INSTRUCTIONS, type ProviderKind } from '../types/provider';
import {
  RefreshCw, AlertCircle, XCircle,
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

const PROVIDER_COLORS: Record<ProviderKind, string> = {
  codex: '#10A37F',
  claude: '#D97757',
  opencode: '#A855F7',
  ollama: '#3B82F6',
  kimi: '#027aff',
  gemini: '#F6C013',
};

const ALL_PROVIDERS: ProviderKind[] = ['codex', 'claude', 'opencode', 'ollama', 'kimi', 'gemini'];

function StatusBadge({ status }: { status: any }) {
  if (!status) return null;
  const kind = status.kind as StatusKind;

  if (kind === 'ready') {
    return (
      <span className="provider-status-badge ready">
        <span className="provider-status-dot" />
        Ready
      </span>
    );
  }
  if (kind === 'not-installed') {
    return (
      <span className="provider-status-badge not-installed">
        <XCircle size={12} />
        Not installed
      </span>
    );
  }
  if (kind === 'not-authenticated') {
    return (
      <span className="provider-status-badge not-auth">
        <AlertCircle size={12} />
        Login required
      </span>
    );
  }
  return (
    <span className="provider-status-badge error">
      <AlertCircle size={12} />
      Error
    </span>
  );
}

function ProviderCard({
  kind, status, models, expanded, onToggle, onProbe,
}: {
  kind: ProviderKind;
  status: any;
  models: string[];
  expanded: boolean;
  onToggle: () => void;
  onProbe: () => void;
}) {
  const Icon = PROVIDER_ICONS[kind];
  const color = PROVIDER_COLORS[kind];
  const isReady = status?.kind === 'ready';
  const isNotAuth = status?.kind === 'not-authenticated';
  const isNotInstalled = status?.kind === 'not-installed';
  const displayName = PROVIDER_DISPLAY_NAMES[kind];
  const instructions = PROVIDER_AUTH_INSTRUCTIONS[kind];
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    // API key saving not yet implemented in IPC
    setApiKey('');
    onProbe();
  };

  return (
    <div className={`provider-card ${expanded ? 'expanded' : ''}`}>
      <div className="provider-header" onClick={onToggle}>
        <div className="provider-info">
          <div className="provider-icon" style={{ color }}>
            <Icon size={20} />
          </div>
          <div className="provider-name-group">
            <span className="provider-name">{displayName}</span>
            <span className="provider-status">
              {isReady ? `${models.length} models available` : status?.message || 'Checking...'}
            </span>
          </div>
        </div>
        <div className="provider-actions">
          <StatusBadge status={status} />
        </div>
      </div>

      {expanded && (
        <div className="provider-details">
          {/* Auth instructions for CLI providers */}
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
              <span className="provider-hint">Run these commands in your terminal.</span>
            </div>
          )}

          {/* API key for Kimi */}
          {kind === 'kimi' && (
            <div className="provider-field">
              <label className="provider-label">API Key</label>
              <div className="provider-apikey-row">
                <input
                  className="settings-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-moon-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button className="settings-btn" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button className="settings-btn" onClick={handleSaveApiKey} disabled={!apiKey.trim()}>
                  Save
                </button>
              </div>
              <span className="provider-hint">Stored locally in ~/.config/kimi/auth.json</span>
            </div>
          )}

          {/* Models list */}
          {models.length > 0 && (
            <div className="provider-field">
              <label className="provider-label">Available models</label>
              <div className="provider-model-list">
                {models.map((model) => (
                  <div key={model} className="provider-model-chip">
                    {model}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {status?.kind === 'error' && (
            <div className="provider-field">
              <div className="provider-error-box">
                <AlertCircle size={14} />
                <span>{status.message}</span>
              </div>
            </div>
          )}

          {/* Probe button */}
          <div className="provider-field">
            <button className="settings-btn" onClick={onProbe}>
              <RefreshCw size={12} />
              <span>Check status</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProvidersSection() {
  const { statuses, models } = useProviderStore();
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
          <span className="settings-group-meta">
            Refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="settings-icon-btn" onClick={handleRefreshAll} title="Refresh all providers">
            <RefreshCw size={14} />
          </button>
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
          />
        ))}
      </div>
    </>
  );
}
