import type { ImageState } from './types';

export function imageSetAsset(
  s: ImageState,
  args: {
    assetId: string;
    naturalWidth: number;
    naturalHeight: number;
    mimeType: string;
    alt?: string;
  },
): ImageState {
  return {
    ...s,
    assetId: args.assetId,
    naturalWidth: args.naturalWidth,
    naturalHeight: args.naturalHeight,
    mimeType: args.mimeType,
    ...(args.alt !== undefined ? { alt: args.alt } : {}),
    // Clear legacy field so it doesn't shadow the new asset on next render.
    src: null,
  };
}

export function imageSetSize(
  s: ImageState,
  args: { width: number; height: number },
): ImageState {
  return {
    ...s,
    width: Math.round(args.width),
    height: Math.round(args.height),
  };
}

export function imageSetAlt(s: ImageState, args: { alt: string }): ImageState {
  return { ...s, alt: args.alt };
}

export function imageClear(s: ImageState): ImageState {
  return {
    ...s,
    assetId: null,
    naturalWidth: null,
    naturalHeight: null,
    mimeType: null,
  };
}
