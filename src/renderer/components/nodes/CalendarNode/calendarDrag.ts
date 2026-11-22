// Decision 63 — ONE drag engine for everything carried onto or on the Calendar:
// a plan (from a Todo row, a task card's grip, a canvas card, or moved and
// resized on the Calendar), an event (once or repeating, moved or resized, or
// its canvas card), a habit (moved on the Calendar, or its canvas card).
//
// The owner picked the repeating-event drag as the model (smooth: it follows
// the pointer every frame) and asked for one source of truth: one target rule
// (snap, clamp, day change, edges, the grab spot), one look (the ghost and its
// time line, the package from outside, the original stepping back), one
// cursor, one sound (from the board change), one "let go outside" rule, one
// hold until the board has the new place. Browser drag-and-drop is not used
// for any of these (it updates about every 50 ms and shows the system's drag
// box next to the pointer).
//
// Calendars register as surfaces (slot under a point, what a drop does);
// everything else here is shared.

import { calendarGhost, endCarry, ghostTimes, moveCarry, setCalendarGhost, startCarry, type CarryShow, type GhostSpec } from './DropGhost';

export type DragKind = 'task' | 'event' | 'habit';
export type DragMode = 'move' | 'top' | 'bottom';

export interface DragItem {
  kind: DragKind;
  /** A task node's id, a habit's id (an event is a habit record), or a Todo item's id (`itemOnly`). */
  id: string;
  /** A Todo row whose task card does not exist yet. */
  itemOnly?: boolean;
  name: string;
  /** A CSS colour. */
  tone: string;
  /** How long it is drawn (minutes). */
  lenMin: number;
  /** A task: its planned work minutes (what a move keeps). */
  plannedMin?: number;
  /** An event: how it repeats (decides whether it can change day). */
  repeat?: 'once' | 'weekly' | 'daily';
  /** A habit from the Habit window: letting go asks how it repeats (the swap card). */
  choose?: boolean;
}

/** Where it was on the Calendar (moved or resized there). */
export interface DragOrigin {
  day: string;
  startMin: number;
  endMin: number;
}

export type Slot = { day: string; min: number } | { anyTime: string } | { monthDay: string };
export interface Target { day: string; startMin: number; endMin: number }
export type DropResult = Target | { anyTime: string } | { monthDay: string };

export interface CalendarSurface {
  /** The element the surface covers (hit-tested under the pointer). */
  readonly el: HTMLElement | null;
  /** The slot under a screen point: a minute in a day's hours, a day's ANY TIME strip, a month cell — or nothing. */
  slotAt(x: number, y: number): Slot | null;
  /** The snap in minutes. */
  gran(): number;
  /** Lands it; returns "has the board got it?" to hold the ghost until then, or null. */
  commit(item: DragItem, result: DropResult, origin: DragOrigin | null, mode: DragMode): (() => boolean) | null;
  /** The original steps back while carried (null: back to normal). Not for an edge pulled. */
  setCarried?(id: string | null, mode?: DragMode): void;
  /**
   * Things that move themselves: a habit's boxes, and a block whose edge is
   * pulled (it stretches itself, its text as it is). At `target`, or back (null).
   */
  preview?(item: DragItem, target: Target | null, origin: DragOrigin | null, mode?: DragMode): void;
  /** The slot under the pointer while carried (a day's strip or a month cell lights up), or none. */
  hover?(slot: Slot | null): void;
  /**
   * Takes the measurements `slotAt` needs, once per drag (and again after a
   * scroll, a wheel or a resize), so nothing reads the page's layout while
   * the pointer moves.
   */
  measure?(): void;
  /** The drag is over: drop those measurements. */
  release?(): void;
}

// ── The target rule (pure, tested) ───────────────────────────────────────────

/** Whether a kind may change its day while carried. */
export function canChangeDay(item: Pick<DragItem, 'kind' | 'repeat'>): boolean {
  if (item.kind === 'habit') return false; // a habit moves for every day it is on
  if (item.kind === 'event') return item.repeat !== 'daily';
  return true;
}

/**
 * Where it would land. Moved on the Calendar: the spot it was grabbed by stays
 * under the pointer (the delta from the start, snapped); resized: that edge
 * follows; carried in from outside: it starts at the pointer's slot.
 */
