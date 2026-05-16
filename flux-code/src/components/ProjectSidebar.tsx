import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Trash2, FolderGit2, Settings,
  Folder, ChevronDown, ChevronRight,
  Plus, Archive, Edit3, Copy, Check, MoreHorizontal, Minus, Search
} from './icons';
import logo from '../Fluxavatar.png';
import type { Project, Thread } from '../App';

interface Props {
  projects: Project[];
  activeProject: Project | null;
  activeThread: Thread | null;
  getProjectThreads: (projectId: number) => Thread[];
  onSelectProject: (p: Project) => void;
  onSelectThread: (t: Thread) => void;
  onAddProject: () => void;
  onRemoveProject: (id: number) => void;
  onAddThread: (projectId: number, title: string, mode?: string) => void;
  loadThreads: (projectId: number) => Promise<void>;
  loadProjects: () => Promise<void>;
  onOpenSearch: () => void;
}

interface ProjectMenuPos {
  x: number;
  y: number;
  projectId: number;
}

interface ThreadMenuPos {
  x: number;
  y: number;
  threadId: number;
  projectId: number;
}

const modeColors: Record<string, string> = {
  chat: '#58a6ff',
  plan: '#d29922',
  worktree: '#3fb950',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function ProjectSidebar({
  projects,
  activeProject,
  activeThread,
  getProjectThreads,
  onSelectProject,
  onSelectThread,
  onAddProject,
  onRemoveProject,
  onAddThread,
  loadThreads,
  loadProjects,
  onOpenSearch,
}: Props) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set());
  const [projectMenu, setProjectMenu] = useState<ProjectMenuPos | null>(null);
  const [threadMenu, setThreadMenu] = useState<ThreadMenuPos | null>(null);
  const [sidebarOptionsOpen, setSidebarOptionsOpen] = useState(false);
  const [hoveredThreadId, setHoveredThreadId] = useState<number | null>(null);
  const [renamingThread, setRenamingThread] = useState<number | null>(null);
  const [renamingProject, setRenamingProject] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsBtnRef = useRef<HTMLButtonElement>(null);
  const renamingThreadProjectId = useRef<number | null>(null);

  // Close menus on outside click using mousedown + ref
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking inside the options menu or the options button
      if (
        optionsRef.current?.contains(target) ||
        optionsBtnRef.current?.contains(target)
      ) {
        return;
      }
      setProjectMenu(null);
      setThreadMenu(null);
      setSidebarOptionsOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Ctrl+K shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenSearch]);

  const toggleProject = async (project: Project) => {
    const newSet = new Set(expandedProjectIds);
    if (newSet.has(project.id)) {
      newSet.delete(project.id);
    } else {
      newSet.add(project.id);
      await loadThreads(project.id);
    }
    setExpandedProjectIds(newSet);
    onSelectProject(project);
  };

  const handleProjectContext = (e: React.MouseEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setThreadMenu(null);
    setProjectMenu({ x: e.clientX, y: e.clientY, projectId });
  };

  const handleThreadContext = (e: React.MouseEvent, threadId: number, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectMenu(null);
    setThreadMenu({ x: e.clientX, y: e.clientY, threadId, projectId });
  };

  const handleArchiveThread = async (threadId: number) => {
    await window.electronAPI.db.archiveThread(threadId);
    const projectId = activeProject?.id;
    if (projectId) await loadThreads(projectId);
    setThreadMenu(null);
  };

  const handleDeleteThread = async (threadId: number) => {
    await window.electronAPI.db.deleteThread(threadId);
    const projectId = activeProject?.id;
    if (projectId) await loadThreads(projectId);
    if (activeThread?.id === threadId) onSelectThread({} as Thread);
    setThreadMenu(null);
  };

  const handleRenameThread = async (threadId: number) => {
    if (!renameValue.trim()) return;
    await window.electronAPI.db.renameThread(threadId, renameValue.trim());
    const projectId = renamingThreadProjectId.current ?? activeProject?.id;
    if (projectId) await loadThreads(projectId);
    setRenamingThread(null);
    setRenameValue('');
    renamingThreadProjectId.current = null;
  };

  const handleRenameProject = async (projectId: number) => {
    if (!renameValue.trim()) return;
    await window.electronAPI.db.renameProject(projectId, renameValue.trim());
    await loadProjects();
    setRenamingProject(null);
    setRenameValue('');
  };

  const startRenameThread = (thread: Thread) => {
    setRenamingThread(thread.id);
    setRenameValue(thread.title);
    renamingThreadProjectId.current = thread.project_id;
    setThreadMenu(null);
  };

  const startRenameProject = (project: Project) => {
    setRenamingProject(project.id);
    setRenameValue(project.name);
    setProjectMenu(null);
  };

  const projMenuProject = projectMenu ? projects.find(p => p.id === projectMenu.projectId) : null;
  const threadMenuThread = threadMenu ? getProjectThreads(threadMenu.projectId).find(t => t.id === threadMenu.threadId) : null;

  return (
    <aside className="sidebar-panel">
      {/* Branding */}
      <div className="sidebar-brand">
        <img src={logo} alt="Flux Code" className="sidebar-logo" />
        <span className="sidebar-brand-name">Flux Code</span>
      </div>

      {/* Search */}
      <div className="sidebar-search" onClick={onOpenSearch}>
        <Search size={14} />
        <span className="sidebar-search-placeholder">Search</span>
        <span className="sidebar-search-shortcut">Ctrl+K</span>
      </div>

      {/* Header */}
      <div className="sidebar-header">
        <h3>Projects</h3>
        <div className="sidebar-actions">
          <button className="icon-btn" onClick={onAddProject} title="Add Project">
            <FolderPlus size={14} />
          </button>
          <div className="sidebar-options-wrapper">
            <button
              ref={optionsBtnRef}
              className="icon-btn"
              onClick={(e) => { e.stopPropagation(); setSidebarOptionsOpen(!sidebarOptionsOpen); }}
              title="Sidebar options"
            >
              <MoreHorizontal size={14} />
            </button>
            {sidebarOptionsOpen && (
              <div ref={optionsRef} className="sidebar-options-menu">
                <div className="options-section">
                  <div className="options-label">Sort projects</div>
                  <button className="options-item active"><Check size={12} /> Last user message</button>
                  <button className="options-item">Created at</button>
                  <button className="options-item">Manual</button>
                </div>
                <div className="options-section">
                  <div className="options-label">Sort threads</div>
                  <button className="options-item active"><Check size={12} /> Last user message</button>
                  <button className="options-item">Created at</button>
                </div>
                <div className="options-section">
                  <div className="options-label">Visible threads</div>
                  <div className="options-counter">
                    <button className="counter-btn"><Minus size={12} /></button>
                    <span className="counter-value">6</span>
                    <button className="counter-btn"><Plus size={12} /></button>
                  </div>
                </div>
                <div className="options-section">
                  <div className="options-label">Group projects</div>
                  <button className="options-item active"><Check size={12} /> Group by repository</button>
                  <button className="options-item">Group by repository path</button>
                  <button className="options-item">Keep separate</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="projects-list">
        {projects.length === 0 && (
          <div className="empty-state">
            <FolderGit2 size={28} />
            <p>No projects yet</p>
            <button className="btn-primary" onClick={onAddProject}>Add your first project</button>
          </div>
        )}

        {projects.map((project) => {
          const isExpanded = expandedProjectIds.has(project.id);
          const projectThreads = getProjectThreads(project.id);

          return (
            <div key={project.id} className="project-group">
              <div
                className="project-header-row"
                onClick={() => toggleProject(project)}
                onContextMenu={(e) => handleProjectContext(e, project.id)}
              >
                <button className="expand-btn">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="project-icon-sm"><Folder size={12} /></div>
                {renamingProject === project.id ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameProject(project.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameProject(project.id);
                      if (e.key === 'Escape') { setRenamingProject(null); setRenameValue(''); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="project-info-sm">
                    <span className="project-name-sm">{project.name}</span>
                    {project.git_branch && (
                      <span className="branch-badge-sm">{project.git_branch}</span>
                    )}
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="project-threads">
                  {projectThreads.length === 0 && (
                    <div className="project-threads-empty">
                      <span>No threads yet</span>
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddThread(project.id, 'New Thread', 'chat');
                        }}
                        title="New Thread"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                  {projectThreads.map((thread) => {
                    const isThreadActive = activeThread?.id === thread.id;
                    const isHovered = hoveredThreadId === thread.id;
                    return (
                      <div
                        key={thread.id}
                        className={`thread-row ${isThreadActive ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectThread(thread);
                          onSelectProject(project);
                        }}
                        onContextMenu={(e) => handleThreadContext(e, thread.id, project.id)}
                        onMouseEnter={() => setHoveredThreadId(thread.id)}
                        onMouseLeave={() => setHoveredThreadId(null)}
                      >
                        {renamingThread === thread.id ? (
                          <input
                            className="rename-input thread-rename"
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameThread(thread.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameThread(thread.id);
                              if (e.key === 'Escape') { setRenamingThread(null); setRenameValue(''); }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span className="thread-row-title">{thread.title}</span>
                            {isHovered ? (
                              <button
                                className="thread-archive-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchiveThread(thread.id);
                                }}
                                title="Archive"
                              >
                                <Archive size={12} />
                              </button>
                            ) : (
                              <span className="thread-row-time">{formatRelativeTime(thread.updated_at)}</span>
                            )}
                            <span
                              className="thread-row-dot"
                              style={{ background: modeColors[thread.mode] || '#6e7681' }}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                  {projectThreads.length > 0 && (
                    <button
                      className="thread-row add-thread-row"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddThread(project.id, 'New Thread', 'chat');
                      }}
                    >
                      <Plus size={12} />
                      <span>New thread</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-nav">
        <button className="nav-item">
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>

      {/* Project Context Menu */}
      {projectMenu && projMenuProject && (
        <div
          className="context-menu"
          style={{ left: projectMenu.x, top: projectMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-item" onClick={() => startRenameProject(projMenuProject)}>
            <Edit3 size={14} />
            <span>Rename Project</span>
          </button>
          <button className="context-item" onClick={() => { setProjectMenu(null); }}>
            <Folder size={14} />
            <span>Project grouping</span>
          </button>
          <button className="context-item" onClick={() => { navigator.clipboard.writeText(projMenuProject.path); setProjectMenu(null); }}>
            <Copy size={14} />
            <span>Copy Project Path</span>
          </button>
          <div className="context-sep" />
          <button className="context-item danger" onClick={() => { onRemoveProject(projMenuProject.id); setProjectMenu(null); }}>
            <Trash2 size={14} />
            <span>Remove Project</span>
          </button>
        </div>
      )}

      {/* Thread Context Menu */}
      {threadMenu && threadMenuThread && (
        <div
          className="context-menu"
          style={{ left: threadMenu.x, top: threadMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-item" onClick={() => startRenameThread(threadMenuThread)}>
            <Edit3 size={14} />
            <span>Rename thread</span>
          </button>
          <button className="context-item" onClick={() => { setThreadMenu(null); }}>
            <Check size={14} />
            <span>Mark Unread</span>
          </button>
          <button className="context-item" onClick={() => { navigator.clipboard.writeText(threadMenuThread.title); setThreadMenu(null); }}>
            <Copy size={14} />
            <span>Copy path</span>
          </button>
          <button className="context-item" onClick={() => { navigator.clipboard.writeText(String(threadMenuThread.id)); setThreadMenu(null); }}>
            <Copy size={14} />
            <span>Copy Path ID</span>
          </button>
          <div className="context-sep" />
          <button className="context-item danger" onClick={() => handleDeleteThread(threadMenuThread.id)}>
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  );
}
