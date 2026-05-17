import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Square, Bot, Lock, Check, Search, Copy } from './icons';
import logo from '../Fluxavatar.png';
import type { Thread, Project } from '../App';
import { useProviderStore } from '../stores/providerStore';
import type { ProviderKind } from '../types/provider';

interface Props {
  activeThread: Thread | null;
  activeProject: Project | null;
  onAddThread: (title: string, mode?: string) => void;
}

const ACCESS_LEVELS = [
  { id: 'supervised', label: 'Supervised', desc: 'Ask before commands and file changes.', icon: 'lock' },
  { id: 'auto-edit', label: 'Auto-accept edits', desc: 'Auto-approve edits, ask before other actions.', icon: 'pencil' },
  { id: 'full', label: 'Full access', desc: 'Allow commands and edits without prompts.', icon: 'lock' },
] as const;

const VARIANTS = ['Low', 'Medium', 'High'] as const;
const AGENTS = ['Build', 'Plan'] as const;

export default function ChatPanel({ activeThread, activeProject, onAddThread }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [openDropdown, setOpenDropdown] = useState<null | 'model' | 'access' | 'variant'>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedAccess, setSelectedAccess] = useState('full');
  const [selectedVariant, setSelectedVariant] = useState('Medium');
  const [selectedAgent, setSelectedAgent] = useState('Build');

  const {
    statuses, models: providerModels, enabledProviders,
    activeProvider, activeModel,
    setActiveProvider, setActiveModel,
    streamingContent: storeStreamingContent,
    isStreaming: storeIsStreaming,
    error: storeError,
    endStreaming, setError,
  } = useProviderStore();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  // Build flat model list from provider store (only enabled providers)
  const allModels: { provider: ProviderKind; model: string; displayName: string }[] = [];
  for (const [kind, list] of Object.entries(providerModels)) {
    if (!enabledProviders[kind as ProviderKind]) continue;
    for (const m of list) {
      allModels.push({ provider: kind as ProviderKind, model: m, displayName: m });
    }
  }

  const filteredModels = allModels.filter(m =>
    m.model.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.provider.toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Sync store streaming to local state
  useEffect(() => {
    if (storeIsStreaming) {
      setStreamingContent(storeStreamingContent);
      setIsGenerating(true);
      generatingRef.current = true;
    }
  }, [storeStreamingContent, storeIsStreaming]);

  useEffect(() => {
    if (storeError) {
      setErrorToast(storeError);
      setIsGenerating(false);
      generatingRef.current = false;
      setStreamingContent('');
      endStreaming();
      setTimeout(() => { setErrorToast(null); setError(null); }, 5000);
    }
  }, [storeError]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }
    window.electronAPI.chat.getMessages(activeThread.id).then(setMessages);
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

    try {
      await window.electronAPI.provider.startSession({
        threadId: activeThread.id,
        provider: activeProvider,
        model: activeModel,
        projectPath: activeProject?.path ?? '.',
      });

      const turnId = `turn_${Date.now()}`;
      await window.electronAPI.provider.sendTurn(activeThread.id, turnId, text);
    } catch (err: any) {
      setErrorToast(err.message || 'Failed to send message');
      setIsGenerating(false);
      generatingRef.current = false;
      setTimeout(() => setErrorToast(null), 5000);
    }
  };

  const handleCancel = () => {
    if (!activeThread) return;
    window.electronAPI.provider.interruptTurn(activeThread.id);
    setIsGenerating(false);
    generatingRef.current = false;
    setStreamingContent('');
    endStreaming();
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
      {errorToast && (
        <div className="chat-toast error">
          <span>{errorToast}</span>
          <button className="chat-toast-close" onClick={() => setErrorToast(null)}>×</button>
        </div>
      )}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <img src={logo} alt="Flux Code" className="chat-avatar" />
            <p>Ask the agent to do something...</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const time = msg.created_at
            ? new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '';
          return (
            <div key={i} className={`message message-${msg.role}`}>
              <div className="message-content">
                <span className="message-text">{msg.content}</span>
                {msg.role === 'user' && (
                  <div className="message-content-meta">
                    <button
                      className="message-copy-btn"
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      title="Copy message"
                    >
                      <Copy size={12} />
                    </button>
                    <span className="message-time">{time}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isGenerating && streamingContent && (
          <div className="message message-assistant">
            <div className="message-content">
              <span className="message-text">{streamingContent}</span>
            </div>
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
                  <span>{activeProvider} · {activeModel}</span>
                </button>

                {openDropdown === 'model' && (
                  <div className="toolbar-dropdown model-dropdown">
                    <div className="model-dropdown-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                      <span>{activeProvider}</span>
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
                    {/* Provider list */}
                    {(['codex', 'claude', 'opencode', 'ollama', 'kimi', 'gemini'] as ProviderKind[]).map(kind => {
                      if (!enabledProviders[kind]) return null;
                      const status = statuses[kind];
                      const isReady = status?.kind === 'ready';
                      const modelList = providerModels[kind] ?? [];
                      if (!isReady || modelList.length === 0) return null;
                      return (
                        <div key={kind}>
                          <div className="dropdown-section-label" style={{ textTransform: 'capitalize', padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{kind}</div>
                          {modelList.map(m => (
                            <button
                              key={`${kind}:${m}`}
                              className={`toolbar-dropdown-item ${activeProvider === kind && activeModel === m ? 'active' : ''}`}
                              onClick={() => {
                                setActiveProvider(kind);
                                setActiveModel(m);
                                setOpenDropdown(null);
                                setModelSearch('');
                              }}
                            >
                              <span>{m}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {filteredModels.length === 0 && (
                      <div className="toolbar-dropdown-item" style={{ color: 'var(--text-muted)' }}>
                        <span>No models available. Check provider status in Settings.</span>
                      </div>
                    )}
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
