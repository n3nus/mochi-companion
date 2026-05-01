import { contextBridge, ipcRenderer } from 'electron';

const api = {
  state: {
    load: () => ipcRenderer.invoke('state:load'),
    save: (value: unknown) => ipcRenderer.invoke('state:save', value)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (value: unknown) => ipcRenderer.invoke('settings:set', value)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  overlay: {
    show: () => ipcRenderer.invoke('overlay:show'),
    move: (x: number, y: number) => ipcRenderer.invoke('overlay:move', x, y),
    hide: () => ipcRenderer.invoke('overlay:hide')
  }
};

contextBridge.exposeInMainWorld('mochi', api);

export type MochiApi = typeof api;
