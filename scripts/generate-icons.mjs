// Render build/icon.svg into the platform app icons electron-builder ships.
//
// Usage:
//   npm run icons        # runs this file under Electron (it needs Chromium to rasterise SVG)
//
// Writes:
//   build/icon.png   1024px, macOS-style margin — Linux AppImage + runtime window icon
//   build/icon.icns  macOS app bundle icon (PNG-backed entries, 32…1024px)
//   build/icon.ico   Windows exe / taskbar icon (PNG-backed entries, 16…256px)
//
// macOS icons keep Apple's grid: the tile is 824/1024 of the canvas with a soft
// shadow under it. Windows icons have no such convention, so the tile fills
// almost the whole canvas and stays legible at 16px.

import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const SVG = readFileSync(join(BUILD, 'icon.svg'), 'utf8');

const MAC = { tile: 824 / 1024, shadow: true };
const WIN = { tile: 0.94, shadow: false };

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
// Each size renders in its own window; closing one must not quit the app.
app.on('window-all-closed', () => {});

function pageFor(size, { tile, shadow }) {
  const px = Math.round(size * tile);
  const drop = shadow
    ? `filter: drop-shadow(0 ${size * 0.01}px ${size * 0.02}px rgba(0,0,0,0.35));`
    : '';
  const svg = SVG.replace('<svg ', `<svg style="width:${px}px;height:${px}px;display:block;${drop}" `);
  return `<!doctype html><html><body style="margin:0;background:transparent;width:${size}px;height:${size}px;display:grid;place-items:center;overflow:hidden">${svg}</body></html>`;
}

async function render(size, variant) {
  const win = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageFor(size, variant))}`);
  // Let the glow filter and drop shadow settle before the frame is read back.
  await new Promise((r) => setTimeout(r, 150));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  win.destroy();
  return image.resize({ width: size, height: size, quality: 'best' });
}

// Windows only decodes PNG-compressed ICO entries reliably at 256px; smaller
// sizes must be a classic 32-bit DIB: BITMAPINFOHEADER (height doubled for the
// AND mask), BGRA rows bottom-up, then an all-zero 1-bit AND mask.
function toDib(image, size) {
  const bgra = image.toBitmap();
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    bgra.copy(pixels, (size - 1 - y) * size * 4, y * size * 4, (y + 1) * size * 4);
  }
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, pixels, mask]);
}

// ICO: 6-byte header, one 16-byte directory entry per image, then the payloads.
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

// ICNS: 'icns' + total length, then [OSType, length incl. 8-byte header, PNG] chunks.
function packIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

app.whenReady().then(async () => {
  const mac = {};
  for (const size of [32, 64, 128, 256, 512, 1024]) mac[size] = (await render(size, MAC)).toPNG();

  writeFileSync(join(BUILD, 'icon.png'), mac[1024]);
  writeFileSync(join(BUILD, 'icon.icns'), packIcns([
    { type: 'ic11', png: mac[32] },   // 16@2x
    { type: 'ic12', png: mac[64] },   // 32@2x
    { type: 'ic07', png: mac[128] },
    { type: 'ic08', png: mac[256] },
    { type: 'ic13', png: mac[256] },  // 128@2x
    { type: 'ic09', png: mac[512] },
    { type: 'ic14', png: mac[512] },  // 256@2x
    { type: 'ic10', png: mac[1024] }, // 512@2x
  ]));

  const ico = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const image = await render(size, WIN);
    ico.push({ size, png: size >= 256 ? image.toPNG() : toDib(image, size) });
  }
  writeFileSync(join(BUILD, 'icon.ico'), packIco(ico));

  console.log('[icons] wrote build/icon.png, build/icon.icns, build/icon.ico');
  app.quit();
}).catch((err) => {
  console.error('[icons] failed:', err);
  app.exit(1);
});
