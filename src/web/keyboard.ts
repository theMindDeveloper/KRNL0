// The on-screen keyboard (owner, 2026-11-25: "when I add something the
// keyboard overlaps with the pop-up on mobile and even on iPad"). Phones and
// iPads lay the keyboard over the page; the browser only says how much of the
// screen is still visible (visualViewport). Two answers, both live:
//   - `--kb-inset` on the root: the keyboard's height (0 when it is down).
//     The web app's shell ends above it (mobile.css), so a field at the
//     bottom of a window ("add a plan") stays in sight.
//   - a card floating over the page (the drag card, an event card, a menu)
//     that holds the field being typed in moves up until the field, and as
//     much of the card as fits, is above the keyboard; it moves back when
//     the keyboard goes.

const FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
/** Less than this is a toolbar or a rounding, not a keyboard. */
const MIN_KEYBOARD = 80;

/** The nearest floating card around a field (position: fixed), not the app's own shell. */
function floatingCardOf(el: Element): HTMLElement | null {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (!(n instanceof HTMLElement) || n.classList.contains('m-shell')) continue;
    if (getComputedStyle(n).position === 'fixed') return n;
  }
  return null;
}

export function installKeyboardLift(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => undefined;
  const root = win.document.documentElement;
  let lifted: HTMLElement | null = null;
  const drop = (): void => { if (lifted) { lifted.style.translate = ''; lifted = null; } };

  const update = (): void => {
    const kb = Math.max(0, win.innerHeight - vv.height - vv.offsetTop);
    const up = kb >= MIN_KEYBOARD;
    root.style.setProperty('--kb-inset', up ? `${Math.round(kb)}px` : '0px');
    const active = win.document.activeElement;
    const field = up && active instanceof HTMLElement && active.matches(FIELD) ? active : null;
    const card = field ? floatingCardOf(field) : null;
    if (lifted && lifted !== card) drop();
    if (!field || !card) { drop(); return; }
    card.style.translate = '';
    const bottom = vv.offsetTop + vv.height - 12;
    const top = vv.offsetTop + 8;
    const box = card.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    // As much of the card as fits, and always the field.
    let shift = Math.max(0, Math.min(box.bottom - bottom, box.top - top));
    shift = Math.max(shift, f.bottom - bottom);
    if (shift > 0) { card.style.translate = `0 ${-Math.round(shift)}px`; lifted = card; }
  };

  let t = 0;
  // KRNL0's fields name plans and time, never people: the phone's "AutoFill
  // Contact" bar (owner screenshot, 2026-11-25) has nothing to offer there. A
  // field that says what it wants (email, password) keeps its own setting.
  const noContactFill = (e: FocusEvent): void => {
    const el = e.target;
    if ((el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search' || el.type === '')) || el instanceof HTMLTextAreaElement) {
      if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
    }
  };
  const later = (): void => { win.clearTimeout(t); t = win.setTimeout(update, 60); };
  win.document.addEventListener('focusin', noContactFill, true);
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  win.document.addEventListener('focusin', later);
  win.document.addEventListener('focusout', later);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    win.document.removeEventListener('focusin', later);
    win.document.removeEventListener('focusout', later);
    win.document.removeEventListener('focusin', noContactFill, true);
    win.clearTimeout(t);
    drop();
    root.style.removeProperty('--kb-inset');
  };
}