export function dragTarget(a: {
  mode: DragMode;
  origin: DragOrigin | null;
  /** The minute under the pointer when the drag started (moved on the Calendar). */
  startMin: number | null;
  now: { day: string; min: number };
  lenMin: number;
  gran: number;
  dayChange: boolean;
}): Target {
  const g = Math.max(1, a.gran);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (!a.origin || a.startMin === null) {
    const s = clamp(Math.floor(a.now.min / g) * g, 0, 1440 - g);
    return { day: a.now.day, startMin: s, endMin: Math.min(1440, s + Math.max(g, a.lenMin)) };
  }
  const o = a.origin;
  const d = Math.round((a.now.min - a.startMin) / g) * g;
  if (a.mode === 'top') return { day: o.day, startMin: clamp(o.startMin + d, 0, o.endMin - g), endMin: o.endMin };
  if (a.mode === 'bottom') return { day: o.day, startMin: o.startMin, endMin: clamp(o.endMin + d, o.startMin + g, o.startMin + 1440) };
  const len = o.endMin - o.startMin;
  const s = clamp(o.startMin + d, 0, 1440 - g);
  return { day: a.dayChange ? a.now.day : o.day, startMin: s, endMin: s + len };
}

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The one look of what is carried (DropGhost draws it). */
export function ghostFor(item: DragItem, t: Target, mode: DragMode): GhostSpec {
  const end = Math.min(1440, t.endMin);
  const times = item.kind === 'habit' ? hm(t.startMin)
    : item.kind === 'event' && item.repeat !== 'once' ? `${ghostTimes(t.startMin, end)} · ${item.repeat === 'daily' ? 'every day' : 'every week'}`
    : ghostTimes(t.startMin, end);
  return {
    day: t.day, startMin: t.startMin, endMin: t.endMin, name: item.name, times, tone: item.tone,
    testId: 'calendar-drag-ghost',
    edge: mode === 'bottom' ? 'bottom' : 'top',
    ...(item.kind === 'task' ? { mark: 'list' as const } : item.kind === 'event' ? { mark: item.repeat === 'once' ? 'event' as const : 'repeat' as const } : {}),
    ...(item.kind === 'habit' ? { ruleOnly: true } : {}),
    // An edge pulled: the block itself stretches; only the time line shows.
    ...(mode !== 'move' ? { boxless: true } : {}),
    ...(item.itemOnly || item.kind === 'habit' ? {} : { refId: item.id, refKind: item.kind === 'event' ? 'event' as const : 'task' as const }),
  };
}

// ── The driver ───────────────────────────────────────────────────────────────

const surfaces = new Set<CalendarSurface>();

/** A Calendar view offers itself as a place to drop on. */
export function registerCalendarSurface(s: CalendarSurface): () => void {
  surfaces.add(s);
  return () => { surfaces.delete(s); };
}

interface Active {
  item: DragItem;
  origin: DragOrigin | null;
  mode: DragMode;
  home: CalendarSurface | null;
  show: CarryShow;
  external: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  startMin: number | null;
  started: boolean;
  raf: number;
  over: CalendarSurface | null;
  onOutside?: (item: DragItem) => void;
  onStart?: () => void;
  onEnd?: () => void;
  /** The element it was picked up from (it keeps the pointer, and its cursor shows everywhere). */
  cap?: { el: Element; id: number; cursor: string };
}

let active: Active | null = null;

// ── The cursor and text selection while carrying ─────────────────────────────
// Decision 63 (performance) — no page-wide style changes: a cursor set on
// <body> (or on every element) made the browser restyle the whole page at the
// start and the end of each drag (3,000 elements, ~0.37 s on a slow machine).
// The element it was picked up from keeps the pointer (pointer capture): the
// browser shows its cursor wherever the pointer goes, and nothing under the
// pointer lights up or changes its cursor on the way. Text selection is off
// on <body> (user-select is not inherited: nothing else is restyled).

