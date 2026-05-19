import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowUp, Square, Bot, Lock, Check, Search, Copy, Star, ChevronLeft, ChevronRight } from './icons';
import {
  CodexIcon, OllamaIcon, OpenCodeIcon, ClaudeIcon, KimiIcon, GeminiIcon,
} from './icons';
import logo from '../Fluxavatar.png';
import type { Thread, Project } from '../App';
import { useProviderStore, type ProviderDraft } from '../stores/providerStore';
import { DEFAULT_MODEL, type ProviderKind } from '../types/provider';
import type { ActivityItem } from '../types/activity';
import ChatMarkdown from './ChatMarkdown';
import { WorkLog } from './WorkLog';
import { ChangedFilesBadge } from './ChangedFilesBadge';
import { DiffPanel } from './DiffPanel';

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

function parseDbDate(dateStr: string): Date {
  if (dateStr.includes('T') && (dateStr.endsWith('Z') || dateStr.endsWith('+00:00'))) {
    return new Date(dateStr);
  }
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function generateThreadTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  if (clean.length <= 40) return clean;
  return clean.slice(0, 37) + '...';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function AgentMessageMeta({ metadata, content }: { metadata: string; content: string }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  let parsed: { endTime?: string; durationMs?: number } = {};
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (!parsed.endTime) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="message-content-meta assistant-meta"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="message-time">{parsed.endTime} • {formatDuration(parsed.durationMs ?? 0)}</span>
      {hovered && (
        <button
          className="message-copy-btn"
          onClick={handleCopy}
          title="Copy raw markdown"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </div>
  );
}

// Model option definitions aligned with T3 Code
const CODEX_EFFORTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const CLAUDE_EFFORTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'medium-high', label: 'High' },
  { value: 'ultrathink', label: 'Ultrathink' },
] as const;

const PROVIDER_ORDER: ProviderKind[] = ['codex', 'claudeCode', 'opencode', 'ollama', 'kimi', 'gemini'];

const PROVIDER_ICONS: Record<ProviderKind, React.ComponentType<{ size?: number; className?: string }>> = {
  codex: CodexIcon,
  claudeCode: ClaudeIcon,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
  kimi: KimiIcon,
  gemini: GeminiIcon,
};

const PROVIDER_LABELS: Record<ProviderKind, string> = {
  codex: 'Codex',
  claudeCode: 'Claude',
  opencode: 'OpenCode',
  ollama: 'Ollama',
  kimi: 'Kimi',
  gemini: 'Gemini',
};

function getEnabledProviders(enabledProviders: Record<string, boolean>): ProviderKind[] {
  return PROVIDER_ORDER.filter(k => enabledProviders[k]);
}

// ─── Model Options UI ───────────────────────────────────────────────────────

function ModelOptionsLabel({
  provider,
  modelOptions,
  agent,
}: {
  provider: ProviderKind;
  modelOptions: ProviderDraft['modelOptions'];
  agent: string;
}) {
  if (provider === 'codex') {
    const opts = modelOptions as { effort?: string; fastMode?: boolean } | undefined;
    const effort = opts?.effort ?? 'medium';
    const fast = opts?.fastMode ? 'Fast' : null;
    return <span>{effort}{fast ? ` · ${fast}` : ''} · {agent}</span>;
  }
  if (provider === 'claudeCode') {
    const opts = modelOptions as { effort?: string; thinking?: boolean; fastMode?: boolean } | undefined;
    const effort = opts?.effort ?? 'medium';
    const tags = [effort];
    if (opts?.thinking) tags.push('Think');
    if (opts?.fastMode) tags.push('Fast');
    return <span>{tags.join(' · ')} · {agent}</span>;
  }
  if (provider === 'opencode') {
    const opts = modelOptions as { variant?: string } | undefined;
    const variant = opts?.variant;
    return <span>{variant ? `${variant} · ` : ''}{agent}</span>;
  }
  return <span>Medium · {agent}</span>;
}

