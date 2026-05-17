import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, Keyboard, Cpu, GitBranch,
  Globe, Archive, Trash2, Plus, XIcon, RefreshCw,
  CodexIcon, OllamaIcon, OpenCodeIcon, ClaudeIcon
} from './icons';
import type { Project, Thread } from '../App';

export type Section =
  | 'general'
  | 'keybindings'
  | 'providers'
  | 'source-control'
  | 'connections'
  | 'archive';

interface Props {
  section: Section;
  projects: Project[];
  archivedThreads: Thread[];
  onRestoreDefaults: () => void;
  onUnarchiveThread: (id: number) => void;
  onDeleteThread: (id: number) => void;
}

export interface SettingsPanelHandle {
  restoreDefaults: () => void;
}

const THEME_KEY = 'flux:theme';
const SHORTCUTS_KEY = 'flux:shortcuts-enabled';

export function loadTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {}
  return 'dark';
}

function saveTheme(t: 'dark' | 'light' | 'system') {
  localStorage.setItem(THEME_KEY, t);
}

export function applyTheme(theme: 'dark' | 'light' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function initTheme() {
  const t = loadTheme();
  applyTheme(t);
}

export type ShortcutId = 'open-settings' | 'new-thread' | 'new-project' | 'toggle-sidebar' | 'search' | 'show-window';

export interface ShortcutConfig {
  id: ShortcutId;
  label: string;
  keys: string;
  enabled: boolean;
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: 'open-settings', label: 'Open Settings', keys: 'Ctrl + ,', enabled: true },
  { id: 'new-thread', label: 'New Thread', keys: 'Ctrl + N', enabled: true },
  { id: 'new-project', label: 'New Project', keys: 'Ctrl + Shift + N', enabled: true },
  { id: 'toggle-sidebar', label: 'Toggle Sidebar', keys: 'Ctrl + B', enabled: true },
  { id: 'search', label: 'Search', keys: 'Ctrl + K', enabled: true },
  { id: 'show-window', label: 'Show/Hide Window', keys: 'Ctrl + Shift + C', enabled: true },
];

