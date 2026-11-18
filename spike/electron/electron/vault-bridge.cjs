'use strict';

const { ask } = require('./ai/qa.cjs');
const { OfflineExtractiveAdapter } = require('./ai/adapter.cjs');

// Registers the renderer-facing vault IPC surface. All handlers verify the
// sender via the shared assertSender and delegate to the VaultStore, which
// owns path safety, validation, atomic writes and revision conflicts.
function registerVaultIpc(ipcMain, ctx) {
  const { vault, assertSender, getMainWindow, dialog, fs } = ctx;
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => { assertSender(event); return fn(...args); });

  handle('kb:list', async () => {
    const { notes, corrupt } = await vault.listNotes();
    return { notes, corrupt };
  });
  handle('kb:save', async (note, baseRevision) => {
    if (!note || typeof note !== 'object') throw new TypeError('save requires a note');
    return vault.saveNote(note, baseRevision === undefined ? {} : { baseRevision });
  });
  handle('kb:remove', async (id, baseRevision) => vault.deleteNote(String(id), baseRevision === undefined ? {} : { baseRevision }));
  handle('kb:restore', async (id, baseRevision) => vault.restoreNote(String(id), baseRevision === undefined ? {} : { baseRevision }));
  handle('kb:purge', async (id) => vault.purgeNote(String(id)));
  handle('kb:search', async (query, opts) => vault.search(String(query ?? ''), opts && typeof opts === 'object' ? { limit: Math.min(Number(opts.limit) || 50, 200) } : {}));
  handle('kb:rebuild', async () => vault.rebuildIndex());
  // QA uses the offline extractive adapter by default: no network, no real model.
  // A cloud adapter requires explicit authorization and is not wired here.
  handle('kb:ask', async (query) => ask(vault, String(query ?? ''), OfflineExtractiveAdapter, { limit: 5 }));
  handle('kb:info', async () => ({ mode: 'vault', path: vault.root, segmenter: 'cjk-bigram-1' }));
  handle('kb:export', async (notes) => {
    if (!Array.isArray(notes)) throw new TypeError('export requires a notes array');
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: '导出当前笔记',
      defaultPath: `zhd-notes-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 笔记', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, JSON.stringify({ format: 'zhd-vault-export-v1', exportedAt: new Date().toISOString(), notes }, null, 2), 'utf8');
    return true;
  });
}

module.exports = { registerVaultIpc };
