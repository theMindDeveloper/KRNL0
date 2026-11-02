// Drop anything on the canvas: decide what a dropped file or link becomes.
//   image file              → ImageNode (existing pipeline, dropImage.ts)
//   video / audio / PDF     → MediaNode, bytes stored in the asset store
//   YouTube / Vimeo / … URL → MediaNode 'embed' (react-player can play it)
//   other http(s) URL       → MediaNode 'link'

import type { MediaKind } from '../nodes/MediaNode/types';

const EXT_KIND: Record<string, Exclude<MediaKind, 'embed' | 'link' | 'file'>> = {
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
  pdf: 'pdf',
};

export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** What a dropped file becomes. Exported for tests. */
export function classifyFile(file: { name: string; type: string }): 'image' | Exclude<MediaKind, 'embed' | 'link'> {
  const ext = fileExt(file.name);
  // Extension first: Windows often reports .mov / .wav with an empty or odd MIME.
  if (EXT_KIND[ext]) return EXT_KIND[ext]!;
  if (file.type.startsWith('image/') && ext !== 'heic') return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  // Anything else becomes a file card (download).
  return 'file';
}

const EMBED_HOSTS = [
  /(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/, /(^|\.)vimeo\.com$/, /(^|\.)soundcloud\.com$/,
  /(^|\.)twitch\.tv$/, /(^|\.)dailymotion\.com$/, /(^|\.)wistia\.(com|net)$/, /(^|\.)mixcloud\.com$/,
];

/** What a dropped URL becomes. Exported for tests. */
export function classifyUrl(raw: string): { media: 'embed' | 'link'; url: string } | null {
  const text = raw.trim().split(/\r?\n/).find((l) => l && !l.startsWith('#')) ?? '';
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (EMBED_HOSTS.some((re) => re.test(u.hostname))) return { media: 'embed', url: u.href };
  const kind = EXT_KIND[fileExt(u.pathname)];
  // Direct video / audio file links play in the same player.
  if (kind === 'video' || kind === 'audio') return { media: 'embed', url: u.href };
  return { media: 'link', url: u.href };
}
