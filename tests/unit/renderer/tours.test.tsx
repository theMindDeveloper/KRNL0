// @vitest-environment jsdom
/** Guided tours — one per part of the app; steps wait for Next or the real action. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TOURS, tourById, stepsFor } from '../../../src/renderer/components/Tour/tours';
import { TourHost, startTour } from '../../../src/renderer/components/Tour/TourHost';
import { SysParser } from '../../../src/sys/parser';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({
  ...(await orig<typeof import('../../../src/renderer/store/eventLog')>()),
  saveBoard: vi.fn(async () => undefined),
}));

describe('Easy and Advanced tour — a live demo', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; });
  const seed = (): void => {
    useBoardStore.setState({ board: { version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], uiMode: 'easy' } as unknown as Board });
  };
  const mode = (): string | undefined => useBoardStore.getState().board?.uiMode;

  it('switches the app to the mode each step talks about, and puts the user’s mode back on End', () => {
    seed();
    render(<TourHost />);
    act(() => { startTour('modes'); });
    // the intro names the user's own mode, highlighted
    expect(screen.getByTestId('tour-text').querySelector('mark')?.textContent).toBe('two modes');
    expect(screen.getByTestId('tour-text').textContent).toContain('Easy mode right now');
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); }); // where to switch (Settings → Mode)
    expect(screen.getByTestId('tour-text').textContent).toContain('Settings → Mode');
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); }); // Easy step
    expect(mode()).toBe('easy');
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); }); // the Pomo switch appears
    expect(mode()).toBe('advanced');
    act(() => { fireEvent.click(screen.getByTestId('tour-end')); });
    expect(mode()).toBe('easy');
  });

  it('the last step chooses a mode, and that choice stays', () => {
    seed();
    render(<TourHost />);
    act(() => { startTour('modes'); });
    const n = tourById('modes')!.steps.length;
    for (let k = 0; k < n - 1; k++) act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    expect(screen.queryByTestId('tour-next')).toBeNull();
    act(() => { fireEvent.click(screen.getByTestId('tour-choose-advanced')); });
    expect(screen.queryByTestId('tour-card')).toBeNull();
    expect(mode()).toBe('advanced');
  });
});

describe('tour catalogue', () => {
  it('has a tour for each part of the app', () => {
    expect(TOURS.map((t) => t.id)).toEqual(['first-day', 'welcome', 'pomo', 'todo', 'calendar', 'clock', 'habits', 'routines', 'calendars', 'layout', 'on-track', 'plans-change', 'analytics', 'modes', 'board', 'boards', 'sync', 'terminal']);
    for (const t of TOURS) {
      expect(t.steps.length).toBeGreaterThan(1);
      for (const s of t.steps) expect(s.text.length).toBeGreaterThan(10);
    }
    expect(tourById('nope')).toBeUndefined();
  });

  it('a user only gets the steps that exist in their mode', () => {
    const todo = tourById('todo')!;
    const easy = stepsFor(todo, 'easy');
    const adv = stepsFor(todo, 'advanced');
    expect(easy.some((s) => s.target?.includes('todo-tag-'))).toBe(false); // tags are Advanced-only
    expect(adv.some((s) => s.target?.includes('todo-tag-'))).toBe(true);
    for (const t of TOURS) for (const s of stepsFor(t, 'easy')) expect(s.onlyIn ?? 'easy').toBe('easy');
  });
});

describe('TourHost', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; });
  it('shows a step, Next moves on, Esc ends', () => {
    render(<TourHost />);
    act(() => { expect(startTour('welcome')).toBe(true); });
    expect(screen.getByTestId('tour-card').textContent).toContain('1 / ');
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    expect(screen.getByTestId('tour-card').textContent).toContain('2 / ');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByTestId('tour-card')).toBeNull();
  });

  it('a step that waits for a click advances when the user clicks it', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.setAttribute('data-testid', 'clock-week-toggle');
    document.body.appendChild(target);
    render(<TourHost />);
    act(() => { startTour('clock'); });
    // go to the "press WEEK" step
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    expect(screen.getByTestId('tour-text').textContent).toMatch(/Week/);
    expect(screen.queryByTestId('tour-next')).toBeNull(); // waiting, no Next
    act(() => { target.click(); vi.advanceTimersByTime(400); });
    expect(screen.getByTestId('tour-text').textContent).toMatch(/Each clock is a day/);
    vi.useRealTimers();
  });
});

describe('krnl tour', () => {
  it('parses list / start', () => {
    expect(SysParser.parse(['tour'])).toEqual({ kind: 'tour', sub: 'list' });
    expect(SysParser.parse(['tour', 'start', 'pomo'])).toEqual({ kind: 'tour', sub: 'start', id: 'pomo' });
  });
});

describe('Staying on track tour', () => {
  const b = (habits: unknown[], items: unknown[] = [], taskStates: unknown[] = []) => ({
    nodes: [
      { id: 'mother-habit', kind: 'habit', isMother: true, state: { habits } },
      { id: 'mother-todo', kind: 'todo', isMother: true, state: { items } },
      ...taskStates.map((state, i) => ({ id: `t${i}`, kind: 'todo.task', state })),
    ],
    edges: [],
  }) as never;
  it('waits for a weekly target, a rest day, a due date and a reminder', () => {
    const t = tourById('on-track')!;
    const waits = t.steps.filter((s) => s.waitFor && 'board' in s.waitFor).map((s) => (s.waitFor as { board: (a: never, c: never) => boolean }).board);
    expect(waits).toHaveLength(5);
    const [target, amount, rest, due, remind] = waits as Array<(a: never, c: never) => boolean>;
    expect(amount!(b([{ id: 'w', amount: { target: 8, unit: 'glasses' } }]), b([{ id: 'w' }]))).toBe(true);
    expect(target!(b([{ id: 'g', perWeek: 3 }]), b([{ id: 'g' }]))).toBe(true);
    expect(rest!(b([{ id: 'g', rest: ['2026-11-08'] }]), b([{ id: 'g' }]))).toBe(true);
    expect(due!(b([], [{ id: 'a', dueOn: '2026-11-13' }]), b([], [{ id: 'a' }]))).toBe(true);
    expect(remind!(b([], [], [{ remindMin: 10 }]), b([], [], [{}]))).toBe(true);
  });
});

describe('Habits & Routines tour (routines.md F13)', () => {
  const boardWith = (habits: unknown[]) => ({ nodes: [{ id: 'mother-habit', kind: 'habit', isMother: true, state: { habits } }], edges: [] }) as never;
  const routine = { id: 'r', kind: 'routine', log: [], schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00', durationMin: 120 } };
  it('waits for an event once, a repeating one, a week skipped and an event ended (Decision 62)', () => {
    const t = tourById('routines')!;
    const waits = t.steps.filter((s) => s.waitFor && 'board' in s.waitFor).map((s) => (s.waitFor as { board: (a: never, b: never) => boolean }).board);
    expect(waits).toHaveLength(4);
    const [once, added, skipped, ended] = waits as [(a: never, b: never) => boolean, (a: never, b: never) => boolean, (a: never, b: never) => boolean, (a: never, b: never) => boolean];
    const dentist = { ...routine, startsOn: '2026-11-27', endsOn: '2026-11-27' };
    expect(once(boardWith([dentist]), boardWith([]))).toBe(true);
    expect(once(boardWith([routine]), boardWith([]))).toBe(false); // a weekly one is not "once"
    expect(added(boardWith([dentist, routine]), boardWith([dentist]))).toBe(true);
    expect(added(boardWith([dentist, { ...dentist, id: 'x' }]), boardWith([dentist]))).toBe(false); // another one-time event is not a repeating one
    expect(added(boardWith([{ ...routine, kind: undefined }]), boardWith([]))).toBe(false); // a habit is not a routine
    expect(skipped(boardWith([{ ...routine, exceptions: [{ date: '2026-11-09', skip: true }] }]), boardWith([routine]))).toBe(true);
    expect(ended(boardWith([{ ...routine, endsOn: '2026-11-08' }]), boardWith([routine]))).toBe(true);
  });
});

describe('Separate boards tour (boards.md F12)', () => {
  const boards = tourById('boards')!;
  it('is an Advanced tour that opens the menu and the New board form by doing it', () => {
    expect(boards.onlyIn).toBe('advanced');
    const waits = boards.steps.filter((s) => s.waitFor && 'click' in s.waitFor).map((s) => (s.waitFor as { click: string }).click);
    expect(waits).toEqual(['[data-testid="topbar-canvas-switcher"]', '[data-testid="board-new"]']);
    expect(boards.steps.some((s) => s.target === '[data-testid="board-new-form"]')).toBe(true);
  });
  it('every step has a line for the voice, with no tags', () => {
    for (const s of boards.steps) {
      expect(s.say && s.say.length > 10).toBe(true);
      expect(s.say).not.toMatch(/\[[A-Za-z ]+\]/);
    }
  });
});

describe('Your layout tour (Decisions 54-60)', () => {
  const t = tourById('layout')!;
  it('shows My layout where it needs it and puts back the layout the user started in', () => {
    expect(t.restoreLayout).toBe(true);
    expect(t.steps.filter((s) => s.layout === 'station').length).toBeGreaterThanOrEqual(2);
    expect(t.steps.some((s) => s.target === '[data-testid="layout-option-free"]')).toBe(true);
  });
  it('waits for a swap and for the Free canvas', () => {
    const waits = t.steps.filter((s) => s.waitFor && 'board' in s.waitFor).map((s) => (s.waitFor as { board: (a: never, b: never) => boolean }).board);
    expect(waits).toHaveLength(2);
    const [swapped, free] = waits as [(a: never, b: never) => boolean, (a: never, b: never) => boolean];
    const mother = (id: string, x: number) => ({ id, kind: 'todo', isMother: true, position: { x, y: 0 }, config: {}, state: {} });
    const b = (nodes: unknown[], layoutMode = 'station') => ({ version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode, nodes }) as never;
    expect(swapped(b([mother('a', 0), mother('b', 300)]), b([mother('a', 300), mother('b', 0)]))).toBe(true);
    expect(swapped(b([mother('a', 0)]), b([mother('a', 0)]))).toBe(false);
    expect(free(b([], 'canvas'), b([]))).toBe(true);
    expect(free(b([], 'station'), b([]))).toBe(false);
  });
});
