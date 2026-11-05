// Swapping two windows by dragging (Station panels and canvas mothers share
// this). The browser's drag carries only what we hand it, so without help it
// shows just the small grip. Here:
//   - the drag carries a mini snapshot of the whole window,
//   - the window you picked up dims with a dashed outline,
//   - the window under the pointer lights up with "Swap here",
//   - on drop both windows settle into their new places with a short pop.
// Motion is transform / opacity only, and off with prefers-reduced-motion.

export const MOTHER_DRAG_MIME = 'application/x-krnl0-mother';

const PREVIEW_W = 260;
const PREVIEW_MAX_H = 220;

function frameOf(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.mother-frame[data-tour="${CSS.escape(nodeId)}"]`);
}

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A small picture of the window to carry under the pointer. */
function buildPreview(frame: HTMLElement): HTMLElement {
  const w = frame.offsetWidth || 1;
  const h = frame.offsetHeight || 1;
  const s = PREVIEW_W / w;
  const wrap = document.createElement('div');
  wrap.className = 'krnl-mother-drag-preview';
  Object.assign(wrap.style, {
    position: 'fixed', left: '-10000px', top: '-10000px',
    width: `${PREVIEW_W}px`, height: `${Math.min(PREVIEW_MAX_H, Math.round(h * s))}px`,
    overflow: 'hidden', borderRadius: '10px', pointerEvents: 'none',
    border: '2px solid var(--acid)', background: 'var(--node-bg, var(--paper))',
  } satisfies Partial<CSSStyleDeclaration>);
  const clone = frame.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-tour'); // never found by tours or drop code
  clone.removeAttribute('data-mother-dragging');
  clone.removeAttribute('data-drop-target');
  Object.assign(clone.style, {
    width: `${w}px`, height: `${h}px`, transform: `scale(${s})`, transformOrigin: 'top left', margin: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  wrap.appendChild(clone);
  return wrap;
}

/** Start dragging a window (the grip's dragstart). */
export function startMotherDrag(e: React.DragEvent, nodeId: string): void {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(MOTHER_DRAG_MIME, nodeId);
  const frame = frameOf(nodeId);
  if (!frame) return;
  try {
    const preview = buildPreview(frame);
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, PREVIEW_W / 2, 18);
    // The browser has taken its picture by the next task.
    setTimeout(() => preview.remove(), 0);
  } catch {
    /* no preview: the default drag image still works */
  }
  // Mark the source after the picture is taken, so the preview isn't dimmed.
  requestAnimationFrame(() => { frame.dataset.motherDragging = 'true'; });
  document.body.dataset.motherDrag = 'true';
}

let currentTarget: HTMLElement | null = null;

function unmark(el: HTMLElement | null): void {
  if (!el) return;
  delete el.dataset.dropTarget;
  el.querySelector(':scope > .krnl-swap-label')?.remove();
}

/** The pointer is over this window during a window drag (dragover). */
export function markDropTarget(el: HTMLElement): void {
  if (el.dataset.motherDragging === 'true') return; // its own window
  if (currentTarget === el) return;
  unmark(currentTarget);
  currentTarget = el;
  el.dataset.dropTarget = 'true';
  const label = document.createElement('span');
  label.className = 'krnl-swap-label';
  label.textContent = 'Swap here';
  el.appendChild(label);
}

/** The pointer left this window (dragleave; ignores moves onto its children). */
export function leaveDropTarget(el: HTMLElement, related: EventTarget | null): void {
  if (related instanceof Node && el.contains(related)) return;
  if (currentTarget === el) { unmark(el); currentTarget = null; }
}

/** Drag finished or cancelled: clear every mark. */
export function endMotherDrag(): void {
  unmark(currentTarget);
  currentTarget = null;
  document.querySelectorAll<HTMLElement>('.mother-frame[data-mother-dragging]').forEach((f) => { delete f.dataset.motherDragging; });
  document.querySelectorAll<HTMLElement>('.mother-frame[data-drop-target]').forEach((f) => unmark(f));
  delete document.body.dataset.motherDrag;
}

interface Box { left: number; top: number; width: number; height: number }
const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** A picture of the window, pinned above everything at the window's place. */
function ghostOf(frame: HTMLElement, box: Box, z: number): HTMLElement {
  const w = frame.offsetWidth || 1;
  const h = frame.offsetHeight || 1;
  const ghost = document.createElement('div');
  ghost.className = 'krnl-swap-ghost';
  Object.assign(ghost.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`,
    width: `${box.width}px`, height: `${box.height}px`, zIndex: String(z),
    overflow: 'hidden', borderRadius: '8px', pointerEvents: 'none',
    background: 'var(--node-bg, var(--paper))', transformOrigin: 'top left',
    willChange: 'transform',
  } satisfies Partial<CSSStyleDeclaration>);
  const clone = frame.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-tour');
  clone.removeAttribute('data-mother-dragging');
  clone.removeAttribute('data-drop-target');
  clone.querySelector(':scope > .krnl-swap-label')?.remove();
  Object.assign(clone.style, {
    width: `${w}px`, height: `${h}px`, margin: '0', opacity: '1',
    transform: `scale(${box.width / w}, ${box.height / h})`, transformOrigin: 'top left',
  } satisfies Partial<CSSStyleDeclaration>);
  ghost.appendChild(clone);
  document.body.appendChild(ghost);
  return ghost;
}

