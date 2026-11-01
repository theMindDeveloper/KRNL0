/**
 * transition.ts — ADR 0009 look-switch choreography.
 *
 * Light/dark and frame-style switches repaint every surface at once. Done
 * instantly, text flashes through unreadable in-between states (old ink on
 * new paper). Wrapping the DOM update in a View Transition swaps the whole
 * frame in one step and reveals the new look as a circle growing from the
 * pointer that triggered it.
 *
 * Falls back to a plain synchronous update when the API is missing (tests,
 * older Chromium) or the user asked for reduced motion.
 */

interface ViewTransitionLike {
  finished: Promise<void>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

let lastPointer: { x: number; y: number } | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true },
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Run `update` (which must change the DOM synchronously) inside a reveal. */
export function runLookTransition(update: () => void): void {
  const start = (typeof document !== 'undefined'
    ? (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition
    : undefined);
  if (!start || prefersReducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  const x = lastPointer?.x ?? window.innerWidth / 2;
  const y = lastPointer?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty('--krnl-vt-x', `${x}px`);
  root.style.setProperty('--krnl-vt-y', `${y}px`);
  root.style.setProperty('--krnl-vt-r', `${Math.ceil(r)}px`);
  root.setAttribute('data-look-switching', '');
  try {
    const vt = start.call(document, update);
    void vt.finished.finally(() => root.removeAttribute('data-look-switching'));
  } catch {
    root.removeAttribute('data-look-switching');
    update();
  }
}
