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
        const handler = (_, path) => callback(path);
        ipcRenderer.on('navigate-to', handler);
        return () => {
            ipcRenderer.removeListener('navigate-to', handler);
        };
    },
};
contextBridge.exposeInMainWorld('electronAPI', api);
