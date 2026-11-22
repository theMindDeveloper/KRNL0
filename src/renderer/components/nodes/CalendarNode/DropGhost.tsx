// Decision 61 — the ONE look of anything carried onto the Calendar, whatever
// it is (a plan from Todo, a task card by its grip or on the canvas, a block
// moved on the Calendar, a repeating event, a habit, an edge pulled to resize):
//
//  • On the Calendar: the ghost. The thing itself, drawn solid at the slot it
//    would land on (its name, its times), gliding from slot to slot. While a
//    thing on the Calendar is moved or resized, its original steps back (0.35).
//    The owner picked the repeating-event drag as the model (2026-11-21).
//  • At the pointer: never a browser drag picture. Something carried from
//    outside the Calendar is a small box in its colour; a canvas card shrinks
//    into that box while it is over the Calendar.
//
// Both move without React: the ghost is one element per Calendar grid, moved
// by transform in an animation frame; the box is one element on the page.
// Re-drawing the whole week on every slot change is what made drags stutter.

import { kindIconSvg } from '../../ui/kindIcons';
import { useEffect, useRef, type CSSProperties } from 'react';

// ── The ghost on the Calendar ────────────────────────────────────────────────

export interface GhostSpec {
  /** The day column (YYYY-MM-DD) it is drawn in. */
  day: string;
  startMin: number;
  endMin: number;
  name: string;
  times: string;
  /** A CSS colour (the plan's or the event's). */
  tone: string;
  /** What is carried: kept on the element as its test id. */
  testId: string;
  /** Which edge the time line marks: the start (moving, the top edge) or the end (a bottom edge pulled). */
  edge?: 'top' | 'bottom';
  /** Only the time line (the thing moves itself, e.g. a habit's boxes). */
  ruleOnly?: boolean;
  /** The kind mark the block draws at its top right (kept while carried). */
  mark?: 'list' | 'repeat' | 'event';
  /** Decision 61 — what is carried, so the Clock can show it moving too: a task's id, or a repeating/one-time event's habit id. */
  refId?: string;
  refKind?: 'task' | 'event';
}

let ghost: GhostSpec | null = null;
const ghostSubs = new Set<() => void>();

const sameGhost = (a: GhostSpec | null, b: GhostSpec | null): boolean =>
  a === b || (!!a && !!b && a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin && a.name === b.name && a.times === b.times && a.tone === b.tone && a.testId === b.testId && a.edge === b.edge && a.ruleOnly === b.ruleOnly && a.refId === b.refId && a.mark === b.mark);

/** Shows the ghost (or hides it with null). Cheap to call on every move: nothing happens unless it changed. */
export function setCalendarGhost(next: GhostSpec | null): void {
  if (sameGhost(ghost, next)) return;
  ghost = next;
  for (const f of ghostSubs) f();
}

export function calendarGhost(): GhostSpec | null {
  return ghost;
}

/** For other views (the Clock) that show what is being carried: called when the ghost changes. */
export function subscribeCalendarGhost(f: () => void): () => void {
  ghostSubs.add(f);
  return () => { ghostSubs.delete(f); };
}

const frame = (f: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : (setTimeout(f, 16) as unknown as number);
const cancelFrame = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
};

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "14:00–15:30" (the times line of a ghost). */
export const ghostTimes = (startMin: number, endMin: number): string => `${hm(startMin)}–${hm(endMin)}`;

/**
 * The ghost of one Calendar grid. Lives in the element that holds the day
 * columns (`[data-cal-day]`), sits over the plan area of the ghost's day.
 * With it, a line across the hours to the ghost's edge and the exact time in
 * the hour column (the start, or the end while a bottom edge is pulled).
 */
