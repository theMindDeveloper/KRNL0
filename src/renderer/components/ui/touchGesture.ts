// One touch rule for every window (Decision 68; issues #305, #306, #307).
//
// KRNL0's windows were built for a mouse: a press starts a drag. With a finger
// the browser and the canvas decide first what a gesture is (scroll the page,
// pan or pinch the canvas, zoom the page) and take it away, so a plan would not
// move and the view moved instead. The rule:
//   - a finger that moves at once scrolls, as before;
//   - a finger held still on something you can move (or on empty time, to
//     draw) picks it up (holdToDraw); from then on the gesture is KRNL0's:
//     the page does not scroll, the canvas does not pan or zoom, the page does
//     not zoom, until the finger lifts;
//   - two fingers on a window zoom that window only (it calls ownTouch too).
//
// The guard is one listener on the window, installed once and never removed
// (Safari decides whether a touch may scroll from the listeners it sees when
// the touch begins, so one added mid-gesture could come too late).

let owners = 0;
let installed = false;

/** Whether a KRNL0 gesture has the finger right now. */
export function isTouchOwned(): boolean {
  return owners > 0;
}

/** Takes the touch until the returned release is called (once). */
export function ownTouch(): () => void {
  installTouchGuard();
  owners += 1;
  let done = false;
  return () => { if (!done) { done = true; owners = Math.max(0, owners - 1); } };
}

/** The window-wide guard (idempotent). */
export function installTouchGuard(win: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (installed || !win) return;
  installed = true;
  // Capture, on the window: before the canvas (React Flow's d3-zoom listens on
  // its pane) and before the browser's own scroll or pinch.
  const stop = (e: Event): void => {
    if (owners === 0) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  };
  win.addEventListener('touchmove', stop, { capture: true, passive: false });
  // Safari's own pinch-to-zoom of the page.
  for (const t of ['gesturestart', 'gesturechange']) win.addEventListener(t, stop, { capture: true, passive: false });
}

/** Tests: forget every owner. */
export function resetTouchOwners(): void {
  owners = 0;
}
