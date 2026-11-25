// Hold, then drag: how a finger picks something up in KRNL0 (Decision 68,
// first for drag to add, calendar-clock-visuals F93/F94, owner 2026-11-25).
// A finger that moves scrolls the hours, as before; a finger held still for
// HOLD_MS on something you can move, or on empty time, picks it up (a short
// buzz where the device has one). From then on the gesture is KRNL0's
// (ownTouch): the page does not scroll and the canvas does not pan under it,
// and the long-press menu stays shut, until the finger lifts.

import { ownTouch } from '../../ui/touchGesture';

export const HOLD_MS = 450;
/** A finger that moves further than this before the hold fires is a scroll. */
export const HOLD_SLOP_PX = 8;

export interface HoldStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/** Waits for a still finger; calls `onHold` with where it is, or nothing if it moved, lifted or the browser took it.
 *  Returns a function that gives up the wait (unmount). */
export function holdToDraw(start: HoldStart, onHold: (at: { clientX: number; clientY: number }) => void): () => void {
  const id = start.pointerId;
  let x = start.clientX;
  let y = start.clientY;
  let fired = false;
  let release: (() => void) | null = null;

  // The phone's own long-press menu stays shut; KRNL0's own (a hold lifted
  // in place opens the item's menu, calendarDrag.ts) is not the phone's.
  const blockMenu = (ev: Event): void => { if (!ev.isTrusted) return; ev.preventDefault(); ev.stopPropagation(); };
  window.addEventListener('contextmenu', blockMenu, true);

  const finish = (): void => {
    window.removeEventListener('pointerup', lifted, true);
    window.removeEventListener('pointercancel', lifted, true);
    // Android sends its long-press menu around the lift: keep it shut a moment longer.
    window.setTimeout(() => window.removeEventListener('contextmenu', blockMenu, true), 300);
    release?.();
    release = null;
  };
  const stopWaiting = (): void => {
    window.clearTimeout(timer);
    window.removeEventListener('pointermove', moved, true);
  };
  const moved = (ev: PointerEvent): void => {
    if (ev.pointerId !== id) return;
    if (Math.hypot(ev.clientX - start.clientX, ev.clientY - start.clientY) > HOLD_SLOP_PX) { stopWaiting(); finish(); return; }
    x = ev.clientX;
    y = ev.clientY;
  };
  const lifted = (ev: PointerEvent): void => {
    if (ev.pointerId !== id) return;
    stopWaiting();
    finish();
    // After a hold, the mouse events a browser may copy from the lift must not
    // land on the card that has just opened (its backdrop closes on mousedown).
    if (fired) {
      const swallow = (e: Event): void => { e.preventDefault(); e.stopPropagation(); };
      for (const t of ['mousedown', 'mouseup', 'click'] as const) window.addEventListener(t, swallow, true);
      window.setTimeout(() => { for (const t of ['mousedown', 'mouseup', 'click'] as const) window.removeEventListener(t, swallow, true); }, 400);
    }
  };
  const timer = window.setTimeout(() => {
    window.removeEventListener('pointermove', moved, true);
    fired = true;
    release = ownTouch();
    try { navigator.vibrate?.(12); } catch { /* no buzz on this device */ }
    onHold({ clientX: x, clientY: y });
  }, HOLD_MS);

  window.addEventListener('pointermove', moved, true);
  window.addEventListener('pointerup', lifted, true);
  window.addEventListener('pointercancel', lifted, true);
  return () => { stopWaiting(); finish(); };
}
