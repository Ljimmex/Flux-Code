import { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, Keyboard, Cpu, GitBranch,
  Globe, Archive
} from './icons';
import type { Project } from '../App';

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
  onRemoveProject: (id: number) => void;
  onRestoreDefaults: () => void;
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

const SettingsPanel = forwardRef<SettingsPanelHandle, Props>(function SettingsPanel({ section, projects, onRemoveProject, onRestoreDefaults }, ref) {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(loadTheme);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(loadShortcuts);
  const [removeConfirm, setRemoveConfirm] = useState<number | null>(null);

  /* booleans for demo toggles */
  const [diffWrap, setDiffWrap] = useState(false);
  const [hideWhitespace, setHideWhitespace] = useState(true);
  const [assistantOutput, setAssistantOutput] = useState(false);
  const [autoOpenTask, setAutoOpenTask] = useState(true);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(true);
  const [timeFormat, setTimeFormat] = useState('system');
  const [newThreadsMode, setNewThreadsMode] = useState('local');

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
              <div className="settings-placeholder">
                <p>Configure AI providers and API keys.</p>
                <p className="muted">OpenAI, Anthropic, and Ollama integration coming soon.</p>
              </div>
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
              <>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Archived Projects</h3>
                {projects.length === 0 ? (
                  <p className="settings-placeholder">No projects added yet.</p>
                ) : (
                  <div className="settings-projects-list">
                    {projects.map(p => (
                      <div key={p.id} className="settings-project-item">
                        <div className="settings-project-info">
                          <span className="settings-project-name">{p.name}</span>
                          <span className="settings-project-path">{p.path}</span>
                        </div>
                        {removeConfirm === p.id ? (
                          <div className="settings-project-actions">
                            <button className="confirm-btn secondary" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                            <button className="confirm-btn danger" onClick={() => { onRemoveProject(p.id); setRemoveConfirm(null); }}>Remove</button>
                          </div>
                        ) : (
                          <button className="settings-project-remove" onClick={() => setRemoveConfirm(p.id)}>Remove</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
});

export default SettingsPanel;
