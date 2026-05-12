import type { TextState } from './types';

export function textSetText(s: TextState, args: { text: string }): TextState {
  return { ...s, text: args.text };
}

export function textSetSize(
  s: TextState,
  args: { width: number; height: number },
): TextState {
  return {
    ...s,
    width: Math.round(args.width),
    height: Math.round(args.height),
  };
}
