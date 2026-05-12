/**
 * sys text — CLI parity for TextNode (CLAUDE.md rule 8).
 *
 *   sys text add  [--text "..."] [--at x,y]
 *   sys text set  <id> --text "..."
 *   sys text resize <id> --w N --h N
 */

import { mutateBoard } from '../../main/boardIo';
import type { SysResult } from '../SysFacade';

function newId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function textAdd(
  text: string | undefined,
  at: { x: number; y: number } | undefined,
): SysResult {
  const id = newId();
  mutateBoard((board) => {
    board.nodes.push({
      id,
      kind: 'text',
      position: at ?? { x: 0, y: 0 },
      isMother: false,
      state: { text: text ?? '' },
      config: {},
    });
  });
  return { ok: true, message: `text node added: ${id}`, data: { id } };
}

export function textSet(
  id: string | undefined,
  text: string | undefined,
): SysResult {
  if (!id) return { ok: false, message: 'sys text set: missing <id>' };
  if (text === undefined) {
    return { ok: false, message: 'sys text set: missing --text' };
  }
  let found = false;
  mutateBoard((board) => {
    for (const n of board.nodes) {
      if (n['id'] === id && n['kind'] === 'text') {
        const state = (n['state'] as Record<string, unknown> | undefined) ?? {};
        n['state'] = { ...state, text };
        found = true;
        break;
      }
    }
  });
  return found
    ? { ok: true, message: `text node ${id} updated` }
    : { ok: false, message: `text node ${id} not found` };
}

export function textResize(
  id: string | undefined,
  w: number | undefined,
  h: number | undefined,
): SysResult {
  if (!id) return { ok: false, message: 'sys text resize: missing <id>' };
  if (w === undefined || h === undefined || isNaN(w) || isNaN(h)) {
    return { ok: false, message: 'sys text resize: missing --w/--h' };
  }
  let found = false;
  mutateBoard((board) => {
    for (const n of board.nodes) {
      if (n['id'] === id && n['kind'] === 'text') {
        const state = (n['state'] as Record<string, unknown> | undefined) ?? {};
        n['state'] = { ...state, width: Math.round(w), height: Math.round(h) };
        found = true;
        break;
      }
    }
  });
  return found
    ? { ok: true, message: `text node ${id} resized to ${w}×${h}` }
    : { ok: false, message: `text node ${id} not found` };
}