export function CalendarGhostLayer({ rowHeight, rowCount, planLeft }: {
  rowHeight: number;
  /** Hours drawn (the day columns' height / this = one hour, as CSS drew it). */
  rowCount: number;
  /** Where the plan area starts in a day column (px from its left edge). */
  planLeft: (day: string) => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const timesRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const ruleRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const geo = useRef({ rowHeight, rowCount, planLeft });
  geo.current = { rowHeight, rowCount, planLeft };
  const applyRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let raf = 0;
    let shown = false;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      const rule = ruleRef.current;
      if (!el) return;
      const g = ghost;
      const col = g ? el.parentElement?.querySelector<HTMLElement>(`[data-cal-day="${g.day}"]`) : null;
      if (!g || !col) {
        if (shown) {
          // Hidden and out of the way: a hidden box far down still made the hours scroll.
          for (const x of [el, rule]) {
            if (!x) continue;
            x.style.transition = 'none';
            x.style.visibility = 'hidden';
            x.style.transform = 'translate3d(0, 0, 0)';
            x.classList.remove('is-shown');
          }
          el.style.height = '0px';
          el.style.width = '0px';
          el.removeAttribute('data-testid');
          shown = false;
        }
        return;
      }
      const { rowHeight: jsRh, rowCount: rows, planLeft: pl } = geo.current;
      // One hour as the browser drew it (the columns follow the window by CSS).
      const rh = col.offsetHeight > 0 && rows > 0 ? col.offsetHeight / rows : jsRh;
      const lead = Math.max(0, pl(g.day));
      const x = col.offsetLeft + lead + 2;
      const w = Math.max(12, col.offsetWidth - lead - 4);
      // On its start line, like the block it stands for (the gap is at the bottom).
      const y = (g.startMin / 60) * rh;
      const h = Math.max(18, ((Math.min(1440, g.endMin) - g.startMin) / 60) * rh - 3);
      // The first frame of a drag lands in place; after that it glides.
      if (!shown) { el.style.transition = 'none'; if (rule) rule.style.transition = 'none'; }
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      el.style.setProperty('--ghost-tone', g.tone);
      if (shown) el.style.visibility = g.ruleOnly ? 'hidden' : 'visible';
      el.setAttribute('data-testid', g.testId);
      el.setAttribute('data-day', g.day);
      el.setAttribute('data-start-min', String(g.startMin));
      el.setAttribute('data-end-min', String(g.endMin));
      // The same look as the block: the name wraps over the lines it has room for.
      if (markRef.current) {
        markRef.current.innerHTML = g.mark ? MARK_SVG[g.mark] : '';
        markRef.current.style.display = g.mark && w >= 60 ? '' : 'none';
      }
      if (nameRef.current) {
        nameRef.current.textContent = g.name;
        nameRef.current.style.setProperty('-webkit-line-clamp', String(Math.max(1, Math.floor((h - 6 - (h >= 34 ? 13 : 0)) / 15))));
      }
      if (timesRef.current) {
        timesRef.current.textContent = g.times;
        timesRef.current.style.display = h >= 34 || !g.name ? '' : 'none';
      }
      if (rule) {
        const atEnd = g.edge === 'bottom';
        const ly = atEnd ? y + h : y;
        // A habit moves on every day it is on: its line crosses the whole
        // week, under the habit boxes (they ride on it).
        const parent = el.parentElement;
        rule.style.width = g.ruleOnly && parent ? `${parent.clientWidth + RULE_LEFT}px` : `${x + w + RULE_LEFT}px`;
        rule.style.zIndex = g.ruleOnly ? '2' : '9';
        rule.style.transform = `translate3d(${-RULE_LEFT}px, ${ly}px, 0)`;
        rule.style.setProperty('--ghost-tone', g.tone);
        if (chipRef.current) chipRef.current.textContent = hm(atEnd ? g.endMin : g.startMin);
      }
      if (!shown) {
        void el.offsetWidth;
        el.style.transition = '';
        el.style.visibility = g.ruleOnly ? 'hidden' : 'visible';
        el.classList.add('is-shown');
        if (rule) { rule.style.transition = ''; rule.style.visibility = 'visible'; rule.classList.add('is-shown'); }
        shown = true;
      }
    };
    applyRef.current = apply;
    const onChange = () => { if (!raf) raf = frame(apply); };
    ghostSubs.add(onChange);
    apply();
    return () => {
      ghostSubs.delete(onChange);
      if (raf) cancelFrame(raf);
    };
  }, []);
  // A zoom while carrying: the ghost keeps its minutes.
  useEffect(() => { applyRef.current(); }, [rowHeight]);

  return (
    <>
      <div ref={ruleRef} className="cal-drop-rule" aria-hidden data-testid="calendar-drop-rule" style={RULE_STYLE}>
        <span ref={chipRef} className="cal-drop-rule-time" />
      </div>
      <div ref={ref} className="cal-drop-ghost" aria-hidden style={GHOST_STYLE}>
        <span ref={markRef} className="cal-drop-ghost-mark" />
        <div ref={nameRef} className="cal-drop-ghost-name" />
        <div ref={timesRef} className="cal-drop-ghost-times" />
      </div>
    </>
  );
}

/** The kind marks the blocks draw at their top right (the ghost keeps them). Static markup. */
// The same marks as the blocks and cards (ui/kindIcons.tsx).
const MARK_SVG: Record<'list' | 'repeat' | 'event', string> = {
  list: kindIconSvg('task'),
  repeat: kindIconSvg('repeat'),
  event: kindIconSvg('event'),
};

/** How far into the hour column (left of the days) the time line starts. */
const RULE_LEFT = 46;

const GHOST_STYLE: CSSProperties = {
  position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 8, pointerEvents: 'none', boxSizing: 'border-box',
  visibility: 'hidden', borderRadius: 6, padding: '3px 7px', overflow: 'hidden',
  border: '1.5px solid var(--ghost-tone, var(--acid))',
  background: 'color-mix(in srgb, var(--ghost-tone, var(--acid)) 22%, var(--paper))',
  boxShadow: '0 8px 22px -8px rgba(0,0,0,0.55)',
  fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: '15px',
};

