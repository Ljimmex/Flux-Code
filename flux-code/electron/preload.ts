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
  chat: {
    getMessages: (threadId: number) => Promise<any[]>;
    sendMessage: (threadId: number, message: string, model: string) => Promise<void>;
    cancel: (threadId: number) => Promise<void>;
  };
  provider: {
    getStatuses: () => Promise<Record<string, any>>;
    getModels: () => Promise<Record<string, string[]>>;
    probe: (kind: string) => Promise<void>;
    startSession: (params: any) => Promise<any>;
    sendTurn: (threadId: number, turnId: string, prompt: string, contextFiles?: string[]) => Promise<any>;
    interruptTurn: (threadId: number) => Promise<void>;
    respondToApproval: (threadId: number, requestId: string, approved: boolean) => Promise<void>;
    respondToUserInput: (threadId: number, requestId: string, answers: Record<string, string>) => Promise<void>;
    setBinaryPath: (kind: string, binaryPath: string) => Promise<void>;
    stopSession: (threadId: number) => Promise<void>;
    listSessions: () => Promise<any[]>;
    getCapabilities: (kind: string) => Promise<any>;
    rollbackConversation: (threadId: number, numTurns: number) => Promise<void>;
  };
  onChatToken: (callback: (data: { threadId: number; token: string }) => void) => () => void;
  onChatDone: (callback: (data: { threadId: number }) => void) => () => void;
  onChatError: (callback: (data: { threadId: number; error: string }) => void) => () => void;
  onProviderEvent: (callback: (event: any) => void) => () => void;
  onProviderStatus: (callback: (data: { kind: string; status: any }) => void) => () => void;
  onProviderModels: (callback: (data: { kind: string; models: string[] }) => void) => () => void;
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
  chat: {
    getMessages: (threadId) => ipcRenderer.invoke('chat:getMessages', threadId),
    sendMessage: (threadId, message, model) => ipcRenderer.invoke('chat:sendMessage', threadId, message, model),
    cancel: (threadId) => ipcRenderer.invoke('chat:cancel', threadId),
  },
  provider: {
    getStatuses: () => ipcRenderer.invoke('provider:getStatuses'),
    getModels: () => ipcRenderer.invoke('provider:getModels'),
    probe: (kind) => ipcRenderer.invoke('provider:probe', kind),
    startSession: (params) => ipcRenderer.invoke('provider:startSession', params),
    sendTurn: (threadId, turnId, prompt, contextFiles) => ipcRenderer.invoke('provider:sendTurn', threadId, turnId, prompt, contextFiles),
    interruptTurn: (threadId) => ipcRenderer.invoke('provider:interruptTurn', threadId),
    respondToApproval: (threadId, requestId, approved) => ipcRenderer.invoke('provider:respondToApproval', threadId, requestId, approved),
    respondToUserInput: (threadId, requestId, answers) => ipcRenderer.invoke('provider:respondToUserInput', threadId, requestId, answers),
    setBinaryPath: (kind, binaryPath) => ipcRenderer.invoke('provider:setBinaryPath', kind, binaryPath),
    stopSession: (threadId) => ipcRenderer.invoke('provider:stopSession', threadId),
    listSessions: () => ipcRenderer.invoke('provider:listSessions'),
    getCapabilities: (kind) => ipcRenderer.invoke('provider:getCapabilities', kind),
    rollbackConversation: (threadId, numTurns) => ipcRenderer.invoke('provider:rollbackConversation', threadId, numTurns),
  },
  onChatToken: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('chat:token', handler);
    return () => ipcRenderer.removeListener('chat:token', handler);
  },
  onChatDone: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('chat:done', handler);
    return () => ipcRenderer.removeListener('chat:done', handler);
  },
  onChatError: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.removeListener('chat:error', handler);
  },
  onProviderEvent: (callback) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on('provider:event', handler);
    return () => ipcRenderer.removeListener('provider:event', handler);
  },
  onProviderStatus: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('provider:status', handler);
    return () => ipcRenderer.removeListener('provider:status', handler);
  },
  onProviderModels: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('provider:models', handler);
    return () => ipcRenderer.removeListener('provider:models', handler);
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
