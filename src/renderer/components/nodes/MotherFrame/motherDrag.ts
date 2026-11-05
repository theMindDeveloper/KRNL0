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
const FLY_MS = 260;          // the drop: quick, eases out (no wind-up)
const FADE_MS = 110;
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

/** Fly a picture from one box to another (both in the layer's coordinates).
 *  One smooth ease-out move: it starts at full speed from where you let go
 *  and settles into place. */
function fly(ghost: HTMLElement, from: Box, to: Box, startTilt = ''): Animation {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  ghost.style.transformOrigin = 'center';
  return ghost.animate(
    [
      { transform: `perspective(${PERSPECTIVE}px) translate(0px, 0px) ${startTilt || 'rotateX(0deg) rotateY(0deg)'} scale(1, 1)` },
      { transform: `perspective(${PERSPECTIVE}px) translate(${dx}px, ${dy}px) rotateX(0deg) rotateY(0deg) scale(${sx}, ${sy})` },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
  );
}

/** Real windows fade in under the pictures; the pictures go. */
function land(frames: HTMLElement[], ghosts: HTMLElement[]): void {
  for (const f of frames) {
    f.style.opacity = '';
    if (typeof f.animate === 'function') f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
  }
  for (const g of ghosts) {
    if (typeof g.animate === 'function') {
      const out = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
      out.onfinish = () => g.remove();
    }
    setTimeout(() => g.remove(), FADE_MS + 200);
  }
}

function swapInStore(a: string, b: string): void {
  useBoardStore.getState().swapMotherSlots(a, b);
  const board = useBoardStore.getState().board;
  if (board) void saveBoard(board);
}

// ── cast shadow ────────────────────────────────────────────────────────────
// The held window casts its shadow on what is under it. The shadow is the
// window's own silhouette with the same 3D tilt — so when you swing the
// window left or right, the shadow's shape swings with it — pushed out from
// under the window opposite to the way you move it (it trails behind, as if
// the light is above and in front), and a little away from the middle of the
// screen.
//
// Two surfaces at two depths give the parallax: the window you are over is
// close (a darker, sharper shadow that trails less, clipped to that window),
// the background is far (softer, trails more, with a hole where the hovered
// window is).
//
// Cost: each shadow is a plain blurred box drawn once (will-change:
// transform); per frame only their transforms change, which the compositor
// handles. Clip shapes and positions change only when the window under you
// changes.

interface CastShadow {
  root: HTMLElement; farClip: HTMLElement; far: HTMLElement; nearClip: HTMLElement; near: HTMLElement;
  origin: Box; surface: Box | null;
}

/** k: how far it trails; tilt: how strongly its shape follows the tilt. */
const FAR = { k: 1.0, tilt: 1.35, inset: 0.93, blur: 18, alpha: 0.5 };
const NEAR = { k: 0.6, tilt: 1.15, inset: 0.97, blur: 7, alpha: 0.62 };

function makeCastShadow(origin: Box, gx: number, gy: number): CastShadow {
  const layer = (z: number): HTMLElement => {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: String(z), pointerEvents: 'none', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);
    return el;
  };
  const blob = (blur: number, alpha: number): HTMLElement => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute', left: `${origin.left}px`, top: `${origin.top}px`,
      width: `${origin.width}px`, height: `${origin.height}px`,
      borderRadius: '12px', background: `rgba(0,0,0,${alpha})`, filter: `blur(${blur}px)`,
      transformOrigin: `${gx}px ${gy}px`, willChange: 'transform', // same pivot as the held window
    } satisfies Partial<CSSStyleDeclaration>);
    return el;
  };
  const root = document.createElement('div');
  root.className = 'krnl-cast-shadow';
  const farClip = layer(8999);
  const far = blob(FAR.blur, FAR.alpha);
  farClip.appendChild(far);
  const nearClip = layer(9000);
  nearClip.style.display = 'none';
  nearClip.style.borderRadius = '8px';
  const near = blob(NEAR.blur, NEAR.alpha);
  nearClip.appendChild(near);
  root.append(farClip, nearClip);
  document.body.appendChild(root);
  if (typeof root.animate === 'function') root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  return { root, farClip, far, nearClip, near, origin, surface: null };
}

/** The window under the held one (or none): the near shadow falls on it,
 *  the far one everywhere else. */