const RULE_STYLE: CSSProperties = {
  position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 9, pointerEvents: 'none', visibility: 'hidden',
};

// ── The package at the pointer ───────────────────────────────────────────────

/**
 * When the package shows:
 *  - 'always': carried from outside the Calendar (a Todo row, a task card's grip, a Month block);
 *  - 'offCalendar': moved on the Calendar (over the hours the ghost is enough);
 *  - 'onCalendar': a canvas card (the card itself is the picture until it is over the Calendar).
 */
export type CarryShow = 'always' | 'offCalendar' | 'onCalendar';

/** The package sits just below and right of the pointer, so the arrow's tip and the ghost's name stay in view. */
const BOX_OFFSET = { x: 8, y: 8 };
let box: HTMLDivElement | null = null;
let carry: { show: CarryShow } | null = null;
let boxRaf = 0;
let boxAt: { x: number; y: number; over: boolean } | null = null;

// A small parcel in the plan's colour (three faces, a tape across the lid and
// down the side). Packed as it is carried onto the Calendar, unpacked where it
// is let go. Static markup of our own (no outside content).
const PACKAGE_SVG = `<svg class="krnl-pkg" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
  <g class="krnl-pkg-body">
    <path class="pkg-left" d="M4 11 L16 17 L16 29.5 L4 23.5 Z"/>
    <path class="pkg-right" d="M16 17 L28 11 L28 23.5 L16 29.5 Z"/>
    <path class="pkg-tape" d="M21 14.5 L23 13.5 L23 26 L21 27 Z"/>
    <path class="pkg-edge" d="M4 11 L16 17 L28 11 M16 17 L16 29.5 M4 11 L4 23.5 L16 29.5 L28 23.5 L28 11"/>
  </g>
  <g class="krnl-pkg-lid">
    <path class="pkg-top" d="M4 11 L16 5 L28 11 L16 17 Z"/>
    <path class="pkg-tape" d="M9 8.5 L11 7.5 L23 13.5 L21 14.5 Z"/>
    <path class="pkg-edge" d="M4 11 L16 5 L28 11 L16 17 Z"/>
  </g>
</svg>`;

// The package is in the page long before the first drag (nothing is added
// to the page while a drag starts).
boxEl();

function boxEl(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!box || !box.isConnected) {
    box = document.createElement('div');
    box.className = 'krnl-carry-box';
    box.setAttribute('aria-hidden', 'true');
    box.setAttribute('data-testid', 'carry-box');
    box.innerHTML = PACKAGE_SVG;
    box.addEventListener('animationend', (e) => {
      // Unpacked: it is gone until the next carry.
      if ((e as AnimationEvent).animationName === 'krnl-pkg-unpack') box?.classList.remove('is-unpacking');
    });
    document.body.appendChild(box);
  }
  return box;
}

function paintBox(): void {
  boxRaf = 0;
  const el = boxEl();
  if (!el || !carry || !boxAt) return;
  const visible = carry.show === 'always' || (carry.show === 'offCalendar' ? !boxAt.over : boxAt.over);
  // `translate` (not `transform`): the pack and unpack motion works around the parcel itself.
  el.style.setProperty('translate', `${Math.round(boxAt.x + BOX_OFFSET.x)}px ${Math.round(boxAt.y + BOX_OFFSET.y)}px`);
  // Showing again packs it again (the lid comes down).
  el.classList.toggle('is-shown', visible);
}

/** Moves the package (and says whether the pointer is over the Calendar). */
export function moveCarry(x: number, y: number, overCalendar: boolean): void {
  if (!carry) return;
  boxAt = { x, y, over: overCalendar };
  if (!boxRaf) boxRaf = frame(paintBox);
}

/**
 * Starts carrying (Decision 63: only the drag engine calls this). The
 * package follows the pointer; `show` says where it is drawn.
 */
export function startCarry(tone: string, show: CarryShow): void {
  endCarry();
  const el = boxEl();
  if (!el) return;
  el.classList.remove('is-unpacking');
  el.style.setProperty('--carry-tone', tone);
  carry = { show };
}

/** Ends the carry; `unpack`: it was let go on the Calendar, so the package opens there. */
export function endCarry(opts: { unpack?: boolean } = {}): void {
  if (!carry) return;
  if (boxRaf) { cancelFrame(boxRaf); paintBox(); }
  const shown = !!box?.classList.contains('is-shown');
  carry = null;
  boxAt = null;
  if (!box) return;
  box.classList.remove('is-shown');
  if (opts.unpack && shown) {
    void box.offsetWidth;
    box.classList.add('is-unpacking');
  }
}

