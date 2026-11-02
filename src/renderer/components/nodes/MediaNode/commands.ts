import type { MediaState } from './types';
import { MEDIA_SIZE, heightForAspect } from './types';

/** Fit the card to its content's shape (keeps the width). */
export function mediaSetAspect(s: MediaState, args: { aspect: number }): MediaState {
  const a = args?.aspect;
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0.1 || a > 10) return s;
  if (s.aspect !== undefined && Math.abs(s.aspect - a) < 0.005) return s;
  const width = s.width ?? MEDIA_SIZE[s.media].width;
  return { ...s, aspect: a, width, height: heightForAspect(width, a) };
}

export function mediaSetPage(s: MediaState, args: { page: number }): MediaState {
  if (typeof args.page !== 'number' || !Number.isFinite(args.page)) return s;
  return { ...s, page: Math.max(1, Math.round(args.page)) };
}

export function mediaSetSize(s: MediaState, args: { width: number; height: number }): MediaState {
  return { ...s, width: Math.round(args.width), height: Math.round(args.height) };
}

export function mediaSetTitle(s: MediaState, args: { title: string }): MediaState {
  return typeof args.title === 'string' ? { ...s, title: args.title } : s;
}