function CodexOptions({
  options,
  onChange,
}: {
  options: ProviderDraft['modelOptions'];
  onChange: (opts: ProviderDraft['modelOptions']) => void;
}) {
  const opts = (options as { effort?: string; fastMode?: boolean }) ?? {};
  return (
    <>
      <div className="dropdown-section">
        <div className="dropdown-section-label">Effort</div>
        {CODEX_EFFORTS.map((e) => (
          <button
            key={e.value}
            className={`toolbar-dropdown-item ${opts.effort === e.value ? 'active' : ''}`}
            onClick={() => onChange({ ...opts, effort: e.value })}
          >
            <span>{e.label}</span>
            {opts.effort === e.value && <Check size={14} />}
          </button>
        ))}
      </div>
      <div className="dropdown-section">
        <div className="dropdown-section-label">Mode</div>
        <button
          className={`toolbar-dropdown-item ${opts.fastMode ? 'active' : ''}`}
          onClick={() => onChange({ ...opts, fastMode: !opts.fastMode })}
        >
          <span>Fast mode</span>
          {opts.fastMode && <Check size={14} />}
        </button>
      </div>
    </>
  );
}

function OpenCodeVariantOptions({
  modelId,
  selectedVariant,
  onChange,
}: {
  modelId: string;
  selectedVariant: string | undefined;
  onChange: (variant: string | undefined) => void;
}) {
  const { modelVariants } = useProviderStore();
  const variants = modelVariants[modelId];
  const variantKeys = variants ? Object.keys(variants) : [];
  if (variantKeys.length === 0) return null;

  return (
    <div className="dropdown-section">
      <div className="dropdown-section-label">Variant</div>
      {variantKeys.map((v) => (
        <button
          key={v}
          className={`toolbar-dropdown-item ${selectedVariant === v ? 'active' : ''}`}
          onClick={() => onChange(v)}
        >
          <span className="capitalize">{v}</span>
          {selectedVariant === v && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}

function ClaudeOptions({
  options,
  onChange,
}: {
  options: ProviderDraft['modelOptions'];
  onChange: (opts: ProviderDraft['modelOptions']) => void;
}) {
  const opts = (options as { effort?: string; thinking?: boolean; fastMode?: boolean }) ?? {};
  return (
    <>
      <div className="dropdown-section">
        <div className="dropdown-section-label">Effort</div>
        {CLAUDE_EFFORTS.map((e) => (
          <button
            key={e.value}
            className={`toolbar-dropdown-item ${opts.effort === e.value ? 'active' : ''}`}
            onClick={() => onChange({ ...opts, effort: e.value })}
          >
            <span>{e.label}</span>
            {opts.effort === e.value && <Check size={14} />}
          </button>
        ))}
      </div>
      <div className="dropdown-section">
        <div className="dropdown-section-label">Mode</div>
        <button
          className={`toolbar-dropdown-item ${opts.thinking ? 'active' : ''}`}
          onClick={() => onChange({ ...opts, thinking: !opts.thinking })}
        >
          <span>Extended thinking</span>
          {opts.thinking && <Check size={14} />}
        </button>
        <button
          className={`toolbar-dropdown-item ${opts.fastMode ? 'active' : ''}`}
          onClick={() => onChange({ ...opts, fastMode: !opts.fastMode })}
        >
          <span>Fast mode</span>
          {opts.fastMode && <Check size={14} />}
        </button>
      </div>
    </>
  );
}

export default function ChatPanel({ activeThread, activeProject, onAddThread }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);
  const [diffPanelFiles, setDiffPanelFiles] = useState<string[]>([]);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState('');

  const [openDropdown, setOpenDropdown] = useState<null | 'model' | 'access' | 'variant'>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedAccess, setSelectedAccess] = useState('full');
  const [selectedVariant, setSelectedVariant] = useState('Medium');
  const [selectedAgent, setSelectedAgent] = useState('Build');

  const {
    models: providerModels, enabledProviders, modelMeta,
    activeProvider, activeModel,
    providerDrafts,
    envVars, serverUrls, serverPasswords,
    statuses,
    setActiveProvider, setActiveModel, setModelMeta, setModelOptions,
    streamingByThread,
    error: storeError,
    endStreaming, setError,
  } = useProviderStore();

  // Per-thread streaming state
  const threadStreaming = activeThread ? streamingByThread[activeThread.id] : undefined;
  const storeStreamingContent = threadStreaming?.content ?? '';
  const storeIsStreaming = !!threadStreaming;

  // Helper to get current model options for active provider
  const activeDraft = providerDrafts[activeProvider] ?? {};
  const activeModelOptions = activeDraft.modelOptions ?? {};

  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const generatingRef = useRef(false);

  // Dropdown state
  const enabledProvidersList = useMemo(() => getEnabledProviders(enabledProviders), [enabledProviders]);
  const [dropdownProvider, setDropdownProvider] = useState<ProviderKind>(activeProvider);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // If activeProvider is disabled, switch to first enabled one
  useEffect(() => {
    if (!enabledProvidersList.includes(activeProvider) && enabledProvidersList.length > 0) {
      const first = enabledProvidersList[0];
      setActiveProvider(first);
      setActiveModel(providerModels[first]?.[0] ?? DEFAULT_MODEL[first]);
    }
  }, [enabledProvidersList, activeProvider, setActiveProvider, setActiveModel, providerModels]);

  // Sync dropdown provider when it opens
  useEffect(() => {
    if (openDropdown === 'model') {
      // Ensure we start from an enabled provider
      const startProvider = enabledProvidersList.includes(activeProvider)
        ? activeProvider
        : (enabledProvidersList[0] ?? activeProvider);
      setDropdownProvider(startProvider);
      setHighlightedIndex(0);
      setModelSearch('');
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [openDropdown, activeProvider, enabledProvidersList]);

  const currentModels = useMemo(() => {
    const list = providerModels[dropdownProvider] ?? [];
    if (!modelSearch) return list;
    return list.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()));
  }, [providerModels, dropdownProvider, modelSearch]);

  const allModelsFlat: { provider: ProviderKind; model: string }[] = [];
  for (const kind of enabledProvidersList) {
    for (const m of (providerModels[kind] ?? [])) {
      allModelsFlat.push({ provider: kind, model: m });
    }
  }

  // Global shortcuts: Ctrl+1..9 selects model by flat index
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const idx = num - 1;
        const entry = allModelsFlat[idx];
        if (entry) {
          setActiveProvider(entry.provider);
          setActiveModel(entry.model);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [allModelsFlat, setActiveProvider, setActiveModel]);

  // Keyboard navigation inside model dropdown
  useEffect(() => {
    if (openDropdown !== 'model') return;
    const handler = (e: KeyboardEvent) => {
      const providerIdx = enabledProvidersList.indexOf(dropdownProvider);
      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          const prev = enabledProvidersList[providerIdx - 1];
          if (prev) {
            setDropdownProvider(prev);
            setHighlightedIndex(0);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const next = enabledProvidersList[providerIdx + 1];
          if (next) {
            setDropdownProvider(next);
            setHighlightedIndex(0);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setHighlightedIndex(i => Math.max(0, i - 1));
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          setHighlightedIndex(i => Math.min(currentModels.length - 1, i + 1));
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const model = currentModels[highlightedIndex];
          if (model) {
            setActiveProvider(dropdownProvider);
            setActiveModel(model);
            setOpenDropdown(null);
          }
          break;
        }
        case 'Escape': {
          setOpenDropdown(null);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openDropdown, dropdownProvider, enabledProvidersList, currentModels, highlightedIndex, setActiveProvider, setActiveModel]);

  // Sync store streaming to local state (per-thread aware)
  useEffect(() => {
    if (storeIsStreaming) {
      setStreamingContent(storeStreamingContent);
      setIsGenerating(true);
      generatingRef.current = true;
    } else {
      // Streaming ended for this thread
      if (generatingRef.current) {
        // Only clear if we were generating — a thread switch will reset via the thread change effect
      }
      setStreamingContent('');
    }
  }, [storeStreamingContent, storeIsStreaming]);

  // When thread changes, sync generation state from per-thread store
  useEffect(() => {
    if (activeThread) {
      const streaming = streamingByThread[activeThread.id];
      if (streaming) {
        setStreamingContent(streaming.content);
        setIsGenerating(true);
        generatingRef.current = true;
      } else {
        setStreamingContent('');
        setIsGenerating(false);
        generatingRef.current = false;
        setGenerationStartTime(null);
      }
    }
  }, [activeThread?.id]);

  // Timer for generation duration
  useEffect(() => {
    if (!isGenerating || !generationStartTime) {
      setElapsedTime('');
      return;
    }
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - generationStartTime) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setElapsedTime(m > 0 ? `${m}m ${s}s` : `${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerating, generationStartTime]);

  useEffect(() => {
    if (storeError) {
      setErrorToast(storeError);
      setIsGenerating(false);
      generatingRef.current = false;
      setStreamingContent('');
      setGenerationStartTime(null);
      if (activeThread) endStreaming(activeThread.id);
      setTimeout(() => { setErrorToast(null); setError(null); }, 5000);
    }
  }, [storeError]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      setActivities([]);
      return;
    }
    window.electronAPI.chat.getMessages(activeThread.id).then(setMessages);
    window.electronAPI.db.getActivitiesForThread(activeThread.id).then(setActivities);
  }, [activeThread?.id]);

  // Listen for live activity events from provider (filtered by active thread)
  useEffect(() => {
    const unsub = window.electronAPI.onProviderEvent((event: any) => {
      // Only process events for the currently active thread
      if (
        activeThread &&
        event.threadId === activeThread.id &&
        (event.method === 'item/tool/started' || event.method === 'item/tool/completed')
      ) {
        console.log('[ChatPanel] provider:event', event.method, 'thread:', event.threadId, 'turn:', event.turnId);
        window.electronAPI.db.getActivitiesForThread(activeThread.id).then((acts) => {
          console.log('[ChatPanel] Activities refreshed:', acts.length, 'for thread', activeThread.id);
          setActivities(acts);
        });
      }
    });
    return unsub;
  }, [activeThread?.id]);

  // Reload messages when provider turn completes (backend saved assistant message to DB)
  useEffect(() => {
    const handleTurnCompleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (activeThread && detail?.threadId === activeThread.id) {
        window.electronAPI.chat.getMessages(activeThread.id).then((msgs) => {
          setMessages(msgs);
          setIsGenerating(false);
          generatingRef.current = false;
          setStreamingContent('');

          // Also refresh activities
          window.electronAPI.db.getActivitiesForThread(activeThread.id).then(setActivities);

          // Auto-rename thread after first exchange if it still has default name
          const isDefaultName = activeThread.title === 'New Thread';
          if (isDefaultName && msgs.length >= 2) {
            const firstUserMsg = msgs.find((m: any) => m.role === 'user')?.content || '';
            const newTitle = generateThreadTitle(firstUserMsg);
            window.electronAPI.db.renameThread(activeThread.id, newTitle).then(() => {
              window.dispatchEvent(new CustomEvent('thread:renamed', { detail: { threadId: activeThread.id, title: newTitle } }));
            }).catch(() => {});
          }
        });
      }
    };
    window.addEventListener('provider:turn-completed', handleTurnCompleted);
    return () => window.removeEventListener('provider:turn-completed', handleTurnCompleted);
  }, [activeThread?.id, activeThread?.title, generationStartTime]);

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

    // Check provider status before sending
    const providerStatus = statuses[activeProvider];
    if (providerStatus?.kind === 'not-installed') {
      setErrorToast(`${PROVIDER_LABELS[activeProvider]} is not installed. Check provider settings.`);
      setTimeout(() => setErrorToast(null), 5000);
      return;
    }
    if (providerStatus?.kind === 'not-authenticated') {
      setErrorToast(`${PROVIDER_LABELS[activeProvider]} is not authenticated. Run: ${providerStatus.installCmd}`);
      setTimeout(() => setErrorToast(null), 5000);
      return;
    }
    if (providerStatus?.kind === 'error') {
      setErrorToast(`${PROVIDER_LABELS[activeProvider]} error: ${providerStatus.message}`);
      setTimeout(() => setErrorToast(null), 5000);
      return;
    }

    const text = input.trim();
    setInput('');
    setIsGenerating(true);
    generatingRef.current = true;
    setStreamingContent('');
    setGenerationStartTime(Date.now());

    const turnId = `turn_${Date.now()}`;

    // Optimistically add user message to UI (with turn_id so timeline can group activities)
    setMessages(prev => [...prev, { role: 'user', content: text, turn_id: turnId }]);

    console.log('[ChatPanel] Sending via provider:', activeProvider, 'model:', activeModel, 'thread:', activeThread.id);
    try {
      const runtimeMode = selectedAccess === 'full' ? 'full-access' : 'approval-required';
      await window.electronAPI.provider.startSession({
        threadId: activeThread.id,
        provider: activeProvider,
        model: activeModel,
        projectPath: activeProject?.path ?? '.',
        runtimeMode,
        modelOptions: activeModelOptions,
        interactionMode: selectedAgent.toLowerCase() as 'default' | 'plan',
        serverUrl: serverUrls[activeProvider] || undefined,
        serverPassword: serverPasswords[activeProvider] || undefined,
        env: envVars[activeProvider] || undefined,
      });

      await window.electronAPI.provider.sendTurn(activeThread.id, turnId, text);
    } catch (err: any) {
      console.error('[ChatPanel] Failed to send message:', err);
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
    setGenerationStartTime(null);
    endStreaming(activeThread.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleFavorite = (e: React.MouseEvent, provider: ProviderKind, model: string) => {
    e.stopPropagation();
    const meta = modelMeta[`${provider}:${model}`] ?? {};
    setModelMeta(`${provider}:${model}`, { favorite: !meta.favorite });
  };

  // Build timeline: group messages + activities by turn
  const timeline = useMemo(() => {
    interface TimelineItem {
      type: 'user' | 'worklog' | 'assistant';
      message?: any;
      activities?: ActivityItem[];
      turnId?: string;
      isEmptyResponse?: boolean;
      fileWriteActivities?: ActivityItem[];
    }

    const result: TimelineItem[] = [];
    const activitiesByTurn = new Map<string, ActivityItem[]>();
    for (const act of activities) {
      const list = activitiesByTurn.get(act.turn_id) || [];
      list.push(act);
      activitiesByTurn.set(act.turn_id, list);
    }

    console.log('[ChatPanel] buildTimeline — messages:', messages.length, 'activities:', activities.length, 'turns with acts:', Array.from(activitiesByTurn.keys()));

    // Group messages by turn_id
    const messagesByTurn = new Map<string, any[]>();
    const orphanMessages: any[] = [];
    for (const msg of messages) {
      if (msg.turn_id) {
        const list = messagesByTurn.get(msg.turn_id) || [];
        list.push(msg);
        messagesByTurn.set(msg.turn_id, list);
      } else {
        orphanMessages.push(msg);
      }
    }

    // Render turns in order of appearance
    const seenTurns = new Set<string>();
    for (const msg of messages) {
      if (msg.turn_id && !seenTurns.has(msg.turn_id)) {
        seenTurns.add(msg.turn_id);
        const turnMessages = messagesByTurn.get(msg.turn_id) || [];
        const userMsg = turnMessages.find((m: any) => m.role === 'user');
        const assistantMsg = turnMessages.find((m: any) => m.role === 'assistant');
        const turnActivities = activitiesByTurn.get(msg.turn_id) || [];

        if (userMsg) {
          result.push({ type: 'user', message: userMsg, turnId: msg.turn_id });
        }
        if (turnActivities.length > 0) {
          result.push({ type: 'worklog', activities: turnActivities, turnId: msg.turn_id });
        }
        if (assistantMsg) {
          const isEmpty = !assistantMsg.content?.trim() && turnActivities.length > 0;
          const fileWriteActivities = turnActivities.filter((a) => a.kind === 'fileWrite');
          result.push({ type: 'assistant', message: assistantMsg, turnId: msg.turn_id, isEmptyResponse: isEmpty, fileWriteActivities });
        }
      }
    }

    // Orphan messages (no turn_id — legacy or streaming)
    for (const msg of orphanMessages) {
      result.push({ type: msg.role === 'user' ? 'user' : 'assistant', message: msg });
    }

    return result;
  }, [messages, activities]);

  const ActiveIcon = PROVIDER_ICONS[activeProvider];

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
        {timeline.map((item, i) => {
          if (item.type === 'user' || item.type === 'assistant') {
            const msg = item.message;
            const time = msg.created_at
              ? parseDbDate(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '';
            return (
              <div key={`msg-${msg.id ?? i}`} className={`message message-${msg.role}`}>
                <div className="message-content">
                  {item.isEmptyResponse ? (
                    <p className="empty-response">Agent completed tasks without a text response.</p>
                  ) : (
                    <ChatMarkdown content={msg.content || ''} />
                  )}
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
                  {item.fileWriteActivities && item.fileWriteActivities.length > 0 && (
                    <ChangedFilesBadge
                      fileWriteActivities={item.fileWriteActivities}
                      onClick={() => {
                        const files = item.fileWriteActivities!.map((a) => {
                          const match = a.label.match(/Edit\s+(.+)$/);
                          return match ? match[1] : a.label;
                        }).filter((v, i, a) => a.indexOf(v) === i);
                        setDiffPanelFiles(files);
                        setDiffPanelOpen(true);
                      }}
                    />
                  )}
                  {msg.role === 'assistant' && msg.metadata && (
                    <AgentMessageMeta
                      metadata={msg.metadata}
                      content={msg.content}
                    />
                  )}
                </div>
              </div>
            );
          }
          if (item.type === 'worklog') {
            const hasRunning = item.activities!.some((a) => a.status === 'running');
            return (
              <WorkLog
                key={`wl-${item.turnId ?? i}`}
                activities={item.activities!}
                isRunning={hasRunning}
              />
            );
          }
          return null;
        })}
        {isGenerating && !streamingContent && (
          <div className="thinking-indicator">
            <span className="thinking-dots">
              <span className="dot">.</span>
              <span className="dot">.</span>
              <span className="dot">.</span>
            </span>
            <span className="thinking-text">Working</span>
            {elapsedTime && <span className="thinking-timer">({elapsedTime})</span>}
          </div>
        )}
        {isGenerating && streamingContent && (
          <div className="message message-assistant">
            <div className="message-content">
              <ChatMarkdown content={streamingContent} />
            </div>
          </div>
        )}
      </div>

      {diffPanelOpen && activeProject && (
        <DiffPanel
          projectPath={activeProject.path}
          files={diffPanelFiles}
          onClose={() => setDiffPanelOpen(false)}
        />
      )}

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
                  <ActiveIcon size={14} />
                  <span>{PROVIDER_LABELS[activeProvider]} · {activeModel}</span>
                </button>

                {openDropdown === 'model' && (
                  <div className="toolbar-dropdown model-dropdown">
                    {/* Provider header with arrows */}
                    <div className="model-dropdown-header-nav">
                      <button
                        className="model-nav-arrow"
                        onClick={() => {
                          const idx = enabledProvidersList.indexOf(dropdownProvider);
                          const prev = enabledProvidersList[idx - 1];
                          if (prev) { setDropdownProvider(prev); setHighlightedIndex(0); }
                        }}
                        disabled={enabledProvidersList.indexOf(dropdownProvider) <= 0}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="model-dropdown-header-title">
                        <span className="provider-icon-small">
                          {(() => {
                            const Icon = PROVIDER_ICONS[dropdownProvider];
                            return <Icon size={16} />;
                          })()}
                        </span>
                        <span>{PROVIDER_LABELS[dropdownProvider]}</span>
                      </div>
                      <button
                        className="model-nav-arrow"
                        onClick={() => {
                          const idx = enabledProvidersList.indexOf(dropdownProvider);
                          const next = enabledProvidersList[idx + 1];
                          if (next) { setDropdownProvider(next); setHighlightedIndex(0); }
                        }}
                        disabled={enabledProvidersList.indexOf(dropdownProvider) >= enabledProvidersList.length - 1}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Search */}
                    <div className="toolbar-dropdown-search">
                      <Search size={14} />
                      <input
                        ref={searchInputRef}
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => { setModelSearch(e.target.value); setHighlightedIndex(0); }}
                      />
                    </div>

                    {/* Models list */}
                    <div className="model-dropdown-models">
                      {currentModels.map((m, idx) => {
                        const meta = modelMeta[`${dropdownProvider}:${m}`] ?? {};
                        const isFav = meta.favorite ?? false;
                        const isActive = activeProvider === dropdownProvider && activeModel === m;
                        const isHighlighted = idx === highlightedIndex;
                        const shortcutLabel = idx < 9 ? `Ctrl+${idx + 1}` : '';
                        return (
                          <button
                            key={m}
                            className={`toolbar-dropdown-item model-item ${isActive ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                            onClick={() => {
                              setActiveProvider(dropdownProvider);
                              setActiveModel(m);
                              setOpenDropdown(null);
                              setModelSearch('');
                            }}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                          >
                            <span
                              className="model-star-btn"
                              onClick={(e) => toggleFavorite(e, dropdownProvider, m)}
                              title={isFav ? 'Unfavorite' : 'Favorite'}
                            >
                              <Star size={13} className={isFav ? 'star-filled' : 'star-empty'} />
                            </span>
                            <span className="model-item-name">{m}</span>
                            {isActive && <Check size={14} />}
                            {shortcutLabel && (
                              <span className="model-shortcut">{shortcutLabel}</span>
                            )}
                          </button>
                        );
                      })}
                      {currentModels.length === 0 && (
                        <div className="toolbar-dropdown-item" style={{ color: 'var(--text-muted)' }}>
                          <span>No models found.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <span className="toolbar-sep">|</span>

              {/* Model options + Agent selector */}
              <div className="toolbar-item-wrapper">
                <button
                  className="toolbar-btn"
                  onClick={() => setOpenDropdown(openDropdown === 'variant' ? null : 'variant')}
                >
                  <ModelOptionsLabel
                    provider={activeProvider}
                    modelOptions={activeModelOptions}
                    agent={selectedAgent}
                  />
                </button>

                {openDropdown === 'variant' && (
                  <div className="toolbar-dropdown variant-dropdown">
                    {activeProvider === 'codex' && (
                      <CodexOptions
                        options={(activeModelOptions as ProviderDraft['modelOptions']) ?? {}}
                        onChange={(opts) => setModelOptions('codex', opts)}
                      />
                    )}
                    {activeProvider === 'claudeCode' && (
                      <ClaudeOptions
                        options={(activeModelOptions as ProviderDraft['modelOptions']) ?? {}}
                        onChange={(opts) => setModelOptions('claudeCode', opts)}
                      />
                    )}
                    {activeProvider === 'opencode' && (
                      <OpenCodeVariantOptions
                        modelId={activeModel}
                        selectedVariant={(activeModelOptions as Record<string, unknown>)?.variant as string | undefined}
                        onChange={(variant) => setModelOptions('opencode', { ...activeModelOptions, variant })}
                      />
                    )}
                    {activeProvider !== 'codex' && activeProvider !== 'claudeCode' && activeProvider !== 'opencode' && (
                      <div className="dropdown-section">
                        <div className="dropdown-section-label">Reasoning</div>
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
                    )}
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
