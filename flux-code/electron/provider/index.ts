import { ipcMain, type BrowserWindow } from 'electron';
import { ProviderAdapterRegistry } from './ProviderAdapterRegistry';
import { ProviderSessionDirectory } from './ProviderSessionDirectory';
import { HealthService } from './HealthService';
import { ProviderService } from './ProviderService';
import type { ProviderKind, ProviderRuntimeEvent, ProviderStatus } from './types';

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

export async function initProviders(win: BrowserWindow): Promise<void> {
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

  // 5. Start health probes
  await healthService.start();
}

export async function cleanupProviders(): Promise<void> {
  healthService?.stop();
  await providerService?.stopAllSessions();
}
