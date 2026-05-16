import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Trash2, FolderGit2, Settings, ArrowLeft,
  Folder, ChevronDown, ChevronRight,
  Plus, Archive, Edit3, Copy, Check, MoreHorizontal, Minus, Search, Mail, MailOpen,
  AlertTriangle
} from './icons';
import logo from '../Fluxavatar.png';
import type { Project, Thread } from '../App';
import { SECTIONS, type Section } from './SettingsPanel';

interface Props {
  projects: Project[];
  threads: Thread[];
  activeProject: Project | null;
  activeThread: Thread | null;
  getProjectThreads: (projectId: number) => Thread[];
  onSelectProject: (p: Project) => void;
  onSelectThread: (t: Thread | null) => void;
  onAddProject: () => void;
  onRemoveProject: (id: number) => void;
  onAddThread: (projectId: number, title: string, mode?: string) => void;
  loadThreads: (projectId: number) => Promise<void>;
  loadProjects: () => Promise<void>;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  view?: 'chat' | 'settings';
  onBack?: () => void;
  settingsSection?: Section;
  onSelectSettingsSection?: (section: Section) => void;
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

type ProjectSort = 'lastMessage' | 'createdAt' | 'name' | 'manual';
type ThreadSort = 'lastMessage' | 'createdAt';
type GroupBy = 'none' | 'repository';

const STORAGE_KEY = 'flux-code:sidebar-options';

interface SidebarOptions {
  projectSort: ProjectSort;
  threadSort: ThreadSort;
  visibleThreadCount: number;
  groupBy: GroupBy;
}

function loadOptions(): SidebarOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    projectSort: 'lastMessage',
    threadSort: 'lastMessage',
    visibleThreadCount: 10,
    groupBy: 'none',
  };
}

