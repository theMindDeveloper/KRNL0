/**
 * assets.ts â€” image asset persistence (Decision 21).
 *
 * On-disk layout (sibling to board.json):
 *   <BOARD_DIR>/assets/<ULID>.<ext>
 *
 * Renderer references an image only by its assetId (a 26-char ULID-like
 * Base32 string) â€” never by base64. Renderer fetches bytes via the
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
import { join, extname } from 'path';
import { copyFileSync, createReadStream, openSync, readSync, closeSync, statSync } from 'fs';
import { Readable } from 'stream';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const BOARD_DIR =
  process.env.KRNL0_BOARD_DIR ?? join(homedir(), 'Documents', app.getName());
const ASSETS_DIR = join(BOARD_DIR, 'assets');

// Media dropped on the canvas (video, audio, PDF) shares the asset store.
const MEDIA_MIME: Record<string, string> = {
  // .mov is served as mp4: Chromium refuses video/quicktime, but H.264 movs play.
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mp4', m4v: 'video/mp4', ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
  pdf: 'application/pdf',
};
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', ...Object.keys(MEDIA_MIME)]);
// Any other file dropped on the canvas is kept as an opaque download.
const GENERIC_EXT_RE = /^[a-z0-9]{1,10}$/;
const isStorableExt = (ext: string) => ALLOWED_EXT.has(ext) || GENERIC_EXT_RE.test(ext);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (images)
const MAX_MEDIA_BYTES = 500 * 1024 * 1024; // 500 MB when bytes come over IPC
const MAX_IMPORT_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB when copied from a path
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ...MEDIA_MIME,
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
      if (/^[A-Z0-9]{20,32}$/.test(id) && isStorableExt(ext)) {
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
  if (ext in MEDIA_MIME || !ALLOWED_EXT.has(ext)) {
    if (buf.byteLength === 0 || buf.byteLength > MAX_MEDIA_BYTES) throw new Error('asset:write — invalid size');
    // PDF must look like a PDF; audio/video containers vary too much for a
    // cheap magic check and are only ever played, never executed.
    if (ext === 'pdf' && !(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
      throw new Error('asset:write — PDF magic mismatch');
    }
    return;
  }
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    throw new Error('asset:write â€” invalid size');
  }
  const b = buf;
  switch (ext) {
    case 'png': {
      if (
        b[0] !== 0x89 || b[1] !== 0x50 ||
        b[2] !== 0x4e || b[3] !== 0x47
      ) throw new Error('asset:write â€” PNG magic mismatch');
      return;
    }
    case 'jpg': {
      if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
        throw new Error('asset:write â€” JPEG magic mismatch');
      }
      return;
    }
    case 'gif': {
      if (
        b[0] !== 0x47 || b[1] !== 0x49 ||
        b[2] !== 0x46 || b[3] !== 0x38
      ) throw new Error('asset:write â€” GIF magic mismatch');
      return;
    }
    case 'webp': {
      if (
        b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46 ||
        b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50
      ) throw new Error('asset:write â€” WEBP magic mismatch');
      return;
    }
    case 'svg': {
      const head = new TextDecoder('utf-8', { fatal: false })
        .decode(b.subarray(0, Math.min(b.byteLength, 4096)))
        .trimStart();
      if (!head.startsWith('<?xml') && !head.startsWith('<svg')) {
        throw new Error('asset:write â€” SVG must start with <?xml or <svg');
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
        throw new Error('asset:write â€” SVG contains script/event handler');
      }
      return;
    }
    default:
      throw new Error(`asset:write â€” unsupported ext "${ext}"`);
  }
}

export interface AssetWriteResult {
  assetId: string;
  ext: string;
}

/**
 * Write bytes to disk under a new ULID-shaped assetId. Returns the id.
 * Pure file IO â€” no IPC dependency.
 */
