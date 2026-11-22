/**
 * Decision 63 (performance) — run `fn` once the frame being prepared is on
 * screen. A drop is drawn where it lands first; the board change (which
 * redraws every window) comes after it, so the screen never freezes on the
 * old picture. A hidden or minimised window draws no frames: a short timer
 * makes sure `fn` still runs (a drop is never left waiting, or lost).
 */
export function afterPaint(fn: () => void): void {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { setTimeout(run, 0); });
  setTimeout(run, 100);
}