const FLY_MS = 560;

/**
 * Swap two windows and show them trading places: each window's picture
 * flies from where it was to where it lands — the one you dragged lifts and
 * passes over the other — then the real windows fade in under them.
 * `doSwap` changes the layout (store update).
 */
export function animateSwap(draggedId: string, otherId: string, doSwap: () => void): void {
  endMotherDrag();
  const a = frameOf(draggedId);
  const b = frameOf(otherId);
  if (reducedMotion() || !a || !b || typeof a.animate !== 'function') { doSwap(); return; }

  const fromA = boxOf(a);
  const fromB = boxOf(b);
  const ghostB = ghostOf(b, fromB, 9000);
  const ghostA = ghostOf(a, fromA, 9001); // the dragged one flies on top
  doSwap();

  // Wait for React to draw the swapped layout, then fly.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const na = frameOf(draggedId);
    const nb = frameOf(otherId);
    if (!na || !nb) { ghostA.remove(); ghostB.remove(); return; }
    const toA = boxOf(na);
    const toB = boxOf(nb);
    na.style.opacity = '0';
    nb.style.opacity = '0';

    const fly = (ghost: HTMLElement, from: Box, to: Box, lift: boolean): Animation => {
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const sx = to.width / from.width;
      const sy = to.height / from.height;
      const midS = lift ? 1.04 : 0.96;
      const arc = lift ? -24 : 16; // the dragged one rises over, the other dips under
      return ghost.animate(
        [
          { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)' },
          {
            transform: `translate(${dx / 2}px, ${dy / 2 + arc}px) scale(${((1 + sx) / 2) * midS}, ${((1 + sy) / 2) * midS})`,
            boxShadow: lift ? '0 28px 60px rgba(0,0,0,0.55)' : '0 10px 24px rgba(0,0,0,0.35)',
            offset: 0.5,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
        ],
        { duration: FLY_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
      );
    };
    const flights = [fly(ghostA, fromA, toA, true), fly(ghostB, fromB, toB, false)];

    let done = false;
    const land = (): void => {
      if (done) return;
      done = true;
      // Real windows fade in under the pictures, the pictures fade away.
      for (const f of [na, nb]) {
        f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
        f.style.opacity = '';
      }
      for (const g of [ghostA, ghostB]) {
        const out = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
        out.onfinish = () => g.remove();
        setTimeout(() => g.remove(), 400);
      }
    };
    Promise.all(flights.map((f) => f.finished)).then(land, land);
    setTimeout(land, FLY_MS + 200); // never leave a window hidden
  }));
}
