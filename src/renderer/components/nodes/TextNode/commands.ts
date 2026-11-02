import type { TextLook, TextState } from './types';
import { LOOK_KINDS } from './types';

/** Change a note into a sticky / shape (or back), and/or its colour. */
export function textSetLook(s: TextState, args: Partial<TextLook>): TextState {
  const kind = args.kind && LOOK_KINDS.includes(args.kind) ? args.kind : (s.look?.kind ?? 'note');
  const color = args.color ?? s.look?.color;
  if (kind === 'note' && !color) {
    const { look: _drop, ...rest } = s;
    void _drop;
    return rest;
  }
  return { ...s, look: { kind, ...(color ? { color } : {}) } };
}

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
