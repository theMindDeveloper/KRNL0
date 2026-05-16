import type { FrameState, FrameConfig, FrameTint } from './types';

export function frameSetLabel(s: FrameState, args: { label: string }): FrameState {
  return { ...s, label: args.label };
}

export function frameSetSize(
  s: FrameState,
  args: { width: number; height: number },
): FrameState {
  return {
    ...s,
    width: Math.round(args.width),
    height: Math.round(args.height),
  };
}

export function frameSetChildren(
  s: FrameState,
  args: { childIds: string[] },
): FrameState {
  return { ...s, childIds: [...args.childIds] };
}

export function frameSetTint(
  c: FrameConfig,
  args: { tint: FrameTint },
): FrameConfig {
  return { ...c, tint: args.tint };
}
