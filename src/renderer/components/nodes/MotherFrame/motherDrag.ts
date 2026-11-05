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

/** After a swap: both windows settle into their new places. */
export function playSwap(nodeIds: readonly string[]): void {
  endMotherDrag();
  if (reducedMotion()) return;
  // Wait for React to draw the swapped layout.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const id of nodeIds) {
      const f = frameOf(id);
      if (!f || typeof f.animate !== 'function') continue;
      f.dataset.swapped = 'true';
      f.animate(
        [
          { transform: 'scale(0.94)', opacity: 0.35 },
          { transform: 'scale(1.01)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      setTimeout(() => { delete f.dataset.swapped; }, 520);
    }
  }));
}