export function writeAsset(rawExt: string, buf: Uint8Array): AssetWriteResult {
  const ext = normExt(rawExt);
  if (!isStorableExt(ext)) {
    throw new Error(`asset:write â€” unsupported ext "${ext}"`);
  }
  validateBytes(ext, buf);
  ensureDir();
  const assetId = newAssetId();
  const path = join(ASSETS_DIR, `${assetId}.${ext}`);
  writeFileSync(path, buf);
  assetExt.set(assetId, ext);
  return { assetId, ext };
}

/**
 * Import a file straight from disk (drag-drop gives us its path): a fast
 * file copy in main — no bytes cross the IPC bridge, so big videos drop
 * instantly. Images / PDFs still get their magic-byte check on the head.
 */
export function importAssetFromPath(srcPath: string): AssetWriteResult {
  const ext = normExt(extname(srcPath));
  if (!isStorableExt(ext)) throw new Error(`asset:import — unsupported ext "${ext}"`);
  const st = statSync(srcPath);
  if (!st.isFile() || st.size === 0 || st.size > MAX_IMPORT_BYTES) throw new Error('asset:import — invalid size');
  if (!(ext in MEDIA_MIME) && ALLOWED_EXT.has(ext) || ext === 'pdf') {
    const head = new Uint8Array(Math.min(st.size, 64 * 1024));
    const fd = openSync(srcPath, 'r');
    try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
    if (ext === 'pdf') validateBytes('pdf', head);
    else if (ext !== 'svg' && st.size <= MAX_BYTES) validateBytes(ext, head);
  }
  ensureDir();
  const assetId = newAssetId();
  copyFileSync(srcPath, join(ASSETS_DIR, `${assetId}.${ext}`));
  assetExt.set(assetId, ext);
  return { assetId, ext };
}

/** On-disk path + MIME of an asset, or null. */
function resolveAsset(assetId: string): { path: string; mimeType: string } | null {
  if (!/^[A-Z0-9]{20,32}$/.test(assetId)) return null;
  let ext = assetExt.get(assetId);
  if (!ext) { rebuildExtMap(); ext = assetExt.get(assetId); }
  if (!ext) return null;
  const path = join(ASSETS_DIR, `${assetId}.${ext}`);
  return existsSync(path) ? { path, mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream' } : null;
}

/**
 * Stream an asset, honouring HTTP Range requests: video / audio start playing
 * right away and can seek, instead of loading the whole file into memory.
 * Exported for tests.
 */
export function assetResponse(assetId: string, rangeHeader: string | null): Response {
  const a = resolveAsset(assetId);
  if (!a) return new Response(TRANSPARENT_PNG, { status: 404, headers: { 'Content-Type': 'image/png' } });
  const size = statSync(a.path).size;
  const base = { 'Content-Type': a.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    start = Math.max(0, start);
    const body = Readable.toWeb(createReadStream(a.path, { start, end })) as unknown as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  }
  const body = Readable.toWeb(createReadStream(a.path)) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
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

// 1Ã—1 transparent PNG used as the "asset missing" fallback so the <img>
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
        // Streamed with Range support so media starts at once and can seek.
        return assetResponse(url.host.toUpperCase(), req.headers.get('range'));
      } catch (err) {
        console.warn('[krnl-asset]', err);
        return new Response('', { status: 500 });
      }
    });
  } catch (err) {
    console.warn('[krnl-asset] protocol.handle failed:', err);
  }
}

/** Emit board:changed to every renderer window â€” used by sys commands. */
export function notifyBoardChanged(getWindows: () => BrowserWindow[]): void {
  for (const w of getWindows()) {
    if (!w.isDestroyed()) w.webContents.send('board:changed');
  }
}

export function registerAssetHandlers(): void {
  ipcMain.handle('asset:importPath', (_event, payload: { path: string }) => {
    try {
      return importAssetFromPath(String(payload?.path ?? ''));
    } catch (err) {
      console.warn('[asset:importPath]', err);
      throw err;
    }
  });
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
