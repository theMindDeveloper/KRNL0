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
  /** The original steps back while carried (null: back to normal). */
  setCarried?(id: string | null): void;
  /** Things that move themselves (a habit's boxes): show them at `target`, or back (null). */
  preview?(item: DragItem, target: Target | null, origin: DragOrigin | null): void;
  /** The slot under the pointer while carried (a day's strip or a month cell lights up), or none. */
  hover?(slot: Slot | null): void;
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
}

let active: Active | null = null;
let holding: { check: () => boolean; clear: () => void; timer: number } | null = null;

export function isCalendarDragging(): boolean {
  return !!active?.started;
}

function surfaceAt(x: number, y: number): CalendarSurface | null {
  if (typeof document === 'undefined') return null;
  const els = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
  for (const el of els) for (const s of surfaces) if (s.el && s.el.contains(el)) return s;
  return null;
}

function targetAt(a: Active, s: CalendarSurface, slot: { day: string; min: number }): Target {
  const fromHome = s === a.home;
  return dragTarget({
    mode: a.mode,
    origin: fromHome ? a.origin : null,
    startMin: fromHome ? a.startMin : null,
    now: slot,
    lenMin: a.item.lenMin,
    gran: s.gran(),
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
    s.preview?.(a.item, t, s === a.home ? a.origin : null);
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
  if (typeof document !== 'undefined') document.body.classList.add('krnl-cal-dragging');
  a.home?.setCarried?.(a.item.id);
  startCarry(a.item.tone, a.show);
  a.onStart?.();
}

function finishVisuals(a: Active, keep: boolean): void {
  if (typeof document !== 'undefined') document.body.classList.remove('krnl-cal-dragging');
  if (a.raf) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(a.raf); a.raf = 0; }
  a.over?.hover?.(null);
  a.onEnd?.();
  if (keep) return;
  if (ours()) setCalendarGhost(null);
  a.over?.preview?.(a.item, null, a.origin);
  a.home?.setCarried?.(null);
}

function releaseHold(): void {
  const h = holding;
  if (!h) return;
  holding = null;
  clearTimeout(h.timer);
  h.clear();
}

/**
 * A surface calls this when the board changed (in a layout effect, before the
 * frame is drawn): what was let go stays where it was dropped until the board
 * has it there, then hands over in the same frame (no flash back, no jump).
 */
export function checkCalendarDragLanded(): void {
  if (holding && holding.check()) releaseHold();
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
    const landed = s.commit(a.item, result, s === a.home ? a.origin : null, a.mode);
    endCarry({ unpack: !a.origin });
    if (landed) {
      finishVisuals(a, true);
      releaseHold();
      const clear = () => {
        if (ours()) setCalendarGhost(null);
        s.preview?.(a.item, null, a.origin);
        a.home?.setCarried?.(null);
      };
      holding = { check: landed, clear, timer: window.setTimeout(releaseHold, 1500) };
    } else finishVisuals(a, false);
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
  active = {
    item: spec.item, origin, mode: spec.mode ?? 'move', home,
    show: spec.show ?? (origin ? 'offCalendar' : 'always'), external: false,
    x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    startMin: startSlot && 'min' in startSlot ? startSlot.min : null,
    started: false, raf: 0, over: null,
    ...(spec.onOutside ? { onOutside: spec.onOutside } : {}),
    ...(spec.onStart ? { onStart: spec.onStart } : {}),
    ...(spec.onEnd ? { onEnd: spec.onEnd } : {}),
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
