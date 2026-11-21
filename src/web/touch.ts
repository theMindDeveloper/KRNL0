// Touch screens in the web app (Decision 51, Decision 56). The board's
// windows put row actions (edit, delete, move, colour…) on right-click, as
// the desktop does. On a touch screen a long-press (≈ half a second, finger
// still) is that right-click, at the finger, and nothing else:
//
//   - one menu: the phone's own long-press menu (Android sends its own
//     right-click) is dropped while a finger is down and just after ours;
//   - no text selection: nothing starts selecting while a finger is down,
//     and anything the phone selected anyway is cleared when the menu opens
//     (web.css also makes UI text unselectable on touch screens);
//   - no tap: the lift that ends a long-press is not a tap, and the click a
//     phone may still send after it is dropped, so it never picks a row of
//     the menu that just opened under the finger.
//
// Fields keep the system's own long-press (select, paste). A second finger
// (a pinch) or a move cancels it.

export const HOLD_MS = 480;
export const SLOP_PX = 10;
/** How long after a long-press the phone's own right-click and click are dropped. */
const AFTER_MS = 900;

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-selectable], .xterm';

export function installLongPressMenu(doc: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; target: EventTarget } | null = null;
  let fingerDown = false;
  let fired = false;
  /** Until when the phone's own right-click is dropped and text cannot be selected. */
  let swallowUntil = 0;
  /** Where and when the finger lifted after a long-press: a click there is not a tap. */
  let lift: { x: number; y: number; until: number } | null = null;

  const now = (): number => Date.now();
  const clear = (): void => { if (timer) clearTimeout(timer); timer = null; start = null; };
  const inField = (t: EventTarget | null): boolean => t instanceof Element && t.closest(EDITABLE) !== null;
  const clearSelection = (): void => {
    const sel = doc.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    // A caret in a field is not a selection to clear.
    if (inField(sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement ?? null)) return;
    sel.removeAllRanges();
  };

  const onStart = (e: TouchEvent): void => {
    clear();
    fired = false;
    lift = null;
    fingerDown = e.touches.length > 0;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    const target = e.target;
    if (inField(target)) return;
    start = { x: t.clientX, y: t.clientY, target: target ?? doc };
    timer = setTimeout(() => {
      if (!start) return;
      fired = true;
      swallowUntil = now() + AFTER_MS;
      clearSelection();
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2, buttons: 2, view: doc.defaultView });
      start.target.dispatchEvent(ev);
      timer = null;
    }, HOLD_MS);
  };

  const onMove = (e: TouchEvent): void => {
    if (!start) return;
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP_PX) clear();
  };

  const onEnd = (e: TouchEvent): void => {
    const at = start;
    clear();
    fingerDown = e.touches.length > 0;
    // The lift after a long-press is not a tap on what is under the finger.
    if (fired) {
      if (e.cancelable) e.preventDefault();
      clearSelection();
      swallowUntil = now() + AFTER_MS;
      const t = e.changedTouches?.[0];
      const x = t?.clientX ?? at?.x;
      const y = t?.clientY ?? at?.y;
      lift = x !== undefined && y !== undefined ? { x, y, until: now() + AFTER_MS } : null;
      fired = false;
    }
  };

  const onCancel = (e: TouchEvent): void => { clear(); fingerDown = e.touches.length > 0; };

  // The phone's own right-click (Android sends one on a long-press, sometimes
  // before ours): dropped while a finger is down and just after ours. Ours is
  // synthetic (not trusted) and always goes through.
  const onNativeMenu = (e: MouseEvent): void => {
    if (!e.isTrusted || inField(e.target)) return;
    if (fingerDown || now() < swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  };

  // The click some phones still send for the lift, at the finger, is dropped
  // (it would pick the menu row that just opened under it). A tap anywhere
  // else, even right away, goes through.
  const onClick = (e: MouseEvent): void => {
    if (!e.isTrusted || !lift) return;
    const near = Math.hypot(e.clientX - lift.x, e.clientY - lift.y) <= 2 * SLOP_PX;
    if (now() < lift.until && near) { e.preventDefault(); e.stopImmediatePropagation(); }
    lift = null;
  };

  // Nothing starts selecting while a finger is down, outside fields.
  const onSelectStart = (e: Event): void => {
    if ((fingerDown || now() < swallowUntil) && !inField(e.target instanceof Node ? (e.target instanceof Element ? e.target : e.target.parentElement) : null)) e.preventDefault();
  };

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  doc.addEventListener('touchstart', onStart, opts);
  doc.addEventListener('touchmove', onMove, opts);
  doc.addEventListener('touchcancel', onCancel, opts);
  doc.addEventListener('touchend', onEnd, { capture: true, passive: false });
  doc.addEventListener('contextmenu', onNativeMenu, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('selectstart', onSelectStart, true);
  return () => {
    clear();
    doc.removeEventListener('touchstart', onStart, opts);
    doc.removeEventListener('touchmove', onMove, opts);
    doc.removeEventListener('touchcancel', onCancel, opts);
    doc.removeEventListener('touchend', onEnd, { capture: true });
    doc.removeEventListener('contextmenu', onNativeMenu, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('selectstart', onSelectStart, true);
  };
}
