// sys media — CLI twin of dropping a link on the canvas.
//   media add <url> [--at x,y]   YouTube / Vimeo / … become an embedded player,
//                                other URLs a link card
//   media list [--json]          list media nodes (files dropped in the app too)

import { mutateBoard, readBoardFile } from '../../main/boardIo';
import type { SysResult } from '../SysFacade';
import { classifyUrl } from '../../renderer/components/Canvas/dropMedia';
import { MEDIA_SIZE, type MediaState } from '../../renderer/components/nodes/MediaNode/types';
import { mediaSetPage, mediaSetSize } from '../../renderer/components/nodes/MediaNode/commands';
import { resolveNodeRef } from '../../shared/dispatch/resolveRef';

export function mediaAdd(url: string | undefined, at: { x: number; y: number } | undefined): SysResult {
  if (!url) return { ok: false, message: 'media add requires <url>' };
  const link = classifyUrl(url);
  if (!link) return { ok: false, message: `not an http(s) URL: "${url}"` };
  const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const size = MEDIA_SIZE[link.media];
  const state: MediaState = {
    media: link.media,
    src: link.url,
    title: new URL(link.url).hostname.replace(/^www\./, ''),
    width: size.width,
    height: size.height,
  };
  mutateBoard((board) => {
    board.nodes.push({ id, kind: 'media', position: at ?? { x: 0, y: 900 }, isMother: false, state, config: {} });
  });
  return { ok: true, message: `${link.media} node added: ${id}`, data: { id, media: link.media } };
}

export function mediaList(json: boolean): SysResult {
  const board = readBoardFile();
  const rows = (board?.nodes ?? [])
    .filter((n) => n.kind === 'media')
    .map((n) => {
      const s = n.state as MediaState;
      return { id: n.id, media: s.media, title: s.title, src: s.src };
    });
  if (json) return { ok: true, message: JSON.stringify(rows), data: rows };
  if (rows.length === 0) return { ok: true, message: 'no media on the board', data: rows };
  return { ok: true, message: rows.map((r) => `  ${r.id}  ${r.media.padEnd(6)} ${r.title}`).join('\n'), data: rows };
}

/** One media node by id / 4+ char prefix. */
function findMedia(board: { nodes: Array<Record<string, unknown>> }, ref: string): Record<string, unknown> | null {
  const media = board.nodes.filter((n) => n['kind'] === 'media');
  const r = resolveNodeRef(board as never, ref, 'media');
  const id = 'id' in r ? r.id : null;
  return id ? media.find((n) => n['id'] === id) ?? null : null;
}

/** `media resize <id> --w N --h N` */
export function mediaResize(ref: string | undefined, w: number | undefined, h: number | undefined): SysResult {
  if (!ref) return { ok: false, message: 'media resize requires <id>' };
  if (!w || !h || w <= 0 || h <= 0) return { ok: false, message: 'media resize requires positive --w N --h N' };
  let done = false;
  mutateBoard((board) => {
    const n = findMedia(board, ref);
    if (!n) return;
    n['state'] = mediaSetSize(n['state'] as MediaState, { width: w, height: h });
    done = true;
  });
  return done ? { ok: true, message: `media ${ref} resized to ${Math.round(w)}×${Math.round(h)}` } : { ok: false, message: `no media node "${ref}"` };
}

/** `media page <id> <n>` — which page a PDF card shows. */
export function mediaPage(ref: string | undefined, page: number | undefined): SysResult {
  if (!ref) return { ok: false, message: 'media page requires <id>' };
  if (page === undefined || page < 1) return { ok: false, message: 'media page requires a page number (1 or more)' };
  let msg: string | null = null;
  mutateBoard((board) => {
    const n = findMedia(board, ref);
    if (!n) return;
    const st = n['state'] as MediaState;
    if (st.media !== 'pdf') { msg = `media ${ref} is a ${st.media}, not a PDF`; return; }
    n['state'] = mediaSetPage(st, { page });
    msg = '';
  });
  if (msg === null) return { ok: false, message: `no media node "${ref}"` };
  return msg ? { ok: false, message: msg } : { ok: true, message: `media ${ref}: page ${page}` };
}
