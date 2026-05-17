import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Square, User, Bot, Lock, Check, Search } from './icons';
import logo from '../Fluxavatar.png';
import type { Thread, Project } from '../App';

interface Props {
  activeThread: Thread | null;
  activeProject: Project | null;
  onAddThread: (title: string, mode?: string) => void;
}

const MODELS = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'claude-4', name: 'Claude 4', provider: 'Anthropic' },
  { id: 'deepseek', name: 'DeepSeek V4', provider: 'DeepSeek' },
  { id: 'ollama', name: 'Ollama Local', provider: 'Local' },
];

const ACCESS_LEVELS = [
  { id: 'supervised', label: 'Supervised', desc: 'Ask before commands and file changes.', icon: 'lock' },
  { id: 'auto-edit', label: 'Auto-accept edits', desc: 'Auto-approve edits, ask before other actions.', icon: 'pencil' },
  { id: 'full', label: 'Full access', desc: 'Allow commands and edits without prompts.', icon: 'lock' },
] as const;

const VARIANTS = ['Low', 'Medium', 'High'] as const;
const AGENTS = ['Build', 'Plan'] as const;

const FAV_MODELS_KEY = 'flux:favModels';

function loadFavModels(): string[] {
  try {
    const raw = localStorage.getItem(FAV_MODELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function saveFavModels(ids: string[]) {
  localStorage.setItem(FAV_MODELS_KEY, JSON.stringify(ids));
}

export default function ChatPanel({ activeThread, activeProject, onAddThread }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const [openDropdown, setOpenDropdown] = useState<null | 'model' | 'access' | 'variant'>(null);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedAccess, setSelectedAccess] = useState('full');
  const [selectedVariant, setSelectedVariant] = useState('Medium');
  const [selectedAgent, setSelectedAgent] = useState('Build');
  const [favModels, setFavModels] = useState<string[]>(loadFavModels);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const sortedModelsRef = useRef(MODELS);
  const generatingRef = useRef(false);

  // Global shortcuts for model selection (Ctrl+1..Ctrl+4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = sortedModelsRef.current;
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= current.length) {
          e.preventDefault();
          setSelectedModel(current[num - 1]);
        }
      }
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredModels = MODELS.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.provider.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const sortedModels = [...filteredModels].sort((a, b) => {
    const aFav = favModels.includes(a.id) ? -1 : 0;
    const bFav = favModels.includes(b.id) ? -1 : 0;
    if (aFav !== bFav) return aFav - bFav;
    return MODELS.findIndex(m => m.id === a.id) - MODELS.findIndex(m => m.id === b.id);
  });

  // Update ref during render so keyboard handler always sees current sortedModels
  sortedModelsRef.current = sortedModels;

  const toggleFav = (modelId: string) => {
    setFavModels(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      saveFavModels(next);
      return next;
    });
  };

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }
    window.electronAPI.chat.getMessages(activeThread.id).then(setMessages);
  }, [activeThread?.id]);

  // Listen for streaming tokens
  useEffect(() => {
    const unsubToken = window.electronAPI.onChatToken(({ threadId, token }) => {
      if (threadId === activeThread?.id) {
        setStreamingContent(prev => prev + token);
      }
    });
    const unsubDone = window.electronAPI.onChatDone(({ threadId }) => {
      if (threadId === activeThread?.id) {
        setIsGenerating(false);
        generatingRef.current = false;
        setStreamingContent('');
        // Refresh messages from DB
        window.electronAPI.chat.getMessages(threadId).then(setMessages);
      }
    });
    const unsubError = window.electronAPI.onChatError(({ threadId, error }) => {
      if (threadId === activeThread?.id) {
        setIsGenerating(false);
        generatingRef.current = false;
        setStreamingContent('');
        alert('Chat error: ' + error);
      }
    });
    return () => {
      unsubToken();
      unsubDone();
      unsubError();
    };
  }, [activeThread?.id]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !activeThread || generatingRef.current) return;
    const text = input.trim();
    setInput('');
    setIsGenerating(true);
    generatingRef.current = true;
    setStreamingContent('');

    // Optimistically add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    await window.electronAPI.chat.sendMessage(activeThread.id, text, selectedModel.id);
  };

  const handleCancel = () => {
    if (!activeThread) return;
    window.electronAPI.chat.cancel(activeThread.id);
    setIsGenerating(false);
    generatingRef.current = false;
    setStreamingContent('');
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
        {isGenerating && streamingContent && (
          <div className="message message-assistant">
            <div className="message-avatar">
              <img src={logo} alt="AI" className="msg-avatar-img" />
            </div>
            <div className="message-content">{streamingContent}</div>
          </div>
        )}
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

          <div className="chat-input-toolbar" ref={toolbarRef}>
            <div className="toolbar-left">
              {/* Model selector */}
              <div className="toolbar-item-wrapper">
                <button
                  className="toolbar-btn"
                  onClick={() => setOpenDropdown(openDropdown === 'model' ? null : 'model')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />
                  </svg>
                  <span>{selectedModel.provider} · {selectedModel.name}</span>
                </button>

                {openDropdown === 'model' && (
                  <div className="toolbar-dropdown model-dropdown">
                    <div className="model-dropdown-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                      <span>{selectedModel.provider}</span>
                    </div>
                    <div className="toolbar-dropdown-search">
                      <Search size={14} />
                      <input
                        autoFocus
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                      />
                    </div>
                    {sortedModels.map((model, i) => {
                      const isFav = favModels.includes(model.id);
                      return (
                        <button
                          key={model.id}
                          className={`toolbar-dropdown-item ${selectedModel.id === model.id ? 'active' : ''}`}
                          onClick={() => { setSelectedModel(model); setOpenDropdown(null); setModelSearch(''); }}
                        >
                          <span
                            className={`model-fav-star ${isFav ? 'fav' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleFav(model.id); }}
                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon
                                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                fill={isFav ? 'currentColor' : 'none'}
                              />
                            </svg>
                          </span>
                          <span>{model.provider} · {model.name}</span>
                          <span className="toolbar-dropdown-shortcut">Ctrl+{i + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <span className="toolbar-sep">|</span>

              {/* Variant/Agent selector */}
              <div className="toolbar-item-wrapper">
                <button
                  className="toolbar-btn"
                  onClick={() => setOpenDropdown(openDropdown === 'variant' ? null : 'variant')}
                >
                  <span>{selectedVariant} · {selectedAgent}</span>
                </button>

                {openDropdown === 'variant' && (
                  <div className="toolbar-dropdown variant-dropdown">
                    <div className="dropdown-section">
                      <div className="dropdown-section-label">Variant</div>
                      {VARIANTS.map(v => (
                        <button
                          key={v}
                          className={`toolbar-dropdown-item ${selectedVariant === v ? 'active' : ''}`}
                          onClick={() => setSelectedVariant(v)}
                        >
                          <span>{v}</span>
                          {selectedVariant === v && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    <div className="dropdown-section">
                      <div className="dropdown-section-label">Agent</div>
                      {AGENTS.map(a => (
                        <button
                          key={a}
                          className={`toolbar-dropdown-item ${selectedAgent === a ? 'active' : ''}`}
                          onClick={() => setSelectedAgent(a)}
                        >
                          <span>{a}</span>
                          {selectedAgent === a && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="toolbar-sep">|</span>

              {/* Access selector */}
              <div className="toolbar-item-wrapper">
                <button
                  className="toolbar-btn"
                  onClick={() => setOpenDropdown(openDropdown === 'access' ? null : 'access')}
                >
                  <Lock size={12} />
                  <span>{ACCESS_LEVELS.find(a => a.id === selectedAccess)?.label}</span>
                </button>

                {openDropdown === 'access' && (
                  <div className="toolbar-dropdown access-dropdown">
                    {ACCESS_LEVELS.map(level => (
                      <button
                        key={level.id}
                        className={`toolbar-dropdown-item access-item ${selectedAccess === level.id ? 'active' : ''}`}
                        onClick={() => { setSelectedAccess(level.id); setOpenDropdown(null); }}
                      >
                        <div className="access-icon">
                          {level.icon === 'lock' ? <Lock size={14} /> : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          )}
                        </div>
                        <div className="access-info">
                          <span className="access-label">{level.label}</span>
                          <span className="access-desc">{level.desc}</span>
                        </div>
                        {selectedAccess === level.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isGenerating ? (
              <button className="send-circle stop" onClick={handleCancel} title="Stop">
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