function holdPointer(a: Active): void {
  const c = a.cap;
  if (!c) return;
  const el = c.el as HTMLElement & { setPointerCapture?: (id: number) => void };
  try { el.setPointerCapture?.(c.id); } catch { /* the pointer may be gone already */ }
  if (el.style) { c.cursor = el.style.cursor; el.style.cursor = 'grabbing'; }
}

function letPointerGo(a: Active): void {
  const c = a.cap;
  if (!c) return;
  const el = c.el as HTMLElement & { releasePointerCapture?: (id: number) => void; hasPointerCapture?: (id: number) => boolean };
  try { if (el.hasPointerCapture?.(c.id)) el.releasePointerCapture?.(c.id); } catch { /* released with the pointer */ }
  if (el.style) el.style.cursor = c.cursor;
}
let holding: { check: () => boolean; clear: (landed: boolean) => void; timer: number } | null = null;

export function isCalendarDragging(): boolean {
  return !!active?.started;
}

// ── Where the Calendars are (measured once per drag) ─────────────────────────
// Hit-testing the page on every pointer event (elementsFromPoint) forced a
// layout each time and was the main cost of a drag. The Calendars do not move
// while something is carried, so their boxes (and their slots) are measured
// when it starts, and again only after a scroll, a wheel or a resize.

let boxes: Map<CalendarSurface, DOMRect> | null = null;
let geomDirty = false;
const onGeomChange = () => { geomDirty = true; };

function measureAll(): void {
  boxes = new Map();
  for (const s of surfaces) {
    if (!s.el || !s.el.isConnected) continue;
    s.measure?.();
    boxes.set(s, s.el.getBoundingClientRect());
  }
  geomDirty = false;
}

function watchGeometry(on: boolean): void {
  if (typeof window === 'undefined') return;
  const f = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
  f('scroll', onGeomChange, true);
  f('wheel', onGeomChange, true);
  f('resize', onGeomChange, true);
}

function releaseGeometry(): void {
  watchGeometry(false);
  if (boxes) for (const s of boxes.keys()) s.release?.();
  boxes = null;
}

function surfaceAt(x: number, y: number): CalendarSurface | null {
  if (!boxes || geomDirty) measureAll();
  let best: CalendarSurface | null = null;
  let area = Infinity;
  for (const [s, r] of boxes!) {
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const a = r.width * r.height;
    if (a < area) { best = s; area = a; }
  }
  return best;
}

/** After this frame is drawn (what the user sees first), then `fn`. */
function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { setTimeout(fn, 0); });
  else setTimeout(fn, 0);
}

function targetAt(a: Active, s: CalendarSurface, slot: { day: string; min: number }): Target {
  const fromHome = s === a.home;
  return dragTarget({
    mode: a.mode,
    origin: fromHome ? a.origin : null,
    startMin: fromHome ? a.startMin : null,
    now: slot,
    lenMin: a.item.lenMin,
    // The owner's pick, the old repeating-event drag: a 15-minute step
    // whatever the zoom (finer when zoomed in), so it moves with the pointer
    // instead of jumping an hour at a time.
    gran: Math.min(15, s.gran()),
    dayChange: canChangeDay(a.item),
  });
}

const ours = () => calendarGhost()?.testId === 'calendar-drag-ghost';

function paint(): void {
  const a = active;
  if (!a) return;
  a.raf = 0;
  const s = surfaceAt(a.x, a.y);
  const slot = s?.slotAt(a.x, a.y) ?? null;
  if (a.over && a.over !== s) { a.over.preview?.(a.item, null, a.origin); a.over.hover?.(null); }
  a.over = s;
  s?.hover?.(slot);
  if (s && slot && 'min' in slot) {
    const t = targetAt(a, s, slot);
    setCalendarGhost(ghostFor(a.item, t, a.mode));
    s.preview?.(a.item, t, s === a.home ? a.origin : null, a.mode);
    moveCarry(a.x, a.y, true);
  } else {
    if (ours()) setCalendarGhost(null);
    s?.preview?.(a.item, null, a.origin);
    moveCarry(a.x, a.y, false);
  }
}

function schedulePaint(): void {
  if (!active || active.raf) return;
  active.raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(paint) : (setTimeout(paint, 16) as unknown as number);
}

