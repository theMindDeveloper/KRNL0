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

/** Closes whatever overlay is on screen (a long-press menu the finger moved on from). */
export function closeCurrentOverlay(): void {
  const c = current;
  current = null;
  c?.close();
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

/**
 * A right-click on a card's backdrop: the card closes and the right-click
 * reaches what is under it, so one right-click opens that menu (it took two).
 */
export function passRightClick(e: { preventDefault: () => void; currentTarget: EventTarget; clientX: number; clientY: number }, close: () => void): void {
  e.preventDefault();
  const backdrop = e.currentTarget as Element;
  close();
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return;
  const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el !== backdrop && !backdrop.contains(el));
  under?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: 2 }));
}
