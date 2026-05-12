/**
 * assets.test.ts — coverage for asset pipeline (Decision 20).
 *
 * Tests writeAsset / readAsset directly (not through IPC). 'electron' is
 * mocked because assets.ts top-level imports `app`, `protocol`, etc.
 * KRNL0_BOARD_DIR points at a fresh temp dir so writes are isolated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

let tmp = '';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'krnl0-assets-'));
  process.env.KRNL0_BOARD_DIR = tmp;
  vi.resetModules();
});

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  ...new Array(20).fill(0),
]);

const JPG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(20).fill(0)]);
const GIF_MAGIC = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, ...new Array(20).fill(0),
]);
const WEBP_MAGIC = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ...new Array(20).fill(0),
]);

function svgBytes(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

describe('writeAsset — magic byte validation', () => {
  it('writes a valid PNG and returns an ULID-shaped id', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const { assetId, ext } = writeAsset('png', PNG_MAGIC);
    expect(ext).toBe('png');
    expect(assetId).toMatch(/^[A-Z0-9]{20,32}$/);
    expect(existsSync(join(tmp, 'assets', `${assetId}.png`))).toBe(true);
  });

  it('accepts jpg and normalises jpeg → jpg', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const a = writeAsset('jpg', JPG_MAGIC);
    expect(a.ext).toBe('jpg');
    const b = writeAsset('jpeg', JPG_MAGIC);
    expect(b.ext).toBe('jpg');
  });

  it('accepts gif and webp', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    expect(writeAsset('gif', GIF_MAGIC).ext).toBe('gif');
    expect(writeAsset('webp', WEBP_MAGIC).ext).toBe('webp');
  });

  it('rejects extension not in whitelist', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    expect(() => writeAsset('bmp', PNG_MAGIC)).toThrow(/unsupported/);
  });

  it('rejects empty file', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    expect(() => writeAsset('png', new Uint8Array())).toThrow(/invalid size/);
  });

  it('rejects PNG with wrong magic', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const bad = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(() => writeAsset('png', bad)).toThrow(/magic mismatch/);
  });

  it('rejects file larger than 25 MB', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    // Mock a 26 MB buffer (zeros — fails magic regardless, but size check
    // fires first).
    const big = new Uint8Array(26 * 1024 * 1024);
    expect(() => writeAsset('png', big)).toThrow(/invalid size/);
  });

  it('accepts SVG starting with <svg', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const svg = svgBytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = writeAsset('svg', svg);
    expect(result.ext).toBe('svg');
  });

  it('rejects SVG containing <script>', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const svg = svgBytes('<svg><script>alert(1)</script></svg>');
    expect(() => writeAsset('svg', svg)).toThrow(/script|event handler/i);
  });

  it('rejects SVG with onload= handler', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const svg = svgBytes('<svg onload="x()"></svg>');
    expect(() => writeAsset('svg', svg)).toThrow(/script|event handler/i);
  });

  it('rejects SVG that does not start with <?xml or <svg', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const svg = svgBytes('not an svg');
    expect(() => writeAsset('svg', svg)).toThrow(/start with/);
  });
});

describe('readAsset', () => {
  it('returns bytes + mime for a written asset', async () => {
    const { writeAsset, readAsset } = await import(
      '../../../src/main/ipc/assets'
    );
    const { assetId } = writeAsset('png', PNG_MAGIC);
    const result = readAsset(assetId);
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe('image/png');
    expect(result?.bytes.byteLength).toBe(PNG_MAGIC.byteLength);
  });

  it('returns null for invalid id format', async () => {
    const { readAsset } = await import('../../../src/main/ipc/assets');
    expect(readAsset('lowercase-bad')).toBeNull();
    expect(readAsset('../../../etc/passwd')).toBeNull();
  });

  it('returns null for an unknown asset', async () => {
    const { readAsset } = await import('../../../src/main/ipc/assets');
    expect(readAsset('NONEXISTENTASSETID000000000')).toBeNull();
  });
});

describe('file persistence — no base64 in stored bytes', () => {
  it('writes raw bytes, not a base64 string', async () => {
    const { writeAsset } = await import('../../../src/main/ipc/assets');
    const { assetId } = writeAsset('png', PNG_MAGIC);
    const onDisk = readFileSync(join(tmp, 'assets', `${assetId}.png`));
    expect(onDisk[0]).toBe(0x89);
    expect(onDisk[1]).toBe(0x50);
    expect(onDisk[2]).toBe(0x4e);
    expect(onDisk[3]).toBe(0x47);
  });
});