function begin(a: Active): void {
  a.started = true;
  // Measured before anything changes the page's style (no forced restyle).
  measureAll();
  watchGeometry(true);
  if (typeof document !== 'undefined') {
    // A marker only: no style rule reads it (see holdPointer).
    document.body.classList.add('krnl-cal-dragging');
    if (!a.external) {
      holdPointer(a);
      document.body.style.userSelect = 'none';
      try { window.getSelection()?.removeAllRanges(); } catch { /* none */ }
    }
  }
  a.home?.setCarried?.(a.item.id, a.mode);
  startCarry(a.item.tone, a.show);
  a.onStart?.();
}

function finishVisuals(a: Active, keep: boolean): void {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('krnl-cal-dragging');
    if (!a.external) { letPointerGo(a); document.body.style.userSelect = ''; }
  }
  releaseGeometry();
  if (a.raf) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(a.raf); a.raf = 0; }
  a.over?.hover?.(null);
  a.onEnd?.();
  if (keep) return;
  if (ours()) setCalendarGhost(null);
  a.over?.preview?.(a.item, null, a.origin);
  a.home?.setCarried?.(null);
}

/** `landed`: the board has it where it was let go (else it is given up after a while). */
function releaseHold(landed = false): void {
  const h = holding;
  if (!h) return;
  holding = null;
  clearTimeout(h.timer);
  h.clear(landed);
}

/**
 * A surface calls this when the board changed (in a layout effect, before the
 * frame is drawn): what was let go stays where it was dropped until the board
 * has it there, then hands over in the same frame (no flash back, no jump).
 */
export function checkCalendarDragLanded(): void {
  if (holding && holding.check()) releaseHold(true);
}

/**
 * The click the browser sends right after a drag's release (same input
 * event) is not a click on what is under it. Only that one: the guard is
 * gone by the next task or the next press.
 */
function stopClickOnce(): void {
  if (typeof window === 'undefined') return;
  const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); off(); };
  const off = () => {
    window.removeEventListener('click', stop, true);
    window.removeEventListener('pointerdown', off, true);
  };
  window.addEventListener('click', stop, true);
  window.addEventListener('pointerdown', off, true);
  window.setTimeout(off, 0);
}

function drop(a: Active, x: number, y: number): boolean {
  a.x = x;
  a.y = y;
  const s = surfaceAt(x, y);
  const slot = s?.slotAt(x, y) ?? null;
  if (s && slot) {
    let result: DropResult;
    if ('min' in slot) {
      const t = targetAt(a, s, slot);
      // Back where it was: nothing to do.
      if (s === a.home && a.origin && t.day === a.origin.day && t.startMin === a.origin.startMin && t.endMin === a.origin.endMin) {
        finishVisuals(a, false);
        endCarry();
        return true;
      }
      result = t;
      // The ghost shows exactly where it lands while the board catches up.
      setCalendarGhost(ghostFor(a.item, t, a.mode));
    } else result = slot;
    endCarry({ unpack: !a.origin });
    finishVisuals(a, true);
    releaseHold();
    // It has landed for the eye at once: the original's place empties now
    // (no copy left behind), and the board (which redraws every window) is
    // changed after this frame is on screen, not before it.
    const home = a.home;
    home?.el?.classList.add('is-landing');
    const origin = s === home ? a.origin : null;
    // Landed: what moved itself (a habit's boxes, a stretched block) is now
    // drawn by the Calendar at its new place (origin null: nothing to put back).
    const clear = (landed: boolean) => {
      if (ours()) setCalendarGhost(null);
      s.preview?.(a.item, null, landed ? null : a.origin);
      home?.setCarried?.(null);
      home?.el?.classList.remove('is-landing');
    };
    const token = { check: () => false, clear, timer: 0 };
    holding = token;
    afterPaint(() => {
      const landed = s.commit(a.item, result, origin, a.mode);
      if (holding !== token) return; // a newer drop owns the screen (this one is saved)
      if (!landed) { holding = null; clear(true); return; }
      // The surface checks after it has redrawn (a layout effect), so the
      // ghost hands over to the real block in the same frame.
      token.check = landed;
      token.timer = window.setTimeout(() => releaseHold(false), 1500);
    });
    return true;
  }
  finishVisuals(a, false);
  endCarry();
  // Let go elsewhere in the app (not outside the window): a plan comes off the Calendar.
  const inWindow = typeof window !== 'undefined' && x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;
  if (inWindow && a.origin && a.onOutside) a.onOutside(a.item);
  return false;
}

