import { app, BrowserWindow, protocol } from 'electron';
import { join } from 'path';
import { registerHandlers } from './ipc/handlers';
import {
  registerAssetHandlers,
  registerAssetProtocol,
} from './ipc/assets';

// Per-worktree user-data isolation (scripts/dev.mjs sets this). Without it,
// multiple worktrees of KRNL0 fight over the default `%APPDATA%/krnl0/`
// Chromium cache → "Unable to move the cache: Access is denied" + GPU disk
// cache failures. Must run before any other Electron API.
if (process.env['KRNL0_USER_DATA']) {
  app.setPath('userData', process.env['KRNL0_USER_DATA']);
}

// Privileged scheme registration MUST happen before app.whenReady() so
// Chromium treats responses from krnl-asset:// as standard, secure-origin
// content — required for <img src="krnl-asset://..."> under default CSP.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'krnl-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#f5f1e8', // --paper light
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    void win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  registerHandlers();
  registerAssetHandlers();
  registerAssetProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
