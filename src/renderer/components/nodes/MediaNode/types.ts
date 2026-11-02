// MediaNode — anything dropped on the canvas that isn't a still image:
// video, audio, PDF, an embeddable link (YouTube, Vimeo, SoundCloud, …) or a
// plain web link. Files live in the asset store (krnl-asset://<id>); links
// keep their URL.

export type MediaKind = 'video' | 'audio' | 'pdf' | 'embed' | 'link' | 'file';

export interface MediaState {
  media: MediaKind;
  /** Asset id (video / audio / pdf) or URL (embed / link). */
  src: string;
  title: string;
  width?: number;
  height?: number;
  /** PDF: current page (1-based). */
  page?: number;
  /** Dropped files: size in bytes (shown on the card). */
  size?: number;
  /** Content width / height (video frame, PDF page). The card keeps it. */
  aspect?: number;
}

/** Card chrome around the content: header + bottom margin, side margins. */
export const MEDIA_CHROME = { v: 42, h: 12 };

/** Card height that fits `aspect` at `width`. */
export function heightForAspect(width: number, aspect: number): number {
  return Math.round((width - MEDIA_CHROME.h) / aspect + MEDIA_CHROME.v);
}

export type MediaConfig = Record<string, never>;

export const MEDIA_SIZE: Record<MediaKind, { width: number; height: number }> = {
  video: { width: 480, height: 300 },
  // 16:9 players: (480 - 12) / (16/9) + 42
  embed: { width: 480, height: 305 },
  audio: { width: 360, height: 110 },
  pdf: { width: 420, height: 560 },
  link: { width: 420, height: 300 },
  file: { width: 280, height: 120 },
};

/** URL the player / viewer loads. */
export function mediaUrl(s: Pick<MediaState, 'media' | 'src'>): string {
  if (s.media === 'embed') return cleanEmbedUrl(s.src);
  return s.media === 'link' ? s.src : `krnl-asset://${s.src.toLowerCase()}`;
}

/**
 * A YouTube link copied from a Mix / playlist (`watch?v=…&list=RD…&start_radio=1`)
 * won't play in an embed: auto-generated Mix playlists are not embeddable, so
 * the player stays black. Keep just the video (and its start time).
 */
export function cleanEmbedUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return raw;
  const v = u.searchParams.get('v');
  if (!v && u.hostname.endsWith('youtube.com')) return raw; // a real playlist / channel page
  const t = u.searchParams.get('t') ?? u.searchParams.get('start');
  for (const k of [...u.searchParams.keys()]) if (k !== 'v') u.searchParams.delete(k);
  if (t) u.searchParams.set('t', t);
  return u.href;
}
