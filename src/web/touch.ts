// Touch screens in the web app (Decision 51). The board's windows put row
// actions (edit, delete, move, colour…) on right-click, as the desktop does.
// Android turns a long-press into a right-click by itself; iPhone and iPad do
// not. So on a touch screen a long-press (≈ half a second, finger still)
// sends the same right-click, at the finger, and the lift that ends it is not
// also a tap. Android's own long-press then adds nothing (one menu, not two).

const HOLD_MS = 480;
const SLOP_PX = 10;

export function installLongPressMenu(doc: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; target: EventTarget } | null = null;
  let fired = false;
  let swallowNative = 0;

  const clear = (): void => { if (timer) clearTimeout(timer); timer = null; start = null; };

  const onStart = (e: TouchEvent): void => {
    clear();
    fired = false;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    const target = e.target;
    // Fields keep the system's own long-press (select, paste).
    if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
    start = { x: t.clientX, y: t.clientY, target: target ?? doc };
    timer = setTimeout(() => {
      if (!start) return;
      fired = true;
      swallowNative = Date.now() + 1200;
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2, buttons: 2, view: doc.defaultView });
      start.target.dispatchEvent(ev);
      timer = null;
    }, HOLD_MS);
  };

  const onMove = (e: TouchEvent): void => {
    if (!start) return;
    const t = e.touches[0];
    if (!t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP_PX) clear();
  };

  const onEnd = (e: TouchEvent): void => {
    clear();
    // The lift after a long-press is not a tap on what is under the finger.
    if (fired) { e.preventDefault(); fired = false; }
  };

  // Android's own long-press right-click, right after ours: drop it.
  const onNativeMenu = (e: MouseEvent): void => {
    if (e.isTrusted && Date.now() < swallowNative) { e.preventDefault(); e.stopPropagation(); }
  };

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  doc.addEventListener('touchstart', onStart, opts);
  doc.addEventListener('touchmove', onMove, opts);
  doc.addEventListener('touchcancel', clear as EventListener, opts);
  doc.addEventListener('touchend', onEnd, { capture: true, passive: false });
  doc.addEventListener('contextmenu', onNativeMenu, true);
  return () => {
    clear();
    doc.removeEventListener('touchstart', onStart, opts);
    doc.removeEventListener('touchmove', onMove, opts);
    doc.removeEventListener('touchcancel', clear as EventListener, opts);
    doc.removeEventListener('touchend', onEnd, { capture: true });
    doc.removeEventListener('contextmenu', onNativeMenu, true);
  };
}
