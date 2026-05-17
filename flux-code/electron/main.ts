import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, globalShortcut, shell } from 'electron';
import * as path from 'path';
import { DatabaseManager } from './db';
import { initChat, cleanupChat } from './chat';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const dbManager = new DatabaseManager();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  const iconPath = path.join(__dirname, '../assets/app-icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    backgroundColor: '#0d1117',
    icon: nativeImage.createFromPath(iconPath),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  const loadApp = async () => {
    if (isDev) {
      try {
        await mainWindow!.loadURL('http://localhost:5173');
        console.log('[Electron] Loaded from Vite dev server');
      } catch (err) {
        console.error('[Electron] Vite dev server not found. Run: npm run dev');
        mainWindow!.loadURL(`data:text/html,<html><body style="background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:40px;text-align:center;"><h1>Flux Code</h1><p style="color:#f85149;">Vite dev server not found at http://localhost:5173</p><p>Run <code style="background:#21262d;padding:4px 8px;border-radius:4px;">npm run dev</code> first.</p></body></html>`);
      }
    } else {
      mainWindow!.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  };

  loadApp();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      mainWindow = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let trayIcon: Electron.NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (process.platform !== 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
      trayIcon = trayIcon.resize({ width: 18, height: 18 });
    }
  } catch (e) {
    console.error('[Tray] Failed to load tray icon:', e);
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Flux Code');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Settings', click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate-to', '/settings'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.fluxcode.app');
  console.log('[Electron] App ready. isDev =', isDev);
  dbManager.init();
  initChat(dbManager);
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
    } else {
      createWindow();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cleanupChat();
  dbManager.close();
});

app.on('before-quit', () => {
  if (mainWindow) mainWindow.removeAllListeners('close');
});

// IPC handlers
ipcMain.handle('db:getProjects', () => dbManager.getProjects());
ipcMain.handle('db:addProject', (_, name: string, projectPath: string) => dbManager.addProject(name, projectPath));
ipcMain.handle('db:removeProject', (_, id: number) => dbManager.removeProject(id));
ipcMain.handle('db:getThreads', (_, projectId: number) => dbManager.getThreads(projectId));
ipcMain.handle('db:addThread', (_, projectId: number, title: string, mode: string) => dbManager.addThread(projectId, title, mode));
ipcMain.handle('db:getSettings', () => dbManager.getSettings());
ipcMain.handle('db:setSetting', (_, key: string, value: string) => dbManager.setSetting(key, value));
ipcMain.handle('db:renameThread', (_, id: number, title: string) => dbManager.renameThread(id, title));
ipcMain.handle('db:archiveThread', (_, id: number) => dbManager.archiveThread(id));
ipcMain.handle('db:unarchiveThread', (_, id: number) => dbManager.unarchiveThread(id));
ipcMain.handle('db:deleteThread', (_, id: number) => dbManager.deleteThread(id));
ipcMain.handle('db:getArchivedThreads', () => dbManager.getArchivedThreads());
ipcMain.handle('db:markThreadRead', (_, id: number) => dbManager.markThreadRead(id));
ipcMain.handle('db:markThreadUnread', (_, id: number) => dbManager.markThreadUnread(id));
ipcMain.handle('db:renameProject', (_, id: number, name: string) => dbManager.renameProject(id, name));
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url));

// Window controls IPC
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
