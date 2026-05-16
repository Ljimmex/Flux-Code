import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  db: {
    getProjects: () => Promise<any[]>;
    addProject: (name: string, path: string) => Promise<any>;
    removeProject: (id: number) => Promise<void>;
    getThreads: (projectId: number) => Promise<any[]>;
    addThread: (projectId: number, title: string, mode: string) => Promise<any>;
    renameThread: (id: number, title: string) => Promise<void>;
    archiveThread: (id: number) => Promise<void>;
    unarchiveThread: (id: number) => Promise<void>;
    deleteThread: (id: number) => Promise<void>;
    getArchivedThreads: () => Promise<any[]>;
    markThreadRead: (id: number) => Promise<void>;
    markThreadUnread: (id: number) => Promise<void>;
    renameProject: (id: number, name: string) => Promise<void>;
    getSettings: () => Promise<Record<string, string>>;
    setSetting: (key: string, value: string) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  onNavigate: (callback: (path: string) => void) => () => void;
}

const api: ElectronAPI = {
  db: {
    getProjects: () => ipcRenderer.invoke('db:getProjects'),
    addProject: (name, path) => ipcRenderer.invoke('db:addProject', name, path),
    removeProject: (id) => ipcRenderer.invoke('db:removeProject', id),
    getThreads: (projectId) => ipcRenderer.invoke('db:getThreads', projectId),
    addThread: (projectId, title, mode) => ipcRenderer.invoke('db:addThread', projectId, title, mode),
    renameThread: (id, title) => ipcRenderer.invoke('db:renameThread', id, title),
    archiveThread: (id) => ipcRenderer.invoke('db:archiveThread', id),
    unarchiveThread: (id) => ipcRenderer.invoke('db:unarchiveThread', id),
    deleteThread: (id) => ipcRenderer.invoke('db:deleteThread', id),
    getArchivedThreads: () => ipcRenderer.invoke('db:getArchivedThreads'),
    markThreadRead: (id) => ipcRenderer.invoke('db:markThreadRead', id),
    markThreadUnread: (id) => ipcRenderer.invoke('db:markThreadUnread', id),
    renameProject: (id, name) => ipcRenderer.invoke('db:renameProject', id, name),
    getSettings: () => ipcRenderer.invoke('db:getSettings'),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  onNavigate: (callback) => {
    const handler = (_: any, path: string) => callback(path);
    ipcRenderer.on('navigate-to', handler);
    return () => {
      ipcRenderer.removeListener('navigate-to', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
