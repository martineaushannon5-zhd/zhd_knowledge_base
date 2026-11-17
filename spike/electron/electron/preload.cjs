'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Keep Node/Electron objects, IPC channel names and event objects private.
contextBridge.exposeInMainWorld('desktopNotes', Object.freeze({
  load: () => ipcRenderer.invoke('desktop-notes:load'),
  save: (notes) => ipcRenderer.invoke('desktop-notes:save', notes),
  info: () => ipcRenderer.invoke('desktop-notes:info'),
  export: (notes) => ipcRenderer.invoke('desktop-notes:export', notes),
}));
