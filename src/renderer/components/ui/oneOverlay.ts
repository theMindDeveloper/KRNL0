/**
 * One overlay at a time (the owner's rule): a right-click menu, an info card,
 * the event card, a picker list. When one opens, the one that was open
 * closes, wherever it is in the app. Pickers inside a card (a time field's
 * list) are part of that card and do not take part.
 */
import { useLayoutEffect, useRef } from 'react';

let current: { id: number; close: () => void } | null = null;
let next = 1;

/** Takes the screen for an overlay (closing the one before); returns its release. */
export function claimOverlay(close: () => void): () => void {
  const id = next++;
  const before = current;
  current = { id, close };
  if (before) before.close();
  return () => { if (current?.id === id) current = null; };
}

/** While `open`, this overlay is the one on screen. */
export function useOneOverlay(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    if (!open) return undefined;
    return claimOverlay(() => closeRef.current());
  }, [open]);
}
