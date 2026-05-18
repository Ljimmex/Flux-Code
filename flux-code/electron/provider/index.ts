import { ipcMain, type BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import { ProviderAdapterRegistry } from './ProviderAdapterRegistry';
import { ProviderSessionDirectory } from './ProviderSessionDirectory';
import { HealthService } from './HealthService';
import { ProviderService } from './ProviderService';
import type { ProviderKind, ProviderRuntimeEvent, ProviderStatus } from './types';
import { checkProviderUpdates, PROVIDER_INSTALL_COMMANDS } from './updateChecker';
import type { DatabaseManager } from '../db';

import { CodexAdapter } from './adapters/CodexAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { OllamaAdapter } from './adapters/OllamaAdapter';
import { OpenCodeAdapter } from './adapters/OpenCodeAdapter';
import { KimiAdapter } from './adapters/KimiAdapter';
import { GeminiAdapter } from './adapters/GeminiAdapter';

let providerService: ProviderService;
let healthService: HealthService;
let registry: ProviderAdapterRegistry;
let directory: ProviderSessionDirectory;
let mainWindow: BrowserWindow | null = null;

function broadcast(event: ProviderRuntimeEvent) {
  console.log('[Provider] broadcast event:', event.kind, event.method, 'thread:', (event as any).threadId);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('provider:event', event);
  }
}

function broadcastStatus(kind: ProviderKind, status: ProviderStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('provider:status', { kind, status });
  }
}

function broadcastModels(kind: ProviderKind, models: string[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('provider:models', { kind, models });
  }
}

function broadcastUpdates(updates: Record<string, import('./updateChecker').ProviderUpdateInfo>) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('provider:updates', updates);
  }
}

const turnAccumulator = new Map<string, string>();
const turnStartTimes = new Map<string, number>();
const lastDelta = new Map<string, string>();

