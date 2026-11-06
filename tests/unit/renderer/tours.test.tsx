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
    expect(TOURS.map((t) => t.id)).toEqual(['whats-new', 'first-day', 'welcome', 'pomo', 'todo', 'calendar', 'clock', 'habits', 'analytics', 'modes', 'terminal']);
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
