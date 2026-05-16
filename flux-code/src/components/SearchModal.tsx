import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileText, FolderPlus, Settings, ArrowUp, ArrowDown, CornerDownLeft, XIcon, ArrowLeft, Folder } from './icons';
import type { Project, Thread } from '../App';

interface Props {
  projects: Project[];
  threads: Thread[];
  activeThread: Thread | null;
  onSelectThread: (t: Thread) => void;
  onSelectProject: (p: Project) => void;
  onAddProject: () => void;
  onAddThread: (projectId: number) => void;
  onClose: () => void;
}

interface ActionItem {
  type: 'action';
  id: string;
  label: string;
  icon: typeof FileText;
}

interface ThreadItem {
  type: 'thread';
  thread: Thread;
  project: Project | undefined;
  icon: typeof FileText;
}

type Item = ActionItem | ThreadItem;

export default function SearchModal({ projects, threads, activeThread, onSelectThread, onSelectProject, onAddProject, onAddThread, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<'main' | 'projects'>('main');
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);

  const getItems = useCallback((): Item[] => {
    const q = query.toLowerCase();
    const activeProjectName = activeThread
      ? projects.find(p => p.id === activeThread.project_id)?.name || 'project'
      : (projects[0]?.name || 'project');
    const actions: ActionItem[] = [
      { type: 'action', id: 'new-thread-current', label: 'New thread in ' + activeProjectName, icon: FileText },
      { type: 'action', id: 'new-thread-choose', label: 'New thread in...', icon: FileText },
      { type: 'action', id: 'add-project', label: 'Add project', icon: FolderPlus },
      { type: 'action', id: 'open-settings', label: 'Open settings', icon: Settings },
    ];
    const recentThreads: ThreadItem[] = threads
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => {
        const project = projects.find(p => p.id === t.project_id);
        return { type: 'thread', thread: t, project, icon: FileText };
      });
    return [...actions, ...recentThreads];
  }, [query, projects, threads, activeThread]);

  const handleSelect = useCallback((item: Item) => {
    if (item.type === 'action') {
      if (item.id === 'add-project') {
        onAddProject();
        onClose();
      } else if (item.id === 'new-thread-current') {
        const projectId = activeThread
          ? activeThread.project_id
          : (projects[0]?.id ?? 0);
        if (projectId) onAddThread(projectId);
        onClose();
      } else if (item.id === 'new-thread-choose') {
        setView('projects');
        setSelectedIndex(0);
        return;
      } else if (item.id === 'open-settings') {
        onClose();
      }
    } else if (item.type === 'thread') {
      onSelectThread(item.thread);
      if (item.project) onSelectProject(item.project);
      onClose();
    }
  }, [onAddProject, onAddThread, onClose, onSelectThread, onSelectProject, activeThread, projects]);

  const handleSelectProject = useCallback((project: Project) => {
    onAddThread(project.id);
    onClose();
  }, [onAddThread, onClose]);

  const items = getItems();
  itemsRef.current = items;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view === 'projects') {
          setView('main');
          setSelectedIndex(0);
          return;
        }
        onClose();
        return;
      }
      const currentItemsLength = view === 'projects' ? projects.length : itemsRef.current.length;
      const currentIndex = selectedIndex;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((currentIndex + 1) % currentItemsLength);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((currentIndex - 1 + currentItemsLength) % currentItemsLength);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (view === 'projects') {
          const project = projects[currentIndex];
          if (project) handleSelectProject(project);
        } else {
          const item = itemsRef.current[currentIndex];
          if (item) handleSelect(item);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, onClose, handleSelect, view, projects, handleSelectProject]);

  if (view === 'projects') {
    return (
      <div className="search-modal-overlay" onClick={onClose}>
        <div className="search-modal" onClick={(e) => e.stopPropagation()}>
          <div className="search-modal-input-wrapper">
            <button className="icon-btn" onClick={() => { setView('main'); setSelectedIndex(0); }}>
              <ArrowLeft size={16} />
            </button>
            <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Select project</span>
          </div>

          <div className="search-modal-section">
            {projects.map((project, i) => (
              <button
                key={project.id}
                className={`search-modal-item ${selectedIndex === i ? 'selected' : ''}`}
                onClick={() => handleSelectProject(project)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <Folder size={14} />
                <span className="search-modal-item-label">{project.name}</span>
              </button>
            ))}
          </div>

          <div className="search-modal-footer">
            <span><ArrowUp size={10} /> <ArrowDown size={10} /> Navigate</span>
            <span><CornerDownLeft size={10} /> Select</span>
            <span><XIcon size={10} /> Back</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-input-wrapper">
          <Search size={16} />
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder="Search commands, projects, and threads..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
        </div>

        <div className="search-modal-section">
          <div className="search-modal-section-label">Actions</div>
          {items.filter((i): i is ActionItem => i.type === 'action').map((item, i) => (
            <button
              key={item.id}
              className={`search-modal-item ${selectedIndex === i ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <item.icon size={14} />
              <span className="search-modal-item-label">{item.label}</span>
            </button>
          ))}
        </div>

        {items.filter((i): i is ThreadItem => i.type === 'thread').length > 0 && (
          <div className="search-modal-section">
            <div className="search-modal-section-label">Recent Threads</div>
            {items.filter((i): i is ThreadItem => i.type === 'thread').map((item, i) => {
              const idx = items.filter((j): j is ActionItem => j.type === 'action').length + i;
              return (
                <button
                  key={item.thread.id}
                  className={`search-modal-item ${selectedIndex === idx ? 'selected' : ''}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <item.icon size={14} />
                  <div className="search-modal-thread-info">
                    <span className="search-modal-item-label">{item.thread.title}</span>
                    <span className="search-modal-thread-meta">
                      {item.project?.name} · #{item.thread.mode}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="search-modal-footer">
          <span><ArrowUp size={10} /> <ArrowDown size={10} /> Navigate</span>
          <span><CornerDownLeft size={10} /> Select</span>
          <span><XIcon size={10} /> Close</span>
        </div>
      </div>
    </div>
  );
}
