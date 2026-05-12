/**
 * sys image — CLI parity for ImageNode (CLAUDE.md rule 8).
 *
 *   sys image add <abs-path> [--at x,y]
 *   sys image replace <id> <abs-path>
 *   sys image resize <id> --w N --h N
 *   sys image clear <id>
 */

import { readFileSync } from 'fs';
import { extname } from 'path';
import { mutateBoard } from '../../main/boardIo';
import { writeAsset } from '../../main/ipc/assets';
import type { SysResult } from '../SysFacade';

function newId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function importAsset(absPath: string): {
  assetId: string;
  ext: string;
  bytes: Uint8Array;
} | null {
  try {
    const buf = readFileSync(absPath);
    const ext = extname(absPath).slice(1).toLowerCase();
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const result = writeAsset(ext, bytes);
    return { assetId: result.assetId, ext: result.ext, bytes };
  } catch (err) {
    console.warn('[sys image] importAsset failed:', err);
    return null;
  }
}

export function imageAdd(
  path: string | undefined,
  at: { x: number; y: number } | undefined,
): SysResult {
  if (!path) return { ok: false, message: 'sys image add: missing <path>' };
  const imported = importAsset(path);
  if (!imported) {
    return { ok: false, message: `sys image add: failed to import "${path}"` };
  }
  const id = newId();
  mutateBoard((board) => {
    board.nodes.push({
      id,
      kind: 'image',
      position: at ?? { x: 0, y: 0 },
      isMother: false,
      state: {
        assetId: imported.assetId,
        naturalWidth: null,
        naturalHeight: null,
        mimeType: null,
        alt: '',
      },
      config: {},
    });
  });
  return {
    ok: true,
    message: `image node added: ${id} (assetId ${imported.assetId})`,
    data: { id, assetId: imported.assetId },
  };
}

export function imageReplace(
  id: string | undefined,
  path: string | undefined,
): SysResult {
  if (!id) return { ok: false, message: 'sys image replace: missing <id>' };
  if (!path) return { ok: false, message: 'sys image replace: missing <path>' };
  const imported = importAsset(path);
  if (!imported) {
    return { ok: false, message: `sys image replace: failed to import "${path}"` };
  }
  let found = false;
  mutateBoard((board) => {
    for (const n of board.nodes) {
      if (n['id'] === id && n['kind'] === 'image') {
        const state = (n['state'] as Record<string, unknown> | undefined) ?? {};
        n['state'] = { ...state, assetId: imported.assetId, src: null };
        found = true;
        break;
      }
    }
  });
  return found
    ? { ok: true, message: `image node ${id} replaced` }
    : { ok: false, message: `image node ${id} not found` };
}

export function imageResize(
  id: string | undefined,
  w: number | undefined,
  h: number | undefined,
): SysResult {
  if (!id) return { ok: false, message: 'sys image resize: missing <id>' };
  if (w === undefined || h === undefined || isNaN(w) || isNaN(h)) {
    return { ok: false, message: 'sys image resize: missing --w/--h' };
  }
  let found = false;
  mutateBoard((board) => {
    for (const n of board.nodes) {
      if (n['id'] === id && n['kind'] === 'image') {
        const state = (n['state'] as Record<string, unknown> | undefined) ?? {};
        n['state'] = { ...state, width: Math.round(w), height: Math.round(h) };
        found = true;
        break;
      }
    }
  });
  return found
    ? { ok: true, message: `image node ${id} resized` }
    : { ok: false, message: `image node ${id} not found` };
}

export function imageClear(id: string | undefined): SysResult {
  if (!id) return { ok: false, message: 'sys image clear: missing <id>' };
  let found = false;
  mutateBoard((board) => {
    for (const n of board.nodes) {
      if (n['id'] === id && n['kind'] === 'image') {
        const state = (n['state'] as Record<string, unknown> | undefined) ?? {};
        n['state'] = {
          ...state,
          assetId: null,
          naturalWidth: null,
          naturalHeight: null,
          mimeType: null,
        };
        found = true;
        break;
      }
    }
  });
  return found
    ? { ok: true, message: `image node ${id} cleared` }
    : { ok: false, message: `image node ${id} not found` };
}
