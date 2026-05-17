import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { BrowserWindow } from 'electron';
import { ProviderAdapterRegistry } from './ProviderAdapterRegistry';
import { HealthService } from './HealthService';
import { ProviderService } from './ProviderService';
import type { ProviderKind, ProviderRuntimeEvent, ProviderStatus } from './types';

let providerService: ProviderService;
let healthService: HealthService;
let registry: ProviderAdapterRegistry;
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
  registry = new ProviderAdapterRegistry();
  healthService = new HealthService(registry, broadcastStatus, broadcastModels);
  providerService = new ProviderService(registry);

  // Forward provider runtime events to renderer
  providerService.onEvent(broadcast);

  // Start health probes
  await healthService.start();

  // ─── IPC handlers ────────────────────────────────────────────────────────

  ipcMain.handle('provider:getStatuses', () => healthService.getAllStatuses());
  ipcMain.handle('provider:getModels', () => healthService.getAllModels());
  ipcMain.handle('provider:probe', async (_, kind: ProviderKind) => {
    await healthService.probeOne(kind);
  });

  ipcMain.handle('provider:startSession', async (_, params: {
    threadId: number;
    provider: ProviderKind;
    model: string;
    projectPath: string;
    systemPrompt?: string;
  }) => {
    return providerService.startSession(params);
  });

  ipcMain.handle('provider:sendTurn', async (_, threadId: number, turnId: string, prompt: string, contextFiles?: string[]) => {
    await providerService.sendTurn(threadId, turnId, prompt, contextFiles);
  });

  ipcMain.handle('provider:interruptTurn', async (_, threadId: number) => {
    await providerService.interruptTurn(threadId);
  });

  ipcMain.handle('provider:respondToApproval', async (_, threadId: number, requestId: string, approved: boolean) => {
    await providerService.respondToApproval(threadId, requestId, approved);
  });

  ipcMain.handle('provider:stopSession', async (_, threadId: number) => {
    await providerService.stopSession(threadId);
  });
}

export async function cleanupProviders(): Promise<void> {
  healthService?.stop();
  await providerService?.stopAllSessions();
}
