import { contextBridge, ipcRenderer } from 'electron';
const api = {
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
        getActivitiesForThread: (threadId) => ipcRenderer.invoke('db:getActivitiesForThread', threadId),
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
        checkUpdates: () => ipcRenderer.invoke('provider:checkUpdates'),
        updateCli: (kind) => ipcRenderer.invoke('provider:updateCli', kind),
        getOpenCodeModels: () => ipcRenderer.invoke('provider:getOpenCodeModels'),
    },
    onChatToken: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('chat:token', handler);
        return () => ipcRenderer.removeListener('chat:token', handler);
    },
    onChatDone: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('chat:done', handler);
        return () => ipcRenderer.removeListener('chat:done', handler);
    },
    onChatError: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('chat:error', handler);
        return () => ipcRenderer.removeListener('chat:error', handler);
    },
    onProviderEvent: (callback) => {
        const handler = (_, event) => callback(event);
        ipcRenderer.on('provider:event', handler);
        return () => ipcRenderer.removeListener('provider:event', handler);
    },
    onProviderStatus: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('provider:status', handler);
        return () => ipcRenderer.removeListener('provider:status', handler);
    },
    onProviderModels: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('provider:models', handler);
        return () => ipcRenderer.removeListener('provider:models', handler);
    },
    onProviderUpdates: (callback) => {
        const handler = (_, updates) => callback(updates);
        ipcRenderer.on('provider:updates', handler);
        return () => ipcRenderer.removeListener('provider:updates', handler);
    },
    onNavigate: (callback) => {
        const handler = (_, path) => callback(path);
        ipcRenderer.on('navigate-to', handler);
        return () => {
            ipcRenderer.removeListener('navigate-to', handler);
        };
    },
};
contextBridge.exposeInMainWorld('electronAPI', api);
