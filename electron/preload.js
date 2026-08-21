const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getLocale: () => ipcRenderer.invoke('desktop:locale'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  getStatus: () => ipcRenderer.invoke('docker:status'),
  start: () => ipcRenderer.invoke('docker:start'),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('docker:progress', listener);
    return () => ipcRenderer.removeListener('docker:progress', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target),
});
