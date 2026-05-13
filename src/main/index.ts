import { app, BrowserWindow, protocol } from 'electron';
import { join } from 'path';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { registerHandlers, getCliDispatch } from './ipc/handlers';
import {
  registerAssetHandlers,
  registerAssetProtocol,
} from './ipc/assets';
import { createRpcServer } from './rpc/server';
import type { RpcServer } from './rpc/server';

// Per-worktree user-data isolation (scripts/dev.mjs sets KRNL0_USER_DATA).
// Without this, multiple worktrees of KRNL0 fight over `%APPDATA%/krnl0/`
// Chromium cache → "Unable to move the cache: Access is denied".
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
    const devPort = process.env['KRNL0_DEV_PORT'] ?? '5173';
    void win.loadURL(`http://localhost:${devPort}`);
    win.webContents.openDevTools();
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

// ── CLI dir setup + RPC server ─────────────────────────────────────────────
// Must happen before windows open (TNF1).

function setupCliDir(): string {
  // Use a per-launch temp dir so each Electron instance gets its own krnl bin.
  const cliDir = join(tmpdir(), `krnl0-cli-${process.pid}`);
  try {
    mkdirSync(cliDir, { recursive: true });
  } catch { /* ignore — already exists */ }

  // Source: bin/ dir relative to the compiled main entrypoint.
  // In dev:        out/main/index.js → ../../bin
  // In packaged:   resources/app.asar/out/main/index.js → ../../bin
  const srcBin = join(__dirname, '../../bin');

  for (const file of ['krnl.js', 'krnl', 'krnl.cmd', 'sys.js', 'package.json']) {
    const src = join(srcBin, file);
    const dst = join(cliDir, file);
    try {
      if (existsSync(src)) copyFileSync(src, dst);
    } catch { /* non-fatal — krnl binary may be missing in some builds */ }
  }

  process.env['KRNL0_CLI_DIR'] = cliDir;
  return cliDir;
}

let rpcServer: RpcServer | undefined;

app.whenReady().then(() => {
  setupCliDir();

  // TNF1: RPC server starts before any window opens.
  const boardPath = process.env['KRNL0_BOARD_PATH'] ?? '';
  rpcServer = createRpcServer(boardPath, getCliDispatch);

  registerHandlers(rpcServer);
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

// TNF1: teardown on quit
app.on('before-quit', () => {
  rpcServer?.close();
});
