import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, Monitor, Moon, Sun, Keyboard, Folder, Cpu, SlidersHorizontal, Check } from './icons';
import type { Project } from '../App';

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onRemoveProject: (id: number) => void;
}

type Section = 'general' | 'ai' | 'projects' | 'shortcuts' | 'advanced';

const THEME_KEY = 'flux:theme';
const SHORTCUTS_KEY = 'flux:shortcuts-enabled';

function loadTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {}
  return 'dark';
}

function saveTheme(t: 'dark' | 'light' | 'system') {
  localStorage.setItem(THEME_KEY, t);
}

function applyTheme(theme: 'dark' | 'light' | 'system') {
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
    // Merge saved enabled states with defaults (in case new shortcuts are added)
    return DEFAULT_SHORTCUTS.map(def => {
      const saved = parsed.find((s: any) => s.id === def.id);
      return saved ? { ...def, enabled: !!saved.enabled } : def;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(shortcuts: ShortcutConfig[]) {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
}

export default function SettingsModal({ open, onClose, projects, onRemoveProject }: Props) {
  const [section, setSection] = useState<Section>('general');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(loadTheme);
  const [removeConfirm, setRemoveConfirm] = useState<number | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(loadShortcuts);

  useEffect(() => {
    if (open) {
      setSection('general');
      setRemoveConfirm(null);
      setShortcuts(loadShortcuts());
    }
  }, [open]);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="settings-modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button className="settings-close-btn" onClick={onClose}><XIcon size={18} /></button>
            </div>

            <div className="settings-modal-body">
              {/* Sidebar tabs */}
              <div className="settings-tabs">
                <button className={`settings-tab ${section === 'general' ? 'active' : ''}`} onClick={() => setSection('general')}>
                  <SlidersHorizontal size={16} />
                  <span>General</span>
                </button>
                <button className={`settings-tab ${section === 'ai' ? 'active' : ''}`} onClick={() => setSection('ai')}>
                  <Cpu size={16} />
                  <span>AI Models</span>
                </button>
                <button className={`settings-tab ${section === 'projects' ? 'active' : ''}`} onClick={() => setSection('projects')}>
                  <Folder size={16} />
                  <span>Projects</span>
                </button>
                <button className={`settings-tab ${section === 'shortcuts' ? 'active' : ''}`} onClick={() => setSection('shortcuts')}>
                  <Keyboard size={16} />
                  <span>Shortcuts</span>
                </button>
              </div>

              {/* Content */}
              <div className="settings-content">
                {section === 'general' && (
                  <>
                    <h3>Appearance</h3>
                    <div className="settings-group">
                      <label className="settings-label">Theme</label>
                      <div className="theme-toggle-group">
                        <button className={`theme-option ${theme === 'dark' ? 'active' : ''}`} onClick={() => handleTheme('dark')}>
                          <Moon size={16} />
                          <span>Dark</span>
                        </button>
                        <button className={`theme-option ${theme === 'light' ? 'active' : ''}`} onClick={() => handleTheme('light')}>
                          <Sun size={16} />
                          <span>Light</span>
                        </button>
                        <button className={`theme-option ${theme === 'system' ? 'active' : ''}`} onClick={() => handleTheme('system')}>
                          <Monitor size={16} />
                          <span>System</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {section === 'ai' && (
                  <>
                    <h3>AI Models</h3>
                    <div className="settings-placeholder">
                      <p>Configure your API keys and default models.</p>
                      <p className="muted">Coming soon — OpenAI, Anthropic, Ollama integration.</p>
                    </div>
                  </>
                )}

                {section === 'projects' && (
                  <>
                    <h3>Projects</h3>
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

                {section === 'shortcuts' && (
                  <>
                    <h3>Keyboard Shortcuts</h3>
                    <div className="settings-shortcuts-list">
                      {shortcuts.map((s) => (
                        <div key={s.id} className="settings-shortcut-row">
                          <div className="settings-shortcut-left">
                            <button
                              className={`shortcut-toggle ${s.enabled ? 'enabled' : ''}`}
                              onClick={() => toggleShortcut(s.id)}
                              title={s.enabled ? 'Disable shortcut' : 'Enable shortcut'}
                            >
                              {s.enabled && <Check size={12} />}
                            </button>
                            <span className={`settings-shortcut-action ${s.enabled ? '' : 'disabled'}`}>{s.label}</span>
                          </div>
                          <kbd className={`settings-shortcut-keys ${s.enabled ? '' : 'disabled'}`}>{s.keys}</kbd>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {section === 'advanced' && (
                  <>
                    <h3>Advanced</h3>
                    <div className="settings-placeholder">
                      <p>Advanced settings will be available here.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
