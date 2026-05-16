import { useState, useEffect } from 'react';
import { GitCompare, Terminal, RotateCcw } from './icons';

interface Props {
  activeProject: { name: string } | null;
  activeThread: { title: string; mode: string } | null;
  view?: 'chat' | 'settings';
  onRestoreDefaults?: () => void;
}

export default function TopBar({ activeProject, activeThread, view = 'chat', onRestoreDefaults }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const check = async () => {
      const max = await window.electronAPI.window.isMaximized();
      setIsMaximized(max);
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        {view === 'settings' ? (
          <span className="thread-name">Settings</span>
        ) : activeThread ? (
          <div className="thread-badge-group">
            <span className="thread-name">{activeThread.title}</span>
            {activeProject && (
              <span className="project-badge">{activeProject.name}</span>
            )}
          </div>
        ) : (
          <span className="topbar-placeholder">No active thread</span>
        )}
      </div>

      <div className="topbar-center drag-region" />

      <div className="topbar-right">
        {view === 'settings' && onRestoreDefaults && (
          <button className="topbar-btn restore-btn" onClick={onRestoreDefaults} title="Restore defaults">
            <RotateCcw size={14} />
            <span>Restore defaults</span>
          </button>
        )}
        {view === 'chat' && (
          <>
            <button className="topbar-btn" title="Open diff panel">
              <GitCompare size={16} />
            </button>
            <button className="topbar-btn" title="Open Terminal">
              <Terminal size={16} />
            </button>
          </>
        )}
        <div className="window-controls">
          <button className="window-btn minimize" onClick={() => window.electronAPI.window.minimize()} title="Minimize">
            <MinimizeIcon />
          </button>
          <button className="window-btn maximize" onClick={() => window.electronAPI.window.maximize()} title={isMaximized ? 'Restore' : 'Maximize'}>
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button className="window-btn close" onClick={() => window.electronAPI.window.close()} title="Close">
            <CloseIcon />
          </button>
        </div>
      </div>
    </header>
  );
}

function MinimizeIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4" width="10" height="1" fill="currentColor" /></svg>;
}

function MaximizeIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>;
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