export function loadShortcuts(): ShortcutConfig[] {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SHORTCUTS;
    return DEFAULT_SHORTCUTS.map(def => {
      const saved = parsed.find((s: any) => s.id === def.id);
      return saved ? { ...def, enabled: !!saved.enabled } : def;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(shortcuts: ShortcutConfig[]) {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
}

/* ─── Toggle switch component ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'on' : ''}`}
      onClick={onChange}
      aria-pressed={checked}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}

/* ─── Settings card component ─── */
function SettingCard({
  title,
  desc,
  children,
  controlPosition = 'inline',
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  controlPosition?: 'inline' | 'bottom';
}) {
  return (
    <div className="setting-card">
      <div className="setting-card-header">
        <span className="setting-card-title">{title}</span>
        {controlPosition === 'inline' && <div className="setting-card-control">{children}</div>}
      </div>
      {desc && <span className="setting-card-desc">{desc}</span>}
      {controlPosition === 'bottom' && <div className="setting-card-control-bottom">{children}</div>}
    </div>
  );
}

/* ─── Section sidebar data ─── */
export const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'keybindings', label: 'Keybindings', icon: Keyboard },
  { id: 'providers', label: 'Providers', icon: Cpu },
  { id: 'source-control', label: 'Source Control', icon: GitBranch },
  { id: 'connections', label: 'Connections', icon: Globe },
  { id: 'archive', label: 'Archive', icon: Archive },
];

/* ─── Provider card component ─── */
function ProviderCard({
  provider,
  expanded,
  onToggleExpand,
  onUpdate,
  onAddModel,
  onRemoveModel,
}: {
  provider: ProviderConfig;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<ProviderConfig>) => void;
  onAddModel: (model: string) => void;
  onRemoveModel: (model: string) => void;
}) {
  const [newModel, setNewModel] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const Icon = provider.icon === 'codex' ? CodexIcon : provider.icon === 'opencode' ? OpenCodeIcon : provider.icon === 'claude' ? ClaudeIcon : OllamaIcon;

  const homeLabel = provider.id === 'codex' ? 'CODEX_HOME path'
    : provider.id === 'claude' ? 'Config directory'
    : provider.id === 'ollama' ? 'OLLAMA_HOST'
    : 'Home path';
  const homePlaceholder = provider.id === 'codex' ? '~/.codex'
    : provider.id === 'claude' ? '~/.config/claude'
    : provider.id === 'ollama' ? 'http://localhost:11434'
    : '';

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    const next = [...provider.envVars, { key: newEnvKey.trim(), value: newEnvVal.trim() }];
    onUpdate({ envVars: next });
    setNewEnvKey('');
    setNewEnvVal('');
  };

  const removeEnvVar = (idx: number) => {
    const next = provider.envVars.filter((_, i) => i !== idx);
    onUpdate({ envVars: next });
  };

  return (
    <div className={`provider-card ${expanded ? 'expanded' : ''}`}>
      <div className="provider-header" onClick={onToggleExpand}>
        <div className="provider-info">
          <div className="provider-icon" style={{ color: provider.accentColor }}>
            <Icon size={20} />
          </div>
          <div className="provider-name-group">
            <span className="provider-name">{provider.displayName || provider.name}</span>
            <span className="provider-status">
              {provider.enabled
                ? `${provider.models.length} models available`
                : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="provider-actions">
          <Toggle checked={provider.enabled} onChange={() => onUpdate({ enabled: !provider.enabled })} />
        </div>
      </div>

      {expanded && (
        <div className="provider-details">
          {/* Display name */}
          <div className="provider-field">
            <label className="provider-label">Display name</label>
            <input
              className="settings-input"
              type="text"
              placeholder={provider.name}
              value={provider.displayName || ''}
              onChange={(e) => onUpdate({ displayName: e.target.value })}
            />
            <span className="provider-hint">Optional label shown in the provider list.</span>
          </div>

          {/* Accent color */}
          <div className="provider-field">
            <label className="provider-label">Accent color</label>
            <div className="provider-colors">
              {ACCENT_COLORS.map(color => (
                <button
                  key={color}
                  className={`provider-color-dot ${provider.accentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => onUpdate({ accentColor: color })}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
            <span className="provider-hint">Used to distinguish this instance in picker rails and model lists.</span>
          </div>

          {/* Environment variables */}
          <div className="provider-field">
            <div className="provider-env-header">
              <label className="provider-label">Environment variables</label>
            </div>
            <span className="provider-hint">Add variables to pass API keys, base URLs, or other per-instance CLI settings.</span>
            {provider.envVars.length > 0 && (
              <div className="provider-env-list">
                {provider.envVars.map((env, idx) => (
                  <div key={idx} className="provider-env-item">
                    <span className="provider-env-key">{env.key}</span>
                    <span className="provider-env-sep">=</span>
                    <span className="provider-env-val">{env.value ? '••••••••' : '(empty)'}</span>
                    <button className="provider-env-remove" onClick={() => removeEnvVar(idx)} title="Remove">
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="provider-env-add">
              <input
                className="settings-input"
                placeholder="KEY"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEnvVar(); }}
              />
              <input
                className="settings-input"
                placeholder="value"
                value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEnvVar(); }}
              />
              <button className="settings-btn" onClick={addEnvVar}>
                <Plus size={12} /><span>Add</span>
              </button>
            </div>
          </div>

          {/* Binary path */}
          <div className="provider-field">
            <label className="provider-label">Binary path</label>
            <input
              className="settings-input"
              type="text"
              placeholder={provider.id === 'codex' ? 'codex' : provider.id === 'ollama' ? 'ollama' : provider.id === 'claude' ? 'claude' : 'opencode'}
              value={provider.binaryPath || ''}
              onChange={(e) => onUpdate({ binaryPath: e.target.value })}
            />
            <span className="provider-hint">Path to the {provider.name} binary used by this instance.</span>
          </div>

          {/* Home path */}
          <div className="provider-field">
            <label className="provider-label">{homeLabel}</label>
            <input
              className="settings-input"
              type="text"
              placeholder={homePlaceholder}
              value={provider.homePath || ''}
              onChange={(e) => onUpdate({ homePath: e.target.value })}
            />
            <span className="provider-hint">
              {provider.id === 'codex' ? 'Custom Codex home and config directory.'
                : provider.id === 'ollama' ? 'Ollama server host URL or config path.'
                : provider.id === 'claude' ? 'Custom Claude config directory.'
                : 'Custom home path.'}
            </span>
          </div>

          {/* Shadow home path (Codex only) */}
          {provider.id === 'codex' && (
            <div className="provider-field">
              <label className="provider-label">Shadow home path</label>
              <input
                className="settings-input"
                type="text"
                placeholder="~/.codex-t3/personal"
                value={provider.shadowHomePath || ''}
                onChange={(e) => onUpdate({ shadowHomePath: e.target.value })}
              />
              <span className="provider-hint">Account-specific Codex home. Keeps auth.json separate while sharing state from CODEX_HOME.</span>
            </div>
          )}

          {/* Models */}
          <div className="provider-field">
            <label className="provider-label">Models</label>
            <span className="provider-hint">{provider.models.length} models available.</span>
            <div className="provider-models">
              {provider.models.map(model => (
                <div key={model} className="provider-model-item">
                  <span className="provider-model-name">{model}</span>
                  <div className="provider-model-actions">
                    <button className="provider-model-btn" title="Favorite"><span>☆</span></button>
                    <button className="provider-model-btn" title="Move up"><span>↑</span></button>
                    <button className="provider-model-btn" title="Move down"><span>↓</span></button>
                    <button
                      className="provider-model-btn danger"
                      onClick={() => onRemoveModel(model)}
                      title="Remove model"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="provider-model-add">
                <input
                  className="settings-input"
                  placeholder="model-name"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newModel.trim()) {
                      onAddModel(newModel.trim());
                      setNewModel('');
                    }
                  }}
                />
                <button
                  className="settings-btn"
                  onClick={() => {
                    if (newModel.trim()) {
                      onAddModel(newModel.trim());
                      setNewModel('');
                    }
                  }}
                >
                  <Plus size={12} />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Relative time formatter ─── */
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/* ─── Archive section component ─── */
function ArchiveSection({
  projects,
  archivedThreads,
  onUnarchiveThread,
  onDeleteThread,
}: {
  projects: Project[];
  archivedThreads: Thread[];
  onUnarchiveThread: (id: number) => void;
  onDeleteThread: (id: number) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; threadId: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(archivedThreads.map(t => t.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleBulkUnarchive = () => {
    selectedIds.forEach(id => onUnarchiveThread(id));
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(id => onDeleteThread(id));
    setSelectedIds(new Set());
  };

  // Group archived threads by project
  const grouped = new Map<number, Thread[]>();
  for (const t of archivedThreads) {
    const list = grouped.get(t.project_id) ?? [];
    list.push(t);
    grouped.set(t.project_id, list);
  }

  if (archivedThreads.length === 0) {
    return <p className="settings-placeholder">No archived threads yet.</p>;
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="archive-section">
      {/* Toolbar */}
      <div className="archive-toolbar">
        {selectMode && hasSelection ? (
          <div className="archive-bulk-actions">
            <span className="archive-selection-count">{selectedIds.size} selected</span>
            <div className="archive-bulk-btns">
              <button className="archive-bulk-btn" onClick={handleBulkUnarchive}>
                <Archive size={14} />
                <span>Unarchive</span>
              </button>
              <button className="archive-bulk-btn danger" onClick={handleBulkDelete}>
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
              <button className="archive-bulk-btn secondary" onClick={deselectAll}>
                <span>Deselect</span>
              </button>
            </div>
          </div>
        ) : selectMode ? (
          <div className="archive-select-bar">
            <button className="archive-select-btn" onClick={selectAll}>Select all</button>
            <button className="archive-select-btn secondary" onClick={() => { setSelectMode(false); deselectAll(); }}>Cancel</button>
          </div>
        ) : (
          <button className="archive-select-btn" onClick={() => setSelectMode(true)}>Select</button>
        )}
      </div>

      {Array.from(grouped.entries()).map(([projectId, threads]) => {
        const project = projects.find(p => p.id === projectId);
        const projectName = project?.name ?? 'Unknown Project';
        return (
          <div key={projectId} className="archive-group">
            <div className="archive-group-title">{projectName}</div>
            <div className="archive-list">
              {threads.map(thread => {
                const isSelected = selectedIds.has(thread.id);
                return (
                  <div
                    key={thread.id}
                    className={`archive-card ${isSelected ? 'selected' : ''} ${selectMode ? 'selectable' : ''}`}
                    onClick={() => selectMode && toggleSelect(thread.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, threadId: thread.id });
                    }}
                  >
                    {selectMode && (
                      <div className="archive-checkbox">
                        <div className={`archive-check ${isSelected ? 'checked' : ''}`} />
                      </div>
                    )}
                    <div className="archive-card-info">
                      <span className="archive-card-title">{thread.title}</span>
                      <span className="archive-card-meta">
                        Archived {timeAgo(thread.updated_at)} · Created {timeAgo(thread.created_at)}
                      </span>
                    </div>
                    {!selectMode && (
                      <button
                        className="archive-card-btn"
                        onClick={(e) => { e.stopPropagation(); onUnarchiveThread(thread.id); }}
                      >
                        <Archive size={14} />
                        <span>Unarchive</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {contextMenu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-item" onClick={() => { onUnarchiveThread(contextMenu.threadId); setContextMenu(null); }}>
            <Archive size={14} />
            <span>Unarchive</span>
          </button>
          <div className="context-sep" />
          <button className="context-item danger" onClick={() => { onDeleteThread(contextMenu.threadId); setContextMenu(null); }}>
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Provider config types & helpers ─── */
interface EnvVar {
  key: string;
  value: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  icon: 'codex' | 'ollama' | 'opencode' | 'claude';
  enabled: boolean;
  displayName?: string;
  accentColor?: string;
  binaryPath?: string;
  homePath?: string;
  shadowHomePath?: string;
  envVars: EnvVar[];
  models: string[];
}

const PROVIDERS_KEY = 'flux:providers';

const ACCENT_COLORS = ['#3B82F6', '#10B981', '#F97316', '#EF4444', '#A855F7', '#06B6D4'];

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: 'codex',
    enabled: true,
    accentColor: '#10A37F',
    binaryPath: '',
    homePath: '',
    shadowHomePath: '',
    envVars: [],
    models: ['gpt-4o', 'gpt-4o-mini'],
  },
  {
    id: 'ollama',
    name: 'Ollama CLI',
    icon: 'ollama',
    enabled: true,
    accentColor: '#3B82F6',
    binaryPath: '',
    homePath: '',
    envVars: [],
    models: ['llama3.2', 'codellama', 'phi3', 'mistral'],
  },
  {
    id: 'claude',
    name: 'Claude CLI',
    icon: 'claude',
    enabled: false,
    accentColor: '#D97757',
    binaryPath: '',
    homePath: '',
    envVars: [],
    models: ['claude-3-5-sonnet', 'claude-3-opus'],
  },
  {
    id: 'opencode',
    name: 'OpenCode CLI',
    icon: 'opencode',
    enabled: false,
    accentColor: '#A855F7',
    binaryPath: '',
    homePath: '',
    envVars: [],
    models: ['claude-3-5-sonnet', 'claude-3-opus'],
  },
];

function loadProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        return DEFAULT_PROVIDERS.map(def => {
          const s = saved.find((p: any) => p.id === def.id);
          if (!s) return def;
          return {
            ...def,
            ...s,
            envVars: Array.isArray(s.envVars) ? s.envVars : def.envVars,
            models: Array.isArray(s.models) ? s.models : def.models,
          };
        });
      }
    }
  } catch {}
  return DEFAULT_PROVIDERS;
}

function saveProviders(list: ProviderConfig[]) {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(list));
}

const SettingsPanel = forwardRef<SettingsPanelHandle, Props>(function SettingsPanel({ section, projects, archivedThreads, onRestoreDefaults, onUnarchiveThread, onDeleteThread }, ref) {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(loadTheme);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(loadShortcuts);

  /* booleans for demo toggles */
  const [diffWrap, setDiffWrap] = useState(false);
  const [hideWhitespace, setHideWhitespace] = useState(true);
  const [assistantOutput, setAssistantOutput] = useState(false);
  const [autoOpenTask, setAutoOpenTask] = useState(true);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(true);
  const [timeFormat, setTimeFormat] = useState('system');
  const [newThreadsMode, setNewThreadsMode] = useState('local');

  /* Providers state */
  const [providers, setProviders] = useState(() => loadProviders());
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

  const refreshProviders = () => {
    setProviders(loadProviders());
    setLastRefreshed(new Date());
  };

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) => {
    setProviders(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch } : p);
      saveProviders(next);
      return next;
    });
  };

  const addProviderModel = (providerId: string, model: string) => {
    setProviders(prev => {
      const next = prev.map(p => p.id === providerId ? { ...p, models: [...p.models, model] } : p);
      saveProviders(next);
      return next;
    });
  };

  const removeProviderModel = (providerId: string, model: string) => {
    setProviders(prev => {
      const next = prev.map(p => p.id === providerId ? { ...p, models: p.models.filter(m => m !== model) } : p);
      saveProviders(next);
      return next;
    });
  };

  const handleTheme = (t: 'dark' | 'light' | 'system') => {
    setTheme(t);
    saveTheme(t);
    applyTheme(t);
  };

  const toggleShortcut = (id: ShortcutId) => {
    setShortcuts(prev => {
      const next = prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
      saveShortcuts(next);
      return next;
    });
  };

  const handleRestore = () => {
    setTheme('dark');
    saveTheme('dark');
    applyTheme('dark');
    setShortcuts(DEFAULT_SHORTCUTS);
    saveShortcuts(DEFAULT_SHORTCUTS);
    setDiffWrap(false);
    setHideWhitespace(true);
    setAssistantOutput(false);
    setAutoOpenTask(true);
    setArchiveConfirm(false);
    setDeleteConfirm(true);
    setTimeFormat('system');
    setNewThreadsMode('local');
    onRestoreDefaults();
  };

  useImperativeHandle(ref, () => ({ restoreDefaults: handleRestore }));

  return (
    <div className="settings-view">
      <main className="settings-view-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            className="settings-view-section"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {section === 'general' && (
              <>
                <div className="settings-group-title">General</div>

                <SettingCard title="Theme" desc="Choose how Flux Code looks across the app.">
                  <select
                    className="settings-select"
                    value={theme}
                    onChange={(e) => handleTheme(e.target.value as any)}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </SettingCard>

                <SettingCard title="Time format" desc="System default follows your browser or OS clock preference.">
                  <select
                    className="settings-select"
                    value={timeFormat}
                    onChange={(e) => setTimeFormat(e.target.value)}
                  >
                    <option value="system">System default</option>
                    <option value="12h">12-hour</option>
                    <option value="24h">24-hour</option>
                  </select>
                </SettingCard>

                <SettingCard title="Diff line wrapping" desc="Set the default wrap state when the diff panel opens.">
                  <Toggle checked={diffWrap} onChange={() => setDiffWrap(v => !v)} />
                </SettingCard>

                <SettingCard title="Hide whitespace changes" desc="Set whether the diff panel ignores whitespace-only edits by default.">
                  <Toggle checked={hideWhitespace} onChange={() => setHideWhitespace(v => !v)} />
                </SettingCard>

                <SettingCard title="Assistant output" desc="Show token-by-token output while a response is in progress.">
                  <Toggle checked={assistantOutput} onChange={() => setAssistantOutput(v => !v)} />
                </SettingCard>

                <SettingCard title="Auto-open task panel" desc="Open the right-side plan and task panel automatically when steps appear.">
                  <Toggle checked={autoOpenTask} onChange={() => setAutoOpenTask(v => !v)} />
                </SettingCard>

                <SettingCard title="New threads" desc="Pick the default workspace mode for newly created draft threads.">
                  <select
                    className="settings-select"
                    value={newThreadsMode}
                    onChange={(e) => setNewThreadsMode(e.target.value)}
                  >
                    <option value="local">Local</option>
                    <option value="worktree">Worktree</option>
                  </select>
                </SettingCard>

                <SettingCard title="Add project starts in" desc="Leave empty to use ~ when the Add Project browser opens.">
                  <input
                    className="settings-input"
                    type="text"
                    placeholder="~/"
                    defaultValue="~/"
                  />
                </SettingCard>

                <SettingCard title="Archive confirmation" desc="Require a second click on the inline archive action before a thread is archived.">
                  <Toggle checked={archiveConfirm} onChange={() => setArchiveConfirm(v => !v)} />
                </SettingCard>

                <SettingCard title="Delete confirmation" desc="Ask before deleting a thread and its chat history.">
                  <Toggle checked={deleteConfirm} onChange={() => setDeleteConfirm(v => !v)} />
                </SettingCard>

                <SettingCard title="Text generation model" desc="Configure the model used for generated commit messages, PR titles, and similar Git text.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="settings-select" defaultValue="gpt-5.4-mini">
                      <option value="gpt-5.4-mini">GPT-5.4-Mini</option>
                      <option value="gpt-4">GPT-4</option>
                    </select>
                    <select className="settings-select" defaultValue="medium">
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </SettingCard>

                <div className="settings-group-title">About</div>

                <SettingCard title="Version" desc="Current version of the application.">
                  <span className="settings-badge">Up to Date</span>
                </SettingCard>

                <SettingCard title="Update track" desc="Stable follows full releases. Nightly follows the nightly desktop channel and can switch back to stable immediately.">
                  <select className="settings-select" defaultValue="stable">
                    <option value="stable">Stable</option>
                    <option value="nightly">Nightly</option>
                  </select>
                </SettingCard>

                <SettingCard title="Diagnostics" desc="Local trace file.">
                  <button className="settings-btn">View diagnostics</button>
                </SettingCard>
              </>
            )}

            {section === 'keybindings' && (
              <>
                {shortcuts.map((s) => (
                  <div key={s.id} className="setting-row">
                    <div className="setting-row-text">
                      <span className="setting-row-title">{s.label}</span>
                    </div>
                    <div className="setting-row-control">
                      <kbd className="settings-kbd">{s.keys}</kbd>
                      <Toggle checked={s.enabled} onChange={() => toggleShortcut(s.id)} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {section === 'providers' && (
              <>
                <div className="settings-group-header">
                  <span className="settings-group-title">Providers</span>
                  <div className="settings-group-actions">
                    <span className="settings-group-meta">
                      Refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button className="settings-btn" onClick={refreshProviders}>
                      <RefreshCw size={14} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>
                <div className="providers-section">
                  {providers.map(provider => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      expanded={expandedProvider === provider.id}
                      onToggleExpand={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                      onUpdate={(patch) => updateProvider(provider.id, patch)}
                      onAddModel={(model) => addProviderModel(provider.id, model)}
                      onRemoveModel={(model) => removeProviderModel(provider.id, model)}
                    />
                  ))}
                </div>
              </>
            )}

            {section === 'source-control' && (
              <div className="settings-placeholder">
                <p>Git and source control settings.</p>
              </div>
            )}

            {section === 'connections' && (
              <div className="settings-placeholder">
                <p>External service connections.</p>
              </div>
            )}

            {section === 'archive' && (
              <ArchiveSection
                projects={projects}
                archivedThreads={archivedThreads}
                onUnarchiveThread={onUnarchiveThread}
                onDeleteThread={onDeleteThread}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
});

export default SettingsPanel;