function saveOptions(opts: SidebarOptions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (isToday) return `${hours}:${minutes}`;
  if (isYesterday) return `Yesterday, ${hours}:${minutes}`;

  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day}, ${hours}:${minutes}`;
  }
  return `${month} ${day} ${date.getFullYear()}, ${hours}:${minutes}`;
}

type ConfirmAction =
  | { type: 'deleteThread'; threadId: number; projectId: number; title: string }
  | { type: 'removeProject'; projectId: number; name: string };

export default function ProjectSidebar({
  projects,
  threads,
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
  onOpenSettings,
  view = 'chat',
  onBack,
  settingsSection = 'general',
  onSelectSettingsSection,
}: Props) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set());
  const [expandedThreadLists, setExpandedThreadLists] = useState<Set<number>>(new Set());
  const [projectMenu, setProjectMenu] = useState<ProjectMenuPos | null>(null);
  const [threadMenu, setThreadMenu] = useState<ThreadMenuPos | null>(null);
  const [sidebarOptionsOpen, setSidebarOptionsOpen] = useState(false);
  const [hoveredThreadId, setHoveredThreadId] = useState<number | null>(null);
  const [renamingThread, setRenamingThread] = useState<number | null>(null);
  const [renamingProject, setRenamingProject] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [opts, setOpts] = useState<SidebarOptions>(loadOptions);
  const [exitingThreads, setExitingThreads] = useState<Set<number>>(new Set());
  const [enteringThreads, setEnteringThreads] = useState<Set<number>>(new Set());
  const [confirmModal, setConfirmModal] = useState<ConfirmAction | null>(null);

  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsBtnRef = useRef<HTMLButtonElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const threadMenuRef = useRef<HTMLDivElement>(null);
  const renamingThreadProjectId = useRef<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const prevThreadsRef = useRef<Thread[]>([]);

  // Detect newly added threads for enter animation
  useEffect(() => {
    const prevIds = new Set(prevThreadsRef.current.map(t => t.id));
    const newIds = threads.filter(t => !prevIds.has(t.id)).map(t => t.id);

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (newIds.length > 0) {
      setEnteringThreads(prev => new Set([...prev, ...newIds]));
      timer = setTimeout(() => {
        setEnteringThreads(prev => {
          const next = new Set(prev);
          newIds.forEach(id => next.delete(id));
          return next;
        });
      }, 350);
    }

    prevThreadsRef.current = threads;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [threads]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingThread !== null || renamingProject !== null) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingThread, renamingProject]);

  // Close menus on outside click using mousedown + ref
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        optionsRef.current?.contains(target) ||
        optionsBtnRef.current?.contains(target) ||
        projectMenuRef.current?.contains(target) ||
        threadMenuRef.current?.contains(target)
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

  const updateOpts = (patch: Partial<SidebarOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    saveOptions(next);
  };

  const getLastThreadDate = (projectId: number): number => {
    const list = getProjectThreads(projectId);
    if (list.length === 0) {
      const proj = projects.find(p => p.id === projectId);
      return proj ? new Date(proj.created_at).getTime() : 0;
    }
    return Math.max(...list.map(t => new Date(t.updated_at).getTime()));
  };

  const sortedProjects = (() => {
    const list = [...projects];
    switch (opts.projectSort) {
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'createdAt':
        return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'lastMessage':
        return list.sort((a, b) => getLastThreadDate(b.id) - getLastThreadDate(a.id));
      case 'manual':
      default:
        return list;
    }
  })();

  const getSortedThreads = (projectId: number): Thread[] => {
    const list = [...getProjectThreads(projectId)];
    switch (opts.threadSort) {
      case 'createdAt':
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'lastMessage':
      default:
        list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }
    const isExpanded = expandedThreadLists.has(projectId);
    return isExpanded ? list : list.slice(0, opts.visibleThreadCount);
  };

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

  const requestArchiveThread = (threadId: number, projectId: number) => {
    setExitingThreads(prev => new Set(prev).add(threadId));
    setThreadMenu(null);
    setTimeout(async () => {
      try {
        await window.electronAPI.db.archiveThread(threadId);
        await loadThreads(projectId);
      } catch (err) {
        console.error('Failed to archive thread:', err);
      } finally {
        setExitingThreads(prev => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
      }
    }, 280);
  };

  const requestDeleteThread = (threadId: number, projectId: number) => {
    setExitingThreads(prev => new Set(prev).add(threadId));
    setThreadMenu(null);
    setTimeout(async () => {
      try {
        await window.electronAPI.db.deleteThread(threadId);
        await loadThreads(projectId);
        if (activeThread?.id === threadId) onSelectThread(null);
      } catch (err) {
        console.error('Failed to delete thread:', err);
      } finally {
        setExitingThreads(prev => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
      }
    }, 280);
  };

  const requestRemoveProject = (projectId: number) => {
    onRemoveProject(projectId);
    setProjectMenu(null);
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

  const handleMarkRead = async (threadId: number) => {
    await window.electronAPI.db.markThreadRead(threadId);
    const projectId = activeProject?.id ?? threadMenu?.projectId;
    if (projectId) await loadThreads(projectId);
    setThreadMenu(null);
  };

  const handleMarkUnread = async (threadId: number) => {
    await window.electronAPI.db.markThreadUnread(threadId);
    const projectId = activeProject?.id ?? threadMenu?.projectId;
    if (projectId) await loadThreads(projectId);
    setThreadMenu(null);
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

      {view === 'settings' ? (
        <>
          <div className="sidebar-settings-nav">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`sidebar-settings-nav-item ${settingsSection === id ? 'active' : ''}`}
                onClick={() => onSelectSettingsSection?.(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-nav">
            <button className="nav-item" onClick={onBack}>
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          </div>
        </>
      ) : (
        <>
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
                      <button className={`options-item ${opts.projectSort === 'lastMessage' ? 'active' : ''}`} onClick={() => updateOpts({ projectSort: 'lastMessage' })}>
                        {opts.projectSort === 'lastMessage' && <Check size={12} />} Last user message
                      </button>
                      <button className={`options-item ${opts.projectSort === 'createdAt' ? 'active' : ''}`} onClick={() => updateOpts({ projectSort: 'createdAt' })}>
                        {opts.projectSort === 'createdAt' && <Check size={12} />} Created at
                      </button>
                      <button className={`options-item ${opts.projectSort === 'name' ? 'active' : ''}`} onClick={() => updateOpts({ projectSort: 'name' })}>
                        {opts.projectSort === 'name' && <Check size={12} />} Name
                      </button>
                      <button className={`options-item ${opts.projectSort === 'manual' ? 'active' : ''}`} onClick={() => updateOpts({ projectSort: 'manual' })}>
                        {opts.projectSort === 'manual' && <Check size={12} />} Manual
                      </button>
                    </div>
                    <div className="options-section">
                      <div className="options-label">Sort threads</div>
                      <button className={`options-item ${opts.threadSort === 'lastMessage' ? 'active' : ''}`} onClick={() => updateOpts({ threadSort: 'lastMessage' })}>
                        {opts.threadSort === 'lastMessage' && <Check size={12} />} Last user message
                      </button>
                      <button className={`options-item ${opts.threadSort === 'createdAt' ? 'active' : ''}`} onClick={() => updateOpts({ threadSort: 'createdAt' })}>
                        {opts.threadSort === 'createdAt' && <Check size={12} />} Created at
                      </button>
                    </div>
                    <div className="options-section">
                      <div className="options-label">Visible threads</div>
                      <div className="options-counter">
                        <button className="counter-btn" onClick={() => updateOpts({ visibleThreadCount: Math.max(1, opts.visibleThreadCount - 1) })}><Minus size={12} /></button>
                        <span className="counter-value">{opts.visibleThreadCount}</span>
                        <button className="counter-btn" onClick={() => updateOpts({ visibleThreadCount: Math.min(30, opts.visibleThreadCount + 1) })}><Plus size={12} /></button>
                      </div>
                    </div>
                    <div className="options-section">
                      <div className="options-label">Group projects</div>
                      <button className={`options-item ${opts.groupBy === 'repository' ? 'active' : ''}`} onClick={() => updateOpts({ groupBy: 'repository' })}>
                        {opts.groupBy === 'repository' && <Check size={12} />} Group by repository
                      </button>
                      <button className={`options-item ${opts.groupBy === 'none' ? 'active' : ''}`} onClick={() => updateOpts({ groupBy: 'none' })}>
                        {opts.groupBy === 'none' && <Check size={12} />} Keep separate
                      </button>
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

            {sortedProjects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const projectThreads = getSortedThreads(project.id);

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
                        ref={renameInputRef}
                        className="rename-input"
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
                        const isUnread = thread.is_read === 0;
                        const isExiting = exitingThreads.has(thread.id);
                        const isEntering = enteringThreads.has(thread.id);
                        return (
                          <div
                            key={thread.id}
                            className={`thread-row ${isThreadActive ? 'active' : ''} ${isUnread ? 'unread' : ''} ${isExiting ? 'exiting' : ''} ${isEntering ? 'entering' : ''}`}
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
                                ref={renameInputRef}
                                className="rename-input thread-rename"
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
                                {isUnread && <span className="thread-unread-dot" />}
                                <span className={`thread-row-title ${isUnread ? 'unread' : ''}`}>{thread.title}</span>
                                {isHovered ? (
                                  <button
                                    className="thread-archive-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestArchiveThread(thread.id, project.id);
                                    }}
                                    title="Archive"
                                  >
                                    <Archive size={12} />
                                  </button>
                                ) : (
                                  <span className="thread-row-time">{formatDateTime(thread.updated_at)}</span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                      {getProjectThreads(project.id).length > opts.visibleThreadCount && !expandedThreadLists.has(project.id) && (
                        <button
                          className="thread-row more-threads"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedThreadLists(prev => new Set(prev).add(project.id));
                          }}
                        >
                          <span>+{getProjectThreads(project.id).length - opts.visibleThreadCount} more</span>
                        </button>
                      )}
                      {expandedThreadLists.has(project.id) && getProjectThreads(project.id).length > opts.visibleThreadCount && (
                        <button
                          className="thread-row more-threads"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedThreadLists(prev => {
                              const next = new Set(prev);
                              next.delete(project.id);
                              return next;
                            });
                          }}
                        >
                          <span>-{getProjectThreads(project.id).length - opts.visibleThreadCount} less</span>
                        </button>
                      )}
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
            <button className="nav-item" onClick={onOpenSettings}>
              <Settings size={14} />
              <span>Settings</span>
            </button>
          </div>
        </>
      )}

      {/* Project Context Menu */}
      {projectMenu && projMenuProject && (
        <div
          ref={projectMenuRef}
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
          <button className="context-item danger" onClick={() => { setConfirmModal({ type: 'removeProject', projectId: projMenuProject.id, name: projMenuProject.name }); setProjectMenu(null); }}>
            <Trash2 size={14} />
            <span>Remove Project</span>
          </button>
        </div>
      )}

      {/* Thread Context Menu */}
      {threadMenu && threadMenuThread && (
        <div
          ref={threadMenuRef}
          className="context-menu"
          style={{ left: threadMenu.x, top: threadMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-item" onClick={() => startRenameThread(threadMenuThread)}>
            <Edit3 size={14} />
            <span>Rename thread</span>
          </button>
          {threadMenuThread.is_read === 0 ? (
            <button className="context-item" onClick={() => handleMarkRead(threadMenuThread.id)}>
              <MailOpen size={14} />
              <span>Mark Read</span>
            </button>
          ) : (
            <button className="context-item" onClick={() => handleMarkUnread(threadMenuThread.id)}>
              <Mail size={14} />
              <span>Mark Unread</span>
            </button>
          )}
          <button className="context-item" onClick={() => { navigator.clipboard.writeText(threadMenuThread.title); setThreadMenu(null); }}>
            <Copy size={14} />
            <span>Copy path</span>
          </button>
          <button className="context-item" onClick={() => { navigator.clipboard.writeText(String(threadMenuThread.id)); setThreadMenu(null); }}>
            <Copy size={14} />
            <span>Copy Path ID</span>
          </button>
          <div className="context-sep" />
          <button className="context-item danger" onClick={() => { setConfirmModal({ type: 'deleteThread', threadId: threadMenuThread.id, projectId: threadMenu.projectId, title: threadMenuThread.title }); setThreadMenu(null); }}>
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon">
              <AlertTriangle size={28} />
            </div>
            <h3 className="confirm-modal-title">
              {confirmModal.type === 'deleteThread' ? 'Delete Thread' : 'Remove Project'}
            </h3>
            <p className="confirm-modal-desc">
              {confirmModal.type === 'deleteThread'
                ? `Are you sure you want to delete "${confirmModal.title}"? This action cannot be undone.`
                : `Are you sure you want to remove "${confirmModal.name}"? All associated threads will also be removed.`}
            </p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button
                className="confirm-btn danger"
                onClick={() => {
                  if (confirmModal.type === 'deleteThread') {
                    requestDeleteThread(confirmModal.threadId, confirmModal.projectId);
                  } else {
                    requestRemoveProject(confirmModal.projectId);
                  }
                  setConfirmModal(null);
                }}
              >
                {confirmModal.type === 'deleteThread' ? 'Delete' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
