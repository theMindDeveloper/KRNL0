// @vitest-environment jsdom
/**
 * Decision 63 — pulling a repeating event's bottom edge changes its length
 * for every week (it was never saved: the band snapped back).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { calendarGhost, setCalendarGhost } from '../DropGhost';
import { mockCalendarLayout, nextFrame, release } from './calendarLayout';
import type { CalendarState, CalendarConfig } from '../types';

const habitCmd = vi.fn(async (_cmd: string, _args: Record<string, unknown>) => undefined);
vi.mock('../../../../store/scheduleActions', async (orig) => ({
  ...(await orig<typeof import('../../../../store/scheduleActions')>()),
  habitMotherCommand: (cmd: string, args: Record<string, unknown>) => habitCmd(cmd, args),
}));

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };
const lecture = { id: 'ev-lecture', name: 'Lecture', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'weekly', days: [4], timeOfDay: '14:00', durationMin: 90 } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [
    { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [lecture] } },
  ] as never } });
});
afterEach(() => { vi.useRealTimers(); cleanup(); setCalendarGhost(null); useBoardStore.setState({ board: null }); habitCmd.mockClear(); vi.restoreAllMocks(); });

describe('a repeating event pulled by its bottom edge', () => {
  it('lands as soon as the board has it, not after the 1.5 s fallback (the check reads the board as it is now)', async () => {
    // The command reaches the board, as the real dispatcher does.
    habitCmd.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd !== 'habit.setSchedule') return undefined;
      const b = useBoardStore.getState().board!;
      useBoardStore.setState({ board: { ...b, nodes: b.nodes.map((n) => (n.id === 'mother-habit' ? { ...n, state: { habits: [{ ...lecture, schedule: args['schedule'] }] } } : n)) } as never });
      return undefined;
    });
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const col = document.querySelector('[data-cal-day="2026-05-14"]')!;
      const rowH = parseFloat(getComputedStyle(document.querySelector('[data-cal-surface]')!).getPropertyValue('--rh')) || 28;
      const y = 15.5 * rowH - 2;
      fireEvent.pointerDown(col, { button: 0, clientX: 350, clientY: y });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: y + 60 }));
      await act(async () => { await nextFrame(); });
      await act(async () => { await release(350, y + 60); await new Promise((r) => setTimeout(r, 30)); });
      expect(calendarGhost()).toBeNull();
      // Drawn from the board again (the pulled drawing is let go with the ghost).
      expect(document.querySelector('[data-testid="calendar-routine-ev-lecture"]')).toBeTruthy();
    } finally { restore(); }
  });

  it('pulled into the next event, it takes its lane beside it while pulled: nothing changes on release', async () => {
    const seminar = { ...lecture, id: 'ev-seminar', name: 'Seminar', schedule: { kind: 'weekly', days: [4], timeOfDay: '16:00', durationMin: 60 } };
    const withHabits = (habits: unknown[]) => {
      const b = useBoardStore.getState().board!;
      useBoardStore.setState({ board: { ...b, nodes: b.nodes.map((n) => (n.id === 'mother-habit' ? { ...n, state: { habits } } : n)) } as never });
    };
    withHabits([lecture, seminar]);
    habitCmd.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'habit.setSchedule') withHabits([{ ...lecture, schedule: args['schedule'] }, seminar]);
      return undefined;
    });
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const band = () => document.querySelector<HTMLElement>('[data-cal-day="2026-05-14"] [data-testid="calendar-routine-ev-lecture"]')!;
      const col = document.querySelector('[data-cal-day="2026-05-14"]')!;
      const rowH = parseFloat(getComputedStyle(document.querySelector('[data-cal-surface]')!).getPropertyValue('--rh')) || 28;
      const w0 = band().style.width;
      const y = 15.5 * rowH - 2;
      fireEvent.pointerDown(col, { button: 0, clientX: 350, clientY: y });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: y + 1.5 * rowH }));
      await act(async () => { await nextFrame(); });
      // It now overlaps the seminar: two lanes, while still being pulled.
      const pulled = band().style.width;
      expect(pulled).not.toBe(w0);
      expect(pulled).toMatch(/0\.5 \*|\/ 2/);
      await act(async () => { await release(350, y + 1.5 * rowH); await new Promise((r) => setTimeout(r, 30)); });
      expect(band().style.width).toBe(pulled);
    } finally { restore(); }
  });

  it('gets the new length for every week', async () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const col = document.querySelector('[data-cal-day="2026-05-14"]')!;
      expect(col.querySelector('[data-testid="calendar-routine-ev-lecture"]')).toBeTruthy();
      // The Calendar finds the edge with its own hour height (jsdom: no CSS sizes).
      const rowH = parseFloat(getComputedStyle(document.querySelector('[data-cal-surface]')!).getPropertyValue('--rh')) || 28;
      const y = 15.5 * rowH - 2;
      fireEvent.pointerDown(col, { button: 0, clientX: 350, clientY: y });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: y + 60 }));
      await act(async () => { await nextFrame(); });
      await act(async () => { await release(350, y + 60); });
      const set = habitCmd.mock.calls.find((c) => c[0] === 'habit.setSchedule');
      expect(set?.[1]).toMatchObject({ habitId: 'ev-lecture', schedule: { kind: 'weekly', days: [4], timeOfDay: '14:00' } });
      expect((set?.[1] as { schedule: { durationMin: number } }).schedule.durationMin).toBeGreaterThan(90);
    } finally { restore(); }
  });
});
