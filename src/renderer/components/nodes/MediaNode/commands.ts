import type { MediaState } from './types';

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
