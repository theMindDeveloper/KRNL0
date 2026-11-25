// @vitest-environment jsdom
/**
 * Decision 63 — one drag engine: one target rule and one look for a plan,
 * an event (once or repeating) and a habit.
 */
import { describe, it, expect } from 'vitest';
import { canChangeDay, dragTarget, ghostFor, type DragItem } from '../calendarDrag';

const plan: DragItem = { kind: 'task', id: 't-1', name: 'Write report', tone: 'var(--acid)', lenMin: 60, plannedMin: 60 };
const weekly: DragItem = { kind: 'event', id: 'ev-1', name: 'Lecture', tone: 'var(--acid)', lenMin: 90, repeat: 'weekly' };
const once: DragItem = { ...weekly, id: 'ev-2', name: 'Dentist', repeat: 'once' };
const daily: DragItem = { ...weekly, id: 'ev-3', name: 'Standup', repeat: 'daily' };
const habit: DragItem = { kind: 'habit', id: 'h-1', name: 'Run', tone: 'var(--acid)', lenMin: 30 };

describe('which kinds may change day', () => {
  it('a plan and a weekly or one-time event may; a daily event and a habit keep their days', () => {
    expect(canChangeDay(plan)).toBe(true);
    expect(canChangeDay(weekly)).toBe(true);
    expect(canChangeDay(once)).toBe(true);
    expect(canChangeDay(daily)).toBe(false);
    expect(canChangeDay(habit)).toBe(false);
  });
});

describe('the one target rule', () => {
  const origin = { day: '2026-05-14', startMin: 600, endMin: 660 };

  it('moved: the grabbed spot stays under the pointer, snapped by the step', () => {
    // Grabbed 15 min into the block, pointer now 2 h 7 min later: moves 2 h 0 min at a 15-min step.
    const t = dragTarget({ mode: 'move', origin, startMin: 615, now: { day: '2026-05-15', min: 742 }, lenMin: 60, gran: 15, dayChange: true });
    expect(t).toEqual({ day: '2026-05-15', startMin: 720, endMin: 780 });
  });

  it('moved without a day change: stays on its own day', () => {
    const t = dragTarget({ mode: 'move', origin, startMin: 615, now: { day: '2026-05-16', min: 675 }, lenMin: 60, gran: 15, dayChange: false });
    expect(t).toEqual({ day: '2026-05-14', startMin: 660, endMin: 720 });
  });

  it('moved past midnight: clamped inside the day', () => {
    expect(dragTarget({ mode: 'move', origin, startMin: 615, now: { day: '2026-05-14', min: 0 }, lenMin: 60, gran: 15, dayChange: true }).startMin).toBe(0);
    expect(dragTarget({ mode: 'move', origin, startMin: 615, now: { day: '2026-05-14', min: 1439 }, lenMin: 60, gran: 15, dayChange: true }).startMin).toBe(1425);
  });

  it('resized: only that edge follows, and it never crosses the other', () => {
    expect(dragTarget({ mode: 'bottom', origin, startMin: 660, now: { day: '2026-05-14', min: 720 }, lenMin: 60, gran: 15, dayChange: true })).toEqual({ day: '2026-05-14', startMin: 600, endMin: 720 });
    expect(dragTarget({ mode: 'top', origin, startMin: 600, now: { day: '2026-05-14', min: 570 }, lenMin: 60, gran: 15, dayChange: true })).toEqual({ day: '2026-05-14', startMin: 570, endMin: 660 });
    expect(dragTarget({ mode: 'top', origin, startMin: 600, now: { day: '2026-05-14', min: 700 }, lenMin: 60, gran: 15, dayChange: true }).startMin).toBe(645);
    expect(dragTarget({ mode: 'bottom', origin, startMin: 660, now: { day: '2026-05-14', min: 500 }, lenMin: 60, gran: 15, dayChange: true }).endMin).toBe(615);
  });

  it('carried in from outside: it starts at the step under the pointer', () => {
    expect(dragTarget({ mode: 'move', origin: null, startMin: null, now: { day: '2026-05-14', min: 547 }, lenMin: 45, gran: 15, dayChange: true })).toEqual({ day: '2026-05-14', startMin: 540, endMin: 585 });
  });
});

