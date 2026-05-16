import { useState, useEffect, useCallback } from 'react';
import ResizablePanels from './components/ResizablePanels';
import ProjectSidebar from './components/ProjectSidebar';
import MainPanel from './components/MainPanel';
import TopBar from './components/TopBar';
import SearchModal from './components/SearchModal';
import SettingsPanel, { initTheme, loadShortcuts, type ShortcutId } from './components/SettingsPanel';
import './styles/global.css';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [sidebarVisible, setSidebarVisible] = useState(true);

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

  useEffect(() => {
    initTheme();
    loadProjects();
  }, [loadProjects]);

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
          />
        }
        main={
          <div className="main-column">
            <TopBar
              activeProject={activeProject}
              activeThread={activeThread}
              view={view}
              onRestoreDefaults={() => { /* handled inside SettingsPanel */ }}
            />
            {view === 'settings' ? (
              <SettingsPanel
                onBack={() => setView('chat')}
                projects={projects}
                onRemoveProject={handleRemoveProject}
                onRestoreDefaults={() => {}}
              />
            ) : (
              <MainPanel
                activeThread={activeThread}
                activeProject={activeProject}
                onAddThread={(title, mode) => {
                  if (activeProject) handleAddThread(activeProject.id, title, mode);
                }}
              />
            )}
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
    </div>
  );
}
