'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Keep Node/Electron objects, IPC channel names and event objects private.
contextBridge.exposeInMainWorld('desktopNotes', Object.freeze({
  load: () => ipcRenderer.invoke('desktop-notes:load'),
  save: (notes) => ipcRenderer.invoke('desktop-notes:save', notes),
  info: () => ipcRenderer.invoke('desktop-notes:info'),
  export: (notes) => ipcRenderer.invoke('desktop-notes:export', notes),
}));

// Phase C: file-truth-source vault surface (Markdown + JSON + SQLite index).
contextBridge.exposeInMainWorld('kbStore', Object.freeze({
  list: () => ipcRenderer.invoke('kb:list'),
  save: (note, baseRevision) => ipcRenderer.invoke('kb:save', note, baseRevision),
  remove: (id, baseRevision) => ipcRenderer.invoke('kb:remove', id, baseRevision),
  restore: (id, baseRevision) => ipcRenderer.invoke('kb:restore', id, baseRevision),
  purge: (id) => ipcRenderer.invoke('kb:purge', id),
  search: (query, opts) => ipcRenderer.invoke('kb:search', query, opts),
  rebuild: () => ipcRenderer.invoke('kb:rebuild'),
  ask: (query) => ipcRenderer.invoke('kb:ask', query),
  info: () => ipcRenderer.invoke('kb:info'),
  export: (notes) => ipcRenderer.invoke('kb:export', notes),
}));