describe('near another block it lands on its edge (owner, 2026-11-25)', () => {
  const origin = { day: '2026-05-14', startMin: 600, endMin: 660 };
  // Another block 12:00–13:00 that day; none the next day.
  const edgesOn = (day: string) => (day === '2026-05-14' ? [720, 780] : []);
  const base = { origin, startMin: 615, lenMin: 60, gran: 5, dayChange: true, edgesOn, edgeRange: 10 } as const;

  it('moved: the start lands on its end, or the end on its start (back to back)', () => {
    // Start would be 13:07: lands on 13:00, right after it.
    expect(dragTarget({ ...base, mode: 'move', now: { day: '2026-05-14', min: 615 + 187 } })).toMatchObject({ startMin: 780, endMin: 840 });
    // End would be 11:52: lands on 12:00, right before it.
    expect(dragTarget({ ...base, mode: 'move', now: { day: '2026-05-14', min: 615 + 52 } })).toMatchObject({ startMin: 660, endMin: 720 });
  });
  it('side by side: a start near its start lands on it (both at 12:00)', () => {
    expect(dragTarget({ ...base, mode: 'move', now: { day: '2026-05-14', min: 615 + 124 } })).toMatchObject({ startMin: 720, endMin: 780 });
  });
  it('further away it is free, in 5-minute steps (it may overlap)', () => {
    expect(dragTarget({ ...base, mode: 'move', now: { day: '2026-05-14', min: 615 + 145 } })).toMatchObject({ startMin: 745, endMin: 805 });
  });
  it('a pulled edge lands on the neighbour too', () => {
    expect(dragTarget({ ...base, mode: 'bottom', startMin: 660, now: { day: '2026-05-14', min: 714 } }).endMin).toBe(720);
  });
  it('carried in from Todo: lands on the edge near the pointer', () => {
    expect(dragTarget({ ...base, mode: 'move', origin: null, startMin: null, now: { day: '2026-05-14', min: 784 } })).toMatchObject({ startMin: 780, endMin: 840 });
  });
  it('another day has its own blocks; a range of 0 (Alt held) turns it off', () => {
    expect(dragTarget({ ...base, mode: 'move', now: { day: '2026-05-15', min: 615 + 187 } }).startMin).toBe(785);
    expect(dragTarget({ ...base, edgeRange: 0, mode: 'move', now: { day: '2026-05-14', min: 615 + 187 } }).startMin).toBe(785);
  });
});

describe('the one look', () => {
  const t = { day: '2026-05-14', startMin: 540, endMin: 600 };

  it('each kind carries its mark; a repeating event says how it repeats', () => {
    expect(ghostFor(plan, t, 'move')).toMatchObject({ testId: 'calendar-drag-ghost', mark: 'list', refId: 't-1', refKind: 'task', edge: 'top' });
    const w = ghostFor(weekly, t, 'move');
    expect(w).toMatchObject({ mark: 'repeat', refId: 'ev-1', refKind: 'event' });
    expect(w.times).toMatch(/every week$/);
    expect(ghostFor(daily, t, 'move').times).toMatch(/every day$/);
    const o = ghostFor(once, t, 'move');
    expect(o.mark).toBe('event');
    expect(o.times).not.toMatch(/every/);
  });

  it('a habit shows only the time line, with its start time', () => {
    const g = ghostFor(habit, t, 'move');
    expect(g).toMatchObject({ ruleOnly: true, times: '09:00' });
    expect(g.refId).toBeUndefined();
    expect(g.mark).toBeUndefined();
  });

  it('a Todo row with no card yet is not on the Clock until it lands', () => {
    expect(ghostFor({ ...plan, itemOnly: true }, t, 'move').refId).toBeUndefined();
  });

  it('the bottom edge resized: the time chip sits on the bottom edge', () => {
    expect(ghostFor(plan, t, 'bottom').edge).toBe('bottom');
  });
});
