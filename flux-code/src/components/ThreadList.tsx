import { useState, useEffect } from 'react';
import { Plus, Play, Search, MessageSquare, Clock, CheckCircle2, Loader2, Trash2, Edit3, Copy, Archive, ExternalLink } from './icons';
import type { Thread } from '../App';

interface Props {
  threads: Thread[];
  activeThread: Thread | null;
  projectName: string;
  onSelectThread: (t: Thread) => void;
  onAddThread: (title: string, mode?: string) => void;
}

interface ContextMenuPos {
  x: number;
  y: number;
  threadId: number;
}

const modeLabels: Record<string, string> = {
  chat: 'Chat',
  plan: 'Plan',
  worktree: 'Worktree',
};

const modeColors: Record<string, string> = {
  chat: '#58a6ff',
  plan: '#d29922',
  worktree: '#3fb950',
};

function groupThreads(threads: Thread[]): { label: string; items: Thread[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const running: Thread[] = [];
  const todayList: Thread[] = [];
  const yesterdayList: Thread[] = [];
  const thisWeek: Thread[] = [];
  const older: Thread[] = [];

  for (const t of threads) {
    const updated = new Date(t.updated_at);
    if (t.status === 'running') {
      running.push(t);
    } else if (updated >= today) {
      todayList.push(t);
    } else if (updated >= yesterday) {
      yesterdayList.push(t);
    } else if (updated >= weekAgo) {
      thisWeek.push(t);
    } else {
      older.push(t);
    }
  }

  const groups: { label: string; items: Thread[] }[] = [];
  if (running.length) groups.push({ label: 'Running', items: running });
  if (todayList.length) groups.push({ label: 'Today', items: todayList });
  if (yesterdayList.length) groups.push({ label: 'Yesterday', items: yesterdayList });
  if (thisWeek.length) groups.push({ label: 'This Week', items: thisWeek });
  if (older.length) groups.push({ label: 'Older', items: older });
  return groups;
}

export default function ThreadList({ threads, activeThread, projectName, onSelectThread, onAddThread }: Props) {
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, threadId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, threadId });
  };

  const filtered = threads.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const groups = groupThreads(filtered);

  return (
    <aside className="threads-panel">
      <div className="threads-header">
        <h3>{projectName}</h3>
        <div className="threads-actions">
          <button className="icon-btn" onClick={() => onAddThread('New Thread', 'chat')} title="New Thread">
            <Plus size={16} />
          </button>
          <button className="icon-btn" title="Quick Actions">
            <Play size={16} />
          </button>
        </div>
      </div>

      <div className="threads-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search threads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="threads-list">
        {threads.length === 0 && (
          <div className="empty-state">
            <MessageSquare size={32} />
            <p>No threads yet</p>
            <button className="btn-primary" onClick={() => onAddThread('New Thread')}>
              Create first thread
            </button>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="thread-group">
            <div className="thread-group-label">{group.label}</div>
            {group.items.map((thread) => {
              const isActive = activeThread?.id === thread.id;
              return (
                <div
                  key={thread.id}
                  className={`thread-card ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectThread(thread)}
                  onContextMenu={(e) => handleContextMenu(e, thread.id)}
                >
                  <div className="thread-icon">
                    {thread.status === 'running' ? <Loader2 size={14} className="spin" /> :
                     thread.status === 'completed' ? <CheckCircle2 size={14} /> :
                     <Clock size={14} />}
                  </div>
                  <div className="thread-info">
                    <div className="thread-title">{thread.title}</div>
                    <div className="thread-meta">
                      <span
                        className="mode-badge"
                        style={{ background: modeColors[thread.mode] + '22', color: modeColors[thread.mode] }}
                      >
                        {modeLabels[thread.mode] || thread.mode}
                      </span>
                      <span className="thread-date">{new Date(thread.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-item" onClick={() => setContextMenu(null)}>
            <Edit3 size={14} />
            <span>Rename</span>
          </button>
          <button className="context-item" onClick={() => setContextMenu(null)}>
            <Copy size={14} />
            <span>Duplicate</span>
          </button>
          <button className="context-item" onClick={() => setContextMenu(null)}>
            <Archive size={14} />
            <span>Archive</span>
          </button>
          <button className="context-item" onClick={() => setContextMenu(null)}>
            <ExternalLink size={14} />
            <span>Copy link</span>
          </button>
          <div className="context-sep" />
          <button className="context-item danger" onClick={() => setContextMenu(null)}>
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  );
}
