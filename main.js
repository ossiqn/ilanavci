const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { initDatabase } = require('./lib/database');
const { startScheduler, stopScheduler, runScan, getSchedulerStatus } = require('./lib/scheduler');

const store = new Store();
let mainWindow = null;
let tray = null;
let isQuitting = false;
let splashShown = false;

const CREDIT_INFO = {
  author: 'OSSIQN',
  github: 'https://github.com/ossiqn',
  r10: 'https://www.r10.net/profil/217094-ossiqn.html',
  message: 'Bu yazilim OSSIQN tarafindan kodlanmistir. Satisi yasaktir, ucretsiz olarak yayimlanmistir.'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#07070d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (!splashShown) {
      splashShown = true;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('show:credits', CREDIT_INFO);
        }
      }, 800);
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'src/assets/tray.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (trayIcon.isEmpty()) throw new Error('empty');
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Goster',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Taramayi Baslat',
      click: () => startScheduler(mainWindow)
    },
    {
      label: 'Taramayi Durdur',
      click: () => stopScheduler()
    },
    { type: 'separator' },
    {
      label: 'Github',
      click: () => shell.openExternal(CREDIT_INFO.github)
    },
    {
      label: 'R10 Profil',
      click: () => shell.openExternal(CREDIT_INFO.r10)
    },
    { type: 'separator' },
    {
      label: 'Cikis',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('IlanAvci by OSSIQN');
  tray.setContextMenu(menu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function registerIpcHandlers() {
  const db = require('./lib/database');

  ipcMain.handle('watcher:create', (_, data) => db.createWatcher(data));
  ipcMain.handle('watcher:list', () => db.getWatchers());
  ipcMain.handle('watcher:delete', (_, id) => db.deleteWatcher(id));
  ipcMain.handle('watcher:toggle', (_, id) => db.toggleWatcher(id));
  ipcMain.handle('watcher:update', (_, id, data) => db.updateWatcher(id, data));

  ipcMain.handle('alert:list', (_, filters) => db.getAlerts(filters));
  ipcMain.handle('alert:markRead', (_, id) => db.markAlertRead(id));
  ipcMain.handle('alert:markAllRead', () => db.markAllAlertsRead());
  ipcMain.handle('alert:count', () => db.getUnreadAlertCount());
  ipcMain.handle('alert:delete', (_, id) => db.deleteAlert(id));

  ipcMain.handle('listing:list', (_, filters) => db.getListings(filters));
  ipcMain.handle('listing:detail', (_, id) => db.getListingDetail(id));
  ipcMain.handle('listing:sellerHistory', (_, seller) => db.getSellerHistory(seller));

  ipcMain.handle('stats:dashboard', () => db.getDashboardStats());

  ipcMain.handle('scan:now', async () => await runScan(mainWindow));
  ipcMain.handle('scan:start', () => {
    startScheduler(mainWindow);
    return { running: true };
  });
  ipcMain.handle('scan:stop', () => {
    stopScheduler();
    return { running: false };
  });
  ipcMain.handle('scan:status', () => getSchedulerStatus());

  ipcMain.handle('settings:get', () => store.store);
  ipcMain.handle('settings:set', (_, data) => {
    Object.keys(data).forEach(key => store.set(key, data[key]));
    return true;
  });

  ipcMain.handle('telegram:test', async (_, config) => {
    const { testTelegram } = require('./lib/notifier');
    return await testTelegram(config);
  });

  ipcMain.handle('credit:info', () => CREDIT_INFO);

  ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });

  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  createTray();
  registerIpcHandlers();

  setTimeout(() => {
    startScheduler(mainWindow);
  }, 6000);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else mainWindow.show();
});