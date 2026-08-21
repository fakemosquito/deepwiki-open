const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const { t, resolveLocale } = require('./i18n');
const { readSettings, writeSettings, hasAnyApiKey, getUserDataPaths, FRONTEND_PORT } = require('./paths');
const docker = require('./docker');

let splashWindow = null;
let mainWindow = null;
let quitting = false;
let starting = false;

function locale() {
  const settings = readSettings();
  return resolveLocale(settings.locale || app.getLocale());
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 560,
    height: 720,
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

  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
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
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    splashWindow?.close();
  });

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
  splashWindow?.webContents.send('docker:progress', payload);
}

async function startServices() {
  if (starting) return { ok: true, busy: true };
  starting = true;
  try {
    await docker.startStack(emitProgress);
    createMainWindow();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error.code || 'START_FAILED',
      message: error.message,
      dockerInstalled: error.dockerInstalled,
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
          click: () => {
            splashWindow?.focus();
            if (!splashWindow) {
              createSplashWindow();
            }
            splashWindow?.webContents.send('docker:progress', { step: 'open-settings' });
          },
        },
        {
          label: t(lang, 'restart'),
          click: async () => {
            createSplashWindow();
            emitProgress({ step: 'check-docker' });
            try {
              await docker.restartStack(emitProgress);
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
          label: t(lang, 'dockerDocs'),
          click: () =>
            shell.openExternal('https://docs.docker.com/desktop/setup/install/windows-install/'),
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
  const settings = readSettings();
  if (!settings.stopContainersOnQuit) return;
  event.preventDefault();
  quitting = true;
  const timer = setTimeout(() => app.exit(0), 15000);
  try {
    await docker.stopStack();
  } finally {
    clearTimeout(timer);
    app.exit(0);
  }
});

ipcMain.handle('desktop:locale', () => locale());

ipcMain.handle('config:get', () => readSettings());

ipcMain.handle('config:set', (_event, config) => writeSettings(config || {}));

ipcMain.handle('docker:status', async () => ({
  ...docker.getStatus(),
  dockerReady: await docker.dockerAvailable(),
  stackReady: await docker.isStackReady(),
  hasApiKey: hasAnyApiKey(readSettings().keys),
}));

ipcMain.handle('docker:start', () => startServices());

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
