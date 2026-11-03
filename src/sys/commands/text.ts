/**
 * sys text — CLI parity for TextNode (CLAUDE.md rule 8).
 *
 *   sys text add  [--text "..."] [--at x,y]
 *   sys text set  <id> --text "..."
 *   sys text resize <id> --w N --h N
 */

import { mutateBoard, readBoardFile } from '../../main/boardIo';
import type { SysResult } from '../SysFacade';
import { textSetLook } from '../../renderer/components/nodes/TextNode/commands';
import { LOOK_KINDS, type TextLook, type TextState } from '../../renderer/components/nodes/TextNode/types';
import { resolveNodeRef } from '../../shared/dispatch/resolveRef';
import type { BoardShape } from '../../shared/dispatch/types';

/** The full id `ref` names among `kind` nodes, or null. */
function refIn(board: { nodes: Array<Record<string, unknown>> }, ref: string, kind: string): string | null {
  const r = resolveNodeRef(board as unknown as BoardShape, ref, kind);
  return r.ok ? r.id : null;
}

function newId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve --near source geometry for sibling placement: returns position at srcX + srcW + 24, srcY. */
function resolveNearPosition(
  near: string,
): { x: number; y: number } | null {
  const board = readBoardFile();
  if (!board) return null;
  let src: Record<string, unknown> | undefined;
  src = board.nodes.find((n) => n['id'] === near);
  if (!src && near.length >= 4) {
    const matches = board.nodes.filter((n) => typeof n['id'] === 'string' && (n['id'] as string).startsWith(near));
    if (matches.length === 1) src = matches[0];
  }
  if (!src) return null;

  const pos = (src['position'] as { x: number; y: number } | undefined) ?? { x: 0, y: 0 };
  const state = (src['state'] as Record<string, unknown> | null | undefined) ?? {};
  let w = typeof state['width'] === 'number' ? state['width'] : 0;
  if (w === 0) {
    switch (src['kind']) {
      case 'text': w = 200; break;
      case 'image': w = 240; break;
      default: w = 280; break;
    }
  }
  return { x: pos.x + w + 24, y: pos.y };
}

export function textAdd(
  text: string | undefined,
  at: { x: number; y: number } | undefined,
  near?: string,
  look?: { kind: string; color?: string },
): SysResult {
  let position = at ?? { x: 0, y: 0 };
  if (near) {
    const nearPos = resolveNearPosition(near);
    if (!nearPos) return { ok: false, message: `text add --near: no node matching "${near}"` };
    position = nearPos;
  }
  const id = newId();
  mutateBoard((board) => {
    board.nodes.push({
      id,
      kind: 'text',
      position,
      isMother: false,
      state: {
        text: text ?? '',
        ...(look ? { look: { kind: look.kind, ...(look.color ? { color: look.color } : {}) } } : {}),
        ...(look && look.kind !== 'note' ? { width: 200, height: look.kind === 'sticky' ? 200 : 140 } : {}),
      },
      config: {},
    });
  });
  return { ok: true, message: `${look && look.kind !== 'note' ? look.kind : 'text'} node added: ${id}`, data: { id } };
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
    // id, a ≥4-char prefix or unique text, like every other ref.
    const target = refIn(board, id, 'text');
    for (const n of board.nodes) {
      if (target !== null && n['id'] === target && n['kind'] === 'text') {
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

/**
 * `text look <id> --note | --sticky | --shape rect|ellipse|diamond [--color c]`
 * — the look bar of a selected note, from the CLI.
 */
export function textLook(
  id: string | undefined,
  look: { kind: string; color?: string } | undefined,
): SysResult {
  if (!id) return { ok: false, message: 'text look requires <id>' };
  if (!look) return { ok: false, message: 'text look requires --note, --sticky, --shape rect|ellipse|diamond or --color <css>' };
  if (look.kind && !(LOOK_KINDS as readonly string[]).includes(look.kind)) {
    return { ok: false, message: `text look: unknown look "${look.kind}" (${LOOK_KINDS.join(', ')})` };
  }
  const patch: Partial<TextLook> = {
    ...(look.kind ? { kind: look.kind as TextLook['kind'] } : {}),
    ...(look.color ? { color: look.color } : {}),
  };
  let found: string | null = null;
  mutateBoard((board) => {
    const target = refIn(board, id, 'text');
    const n = target !== null ? board.nodes.find((x) => x['id'] === target && x['kind'] === 'text') : undefined;
    if (!n) return;
    n['state'] = textSetLook(((n['state'] as TextState | undefined) ?? { text: '' }), patch);
    found = target;
  });
  return found
    ? { ok: true, message: `text node ${id}: look ${look.kind || 'recoloured'}${look.color ? ` ${look.color}` : ''}`, data: { id: found } }
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
  if (w < 1 || h < 1) return { ok: false, message: 'sys text resize: --w and --h must be positive' };
  let found = false;
  mutateBoard((board) => {
    // id, a ≥4-char prefix or unique text, like every other ref.
    const target = refIn(board, id, 'text');
    for (const n of board.nodes) {
      if (target !== null && n['id'] === target && n['kind'] === 'text') {
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
