// MediaNode — anything dropped on the canvas that isn't a still image:
// video, audio, PDF, an embeddable link (YouTube, Vimeo, SoundCloud, …) or a
// plain web link. Files live in the asset store (krnl-asset://<id>); links
// keep their URL.

export type MediaKind = 'video' | 'audio' | 'pdf' | 'embed' | 'link';

export interface MediaState {
  media: MediaKind;
  /** Asset id (video / audio / pdf) or URL (embed / link). */
  src: string;
  title: string;
  width?: number;
  height?: number;
  /** PDF: current page (1-based). */
  page?: number;
}

export type MediaConfig = Record<string, never>;

export const MEDIA_SIZE: Record<MediaKind, { width: number; height: number }> = {
  video: { width: 480, height: 300 },
  embed: { width: 480, height: 300 },
  audio: { width: 360, height: 110 },
  pdf: { width: 420, height: 560 },
  link: { width: 320, height: 96 },
};

/** URL the player / viewer loads. */
export function mediaUrl(s: Pick<MediaState, 'media' | 'src'>): string {
  return s.media === 'embed' || s.media === 'link' ? s.src : `krnl-asset://${s.src.toLowerCase()}`;
}
