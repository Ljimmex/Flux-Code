import { useState, useEffect } from 'react';
import { XIcon, Monitor, Moon, Sun, Keyboard, Folder, Cpu, SlidersHorizontal } from './icons';
import type { Project } from '../App';

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onRemoveProject: (id: number) => void;
}

type Section = 'general' | 'ai' | 'projects' | 'shortcuts' | 'advanced';

const THEME_KEY = 'flux:theme';

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

const SHORTCUTS = [
  { keys: 'Ctrl + ,', action: 'Open Settings' },
  { keys: 'Ctrl + N', action: 'New Thread' },
  { keys: 'Ctrl + Shift + N', action: 'New Project' },
  { keys: 'Ctrl + B', action: 'Toggle Sidebar' },
  { keys: 'Ctrl + K', action: 'Search' },
  { keys: 'Ctrl + Shift + C', action: 'Show/Hide Window' },
];

export default function SettingsModal({ open, onClose, projects, onRemoveProject }: Props) {
  const [section, setSection] = useState<Section>('general');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(loadTheme);
  const [removeConfirm, setRemoveConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setSection('general');
      setRemoveConfirm(null);
    }
  }, [open]);

  const handleTheme = (t: 'dark' | 'light' | 'system') => {
    setTheme(t);
    saveTheme(t);
    applyTheme(t);
  };

  if (!open) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
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
                  {SHORTCUTS.map((s, i) => (
                    <div key={i} className="settings-shortcut-row">
                      <span className="settings-shortcut-action">{s.action}</span>
                      <kbd className="settings-shortcut-keys">{s.keys}</kbd>
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
      </div>
    </div>
  );
}