function onMove(ev: PointerEvent): void {
  const a = active;
  if (!a || a.external) return;
  a.x = ev.clientX;
  a.y = ev.clientY;
  if (!a.started) {
    if (Math.hypot(a.x - a.x0, a.y - a.y0) < 4) return;
    begin(a);
  }
  ev.preventDefault();
  schedulePaint();
}

function detach(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerup', onUp, true);
  window.removeEventListener('pointercancel', onCancel, true);
  window.removeEventListener('keydown', onKey, true);
}

function onUp(ev: PointerEvent): void {
  const a = active;
  if (!a || a.external) return;
  detach();
  active = null;
  if (!a.started) return;
  stopClickOnce();
  drop(a, ev.clientX, ev.clientY);
}

function cancel(): void {
  const a = active;
  if (!a) return;
  detach();
  active = null;
  if (!a.started) return;
  finishVisuals(a, false);
  endCarry();
}

function onCancel(): void { cancel(); }
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && active?.started) { e.stopPropagation(); e.preventDefault(); cancel(); }
}

/**
 * Starts carrying something with the pointer (from its pointerdown). Nothing
 * happens until it moves 4 px; a press that does not move stays a click.
 */
export function beginCalendarDrag(
  e: { clientX: number; clientY: number; button?: number },
  spec: {
    item: DragItem;
    origin?: DragOrigin | null;
    mode?: DragMode;
    home?: CalendarSurface | null;
    /** When the small box shows (default: off the Calendar when moved on it, always when carried in). */
    show?: CarryShow;
    onOutside?: (item: DragItem) => void;
    onStart?: () => void;
    onEnd?: () => void;
  },
): void {
  if (e.button !== undefined && e.button !== 0) return;
  if (active) cancel();
  const origin = spec.origin ?? null;
  const home = spec.home ?? null;
  const startSlot = origin && home ? home.slotAt(e.clientX, e.clientY) : null;
  const from = (e as { currentTarget?: unknown }).currentTarget;
  const pointerId = (e as { pointerId?: unknown }).pointerId;
  active = {
    item: spec.item, origin, mode: spec.mode ?? 'move', home,
    show: spec.show ?? (origin ? 'offCalendar' : 'always'), external: false,
    x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    startMin: startSlot && 'min' in startSlot ? startSlot.min : null,
    started: false, raf: 0, over: null,
    ...(spec.onOutside ? { onOutside: spec.onOutside } : {}),
    ...(spec.onStart ? { onStart: spec.onStart } : {}),
    ...(spec.onEnd ? { onEnd: spec.onEnd } : {}),
    ...(typeof Element !== 'undefined' && from instanceof Element && typeof pointerId === 'number' ? { cap: { el: from, id: pointerId, cursor: '' } } : {}),
  };
  if (typeof window === 'undefined') return;
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('keydown', onKey, true);
}

/**
 * A drag that something else moves (a canvas card, dragged by the canvas):
 * feed it the pointer. Returns whether it is over a Calendar's hours or strip.
 */
export function externalDragMove(item: DragItem, x: number, y: number): boolean {
  if (!active || !active.external || active.item.id !== item.id) {
    if (active) cancel();
    active = {
      item, origin: null, mode: 'move', home: null, show: 'onCalendar', external: true,
      x0: x, y0: y, x, y, startMin: null, started: false, raf: 0, over: null,
    };
    begin(active);
  }
  active.x = x;
  active.y = y;
  schedulePaint();
  // Measured boxes only (no layout read per move).
  const s = surfaceAt(x, y);
  return !!(s && s.slotAt(x, y));
}

/** The canvas let go of it: lands it on a Calendar under the point (true), or nothing (false). */
export function externalDragEnd(x: number, y: number): boolean {
  const a = active;
  if (!a || !a.external) return false;
  active = null;
  return drop(a, x, y);
}
