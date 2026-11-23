// @vitest-environment jsdom
// The web app's phone / iPad shell (Decision 51, designs Phone*/Tablet*).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
// The real canvas needs a browser; its view is covered by the web simulation in headless Chrome.
vi.mock('../../../src/renderer/components/Station/EmbeddedCanvasCell', () => ({ EmbeddedCanvasCell: () => null }));
import { MobileShell } from '../../../src/renderer/components/Mobile/MobileShell';
import { formFactorFor } from '../../../src/renderer/components/Mobile/useFormFactor';
import { isStationShown } from '../../../src/renderer/components/Station/useStationViewportGate';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function setBoard(items: Array<Record<string, unknown>> = []): void {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'station',
    // A Plans window only (state read for the headline); the others are absent, so no window renders.
    nodes: [{ id: 'mother-todo', kind: 'todo-x', isMother: true, position: { x: 0, y: 0 }, state: { items }, config: {} }],
  } as unknown as Board);
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* none */ } setBoard(); });
afterEach(() => cleanup());

describe('form factor', () => {
  it('phone below 700, iPad below 1200, desktop above', () => {
    expect(formFactorFor(390)).toBe('phone');
    expect(formFactorFor(699)).toBe('phone');
    expect(formFactorFor(700)).toBe('tablet');
    expect(formFactorFor(1180)).toBe('tablet');
    expect(formFactorFor(1200)).toBe('desktop');
  });
});

describe('MobileShell', () => {
  it('phone: five tabs (Today, Todos, Calendar, Habits, More), Today first; the choice is kept for this browser session', () => {
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-shell-phone')).toBeTruthy();
    for (const v of ['today', 'todos', 'calendar', 'habits', 'more']) expect(screen.getByTestId(`m-nav-${v}`)).toBeTruthy();
    expect(screen.queryByTestId('m-nav-insights')).toBeNull();
    expect(screen.getByTestId('m-nav-today').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('m-today')).toBeTruthy();
    fireEvent.click(screen.getByTestId('m-nav-habits'));
    expect(screen.getByTestId('m-nav-habits').getAttribute('aria-current')).toBe('page');
    expect(sessionStorage.getItem('krnl0-web-view')).toBe('habits');
    cleanup();
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-nav-habits').getAttribute('aria-current')).toBe('page');
  });

  it('iPad: the same views in a side rail, named as in the design (Week)', () => {
    render(<MobileShell ff="tablet" />);
    expect(screen.getByTestId('m-shell-tablet')).toBeTruthy();
    expect(screen.getByTestId('m-nav-calendar').textContent).toContain('Week');
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeTruthy();
  });

  it('while the shell is up, the canvas shows only free cards (the windows have their own views)', () => {
    expect(isStationShown('canvas')).toBe(false);
    render(<MobileShell ff="phone" />);
    expect(isStationShown('canvas')).toBe(true);
    cleanup();
    expect(isStationShown('canvas')).toBe(false);
  });

  it('no Focus while the timer is idle', () => {
    render(<MobileShell ff="phone" />);
    expect(screen.queryByTestId('m-focus-open')).toBeNull();
  });

  it('the phone gives the Calendar the whole screen: no Calendar / Clock switch (Decision 56)', () => {
    render(<MobileShell ff="phone" />);
    fireEvent.click(screen.getByTestId('m-nav-calendar'));
    expect(screen.getByTestId('m-calendar')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Clock' })).toBeNull();
  });

  it('Today opens with Your day and a way to the Calendar (phone-web F1; the list itself: dayAgenda.test.ts)', () => {
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-day')).toBeTruthy();
    fireEvent.click(screen.getByTestId('m-day-calendar'));
    expect(screen.getByTestId('m-nav-calendar').getAttribute('aria-current')).toBe('page');
  });

  it('phone: Insights and Canvas open from More, and More stays marked (phone-web F9)', () => {
    render(<MobileShell ff="phone" />);
    fireEvent.click(screen.getByTestId('m-nav-more'));
    expect(screen.getByTestId('m-more')).toBeTruthy();
    fireEvent.click(screen.getByTestId('m-more-insights'));
    expect(screen.queryByTestId('m-more')).toBeNull();
    expect(screen.getByTestId('m-nav-more').getAttribute('aria-current')).toBe('page');
  });

  it('phone: Todos have their own tab (phone-web F9)', () => {
    render(<MobileShell ff="phone" />);
    fireEvent.click(screen.getByTestId('m-nav-todos'));
    expect(screen.getByTestId('m-todos')).toBeTruthy();
    expect(screen.getByTestId('m-nav-todos').getAttribute('aria-current')).toBe('page');
  });

  it('iPad keeps Insights and Canvas in its rail (no More)', () => {
    render(<MobileShell ff="tablet" />);
    expect(screen.getByTestId('m-nav-insights')).toBeTruthy();
    expect(screen.queryByTestId('m-nav-more')).toBeNull();
  });

  it('phone Today has one timer card with one Start, and no Plans or Habits windows (phone-web F3)', () => {
    useBoardStore.getState().setBoard({
      version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'station',
      nodes: [
        { id: 'mother-todo', kind: 'todo-x', isMother: true, position: { x: 0, y: 0 }, state: { items: [] }, config: {} },
        { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, activeTaskId: null, history: [], pausedAt: null, sessionWorkSec: 0, pausedElapsedMs: 0 }, config: { mode: 'pomodoro', sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 } },
      ],
    } as unknown as Board);
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-timer-card').textContent).toContain('25:00');
    expect(screen.getAllByText('Start')).toHaveLength(1);
    expect(screen.queryByLabelText('Plans')).toBeNull();
    expect(screen.queryByLabelText('Habits')).toBeNull();
  });

  it('has a settings button on the phone', () => {
    setBoard([{ id: 'a', text: 'Gym', done: false, createdAt: '', completedAt: null, taskNodeId: null, scheduledFor: `${today()}T17:30` }]);
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-settings')).toBeTruthy();
  });
});
