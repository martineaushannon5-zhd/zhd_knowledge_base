'use strict';

const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require('electron');
const path = require('node:path');
const { createNotesStorage, validateNotes } = require('./storage.cjs');
const fs = require('node:fs/promises');
const { parseDevServerUrl, isTrustedRendererUrl, isAllowedRequest } = require('./security.cjs');

let mainWindow = null;
let storage = null;
let quitting = false;
let writesFlushed = false;
const indexFile = path.join(__dirname, '..', 'dist', 'index.html');

app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    // A packaged binary cannot be redirected to a development server by env.
    const devServerUrl = app.isPackaged ? null : parseDevServerUrl(process.env.VITE_DEV_SERVER_URL);
    const trusted = { devServerUrl, indexFile };
    storage = createNotesStorage(app.getPath('userData'));
    const rendererSession = session.fromPartition('zhd-notes-renderer');
    rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    rendererSession.setPermissionCheckHandler(() => false);
    rendererSession.on('will-download', (event) => event.preventDefault());
    rendererSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      callback({ cancel: !isAllowedRequest(details.url, trusted) });
    });

    function assertSender(event) {
      if (quitting) throw new Error('The application is closing');
      if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
          !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame ||
          !isTrustedRendererUrl(event.senderFrame.url, trusted)) {
        throw new Error('Untrusted notes IPC sender');
      }
    }

    ipcMain.handle('desktop-notes:load', async (event, ...args) => {
      assertSender(event);
      if (args.length) throw new TypeError('load takes no arguments');
      return storage.load();
    });
    ipcMain.handle('desktop-notes:save', async (event, ...args) => {
      assertSender(event);
      if (args.length !== 1) throw new TypeError('save requires one notes array');
      await storage.save(args[0]);
    });
    ipcMain.handle('desktop-notes:info', async (event, ...args) => {
      assertSender(event);
      if (args.length) throw new TypeError('info takes no arguments');
      return storage.info();
    });

    ipcMain.handle('desktop-notes:export', async (event, ...args) => {
      assertSender(event);
      if (args.length !== 1) throw new TypeError('export requires one notes array');
      const notes = validateNotes(args[0]);
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出当前笔记',
        defaultPath: `zhd-notes-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON 笔记', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return false;
      await fs.writeFile(result.filePath, JSON.stringify({ format: 'zhd-prototype-v1', exportedAt: new Date().toISOString(), notes }, null, 2), 'utf8');
      return true;
    });

    Menu.setApplicationMenu(null);

    async function createWindow() {
      mainWindow = new BrowserWindow({
        width: 1500,
        height: 960,
        minWidth: 1000,
        minHeight: 680,
        backgroundColor: '#ffffff',
        title: 'Zhd Notes',
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          session: rendererSession,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
          navigateOnDragDrop: false,
          devTools: !app.isPackaged,
        },
      });
      const window = mainWindow;
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-prevent-unload', (event) => {
        const choice = dialog.showMessageBoxSync(window, {
          type: 'question',
          buttons: ['继续编辑', '放弃修改并关闭'],
          defaultId: 0,
          cancelId: 0,
          title: '还有未保存的修改',
          message: '关闭窗口将放弃当前未保存的内容。',
        });
        if (choice === 1) event.preventDefault();
        else { quitting = false; writesFlushed = false; }
      });
      window.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedRendererUrl(url, trusted)) event.preventDefault();
      });
      window.webContents.on('will-redirect', (event, url) => {
        if (!isTrustedRendererUrl(url, trusted)) event.preventDefault();
      });
      window.webContents.on('will-frame-navigate', (event) => {
        if (!event.isMainFrame || !isTrustedRendererUrl(event.url, trusted)) event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.once('ready-to-show', () => window.show());
      window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
      if (devServerUrl) await window.loadURL(devServerUrl);
      else await window.loadFile(indexFile);
    }

    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(reportStartupError);
    });
  }).catch(reportStartupError);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (writesFlushed || !storage) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    storage.flush().finally(() => {
      writesFlushed = true;
      app.quit();
    });
  });
}

function reportStartupError(error) {
  console.error('Desktop startup failed:', error.message);
  dialog.showErrorBox('Zhd Notes 启动失败', '请确认前端已启动，或先运行 npm run build 后使用 npm run electron:preview。');
  app.quit();
}
