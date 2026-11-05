// Swapping two windows by carrying one onto the other (Station panels and
// canvas mothers share this).
//
// Press the grip and move: the window lifts off its slot and you hold it —
// it follows the pointer and tilts in 3D with the way you move it, while its
// slot stays behind as an empty outline. The window under the pointer lights
// up with "Swap here". Let go on it and the held window flies into that slot
// while the other one flies over into the slot you emptied. Let go anywhere
// else (or press Esc) and it flies back.
//
// On the canvas the landing flights live inside the canvas viewport, so they
// pan and zoom with it. Motion is transform / opacity only; with
// prefers-reduced-motion the swap just happens.

import { useBoardStore } from '../../../store/boardStore';
import { saveBoard } from '../../../store/eventLog';

/** Kept for code that still recognises the old native drag payload. */
export const MOTHER_DRAG_MIME = 'application/x-krnl0-mother';

const PICKUP_PX = 4;          // movement before a press becomes a pick-up
const HOLD_MAX_W = 520;       // a held window is at most this wide on screen
const FLY_MS = 560;
const PERSPECTIVE = 900;

interface Box { left: number; top: number; width: number; height: number }

const esc = (v: string): string =>
  (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&'));
function frameOf(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.mother-frame[data-tour="${esc(nodeId)}"]`);
}
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};
const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ── drop-target marks ──────────────────────────────────────────────────────
let currentTarget: HTMLElement | null = null;

function unmark(el: HTMLElement | null): void {
  if (!el) return;
  delete el.dataset.dropTarget;
  el.querySelector(':scope > .krnl-swap-label')?.remove();
}

/** The held window is over this window. */
export function markDropTarget(el: HTMLElement): void {
  if (el.dataset.motherDragging === 'true') return; // its own slot
  if (currentTarget === el) return;
  unmark(currentTarget);
  currentTarget = el;
  el.dataset.dropTarget = 'true';
  const label = document.createElement('span');
  label.className = 'krnl-swap-label';
  label.textContent = 'Swap here';
  el.appendChild(label);
}

/** Left this window (ignores moves onto its own children). */
export function leaveDropTarget(el: HTMLElement, related: EventTarget | null): void {
  if (related instanceof Node && el.contains(related)) return;
  if (currentTarget === el) { unmark(el); currentTarget = null; }
}

/** Clear every mark. */
export function endMotherDrag(): void {
  unmark(currentTarget);
  currentTarget = null;
  document.querySelectorAll<HTMLElement>('.mother-frame[data-mother-dragging]').forEach((f) => { delete f.dataset.motherDragging; });
  document.querySelectorAll<HTMLElement>('.mother-frame[data-drop-target]').forEach((f) => unmark(f));
  delete document.body.dataset.motherDrag;
}

// ── pictures of a window ───────────────────────────────────────────────────
/** A copy of the window, drawn in `box` (its content scaled to fit). */
function ghostOf(frame: HTMLElement, box: Box, z: number, position: 'fixed' | 'absolute'): HTMLElement {
  const w = frame.offsetWidth || 1;
  const h = frame.offsetHeight || 1;
  const ghost = document.createElement('div');
  ghost.className = 'krnl-swap-ghost';
  ghost.dataset.w = String(w);
  ghost.dataset.h = String(h);
  Object.assign(ghost.style, {
    position, zIndex: String(z), overflow: 'hidden', borderRadius: '8px', pointerEvents: 'none',
    background: 'var(--node-bg, var(--paper))', willChange: 'transform', margin: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  const clone = frame.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-tour');
  clone.removeAttribute('data-mother-dragging');
  clone.removeAttribute('data-drop-target');
  clone.querySelector(':scope > .krnl-swap-label')?.remove();
  Object.assign(clone.style, { width: `${w}px`, height: `${h}px`, margin: '0', opacity: '1', transformOrigin: 'top left' } satisfies Partial<CSSStyleDeclaration>);
  ghost.appendChild(clone);
  setBox(ghost, box);
  return ghost;
}

function setBox(ghost: HTMLElement, box: Box): void {
  Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const clone = ghost.firstElementChild as HTMLElement | null;
  const w = Number(ghost.dataset.w) || 1;
  const h = Number(ghost.dataset.h) || 1;
  if (clone) clone.style.transform = `scale(${box.width / w}, ${box.height / h})`;
}

/** Where flights are drawn: inside the canvas viewport (so they pan and zoom
 *  with it), or fixed above the window in Station. Converts screen boxes. */
interface Layer { host: HTMLElement; position: 'fixed' | 'absolute'; local: (b: Box) => Box }
function layerFor(frame: HTMLElement): Layer {
  const vp = frame.closest<HTMLElement>('.react-flow__viewport');
  if (!vp) return { host: document.body, position: 'fixed', local: (b) => b };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
  vp.appendChild(probe);
  const o = probe.getBoundingClientRect();
  probe.remove();
  const z = frame.getBoundingClientRect().width / (frame.offsetWidth || 1) || 1;
  return {
    host: vp,
    position: 'absolute',
    local: (b) => ({ left: (b.left - o.left) / z, top: (b.top - o.top) / z, width: b.width / z, height: b.height / z }),
  };
}

/** Fly a picture from one box to another (both in the layer's coordinates). */
function fly(ghost: HTMLElement, from: Box, to: Box, over: boolean, startTilt = ''): Animation {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const mid = over ? 1.05 : 0.95;
  const arc = (over ? -0.06 : 0.04) * Math.max(from.height, to.height); // over rises, under dips
  ghost.style.transformOrigin = 'center';
  return ghost.animate(
    [
      { transform: `perspective(${PERSPECTIVE}px) translate(0px, 0px) ${startTilt || 'rotateX(0deg) rotateY(0deg)'} scale(1, 1)`, boxShadow: over ? '0 30px 70px rgba(0,0,0,0.5)' : '0 0 0 rgba(0,0,0,0)' },
      {
        transform: `perspective(${PERSPECTIVE}px) translate(${dx / 2}px, ${dy / 2 + arc}px) rotateX(0deg) rotateY(0deg) scale(${((1 + sx) / 2) * mid}, ${((1 + sy) / 2) * mid})`,
        boxShadow: over ? '0 34px 80px rgba(0,0,0,0.5)' : '0 12px 28px rgba(0,0,0,0.3)',
        offset: 0.5,
      },
      { transform: `perspective(${PERSPECTIVE}px) translate(${dx}px, ${dy}px) rotateX(0deg) rotateY(0deg) scale(${sx}, ${sy})`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
  );
}

/** Real windows fade in under the pictures; the pictures go. */
function land(frames: HTMLElement[], ghosts: HTMLElement[]): void {
  for (const f of frames) {
    f.style.opacity = '';
    if (typeof f.animate === 'function') f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }
  for (const g of ghosts) {
    if (typeof g.animate === 'function') {
      const out = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
      out.onfinish = () => g.remove();
    }
    setTimeout(() => g.remove(), 400);
  }
}

function swapInStore(a: string, b: string): void {
  useBoardStore.getState().swapMotherSlots(a, b);
  const board = useBoardStore.getState().board;
  if (board) void saveBoard(board);
}

// ── holding a window ───────────────────────────────────────────────────────
let holding = false;

/**
 * Press on a window's grip. Nothing happens until the pointer moves a few
 * pixels (a plain click stays a click); then the window is picked up.
 */
export function beginHold(e: React.PointerEvent, nodeId: string): void {
  if (e.button !== 0 || holding) return;
  e.preventDefault();
  e.stopPropagation(); // the canvas must not start a pan
  const startX = e.clientX;
  const startY = e.clientY;
  let picked = false;
  let px = startX;
  let py = startY;

  // set at pick-up
  let source: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let origin: Box | null = null;
  let s = 1; let sTarget = 1;       // hold scale
  let rx = 0; let ry = 0;           // tilt
  let lastX = startX; let lastY = startY;
  let raf = 0;
  let prevCursor = '';

  const frameLoop = (): void => {
    if (!ghost) return;
    const vx = px - lastX;
    const vy = py - lastY;
    lastX = px; lastY = py;
    // Tilt toward the movement, ease back when still.
    rx += (clamp(-vy * 1.4, -22, 22) - rx) * 0.18;
    ry += (clamp(vx * 1.4, -22, 22) - ry) * 0.18;
    s += (sTarget - s) * 0.22;
    ghost.style.transform =
      `translate3d(${px - startX}px, ${py - startY}px, 0) perspective(${PERSPECTIVE}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`;
    raf = requestAnimationFrame(frameLoop);
  };

  const pickUp = (): void => {
    source = frameOf(nodeId);
    if (!source) return;
    picked = true;
    holding = true;
    origin = boxOf(source);
    const gx = startX - origin.left; // grab point inside the window
    const gy = startY - origin.top;
    sTarget = Math.min(1.03, Math.max(0.35, HOLD_MAX_W / origin.width));
    ghost = ghostOf(source, origin, 9001, 'fixed');
    Object.assign(ghost.style, {
      transformOrigin: `${gx}px ${gy}px`, // tilts and shrinks around your hand
      boxShadow: '0 30px 70px rgba(0,0,0,0.5), 0 0 0 2px var(--acid)',
    });
    document.body.appendChild(ghost);
    source.dataset.motherDragging = 'true';
    document.body.dataset.motherDrag = 'true';
    prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    raf = requestAnimationFrame(frameLoop);
  };

  const hitTest = (): void => {
    const under = document.elementFromPoint(px, py);
    const frame = under?.closest<HTMLElement>('.mother-frame[data-tour]') ?? null;
    if (frame && frame !== source) markDropTarget(frame);
    else if (currentTarget) { unmark(currentTarget); currentTarget = null; }
  };

  function cleanup(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    if (picked) document.body.style.cursor = prevCursor;
    holding = false;
  }

  function release(targetId: string | null): void {
    cleanup();
    if (!picked || !ghost || !source || !origin) return;
    const held = ghost;
    const src = source;
    const tilt = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    const heldBox = boxOf(held); // where it is on screen now
    const layer = layerFor(src);
    endMotherDrag();

    // Re-seat the held picture in the flight layer, at the same place.
    held.style.transform = 'none';
    held.style.position = layer.position;
    held.style.boxShadow = '';
    layer.host.appendChild(held);
    const heldLocal = layer.local(heldBox);
    setBox(held, heldLocal);

    const still = reducedMotion() || typeof held.animate !== 'function';
    if (!targetId || still) {
      if (targetId) swapInStore(nodeId, targetId);
      // Back to its own slot (or, without motion, just gone).
      const back = still ? null : fly(held, heldLocal, layer.local(origin), true, tilt);
      const done = (): void => land([src], [held]);
      if (back) back.finished.then(done, done); else done();
      return;
    }

    const other = frameOf(targetId);
    if (!other) { swapInStore(nodeId, targetId); land([src], [held]); return; }
    const otherFrom = layer.local(boxOf(other));
    const otherGhost = ghostOf(other, otherFrom, 9000, layer.position);
    layer.host.insertBefore(otherGhost, held); // under the held one
    swapInStore(nodeId, targetId);

    // Wait for the swapped layout, then fly both to their new places.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const na = frameOf(nodeId);
      const nb = frameOf(targetId);
      if (!na || !nb) { held.remove(); otherGhost.remove(); return; }
      const toA = layer.local(boxOf(na));
      const toB = layer.local(boxOf(nb));
      na.style.opacity = '0';
      nb.style.opacity = '0';
      const flights = [fly(held, heldLocal, toA, true, tilt), fly(otherGhost, otherFrom, toB, false)];
      let done = false;
      const finish = (): void => { if (done) return; done = true; land([na, nb], [held, otherGhost]); };
      Promise.all(flights.map((f) => f.finished)).then(finish, finish);
      setTimeout(finish, FLY_MS + 250); // never leave a window hidden
    }));
  }

  function onMove(ev: PointerEvent): void {
    px = ev.clientX; py = ev.clientY;
    if (!picked) {
      if (Math.hypot(px - startX, py - startY) < PICKUP_PX) return;
      pickUp();
      if (!picked) { cleanup(); return; }
    }
    hitTest();
  }
  function onUp(): void {
    if (!picked) { cleanup(); return; }
    release(currentTarget?.dataset.tour ?? null);
  }
  function onCancel(): void { release(null); }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape' || !picked) return;
    ev.preventDefault();
    ev.stopPropagation();
    release(null);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
}