export async function initProviders(win: BrowserWindow, db?: DatabaseManager): Promise<void> {
  mainWindow = win;

  // 1. Create infrastructure layers (aligned with T3 Code)
  registry = new ProviderAdapterRegistry();
  directory = new ProviderSessionDirectory();
  providerService = new ProviderService(registry, directory);
  healthService = new HealthService(registry, broadcastStatus, broadcastModels);

  // 2. Register adapters (T3 style — explicit registration at startup)
  registry.register(new CodexAdapter());
  registry.register(new ClaudeAdapter());
  registry.register(new OllamaAdapter());
  registry.register(new OpenCodeAdapter());
  registry.register(new KimiAdapter());
  registry.register(new GeminiAdapter());

  // 3. Forward provider runtime events to renderer
  providerService.onEvent(broadcast);

  // 3b. Persist messages to DB (accumulate assistant text, save on turn/completed)
  if (db) {
    providerService.onEvent((event) => {
      if (event.kind === 'notification' && event.method === 'item/agentMessage/delta') {
        if (event.turnId && event.textDelta) {
          const key = `${event.threadId}:${event.turnId}`;
          // Deduplicate: skip if same delta was just added (protects against duplicate listeners)
          const prev = lastDelta.get(key);
          if (prev !== undefined && prev === event.textDelta) {
            return;
          }
          lastDelta.set(key, event.textDelta);
          turnAccumulator.set(key, (turnAccumulator.get(key) || '') + event.textDelta);
        }
        return;
      }
      if (event.kind === 'notification' && event.method === 'turn/started') {
        if (event.turnId) {
          const key = `${event.threadId}:${event.turnId}`;
          turnStartTimes.set(key, Date.now());
        }
        return;
      }
      if (event.kind === 'notification' && event.method === 'turn/completed') {
        if (event.turnId) {
          const key = `${event.threadId}:${event.turnId}`;
          const content = turnAccumulator.get(key) || '';
          const startTime = turnStartTimes.get(key);
          const durationMs = startTime ? Date.now() - startTime : 0;
          const endTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          console.log('[Provider] turn/completed, thread:', event.threadId, 'accumulated length:', content.length);
          if (content) {
            try {
              const metadata = JSON.stringify({ endTime, durationMs });
              db.addMessage(event.threadId, 'assistant', content, metadata);
              console.log('[Provider] Saved assistant message to DB, thread:', event.threadId);
            } catch (e: any) {
              console.error('[Provider] Failed to save assistant message:', e.message);
            }
          }
          turnAccumulator.delete(key);
          turnStartTimes.delete(key);
          lastDelta.delete(key);
        }
        return;
      }
    });
  }

  // 4. IPC handlers
  ipcMain.handle('provider:getStatuses', () => healthService.getAllStatuses());
  ipcMain.handle('provider:getModels', () => healthService.getAllModels());
  ipcMain.handle('provider:probe', async (_, kind: ProviderKind) => {
    await healthService.probeOne(kind);
  });

  ipcMain.handle('provider:setBinaryPath', async (_, kind: ProviderKind, binaryPath: string) => {
    registry.setBinaryPath(kind, binaryPath);
    await healthService.probeOne(kind);
  });

  ipcMain.handle('provider:startSession', async (_, params: {
    threadId: number;
    provider: ProviderKind;
    model: string;
    projectPath: string;
    systemPrompt?: string;
    runtimeMode?: import('./types').RuntimeMode;
    resumeCursor?: unknown;
    serverUrl?: string;
    serverPassword?: string;
    env?: Record<string, string>;
    modelOptions?: Record<string, unknown>;
    interactionMode?: 'default' | 'plan';
  }) => {
    const adapter = registry.get(params.provider);
    const session = await providerService.startSession({
      threadId: params.threadId,
      provider: params.provider,
      model: params.model,
      cwd: params.projectPath,
      systemPrompt: params.systemPrompt,
      runtimeMode: params.runtimeMode ?? 'approval-required',
      resumeCursor: params.resumeCursor,
      interactionMode: params.interactionMode,
      providerOptions: {
        [params.provider]: {
          binaryPath: adapter.binaryPath,
          serverUrl: params.serverUrl,
          serverPassword: params.serverPassword,
          env: params.env,
          ...params.modelOptions,
        },
      },
    });
    return session;
  });

  ipcMain.handle('provider:sendTurn', async (_, threadId: number, turnId: string, prompt: string, contextFiles?: string[]) => {
    if (db) {
      try { db.addMessage(threadId, 'user', prompt); } catch {}
    }
    await providerService.sendTurn({
      threadId,
      input: prompt,
      attachments: contextFiles?.map((path) => ({ path })),
    });
    // Return turnId so renderer can correlate
    return { turnId };
  });

  ipcMain.handle('provider:interruptTurn', async (_, threadId: number) => {
    await providerService.interruptTurn({ threadId });
  });

  ipcMain.handle('provider:respondToApproval', async (_, threadId: number, requestId: string, approved: boolean) => {
    await providerService.respondToRequest({
      threadId,
      requestId,
      decision: approved ? 'allow' : 'deny',
    });
  });

  ipcMain.handle('provider:respondToUserInput', async (_, threadId: number, requestId: string, answers: Record<string, string>) => {
    await providerService.respondToUserInput({
      threadId,
      requestId,
      answers,
    });
  });

  ipcMain.handle('provider:stopSession', async (_, threadId: number) => {
    await providerService.stopSession({ threadId });
  });

  ipcMain.handle('provider:listSessions', () => {
    return providerService.listSessions();
  });

  ipcMain.handle('provider:getCapabilities', async (_, kind: ProviderKind) => {
    return providerService.getCapabilities(kind);
  });

  ipcMain.handle('provider:rollbackConversation', async (_, threadId: number, numTurns: number) => {
    await providerService.rollbackConversation({ threadId, numTurns });
  });

  ipcMain.handle('provider:getOpenCodeModels', async () => {
    const adapter = registry.get('opencode') as any;
    if (adapter && typeof adapter.getCachedModels === 'function') {
      return adapter.getCachedModels() as import('../model').OpenCodeModel[];
    }
    return [];
  });

  ipcMain.handle('provider:checkUpdates', async () => {
    const statuses = healthService.getAllStatuses();
    const updates = await checkProviderUpdates(statuses);
    broadcastUpdates(updates);
    return updates;
  });

  ipcMain.handle('provider:updateCli', async (_, kind: ProviderKind) => {
    const cmd = PROVIDER_INSTALL_COMMANDS[kind];
    if (!cmd) return { success: false, error: 'No install command for this provider.' };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const args = cmd.split(' ').filter(Boolean);
      const cmdName = args.shift()!;
      const proc = spawn(cmdName, args, {
        shell: process.platform === 'win32',
        timeout: 120_000,
      });

      let stderr = '';
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Exited with code ${code}` });
        }
      });
    });
  });

  // 5. Start health probes
  await healthService.start();

  // 6. Check for CLI updates after a short delay so statuses are populated
  setTimeout(async () => {
    try {
      const statuses = healthService.getAllStatuses();
      const updates = await checkProviderUpdates(statuses);
      const hasAny = Object.values(updates).some((u) => u.hasUpdate);
      if (hasAny) {
        broadcastUpdates(updates);
      }
    } catch {
      // ignore
    }
  }, 5_000);
}

export async function cleanupProviders(): Promise<void> {
  healthService?.stop();
  await providerService?.stopAllSessions();
}
