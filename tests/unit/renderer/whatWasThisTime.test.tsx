// @vitest-environment jsdom
/**
 * time-log F21 — one "what was this time" everywhere. Log past time and
 * "Time spent on" take a typed name ("Age of Empires 2"), a kind of work or a
 * task, through the same list as the Pomo's "What are you doing?".
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { LogTimeHost, openLogTime, CountsToward } from '../../../src/renderer/components/ui/SpanEditor';
import { addPastSegment, setSegmentWhat } from '../../../src/renderer/store/scheduleActions';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';

const pad = (n: number) => String(n).padStart(2, '0');
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const at = (hm: string): number => new Date(`${TODAY}T${hm}:00`).getTime();

type Rec = { id: string; label: string; taskId: string | null; tag?: string };
const history = (): Rec[] => (useBoardStore.getState().board!.nodes.find((n) => n.kind === 'pomo')!.state as { history: Rec[] }).history;

function task(id: string, text: string): Node {
  return {
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false,
    state: {
      text, done: false, scheduledFor: null, durationMin: 60, eta: '~60 min', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin: 60, secondsAccumulated: 0, currentSessionElapsedSec: 0,
    },
    config: { showDuration: true },
  } as unknown as Node;
}

function seed(history: Rec[] = []): void {
  const board = {
    version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      task('t-api', 'API'),
      {
        id: 'mother-pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, config: {},
        state: { status: 'idle', startedAt: null, activeTaskId: null, label: '', pausedAt: null, history: history.map((h) => ({
          startedAt: new Date(at('09:00')).toISOString(), endedAt: new Date(at('10:00')).toISOString(), durationMin: 60, completed: false, kind: 'work', ...h,
        })) },
      },
    ],
  } as unknown as Board;
  useBoardStore.setState({ board });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T23:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useBoardStore.setState({ board: null });
});

describe('store (F21)', () => {
  it('logs past time under a free name with a kind of work', () => {
    seed();
    expect(addPastSegment(at('20:00'), at('22:00'), null, 'Age of Empires 2', 'writing')).toBeNull();
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null, tag: 'writing' });
  });

  it('turns a task span into a free name, and back to unnamed', () => {
    seed([{ id: 's1', label: 'API', taskId: 't-api' }]);
    setSegmentWhat('s1', { label: 'Emails', tag: null, taskId: null });
    expect(history()[0]).toMatchObject({ label: 'Emails', taskId: null });
    setSegmentWhat('s1', { label: 'API', tag: null, taskId: 't-api' });
    expect(history()[0]).toMatchObject({ label: 'API', taskId: 't-api' });
    setSegmentWhat('s1', null);
    expect(history()[0]).toMatchObject({ label: '', taskId: null });
  });
});

describe('Log past time (F21)', () => {
  it('a typed name that is not a task is saved as the span\'s name', () => {
    seed();
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    fireEvent.change(screen.getByTestId('log-time-task-picker-type'), { target: { value: 'Age of Empires 2' } });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-new')); });
    expect(screen.getByTestId('log-time-task').textContent).toContain('Age of Empires 2');
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null });
  });

  it('a typed name filed under a kind of work', () => {
    seed();
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    fireEvent.change(screen.getByTestId('log-time-task-picker-type'), { target: { value: 'Age of Empires 2' } });
    // The kind pill in the field opens the kinds in the same box.
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-kind')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-kind-writing')); });
    expect(screen.getByTestId('log-time-task-picker-kind').textContent).toContain('Writing');
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-new')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null, tag: 'writing' });
  });

  it('a task still works', () => {
    seed();
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-task-t-api')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    expect(history()[0]).toMatchObject({ label: 'API', taskId: 't-api' });
  });
});

describe('Time spent on (F21)', () => {
  it('shows a free name, not the task list, and renames it', () => {
    seed([{ id: 's1', label: 'Age of Empires 2', taskId: null }]);
    render(<CountsToward segId="s1" taskId={null} taskName={null} label="Age of Empires 2" testId="spent" />);
    expect(screen.getByText('Time spent on')).toBeTruthy();
    expect(screen.getByTestId('spent').textContent).toContain('Age of Empires 2');
    act(() => { fireEvent.click(screen.getByTestId('spent')); });
    fireEvent.change(screen.getByTestId('spent-picker-type'), { target: { value: 'Age of Empires 3' } });
    act(() => { fireEvent.keyDown(screen.getByTestId('spent-picker-type'), { key: 'Enter' }); });
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 3', taskId: null });
  });
});

describe('names you used come back (F22)', () => {
  it('opened: a name you used is offered; typing "aoe" completes it, Tab takes it with its kind', () => {
    seed([{ id: 's1', label: 'Age of Empires 2', taskId: null, tag: 'writing' }]);
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    expect(screen.getByTestId('log-time-task-picker-name-age-of-empires-2')).toBeTruthy();
    const field = screen.getByTestId('log-time-task-picker-type');
    fireEvent.change(field, { target: { value: 'aoe' } });
    expect(screen.getByTestId('log-time-task-picker-ghost').textContent).toContain('Age of Empires 2');
    act(() => { fireEvent.keyDown(field, { key: 'Tab' }); });
    expect(screen.getByTestId('log-time-task').textContent).toContain('Age of Empires 2');
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    const added = history().find((h) => h.id !== 's1')!;
    expect(added).toMatchObject({ label: 'Age of Empires 2', taskId: null, tag: 'writing' });
  });

  it('the box never offers "New name" for a name that already exists', () => {
    seed([{ id: 's1', label: 'Age of Empires 2', taskId: null }]);
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    fireEvent.change(screen.getByTestId('log-time-task-picker-type'), { target: { value: 'age of empires 2' } });
    expect(screen.queryByTestId('log-time-task-picker-new')).toBeNull();
  });

  it('merge moves every span of a name to another', async () => {
    const { mergeFreeName } = await import('../../../src/renderer/store/scheduleActions');
    seed([
      { id: 's1', label: 'AOE2', taskId: null },
      { id: 's2', label: 'Age of Empires 2', taskId: null, tag: 'writing' },
      { id: 's3', label: 'API', taskId: 't-api' },
    ]);
    expect(mergeFreeName(' aoe2 ', 'Age of Empires 2', 'writing')).toBe(1);
    expect(history().map((h) => h.label)).toEqual(['Age of Empires 2', 'Age of Empires 2', 'API']);
    expect(history()[0]).toMatchObject({ tag: 'writing', taskId: null });
  });
});

describe('logging over a small recorded piece (F23)', () => {
  it('the store logs the free parts around it', () => {
    seed([{ id: 'bit', label: 'Emails', taskId: null }]);
    // The seeded piece is 09:00–10:00; log 08:00–11:00 over it.
    expect(addPastSegment(at('08:00'), at('11:00'), null, 'Chess')).toBeNull();
    expect(history().map((h) => h.label)).toEqual(['Chess', 'Emails', 'Chess']);
  });

  it('Log past time adds around it instead of refusing', () => {
    seed([{ id: 'bit', label: 'Emails', taskId: null }]);
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '08:00', endHM: '11:00', x: 0, y: 0 }); });
    expect(screen.queryByTestId('log-time-problem')).toBeNull();
    expect(screen.getByTestId('log-time-around')).toBeTruthy();
    expect(screen.getByTestId('log-time-save').textContent).toBe('Add 2h');
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    expect(history()).toHaveLength(3);
  });
});

describe('"No kind" is kept, never guessed over (review, 2026-11-24)', () => {
  it('a name the classifier would file under Code stays without a kind when "No kind" is picked', () => {
    seed();
    render(<LogTimeHost />);
    act(() => { openLogTime({ dayYMD: TODAY, startHM: '20:00', endHM: '22:00', x: 0, y: 0 }); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task')); });
    fireEvent.change(screen.getByTestId('log-time-task-picker-type'), { target: { value: 'Code review' } });
    // The pill guesses Code; the user says no kind.
    expect(screen.getByTestId('log-time-task-picker-kind').textContent).toContain('Code');
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-kind')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-kind-none')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-task-picker-new')); });
    act(() => { fireEvent.click(screen.getByTestId('log-time-save')); });
    expect(history()[0]).toMatchObject({ label: 'Code review', taskId: null });
    expect(history()[0]!.tag).toBeUndefined();
  });

  it('left untouched, the guess is used (and a call without a kind still guesses)', () => {
    seed();
    expect(addPastSegment(at('08:00'), at('09:00'), null, 'Code review')).toBeNull();
    expect(history()[0]!.tag).toBe('code');
  });
});

