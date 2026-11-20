// Per-device keys and stable hashing (server-sync.md F2, NF4).

import type { Json } from './types';

/** Keys of a board that belong to one device: never uploaded, never overwritten from the server. */
export const BOARD_DEVICE_KEYS = ['viewport', 'savedAt', 'layoutMode', 'layoutGeometry', 'activeCanvasId'] as const;
/** Keys of boards.json that belong to one device. */
export const BOARDS_DEVICE_KEYS = ['activeId', 'recording', 'notice'] as const;

export function deviceKeysOf(name: string): readonly string[] {
  if (name === 'boards') return BOARDS_DEVICE_KEYS;
  if (name.startsWith('board:')) return BOARD_DEVICE_KEYS;
  return [];
}

const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The body without this device's keys (a copy). */
export function stripDevice(name: string, body: Json): Json {
  if (!isObject(body)) return body;
  const out: Record<string, Json> = { ...body };
  for (const k of deviceKeysOf(name)) delete out[k];
  return out;
}

/** A synced body with this device's own keys put back from its local copy. */
export function restoreDevice(name: string, synced: Json, local: Json | null): Json {
  if (!isObject(synced)) return synced;
  const out: Record<string, Json> = { ...synced };
  for (const k of deviceKeysOf(name)) delete out[k];
  if (isObject(local)) for (const k of deviceKeysOf(name)) if (k in local) out[k] = local[k];
  return out;
}

/** JSON with object keys sorted, so equal content always gives equal text. */
export function stableStringify(v: Json): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((x) => stableStringify(x === undefined ? null : x)).join(',') + ']';
  const keys = Object.keys(v as Record<string, Json>).filter((k) => (v as Record<string, Json>)[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, Json>)[k])).join(',') + '}';
}

/** 53-bit string hash (cyrb53): fast and good enough to tell "changed" from "same". */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const sameContent = (a: Json, b: Json): boolean => stableStringify(a) === stableStringify(b);

export const docName = {
  board: (id: string): string => `board:${id}`,
  boardId: (name: string): string | null => (name.startsWith('board:') ? name.slice('board:'.length) : null),
};
