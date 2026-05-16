import { useState } from 'react';
import { ArrowUp, Square, User, Bot, Lock } from './icons';
import logo from '../Fluxavatar.png';
import type { Thread, Project } from '../App';

interface Props {
  activeThread: Thread | null;
  activeProject: Project | null;
  onAddThread: (title: string, mode?: string) => void;
}

export default function ChatPanel({ activeThread, activeProject, onAddThread }: Props) {
  const [input, setInput] = useState('');
  const [messages] = useState<any[]>([]);
  const isGenerating = false;

  const handleSend = () => {
    if (!input.trim() || !activeThread) return;
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeProject) {
    return (
      <div className="chat-panel empty">
        <div className="empty-state large">
          <Bot size={64} />
          <h2>Welcome to Flux Code</h2>
          <p>Select or add a project to start working with AI.</p>
        </div>
      </div>
    );
  }

  if (!activeThread) {
    return (
      <div className="chat-panel empty">
        <div className="empty-state large">
          <Bot size={64} />
          <h2>Select a Thread</h2>
          <p>Choose an existing thread or create a new one.</p>
          <button className="btn-primary" onClick={() => onAddThread('New Thread', 'chat')}>
            Create New Thread
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <img src={logo} alt="Flux Code" className="chat-avatar" />
            <p>Ask the agent to do something...</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? <User size={18} /> : <img src={logo} alt="AI" className="msg-avatar-img" />}
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder="Ask anything. @tag files/folders, $use skills, or / for commands"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="chat-input-toolbar">
            <div className="toolbar-left">
              <div className="toolbar-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />
                </svg>
              </div>
              <select className="toolbar-select">
                <option>OpenCode...</option>
                <option>DeepSeek...</option>
                <option>Claude...</option>
              </select>
              <span className="toolbar-sep">|</span>
              <select className="toolbar-select">
                <option>Medium · Build</option>
                <option>Low · Read</option>
                <option>High · Deploy</option>
              </select>
              <span className="toolbar-sep">|</span>
              <div className="toolbar-icon">
                <Lock size={12} />
              </div>
              <select className="toolbar-select">
                <option>Full access</option>
                <option>Supervised</option>
              </select>
            </div>

            {isGenerating ? (
              <button className="send-circle stop" title="Stop">
                <Square size={16} />
              </button>
            ) : (
              <button className="send-circle" onClick={handleSend} disabled={!input.trim()} title="Send">
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
