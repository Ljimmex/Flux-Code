import { type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { spawnCli, probeBinary } from './spawnCli';
import { getCliVersion } from '../../model';
import type { ProviderAdapterShape } from '../ProviderAdapter';
import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderStatus,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSendTurnInput,
  ProviderTurnStartResult,
  ProviderThreadSnapshot,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from '../types';
import { generateEventId, generateTurnId } from '../types';

interface KimiSession {
  process?: ChildProcess;
  turnId: string | null;
  sessionId: string | null;
  model: string;
  cwd: string;
  interactionMode: 'default' | 'plan';
  toolNames: Map<string, string>;
}

/**
 * Kimi (Moonshot AI) adapter.
 * Uses `kimi --print --output-format stream-json` for non-interactive mode.
 */
export class KimiAdapter implements ProviderAdapterShape {
  readonly provider: ProviderKind = 'kimi';
  readonly capabilities = { sessionModelSwitch: 'in-session' as const };
  binaryPath = 'kimi';

  private sessions = new Map<number, KimiSession>();
  private eventHandlers = new Set<(event: ProviderRuntimeEvent) => void>();

  setBinaryPath(path: string) {
    this.binaryPath = path || 'kimi';
  }

  async probe(): Promise<ProviderStatus> {
    const resolvedPath = probeBinary(this.binaryPath);
    const version = getCliVersion(this.binaryPath);
    if (!resolvedPath) {
      return { kind: 'not-installed', models: this.getFallbackModels(), version };
    }

    const apiKey = this.readApiKey();
    const config = this.readKimiConfig();
    const models = config.models.length > 0 ? config.models : this.getFallbackModels();

    if (!apiKey) {
      return { kind: 'not-authenticated', installCmd: 'kimi login', models, version };
    }
    return { kind: 'ready', models, version };
  }

  private getFallbackModels(): string[] {
    return ['kimi-code/kimi-for-coding'];
  }

  async startSession(input: ProviderSessionStartInput): Promise<ProviderSession> {
    const now = new Date().toISOString();

    // Note: session/connecting and session/ready are emitted by ProviderService
    const config = this.readKimiConfig();
    const model = input.model ?? config.models[0] ?? 'kimi-code/kimi-for-coding';

    this.sessions.set(input.threadId, {
      turnId: null,
      sessionId: null,
      model,
      cwd: input.cwd ?? process.cwd(),
      interactionMode: input.interactionMode ?? 'default',
      toolNames: new Map(),
    });

    return {
      provider: 'kimi',
      status: 'ready',
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model,
      cwd: input.cwd,
      resumeCursor: input.resumeCursor,
      createdAt: now,
      updatedAt: now,
    };
  }

  async stopSession(threadId: number): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session?.process) {
      session.process.kill('SIGTERM');
    }
    this.sessions.delete(threadId);
  }

  async stopAll(): Promise<void> {
    for (const threadId of Array.from(this.sessions.keys())) {
      await this.stopSession(threadId);
    }
  }

  async sendTurn(input: ProviderSendTurnInput): Promise<ProviderTurnStartResult> {
    const session = this.sessions.get(input.threadId);
    if (!session) throw new Error(`Session for thread ${input.threadId} not found`);

    const turnId = input.turnId || generateTurnId();
    session.turnId = turnId;

    this.emit({
      id: generateEventId(),
      kind: 'notification',
      provider: 'kimi',
      threadId: input.threadId,
      createdAt: new Date().toISOString(),
      method: 'turn/started',
      turnId,
    });

    const args: string[] = ['--print', '--output-format', 'stream-json', '--yolo'];

    if (session.sessionId) {
      args.push('-r', session.sessionId);
    }

    if (session.model) {
      args.push('--model', session.model);
    }

    const mode = input.interactionMode ?? session.interactionMode ?? 'default';
    if (mode === 'plan') {
      args.push('--plan');
    }

    const prompt = input.input ?? '';
    // --prompt must be a single argument — do NOT use shell: true
    args.push('--prompt', prompt);

    const cwd = session.cwd;

    console.log('[KimiAdapter] Spawning:', this.binaryPath, JSON.stringify(args), 'cwd:', cwd);

    const proc = spawnCli(this.binaryPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });

    session.process = proc;

    let stdoutAccum = '';
    let sessionId: string | null = null;
    const openToolIds = new Set<string>();

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (rawLine) => {
      stdoutAccum += rawLine + '\n';
      if (!rawLine.trim()) return;

      // Parse "To resume this session: kimi -r <id>"
      const resumeMatch = rawLine.match(/To resume this session: kimi -r ([a-f0-9-]+)/);
      if (resumeMatch) {
        sessionId = resumeMatch[1];
        return;
      }

      // Parse JSON lines
      let msg: any;
      try {
        msg = JSON.parse(rawLine);
      } catch {
        return;
      }

      if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'think' && part.think) {
              this.emit({
                id: generateEventId(),
                kind: 'notification',
                provider: 'kimi',
                threadId: input.threadId,
                createdAt: new Date().toISOString(),
                method: 'item/thinking/delta',
                turnId,
                textDelta: part.think,
              });
            }
            if (part.type === 'text' && part.text) {
              this.emit({
                id: generateEventId(),
                kind: 'notification',
                provider: 'kimi',
                threadId: input.threadId,
                createdAt: new Date().toISOString(),
                method: 'item/agentMessage/delta',
                turnId,
                textDelta: part.text,
              });
            }
          }
        }

        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            const toolId = tc.id || `tool-${Date.now()}`;
            const toolName = tc.function?.name || 'tool';
            const toolArgs = tc.function?.arguments || '{}';
            openToolIds.add(toolId);
            session.toolNames.set(toolId, toolName.toLowerCase().replace(/_/g, '-'));
            this.emit({
              id: generateEventId(),
              kind: 'notification',
              provider: 'kimi',
              threadId: input.threadId,
              createdAt: new Date().toISOString(),
              method: 'item/tool/started',
              turnId,
              itemId: toolId,
              toolName: toolName.toLowerCase().replace(/_/g, '-'),
              payload: { arguments: toolArgs, name: toolName },
            });
          }
        }
      }

      if (msg.role === 'tool') {
        const toolCallId = msg.tool_call_id || '';
        const result = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || '').join('')
          : String(msg.content || '');
        if (toolCallId) {
          const toolName = session.toolNames.get(toolCallId);
          this.emit({
            id: generateEventId(),
            kind: 'notification',
            provider: 'kimi',
            threadId: input.threadId,
            createdAt: new Date().toISOString(),
            method: 'item/tool/completed',
            turnId,
            itemId: toolCallId,
            toolName,
            payload: { result },
          });
          openToolIds.delete(toolCallId);
          session.toolNames.delete(toolCallId);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      console.log('[KimiAdapter] stderr:', text.trim());
    });

    proc.on('error', (err) => {
      console.error('[KimiAdapter] proc error:', err.message);
      this.emit({
        id: generateEventId(),
        kind: 'error',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'error/turn',
        turnId,
        message: err.message,
      });
    });

    proc.on('exit', (code, signal) => {
      console.log('[KimiAdapter] proc exit code:', code, 'signal:', signal, 'sessionId:', sessionId);
      if (sessionId) {
        session.sessionId = sessionId;
      }

      // Close any remaining open tool events
      for (const itemId of openToolIds) {
        this.emit({
          id: generateEventId(),
          kind: 'notification',
          provider: 'kimi',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'item/tool/completed',
          turnId,
          itemId,
        });
      }
      openToolIds.clear();

      if (code !== 0 && code !== null) {
        const stderr = proc.stderr ? '[stderr available]' : '[no stderr]';
        this.emit({
          id: generateEventId(),
          kind: 'error',
          provider: 'kimi',
          threadId: input.threadId,
          createdAt: new Date().toISOString(),
          method: 'error/turn',
          turnId,
          message: `Kimi exited with code ${code}. ${stderr}`,
        });
      }

      this.emit({
        id: generateEventId(),
        kind: 'notification',
        provider: 'kimi',
        threadId: input.threadId,
        createdAt: new Date().toISOString(),
        method: 'turn/completed',
        turnId,
      });
      session.turnId = null;
      session.process = undefined;
    });

    return { turnId };
  }

  async interruptTurn(threadId: number, _turnId?: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (session?.process) {
      session.process.kill('SIGTERM');
    }
  }

  async respondToRequest(_threadId: number, _requestId: string, _decision: ProviderApprovalDecision): Promise<void> {
    // Print mode auto-approves all actions
  }

  async respondToUserInput(_threadId: number, _requestId: string, _answers: ProviderUserInputAnswers): Promise<void> {
    // Not supported in print mode
  }

  async readThread(_threadId: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async rollbackThread(_threadId: number, _numTurns: number): Promise<ProviderThreadSnapshot> {
    return { turns: [] };
  }

  async listSessions(): Promise<readonly ProviderSession[]> {
    const now = new Date().toISOString();
    return Array.from(this.sessions.entries()).map(([threadId, s]) => ({
      provider: 'kimi' as const,
      status: 'ready' as const,
      runtimeMode: 'full-access' as const,
      threadId,
      model: s.model,
      activeTurnId: s.turnId ?? undefined,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async hasSession(threadId: number): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  onEvent(handler: (event: ProviderRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ProviderRuntimeEvent) {
    for (const h of this.eventHandlers) {
      try {
        h(event);
      } catch {
        // ignore
      }
    }
  }

  /** Return cached model metadata including variants from config.toml. */
  getCachedModels(): Array<{ id: string; name: string; providerID: string; variants?: Record<string, Record<string, unknown>> }> {
    const config = this.readKimiConfig();
    return config.models.map((id) => ({
      id,
      name: config.displayNames[id] || id,
      providerID: 'kimi',
      variants: config.variants[id]?.length
        ? Object.fromEntries(config.variants[id].map((v) => [v, {}]))
        : undefined,
    }));
  }

  private readApiKey(): string | null {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    // New kimi CLI uses OAuth tokens in ~/.kimi/credentials/kimi-code.json
    const oauthFile = path.join(os.homedir(), '.kimi', 'credentials', 'kimi-code.json');
    try {
      if (fs.existsSync(oauthFile)) {
        const data = JSON.parse(fs.readFileSync(oauthFile, 'utf8'));
        if (data.access_token) return data.access_token;
      }
    } catch { /* ignore */ }

    // Fallback: old auth.json locations
    const candidates = [
      path.join(os.homedir(), '.config', 'kimi', 'auth.json'),
      path.join(os.homedir(), '.kimi', 'auth.json'),
      process.env.APPDATA ? path.join(process.env.APPDATA, 'kimi', 'auth.json') : '',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'kimi', 'auth.json') : '',
    ];

    for (const authFile of candidates) {
      if (!authFile) continue;
      try {
        if (fs.existsSync(authFile)) {
          const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
          if (data.apiKey) return data.apiKey;
        }
      } catch { /* ignore */ }
    }

    return process.env.MOONSHOT_API_KEY ?? null;
  }

  /** Read kimi CLI config.toml to extract models and variants. */
  private readKimiConfig(): { models: string[]; variants: Record<string, string[]>; displayNames: Record<string, string> } {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const configPath = path.join(os.homedir(), '.kimi', 'config.toml');

    const models: string[] = [];
    const variants: Record<string, string[]> = {};
    const displayNames: Record<string, string> = {};

    try {
      if (!fs.existsSync(configPath)) return { models, variants, displayNames };
      const content = fs.readFileSync(configPath, 'utf8');

      // Extract default_model
      const defaultMatch = content.match(/^default_model\s*=\s*"([^"]+)"/m);
      if (defaultMatch && !models.includes(defaultMatch[1])) {
        models.push(defaultMatch[1]);
      }

      // Extract [models."..."] sections
      const modelSectionRegex = /\[models\."([^"]+)"\]/g;
      let match;
      while ((match = modelSectionRegex.exec(content)) !== null) {
        const modelId = match[1];
        if (!models.includes(modelId)) {
          models.push(modelId);
        }

        // Extract capabilities as variants
        const sectionStart = match.index;
        const nextSection = content.indexOf('[', sectionStart + 1);
        const sectionEnd = nextSection === -1 ? content.length : nextSection;
        const section = content.slice(sectionStart, sectionEnd);

        const capsMatch = section.match(/capabilities\s*=\s*\[([^\]]+)\]/);
        if (capsMatch) {
          const caps = capsMatch[1]
            .split(',')
            .map((s: string) => s.trim().replace(/^"/, '').replace(/"$/, ''))
            .filter((s: string) => s);
          variants[modelId] = caps;
        }

        const nameMatch = section.match(/display_name\s*=\s*"([^"]+)"/);
        if (nameMatch) {
          displayNames[modelId] = nameMatch[1];
        }
      }
    } catch { /* ignore */ }

    return { models, variants, displayNames };
  }
}
