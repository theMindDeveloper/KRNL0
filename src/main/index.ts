import { app, BrowserWindow, Menu, protocol, net } from 'electron';
import { join, normalize, sep } from 'path';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
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
// Chromium treats responses from these schemes as standard, secure-origin
// content.
//
// krnl-asset:// — used for <img src="krnl-asset://...">.
// krnl-app://   — used to serve the renderer in packaged builds instead of
//                  file://. Third-party embeds (YouTube iframe, Stripe, …)
//                  refuse to handshake with file:// parents because the
//                  origin is not "secure". krnl-app:// gives the renderer a
//                  proper origin so embeds work. Dev keeps using
//                  http://localhost:<port>.
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
  {
    scheme: 'krnl-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0e0d0b',
    icon: join(__dirname, '../../build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1814',
      symbolColor: '#c9f158',
      height: 44,
    },
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
    void win.loadURL('krnl-app://krnl0/index.html');
  }

  return win;
}

// Serve the built renderer over krnl-app:// instead of file://. Without this,
// the renderer's origin is file:// — YouTube's embed iframe refuses the
// postMessage handshake from file:// parents and the player never starts.
// The `oembed` fetch also fails CORS preflight from file://. krnl-app:// is
// treated as a standard, secure origin by Chromium, fixing both.
function registerAppProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer');
  try {
    protocol.handle('krnl-app', async (req) => {
      try {
        const url = new URL(req.url);
        // Default `/` and trailing-slash requests to index.html.
        let pathname = url.pathname.replace(/^\/+/, '');
        if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';
        // Resolve and clamp to rendererRoot so a crafted ../../ can't escape.
        const filePath = normalize(join(rendererRoot, pathname));
        const rootWithSep = rendererRoot.endsWith(sep) ? rendererRoot : rendererRoot + sep;
        if (filePath !== rendererRoot && !filePath.startsWith(rootWithSep)) {
          return new Response('forbidden', { status: 403 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      } catch (err) {
        console.warn('[krnl-app] handler failed:', err);
        return new Response('', { status: 500 });
      }
    });
  } catch (err) {
    console.warn('[krnl-app] protocol.handle registration failed:', err);
  }
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

  for (const file of ['krnl.js', 'krnl', 'krnl.cmd', 'sys.js', 'package.json', 'krnl-init.ps1']) {
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
  registerAppProtocol();
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
