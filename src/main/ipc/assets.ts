/**
 * assets.ts — image asset persistence (Decision 20).
 *
 * On-disk layout (sibling to board.json):
 *   <BOARD_DIR>/assets/<ULID>.<ext>
 *
 * Renderer references an image only by its assetId (a 26-char ULID-like
 * Base32 string) — never by base64. Renderer fetches bytes via the
 * `krnl-asset://<assetId>` privileged protocol registered here.
 */

import {
  app,
  ipcMain,
  protocol,
  type BrowserWindow,
} from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const BOARD_DIR =
  process.env.KRNL0_BOARD_DIR ?? join(homedir(), 'Documents', app.getName());
const ASSETS_DIR = join(BOARD_DIR, 'assets');

const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const assetExt = new Map<string, string>();

function ensureDir(): void {
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
}

function rebuildExtMap(): void {
  ensureDir();
  assetExt.clear();
  try {
    for (const file of readdirSync(ASSETS_DIR)) {
      const dot = file.lastIndexOf('.');
      if (dot <= 0) continue;
      const id = file.slice(0, dot);
      const ext = file.slice(dot + 1).toLowerCase();
      if (/^[A-Z0-9]{20,32}$/.test(id) && ALLOWED_EXT.has(ext)) {
        assetExt.set(id, ext);
      }
    }
  } catch {
    // best-effort
  }
}

// Crockford-style Base32 ULID-shaped id (26 chars). Sufficient uniqueness +
// URL-safe + matches the validator pattern used elsewhere in the codebase.
const ULID_ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newAssetId(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 26; i++) {
    out += ULID_ALPHA[bytes[i % 16]! % 32];
  }
  return out;
}

function normExt(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\./, '');
  return lower === 'jpeg' ? 'jpg' : lower;
}

/**
 * Validate the input buffer matches its declared extension via magic bytes.
 * Throws on mismatch. SVG additionally rejects embedded `<script>` / `onload=`
 * / `onerror=` (case-insensitive) to prevent XSS via SVG.
 */
function validateBytes(ext: string, buf: Uint8Array): void {
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    throw new Error('asset:write — invalid size');
  }
  const b = buf;
  switch (ext) {
    case 'png': {
      if (
        b[0] !== 0x89 || b[1] !== 0x50 ||
        b[2] !== 0x4e || b[3] !== 0x47
      ) throw new Error('asset:write — PNG magic mismatch');
      return;
    }
    case 'jpg': {
      if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
        throw new Error('asset:write — JPEG magic mismatch');
      }
      return;
    }
    case 'gif': {
      if (
        b[0] !== 0x47 || b[1] !== 0x49 ||
        b[2] !== 0x46 || b[3] !== 0x38
      ) throw new Error('asset:write — GIF magic mismatch');
      return;
    }
    case 'webp': {
      if (
        b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46 ||
        b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50
      ) throw new Error('asset:write — WEBP magic mismatch');
      return;
    }
    case 'svg': {
      const head = new TextDecoder('utf-8', { fatal: false })
        .decode(b.subarray(0, Math.min(b.byteLength, 4096)))
        .trimStart();
      if (!head.startsWith('<?xml') && !head.startsWith('<svg')) {
        throw new Error('asset:write — SVG must start with <?xml or <svg');
      }
      const lower = new TextDecoder('utf-8', { fatal: false })
        .decode(b)
        .toLowerCase();
      if (
        lower.includes('<script') ||
        lower.includes('onload=') ||
        lower.includes('onerror=') ||
        lower.includes('onclick=')
      ) {
        throw new Error('asset:write — SVG contains script/event handler');
      }
      return;
    }
    default:
      throw new Error(`asset:write — unsupported ext "${ext}"`);
  }
}

export interface AssetWriteResult {
  assetId: string;
  ext: string;
}

/**
 * Write bytes to disk under a new ULID-shaped assetId. Returns the id.
 * Pure file IO — no IPC dependency.
 */
export function writeAsset(rawExt: string, buf: Uint8Array): AssetWriteResult {
  const ext = normExt(rawExt);
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`asset:write — unsupported ext "${ext}"`);
  }
  validateBytes(ext, buf);
  ensureDir();
  const assetId = newAssetId();
  const path = join(ASSETS_DIR, `${assetId}.${ext}`);
  writeFileSync(path, buf);
  assetExt.set(assetId, ext);
  return { assetId, ext };
}

export function readAsset(
  assetId: string,
): { bytes: Uint8Array; mimeType: string } | null {
  if (!/^[A-Z0-9]{20,32}$/.test(assetId)) return null;
  let ext = assetExt.get(assetId);
  if (!ext) {
    rebuildExtMap();
    ext = assetExt.get(assetId);
  }
  if (!ext) return null;
  const path = join(ASSETS_DIR, `${assetId}.${ext}`);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return { bytes, mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
}

export function deleteAsset(assetId: string): void {
  if (!/^[A-Z0-9]{20,32}$/.test(assetId)) return;
  const ext = assetExt.get(assetId);
  if (!ext) return;
  const path = join(ASSETS_DIR, `${assetId}.${ext}`);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // best-effort
  }
  assetExt.delete(assetId);
}

// 1×1 transparent PNG used as the "asset missing" fallback so the <img>
// element doesn't fire onError into an infinite loop.
const TRANSPARENT_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Register the `krnl-asset://` protocol handler. MUST be called inside
 * app.whenReady(); the scheme privilege registration in main/index.ts happens
 * before whenReady (Chromium requires that ordering).
 */
export function registerAssetProtocol(): void {
  rebuildExtMap();
  try {
    protocol.handle('krnl-asset', async (req) => {
      try {
        const url = new URL(req.url);
        const id = url.host.toUpperCase();
        const asset = readAsset(id);
        if (!asset) {
          return new Response(TRANSPARENT_PNG, {
            status: 404,
            headers: { 'Content-Type': 'image/png' },
          });
        }
        return new Response(asset.bytes, {
          status: 200,
          headers: { 'Content-Type': asset.mimeType },
        });
      } catch (err) {
        console.warn('[krnl-asset]', err);
        return new Response('', { status: 500 });
      }
    });
  } catch (err) {
    console.warn('[krnl-asset] protocol.handle failed:', err);
  }
}

/** Emit board:changed to every renderer window — used by sys commands. */
export function notifyBoardChanged(getWindows: () => BrowserWindow[]): void {
  for (const w of getWindows()) {
    if (!w.isDestroyed()) w.webContents.send('board:changed');
  }
}

export function registerAssetHandlers(): void {
  ipcMain.handle(
    'asset:write',
    (_event, payload: { ext: string; bytes: Uint8Array }) => {
      try {
        const bytes =
          payload.bytes instanceof Uint8Array
            ? payload.bytes
            : new Uint8Array(payload.bytes as unknown as ArrayBufferLike);
        return writeAsset(payload.ext, bytes);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(message);
      }
    },
  );

  ipcMain.handle('asset:read', (_event, payload: { assetId: string }) => {
    return readAsset(payload.assetId);
  });

  ipcMain.handle('asset:delete', (_event, payload: { assetId: string }) => {
    deleteAsset(payload.assetId);
  });
}
