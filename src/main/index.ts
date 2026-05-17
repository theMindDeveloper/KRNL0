import { app, BrowserWindow, Menu, protocol } from 'electron';
import { join, normalize, sep, extname } from 'path';
import { mkdirSync, copyFileSync, existsSync, chmodSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { createServer, type Server } from 'http';
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

// krnl-asset:// — used for <img src="krnl-asset://..."> (Decision 21).
// MUST be registered before app.whenReady() so Chromium treats responses as
// standard, secure-origin content.
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

// Resolve the BrowserWindow icon for the current platform. Windows requires a
// .ico file for crisp taskbar / alt-tab rendering; everywhere else .png works.
// In packaged builds the `build/` directory is inside app.asar (see
// electron-builder.json `files`), so __dirname-relative paths reach it the
// same way as in dev. If the resolved file is missing we fall back to the PNG
// rather than crashing — Electron just shows the default icon in that case.
function resolveWindowIcon(): string {
  const buildDir = join(__dirname, '../../build');
  const preferred = process.platform === 'win32'
    ? join(buildDir, 'icon.ico')
    : join(buildDir, 'icon.png');
  if (existsSync(preferred)) return preferred;
  const fallback = join(buildDir, 'icon.png');
  return existsSync(fallback) ? fallback : preferred;
}

// ── Local renderer HTTP server ─────────────────────────────────────────────
// In dev the renderer is served by Vite on http://localhost:<port>. In
// packaged builds it used to load via win.loadFile (→ file://), which broke
// the YouTube embed: YouTube's iframe rejects the postMessage handshake
// from any non-http(s) parent origin (even Chromium-"secure" custom
// schemes like app:// or krnl-app://). Spinning up a real loopback HTTP
// server gives the renderer a true http://127.0.0.1:<port>/ origin that
// YouTube — and every other third-party embed — accepts.
//
// Bound to 127.0.0.1 only, so no firewall prompt and not reachable off
// the box. Port is 0 (OS-assigned) so two instances never collide.

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

let rendererServer: Server | undefined;

async function startRendererServer(): Promise<number> {
  const rendererRoot = join(__dirname, '../renderer');
  const rootWithSep = rendererRoot.endsWith(sep) ? rendererRoot : rendererRoot + sep;

  return new Promise<number>((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          let pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
          if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';
          const filePath = normalize(join(rendererRoot, pathname));
          if (filePath !== rendererRoot && !filePath.startsWith(rootWithSep)) {
            res.writeHead(403); res.end('forbidden'); return;
          }
          let s;
          try { s = await stat(filePath); }
          catch { res.writeHead(404); res.end('not found'); return; }
          if (!s.isFile()) { res.writeHead(404); res.end('not found'); return; }
          const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
          const bytes = await readFile(filePath);
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': bytes.length.toString(),
            'Cache-Control': 'no-cache',
          });
          res.end(bytes);
        } catch (err) {
          console.warn('[renderer-server]', err);
          try { res.writeHead(500); res.end('error'); } catch { /* response already sent */ }
        }
      })();
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        rendererServer = server;
        resolve(addr.port);
      } else {
        reject(new Error('renderer-server: listen failed'));
      }
    });
  });
}

let rendererPort = 0;

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0e0d0b',
    icon: resolveWindowIcon(),
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
    void win.loadURL(`http://127.0.0.1:${rendererPort}/index.html`);
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

  // POSIX shell shims (krnl, claude) need the executable bit preserved across
  // the copy. copyFileSync preserves mode on POSIX, but on packaged builds the
  // bin/ ships from inside app.asar where mode bits aren't guaranteed — force
  // them with chmod after copying.
  const posixShims = new Set(['krnl', 'claude']);
  for (const file of ['krnl.js', 'krnl', 'krnl.cmd', 'sys.js', 'package.json', 'krnl-init.ps1', 'claude']) {
    const src = join(srcBin, file);
    const dst = join(cliDir, file);
    try {
      if (existsSync(src)) {
        copyFileSync(src, dst);
        if (posixShims.has(file) && process.platform !== 'win32') {
          // 0o755 — owner rwx, group/others rx.
          try { chmodSync(dst, 0o755); } catch { /* non-fatal */ }
        }
      }
    } catch { /* non-fatal — krnl binary may be missing in some builds */ }
  }

  process.env['KRNL0_CLI_DIR'] = cliDir;
  return cliDir;
}

let rpcServer: RpcServer | undefined;

app.whenReady().then(async () => {
  // Windows taskbar icon — without a unique AppUserModelID, Windows groups
  // our window under Electron's generic model ID and pins the default
  // Electron icon to the taskbar even when BrowserWindow({ icon }) is set.
  // Setting an explicit ID (matches electron-builder.json `appId`) tells
  // Windows this is its own application and the BrowserWindow icon wins.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.theminddevlab.krnl0');
  }

  setupCliDir();

  // TNF1: RPC server starts before any window opens.
  const boardPath = process.env['KRNL0_BOARD_PATH'] ?? '';
  rpcServer = createRpcServer(boardPath, getCliDispatch);

  registerHandlers(rpcServer);
  registerAssetHandlers();
  registerAssetProtocol();

  // Only the packaged path needs the local renderer server; dev uses Vite.
  if (process.env['NODE_ENV'] !== 'development') {
    try {
      rendererPort = await startRendererServer();
    } catch (err) {
      console.error('[renderer-server] failed to start:', err);
      // Window will fail to load — surfaced visibly rather than silently.
    }
  }

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
  rendererServer?.close();
});
