import { app, BrowserWindow, ipcMain, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type SaveRecord = Record<string, unknown>;

let mainWindow: BrowserWindow | null = null;
let companionWindow: BrowserWindow | null = null;

const isDev = process.argv.includes('--dev');

function appFile(name: string) {
  return path.join(app.getPath('userData'), name);
}

function readJson<T extends SaveRecord>(name: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(appFile(name), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: SaveRecord) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(appFile(name), JSON.stringify(value, null, 2), 'utf8');
}

function rendererFile(fileName: string) {
  return path.join(__dirname, '..', 'renderer', fileName);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0f1014',
    title: 'Mochi',
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(rendererFile('index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createCompanionWindow() {
  if (companionWindow && !companionWindow.isDestroyed()) {
    return companionWindow;
  }

  companionWindow = new BrowserWindow({
    width: 220,
    height: 220,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  companionWindow.setIgnoreMouseEvents(true, { forward: true });
  companionWindow.loadFile(rendererFile('companion.html'));
  companionWindow.on('closed', () => {
    companionWindow = null;
  });

  return companionWindow;
}

ipcMain.handle('state:load', () => {
  return readJson('profile.json', {});
});

ipcMain.handle('state:save', (_event, value: SaveRecord) => {
  writeJson('profile.json', value);
  return true;
});

ipcMain.handle('settings:get', () => {
  return readJson('settings.json', { companionMode: true });
});

ipcMain.handle('settings:set', (_event, value: SaveRecord) => {
  writeJson('settings.json', value);
  return true;
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('overlay:show', async () => {
  const win = createCompanionWindow();
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - 260;
  const y = workArea.y + workArea.height - 260;
  win.setBounds({ x, y, width: 220, height: 220 });
  if (!win.isVisible()) {
    win.showInactive();
  }
  return { x, y, width: workArea.width, height: workArea.height };
});

ipcMain.handle('overlay:move', (_event, x: number, y: number) => {
  if (!companionWindow || companionWindow.isDestroyed()) return false;
  companionWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: 220,
    height: 220
  });
  return true;
});

ipcMain.handle('overlay:hide', () => {
  companionWindow?.hide();
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  companionWindow?.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
