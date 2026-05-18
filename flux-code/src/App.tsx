import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ResizablePanels from './components/ResizablePanels';
import ProjectSidebar from './components/ProjectSidebar';
import MainPanel from './components/MainPanel';
import TopBar from './components/TopBar';
import SearchModal from './components/SearchModal';
import SettingsPanel, { initTheme, loadShortcuts, type ShortcutId, type Section, type SettingsPanelHandle } from './components/SettingsPanel';
import ProviderUpdateToast from './components/ProviderUpdateToast';
import { useProviderEvents } from './hooks/useProviderEvents';
import { useProviderStore } from './stores/providerStore';
import type { ProviderKind } from './types/provider';
import './styles/global.css';
import './styles/markdown.css';
import 'highlight.js/styles/github-dark.min.css';

export interface Project {
  id: number;
  name: string;
  path: string;
  git_branch: string | null;
  git_remote: string | null;
  created_at: string;
}

export interface Thread {
  id: number;
  project_id: number;
  title: string;
  mode: string;
  model: string | null;
  status: string;
  worktree_path: string | null;
  branch_name: string | null;
  reasoning_level: number;
  access_level: string;
  is_read: number;
  created_at: string;
  updated_at: string;
}

export default function App() {
  useProviderEvents();

  const { availableUpdates } = useProviderStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [settingsSection, setSettingsSection] = useState<Section>('general');
  const settingsPanelRef = useRef<SettingsPanelHandle>(null);
  const [archivedThreads, setArchivedThreads] = useState<Thread[]>([]);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set());

  const loadProjects = useCallback(async () => {
    const list = await window.electronAPI.db.getProjects();
    setProjects(list);
  }, []);

  const loadThreads = useCallback(async (projectId: number) => {
    const list = await window.electronAPI.db.getThreads(projectId);
    setThreads(prev => {
      const others = prev.filter(t => t.project_id !== projectId);
      return [...others, ...list];
    });
  }, []);

  const loadArchivedThreads = useCallback(async () => {
    const list = await window.electronAPI.db.getArchivedThreads();
    setArchivedThreads(list);
  }, []);

  useEffect(() => {
    initTheme();
    loadProjects();
    loadArchivedThreads();
  }, [loadProjects, loadArchivedThreads]);

  useEffect(() => {
    if (activeProject) {
      loadThreads(activeProject.id);
    }
  }, [activeProject, loadThreads]);

  const handleAddProject = async () => {
    const projectPath = await window.electronAPI.dialog.openDirectory();
    if (!projectPath) return;
    const name = projectPath.split(/[\\/]/).pop() || 'Untitled';
    const project = await window.electronAPI.db.addProject(name, projectPath);
    if (project) {
      await loadProjects();
      setActiveProject(project);
    }
  };

  const handleRemoveProject = async (id: number) => {
    await window.electronAPI.db.removeProject(id);
    if (activeProject?.id === id) {
      setActiveProject(null);
      setActiveThread(null);
    }
    setThreads(prev => prev.filter(t => t.project_id !== id));
    await loadProjects();
  };

  const handleAddThread = useCallback(async (projectId: number, title: string, mode: string = 'chat') => {
    const thread = await window.electronAPI.db.addThread(projectId, title, mode);
    if (thread) {
      await loadThreads(projectId);
      setActiveThread(thread);
      const project = projects.find(p => p.id === projectId);
      if (project) setActiveProject(project);
    }
  }, [loadThreads, projects]);

  const getProjectThreads = (projectId: number) => {
    return threads.filter(t => t.project_id === projectId);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const shortcuts = loadShortcuts();
      const isEnabled = (id: ShortcutId) => shortcuts.find(s => s.id === id)?.enabled ?? true;

      // Toggle sidebar: Ctrl/Cmd + B
      if (isEnabled('toggle-sidebar') && isCtrl && e.key === 'b' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setSidebarVisible(prev => !prev);
      }

      // Open settings: Ctrl/Cmd + ,
      if (isEnabled('open-settings') && isCtrl && e.key === ',' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setView('settings');
      }

      // New thread: Ctrl/Cmd + N
      if (isEnabled('new-thread') && isCtrl && e.key === 'n' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (activeProject) {
          handleAddThread(activeProject.id, 'New Thread', 'chat');
        }
      }

      // New project: Ctrl/Cmd + Shift + N
      if (isEnabled('new-project') && isCtrl && e.key === 'N' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleAddProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProject, handleAddThread]);

  return (
    <div className="app-container">
      <ResizablePanels
        sidebarVisible={sidebarVisible}
        sidebar={
          <ProjectSidebar
            projects={projects}
            threads={threads}
            activeProject={activeProject}
            activeThread={activeThread}
            getProjectThreads={getProjectThreads}
            onSelectProject={setActiveProject}
            onSelectThread={setActiveThread}
            onAddProject={handleAddProject}
            onRemoveProject={handleRemoveProject}
            onAddThread={handleAddThread}
            loadThreads={loadThreads}
            loadProjects={loadProjects}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSettings={() => setView('settings')}
            view={view}
            onBack={() => setView('chat')}
            settingsSection={settingsSection}
            onSelectSettingsSection={setSettingsSection}
          />
        }
        main={
          <div className="main-column">
            <TopBar
              activeProject={activeProject}
              activeThread={activeThread}
              view={view}
              settingsSection={settingsSection}
              onRestoreDefaults={() => {
                setSettingsSection('general');
                settingsPanelRef.current?.restoreDefaults();
              }}
            />
            <AnimatePresence mode="wait">
              {view === 'settings' ? (
                <motion.div
                  key="settings"
                  className="settings-motion-wrapper"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <SettingsPanel
                    ref={settingsPanelRef}
                    section={settingsSection}
                    projects={projects}
                    archivedThreads={archivedThreads}
                    onRestoreDefaults={() => {}}
                    onUnarchiveThread={async (id) => {
                      await window.electronAPI.db.unarchiveThread(id);
                      await loadArchivedThreads();
                    }}
                    onDeleteThread={async (id) => {
                      await window.electronAPI.db.deleteThread(id);
                      await loadArchivedThreads();
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  className="chat-motion-wrapper"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <MainPanel
                    activeThread={activeThread}
                    activeProject={activeProject}
                    onAddThread={(title, mode) => {
                      if (activeProject) handleAddThread(activeProject.id, title, mode);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      />
      {searchOpen && (
        <SearchModal
          projects={projects}
          threads={threads}
          activeThread={activeThread}
          onSelectThread={setActiveThread}
          onSelectProject={setActiveProject}
          onAddProject={handleAddProject}
          onAddThread={(projectId) => handleAddThread(projectId, 'New Thread', 'chat')}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Provider update toasts */}
      <div className="provider-update-toast-container">
        <AnimatePresence>
          {(Object.entries(availableUpdates) as [ProviderKind, { hasUpdate: boolean }][])
            .filter(([kind, info]) => info.hasUpdate && !dismissedUpdates.has(kind))
            .map(([kind, info]) => (
              <motion.div
                key={kind}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <ProviderUpdateToast
                  kind={kind}
                  current={(info as any).current ?? ''}
                  latest={(info as any).latest ?? ''}
                  onDismiss={() => setDismissedUpdates(prev => new Set([...prev, kind]))}
                  onOpenSettings={() => {
                    setView('settings');
                    setSettingsSection('providers');
                  }}
                />
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
