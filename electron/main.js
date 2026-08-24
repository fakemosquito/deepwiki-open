const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const { t, resolveLocale } = require('./i18n');
const { testModelConnection } = require('./connect');
const {
  readSettings,
  writeSettings,
  hasModelConnection,
  getUserDataPaths,
  FRONTEND_PORT,
} = require('./paths');
const stack = require('./stack');

let splashWindow = null;
let mainWindow = null;
let quitting = false;
let starting = false;

function locale() {
  const settings = readSettings();
  return resolveLocale(settings.locale || app.getLocale());
}

function createSplashWindow(mode = '') {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.focus();
    if (mode === 'settings') {
      splashWindow.webContents.send('stack:progress', { step: 'open-settings' });
    }
    return splashWindow;
  }

  splashWindow = new BrowserWindow({
    width: 560,
    height: 760,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f8f4e6',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'), {
    hash: mode === 'settings' ? 'settings' : '',
  });
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#f8f4e6',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);
  const reveal = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  };
  // Close the splash as soon as Chromium starts loading. Waiting for
  // ready-to-show would keep it up through Next.js first compile.
  mainWindow.webContents.once('did-start-loading', reveal);
  mainWindow.once('ready-to-show', reveal);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function emitProgress(payload) {
  splashWindow?.webContents.send('stack:progress', payload);
}

async function startServices() {
  if (starting) return { ok: true, busy: true };
  starting = true;
  try {
    await stack.startStack(emitProgress);
    createMainWindow();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error.code || 'START_FAILED',
      message: error.message,
    };
  } finally {
    starting = false;
  }
}

function buildMenu() {
  const lang = locale();
  const template = [
    {
      label: t(lang, 'fileMenu'),
      submenu: [
        {
          label: t(lang, 'settings'),
          click: () => createSplashWindow('settings'),
        },
        {
          label: t(lang, 'restart'),
          click: async () => {
            createSplashWindow();
            emitProgress({ step: 'check-runtime' });
            try {
              await stack.restartStack(emitProgress);
              createMainWindow();
            } catch (error) {
              dialog.showErrorBox(t(lang, 'errorTitle'), error.message);
            }
          },
        },
        {
          label: t(lang, 'openData'),
          click: () => shell.openPath(getUserDataPaths().dataDir),
        },
        {
          label: t(lang, 'openLogs'),
          click: () => shell.openPath(getUserDataPaths().logDir),
        },
        { type: 'separator' },
        { label: t(lang, 'quit'), role: 'quit' },
      ],
    },
    {
      label: t(lang, 'helpMenu'),
      submenu: [
        {
          label: t(lang, 'projectHome'),
          click: () =>
            shell.openExternal('https://github.com/AsyncFuncAI/deepwiki-open'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const target = mainWindow || splashWindow;
    if (target) {
      if (target.isMinimized()) target.restore();
      target.focus();
    }
  });
}

app.whenReady().then(() => {
  buildMenu();
  createSplashWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const timer = setTimeout(() => app.exit(0), 15000);
  try {
    await stack.stopStack();
  } finally {
    clearTimeout(timer);
    app.exit(0);
  }
});

ipcMain.handle('desktop:locale', () => locale());

ipcMain.handle('config:get', () => readSettings());

ipcMain.handle('config:set', (_event, config) => writeSettings(config || {}));

ipcMain.handle('stack:status', async () => ({
  ...stack.getStatus(),
  stackReady: await stack.isStackReady(),
  hasModelConnection: hasModelConnection(readSettings().keys),
}));

ipcMain.handle('stack:start', () => startServices());

ipcMain.handle('model:test', (_event, payload) => testModelConnection(payload || {}));

ipcMain.handle('model:connect', async (_event, payload) => {
  const keys = payload?.keys || payload || {};
  const test = await testModelConnection(keys);
  if (!test.ok) return test;
  writeSettings({ keys });
  if (starting) return { ok: true, busy: true };
  starting = true;
  try {
    await stack.restartStack(emitProgress);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
      mainWindow.show();
      mainWindow.focus();
      splashWindow?.close();
    } else {
      createMainWindow();
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error.code || 'START_FAILED',
      message: error.message,
    };
  } finally {
    starting = false;
  }
});

ipcMain.handle('desktop:pick-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win || undefined, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('desktop:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:/i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

ipcMain.handle('desktop:open-path', (_event, target) => {
  if (typeof target === 'string') {
    return shell.openPath(target);
  }
  return '';
});
