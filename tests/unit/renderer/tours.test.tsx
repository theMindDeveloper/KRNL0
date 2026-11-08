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
    expect(TOURS.map((t) => t.id)).toEqual(['first-day', 'welcome', 'pomo', 'todo', 'calendar', 'clock', 'habits', 'routines', 'on-track', 'analytics', 'modes', 'terminal']);
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
    expect(screen.getByTestId('tour-text').textContent).toMatch(/WEEK/);
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
  it('waits for a routine to be added, a week skipped and a routine ended', () => {
    const t = tourById('routines')!;
    const waits = t.steps.filter((s) => s.waitFor && 'board' in s.waitFor).map((s) => (s.waitFor as { board: (a: never, b: never) => boolean }).board);
    expect(waits).toHaveLength(3);
    const [added, skipped, ended] = waits as [(a: never, b: never) => boolean, (a: never, b: never) => boolean, (a: never, b: never) => boolean];
    expect(added(boardWith([routine]), boardWith([]))).toBe(true);
    expect(added(boardWith([{ ...routine, kind: undefined }]), boardWith([]))).toBe(false); // a habit is not a routine
    expect(skipped(boardWith([{ ...routine, exceptions: [{ date: '2026-11-09', skip: true }] }]), boardWith([routine]))).toBe(true);
    expect(ended(boardWith([{ ...routine, endsOn: '2026-11-08' }]), boardWith([routine]))).toBe(true);
  });
});
