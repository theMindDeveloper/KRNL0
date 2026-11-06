// @vitest-environment jsdom
/**
 * Calendar ↔ Clock right-click parity (calendar-clock-visuals F-CM1..F-CM5).
 *
 * The same scheduled task and the same tracked pomo segment, right-clicked on
 * the Calendar day column and on the Clock day view, must offer the same
 * actions — both surfaces build their menus from ContextMenu/scheduleMenus.ts.
 * Also covers the pomo highlights: background bands that never take pointer
 * events (so drops still reach the hour cells).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../../../src/renderer/components/nodes/CalendarNode/WeekView';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { CalendarConfig, CalendarState } from '../../../src/renderer/components/nodes/CalendarNode/types';
import type { ClockConfig, ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';

const pad = (n: number) => String(n).padStart(2, '0');
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

function task(id: string, text: string, scheduledFor: string): Node {
  return {
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false,
    state: {
      text, done: false, scheduledFor, durationMin: 60, eta: '~60 min', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin: 60, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event',
    },
    config: { showDuration: true },
  };
}

function seed(): void {
  const board: Board = {
    version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      task('t-math', 'Math', `${TODAY}T08:00`),
      task('t-phys', 'Physics', `${TODAY}T11:00`),
      {
        id: 'mother-pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, config: {},
        state: {
          status: 'idle', startedAt: null, activeTaskId: null, label: '',
          history: [{ id: 'seg-1', startedAt: `${TODAY}T10:00:00`, endedAt: `${TODAY}T10:25:00`, durationMin: 25, completed: true, kind: 'work', label: 'Math', taskId: 't-math' }],
        },
      },
    ],
  };
  useBoardStore.setState({ board });
}

const calState = (): CalendarState => ({ selectedDate: null, anchorDate: TODAY, zoom: 1 } as CalendarState);
const calConfig = (): CalendarConfig => ({ view: 'day', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 23 } } as CalendarConfig);
const clockNode = (): Node<ClockState, ClockConfig> => ({
  id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true,
  state: { linkedTodoId: null, viewWindow: 0, selectedDate: TODAY }, config: {},
});

/** Labels of the open ContextMenu (header row + buttons). */
function menuLabels(): string[] {
  const buttons = Array.from(document.body.querySelectorAll('div[style*="position: fixed"] > button'))
    .map((b) => b.textContent ?? '');
  return buttons;
}

function calendarMenuAt(hour: number): string[] {
  const view = render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} singleDay />);
  const col = document.querySelector(`[data-testid="week-col-${TODAY}"]`) as HTMLElement;
  fireEvent.contextMenu(col, { clientY: hour * 28, clientX: 60 });
  const labels = menuLabels();
  view.unmount();
  return labels;
}

function clockMenu(selector: string): string[] {
  const view = render(<ClockNode node={clockNode()} selected={false} onCommand={() => {}} onSelect={() => {}} />);
  const el = document.querySelector(selector) as Element;
  expect(el).toBeTruthy();
  fireEvent.contextMenu(el, { clientX: 60, clientY: 60 });
  const labels = menuLabels();
  view.unmount();
  return labels;
}

describe('Calendar ↔ Clock right-click parity', () => {
  it('a task offers the same actions on both surfaces', () => {
    seed();
    const cal = calendarMenuAt(8.5);
    const clock = clockMenu('[data-testid="clock-plan-arc"][data-task-id="t-math"]');
    expect(cal).toEqual(['Details…', 'Start focus', 'Mark done', 'Show on canvas', 'Unschedule']);
    // Identical on both surfaces, Details… included.
    expect(clock).toEqual(cal);
  });

  it('right-click on recorded time opens the same popup as left-click, on both surfaces', () => {
    seed();
    let view = render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} singleDay />);
    const col = document.querySelector(`[data-testid="week-col-${TODAY}"]`) as HTMLElement;
    fireEvent.contextMenu(col, { clientY: 10.2 * 28, clientX: 60 });
    expect(document.querySelector('[data-testid="calendar-reality-popup"]')).toBeTruthy();
    // No separate right-click menu for recorded time any more.
    expect(menuLabels()).not.toContain('Untag');
    view.unmount();
    view = render(<ClockNode node={clockNode()} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    fireEvent.contextMenu(document.querySelector('[data-testid="clock-reality-arc"]') as Element, { clientX: 60, clientY: 60 });
    expect(document.querySelector('[data-testid="clock-reality-popup"]')).toBeTruthy();
    view.unmount();
  });

  it('menu actions change the board (retag, delete, unschedule)', async () => {
    seed();
    render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} singleDay />);
    const col = document.querySelector(`[data-testid="week-col-${TODAY}"]`) as HTMLElement;
    const pomo = () => useBoardStore.getState().board!.nodes.find((n) => n.kind === 'pomo')!.state as { history: Array<{ taskId: string | null }> };

    fireEvent.contextMenu(col, { clientY: 10.2 * 28, clientX: 60 });
    act(() => { fireEvent.click(screen.getByTestId('calendar-reality-retag')); });
    act(() => { fireEvent.click(screen.getByTestId('calendar-reality-retag-picker-task-t-phys')); });
    expect(pomo().history[0]!.taskId).toBe('t-phys');

    act(() => { fireEvent.click(screen.getByTestId('calendar-reality-delete')); });
    expect(pomo().history).toEqual([]);

    fireEvent.contextMenu(col, { clientY: 8.5 * 28, clientX: 60 });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Unschedule' })); });
    // Unschedule goes through the dispatcher (lazy-loaded), so it lands a tick later.
    await waitFor(() => {
      const math = useBoardStore.getState().board!.nodes.find((n) => n.id === 't-math')!.state as { scheduledFor: string | null };
      expect(math.scheduledFor ?? null).toBeNull();
    });
  });
});

describe('Calendar pomo spans as background highlights', () => {
  it('is a thin rail beside the plan and never takes pointer events', () => {
    seed();
    render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} singleDay />);
    const band = document.querySelector('[data-testid="calendar-reality-block"]') as HTMLElement;
    expect(band).toBeTruthy();
    expect(band.style.pointerEvents).toBe('none');
    // The recorded rail sits in its own lane beside the plan blocks (z 1), never under them.
    expect(band.style.zIndex).toBe('1');
    expect(band.getAttribute('data-reality-kind')).toBe('work');
    // Recorded time is a thin rail inside the day's left edge (calendar F-layers), not a full-width band.
    expect(band.style.left).toBe('5px');
    expect(band.style.width).toBe('4px');
  });

  it('focus and break read differently', () => {
    seed();
    const b = useBoardStore.getState().board!;
    const pomo = b.nodes.find((n) => n.kind === 'pomo')!;
    (pomo.state as { history: unknown[] }).history.push({ id: 'seg-2', startedAt: `${TODAY}T10:25:00`, endedAt: `${TODAY}T10:30:00`, durationMin: 5, completed: true, kind: 'break', label: '' });
    useBoardStore.setState({ board: { ...b } });
    render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} singleDay />);
    const [work, brk] = Array.from(document.querySelectorAll('[data-testid="calendar-reality-block"]')) as HTMLElement[];
    expect(brk!.getAttribute('data-reality-kind')).toBe('break');
    expect(work!.style.background).not.toEqual(brk!.style.background);
    // A break is the gap in the rail: nothing is drawn (no stripes).
    expect(brk!.style.background).toBe('transparent');
  });
});
