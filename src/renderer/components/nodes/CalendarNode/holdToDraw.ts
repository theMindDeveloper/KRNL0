// F93 / F94 on a touch screen (owner, 2026-11-25: "why doesn't it work on
// mobile with touch?"). A finger that moves scrolls the hours, as before; a
// finger held still on empty time for HOLD_MS starts drag to add there, like a
// phone calendar. One helper for the Calendar and the Clock.
//
// While the hold waits nothing is stopped, so a swipe scrolls at once. Once it
// fires, the page may no longer scroll under the finger (touchmove is stopped)
// and the long-press menu (Android's contextmenu, the iOS callout) stays shut
// until the finger lifts, so the box follows the finger and nothing else opens.

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

  const blockMenu = (ev: Event): void => { ev.preventDefault(); ev.stopPropagation(); };
  const blockScroll = (ev: TouchEvent): void => { if (fired && ev.cancelable) ev.preventDefault(); };
  window.addEventListener('contextmenu', blockMenu, true);
  window.addEventListener('touchmove', blockScroll, { passive: false });

  const release = (): void => {
    window.removeEventListener('pointerup', lifted, true);
    window.removeEventListener('pointercancel', lifted, true);
    // Android sends its long-press menu around the lift: keep it shut a moment longer.
    window.setTimeout(() => window.removeEventListener('contextmenu', blockMenu, true), 300);
    window.removeEventListener('touchmove', blockScroll);
  };
  const stopWaiting = (): void => {
    window.clearTimeout(timer);
    window.removeEventListener('pointermove', moved, true);
  };
  const moved = (ev: PointerEvent): void => {
    if (ev.pointerId !== id) return;
    if (Math.hypot(ev.clientX - start.clientX, ev.clientY - start.clientY) > HOLD_SLOP_PX) { stopWaiting(); release(); return; }
    x = ev.clientX;
    y = ev.clientY;
  };
  const lifted = (ev: PointerEvent): void => {
    if (ev.pointerId !== id) return;
    stopWaiting();
    release();
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
    try { navigator.vibrate?.(12); } catch { /* no buzz on this device */ }
    onHold({ clientX: x, clientY: y });
  }, HOLD_MS);

  window.addEventListener('pointermove', moved, true);
  window.addEventListener('pointerup', lifted, true);
  window.addEventListener('pointercancel', lifted, true);
  return () => { stopWaiting(); release(); };
}