function setShadowSurface(cs: CastShadow, r: Box | null): void {
  cs.surface = r;
  if (!r) {
    cs.nearClip.style.display = 'none';
    cs.farClip.style.clipPath = '';
    return;
  }
  Object.assign(cs.nearClip.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  // inside the clip, the shadow is placed relative to the clip's corner
  cs.near.style.left = `${cs.origin.left - r.left}px`;
  cs.near.style.top = `${cs.origin.top - r.top}px`;
  const L = r.left; const T = r.top; const R = r.left + r.width; const B = r.top + r.height;
  cs.farClip.style.clipPath =
    `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${L}px ${T}px, ${R}px ${T}px, ${R}px ${B}px, ${L}px ${B}px, ${L}px ${T}px)`;
}

/** Follow the held window: (dx, dy) its move from the pick-up point, `s` its
 *  scale, (rx, ry) its tilt, (cx, cy) where your hand is on screen. */
function placeShadow(cs: CastShadow, dx: number, dy: number, s: number, rx: number, ry: number, cx: number, cy: number): void {
  // Trails behind the movement (the tilt is the movement), drops below, and
  // drifts away from the middle of the screen.
  const ox = -ry * 3.2 + (cx - window.innerWidth / 2) * 0.04;
  const oy = 40 + rx * 2.2 + (cy - window.innerHeight * 0.3) * 0.03;
  const put = (el: HTMLElement, d: typeof FAR): void => {
    el.style.transform =
      `translate3d(${dx + ox * d.k}px, ${dy + oy * d.k}px, 0) perspective(${PERSPECTIVE}px) ` +
      `rotateX(${rx * d.tilt}deg) rotateY(${ry * d.tilt}deg) scale(${s * d.inset})`;
  };
  put(cs.far, FAR);
  if (cs.surface) put(cs.near, NEAR);
}

function dropShadow(cs: CastShadow): void {
  const root = cs.root;
  if (typeof root.animate === 'function') {
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' }).onfinish = () => root.remove();
  }
  setTimeout(() => root.remove(), 320);
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
  let shadow: CastShadow | null = null; // cast on what is under the held window
  let origin: Box | null = null;
  let gx = 0; let gy = 0;           // grab point inside the window
  let s = 1; let sTarget = 1;       // hold scale
  let rx = 0; let ry = 0;           // tilt
  let lastX = startX; let lastY = startY;
  let raf = 0;
  let prevCursor = '';
  let lastSurfaceEl: HTMLElement | null = null;

  const frameLoop = (): void => {
    if (!ghost) return;
    const vx = px - lastX;
    const vy = py - lastY;
    lastX = px; lastY = py;
    // Tilt toward the movement, ease back when still.
    rx += (clamp(-vy * 1.4, -22, 22) - rx) * 0.18;
    ry += (clamp(vx * 1.4, -22, 22) - ry) * 0.18;
    s += (sTarget - s) * 0.22;
    const dx = px - startX;
    const dy = py - startY;
    ghost.style.transform =
      `translate3d(${dx}px, ${dy}px, 0) perspective(${PERSPECTIVE}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`;
    if (shadow) placeShadow(shadow, dx, dy, s, rx, ry, px, py);
    raf = requestAnimationFrame(frameLoop);
  };

  const pickUp = (): void => {
    source = frameOf(nodeId);
    if (!source) return;
    picked = true;
    holding = true;
    origin = boxOf(source);
    gx = startX - origin.left;
    gy = startY - origin.top;
    sTarget = Math.min(1.03, Math.max(0.35, HOLD_MAX_W / origin.width));
    shadow = makeCastShadow(origin, gx, gy);
    ghost = ghostOf(source, origin, 9001, 'fixed');
    ghost.style.transformOrigin = `${gx}px ${gy}px`; // tilts and shrinks around your hand
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
    // Only when the window under you changes (cheap the rest of the time).
    if (shadow && lastSurfaceEl !== currentTarget) {
      setShadowSurface(shadow, currentTarget ? boxOf(currentTarget) : null);
      lastSurfaceEl = currentTarget;
    }
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
    const from0 = origin;
    const tilt = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    // Where the held window is, without its tilt (the tilt is carried into the
    // flight), so nothing jumps when you let go.
    const dx = px - startX;
    const dy = py - startY;
    const heldBox: Box = {
      left: from0.left + dx + gx * (1 - s), top: from0.top + dy + gy * (1 - s),
      width: from0.width * s, height: from0.height * s,
    };
    const layer = layerFor(src);
    endMotherDrag();
    if (shadow) { dropShadow(shadow); shadow = null; }

    // Re-seat the held picture in the flight layer, at the same place.
    held.style.transform = 'none';
    held.style.position = layer.position;
    layer.host.appendChild(held);
    const heldLocal = layer.local(heldBox);
    setBox(held, heldLocal);

    const still = reducedMotion() || typeof held.animate !== 'function';
    const other = targetId ? frameOf(targetId) : null;
    if (!targetId || !other || still) {
      if (targetId) swapInStore(nodeId, targetId);
      // Back to its own slot (or, without motion, just gone).
      const back = still || targetId ? null : fly(held, heldLocal, layer.local(from0), tilt);
      const done = (): void => land([src], [held]);
      if (back) back.finished.then(done, done); else done();
      return;
    }

    // A swap trades slots, so each window lands where the other one is now —
    // known before the swap, so both fly the moment you let go.
    const otherScreen = boxOf(other);
    const otherFrom = layer.local(otherScreen);
    const toA = otherFrom;              // the held one → the other's slot
    const toB = layer.local(from0);     // the other → the slot you emptied
    const otherGhost = ghostOf(other, otherFrom, 9000, layer.position);
    layer.host.insertBefore(otherGhost, held); // under the held one
    const flights = [fly(held, heldLocal, toA, tilt), fly(otherGhost, otherFrom, toB)];
    swapInStore(nodeId, targetId);

    // Keep the real windows hidden under the pictures until they land.
    let landed = false;
    const hide = (): void => {
      if (landed) return;
      for (const id of [nodeId, targetId]) { const f = frameOf(id); if (f) f.style.opacity = '0'; }
    };
    hide();
    requestAnimationFrame(hide); // after React has drawn the swap
    const finish = (): void => {
      if (landed) return;
      landed = true;
      const na = frameOf(nodeId);
      const nb = frameOf(targetId);
      land([na, nb].filter((f): f is HTMLElement => !!f), [held, otherGhost]);
    };
    Promise.all(flights.map((f) => f.finished)).then(finish, finish);
    setTimeout(finish, FLY_MS + 200); // never leave a window hidden
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
