// One highlight for the whole app: a ring drawn on a layer above the screen,
// shaped like the thing it points at (same rounded corners, following it while
// the canvas moves). The highlighted element itself is never restyled — no
// box-shadow on it, no square wrapper corners. Used by Show (the eye), the
// Calendar reveal and `krnl show` (the agent pointing at something while it
// explains).

import { Z } from '../components/ui/layers';

const RING_CLASS = 'krnl-highlight';

export interface HighlightOptions {
  /** A short line under the ring ("This is where your plan sits"). */
  note?: string | undefined;
  /** How long it stays, in ms (default 2.4 s; a note keeps it 6 s). */
  ms?: number | undefined;
}

/** The element that carries the visible shape: the first one with rounded corners. */
function shapeOf(el: HTMLElement): HTMLElement {
  let cur: HTMLElement = el;
  for (let depth = 0; depth < 4; depth++) {
    if (parseFloat(getComputedStyle(cur).borderTopLeftRadius) > 0) return cur;
    // Step into the child that fills the parent (the card inside a wrapper,
    // next to small things like connection handles).
    const a = cur.getBoundingClientRect();
    const fill = Array.from(cur.children).find((c): c is HTMLElement => {
      if (!(c instanceof HTMLElement)) return false;
      const b = c.getBoundingClientRect();
      return Math.abs(a.width - b.width) <= 4 && Math.abs(a.height - b.height) <= 4;
    });
    if (!fill) break;
    cur = fill;
  }
  return el;
}

function reducedMotion(): boolean {
  return document.documentElement.getAttribute('data-motion') === 'reduced'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Draw the ring around `target`. Returns a function that removes it. */
export function highlightElement(target: HTMLElement, opts: HighlightOptions = {}): () => void {
  const el = shapeOf(target);
  const ms = opts.ms ?? (opts.note ? 6000 : 2400);
  const pad = 4;
  const ring = document.createElement('div');
  ring.className = RING_CLASS;
  ring.setAttribute('data-testid', 'krnl-highlight');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: String(Z.tour),
    border: '2px solid var(--acid)',
    boxShadow: '0 0 0 4px color-mix(in srgb, var(--acid) 22%, transparent)',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  let label: HTMLDivElement | null = null;
  if (opts.note) {
    label = document.createElement('div');
    label.className = `${RING_CLASS}-note`;
    label.setAttribute('data-testid', 'krnl-highlight-note');
    label.textContent = opts.note;
    Object.assign(label.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: String(Z.tour),
      maxWidth: '280px',
      padding: '6px 10px',
      borderRadius: '8px',
      background: 'var(--ink)',
      color: 'var(--paper)',
      fontFamily: 'var(--font-sans)',
      fontSize: '12px',
      lineHeight: '17px',
      boxShadow: '0 6px 18px rgba(0,0,0,.28)',
    } satisfies Partial<CSSStyleDeclaration>);
  }
  document.body.appendChild(ring);
  if (label) document.body.appendChild(label);

  let alive = true;
  const remove = () => {
    if (!alive) return;
    alive = false;
    ring.remove();
    label?.remove();
  };
  const place = () => {
    if (!alive) return;
    if (!el.isConnected) { remove(); return; }
    const r = el.getBoundingClientRect();
    // Canvas zoom scales the drawn corners; computed style is unscaled.
    const scale = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) * scale || 0;
    ring.style.left = `${r.left - pad}px`;
    ring.style.top = `${r.top - pad}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;
    ring.style.borderRadius = `${radius + pad}px`;
    if (label) {
      const lw = label.offsetWidth;
      const lh = label.offsetHeight;
      const below = r.bottom + pad + 8;
      const top = below + lh > window.innerHeight - 8 ? Math.max(8, r.top - pad - 8 - lh) : below;
      label.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - lw - 8))}px`;
      label.style.top = `${top}px`;
    }
    requestAnimationFrame(place);
  };
  place();

  if (!reducedMotion()) {
    ring.animate([{ opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }], { duration: 800, iterations: Math.max(1, Math.round(ms / 800)), easing: 'ease-in-out' });
  }
  window.setTimeout(remove, ms);
  return remove;
}

/** Remove every highlight on screen. */
export function clearHighlights(): void {
  document.querySelectorAll(`.${RING_CLASS}, .${RING_CLASS}-note`).forEach((n) => n.remove());
}

/** The drawn element of a node: a mother window's frame or a canvas card. */
export function nodeElement(nodeId: string): HTMLElement | null {
  const id = CSS.escape(nodeId);
  return document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
    ?? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
}
