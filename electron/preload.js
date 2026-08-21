const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getLocale: () => ipcRenderer.invoke('desktop:locale'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  getStatus: () => ipcRenderer.invoke('stack:status'),
  start: () => ipcRenderer.invoke('stack:start'),
  testModel: (payload) => ipcRenderer.invoke('model:test', payload),
  connect: (payload) => ipcRenderer.invoke('model:connect', payload),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('stack:progress', listener);
    return () => ipcRenderer.removeListener('stack:progress', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target),
});
