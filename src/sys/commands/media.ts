// sys media — CLI twin of dropping a link on the canvas.
//   media add <url> [--at x,y]   YouTube / Vimeo / … become an embedded player,
//                                other URLs a link card
//   media list [--json]          list media nodes (files dropped in the app too)

import { mutateBoard, readBoardFile } from '../../main/boardIo';
import type { SysResult } from '../SysFacade';
import { classifyUrl } from '../../renderer/components/Canvas/dropMedia';
import { MEDIA_SIZE, type MediaState } from '../../renderer/components/nodes/MediaNode/types';

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
