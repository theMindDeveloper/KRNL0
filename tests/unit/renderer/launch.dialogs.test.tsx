// @vitest-environment jsdom
/** Decision 38 — launch dialogs in the window (launch-experience.md F5–F7, F12–F14, F16–F18). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { WhatsNewDialog } from '../../../src/renderer/components/Launch/WhatsNewDialog';
import { WelcomeBack } from '../../../src/renderer/components/Launch/WelcomeBack';
import { FeedbackDialog } from '../../../src/renderer/components/Launch/FeedbackDialog';
import {
  openFeedback,
  openWelcomeBack,
  runLaunchFlow,
  useLaunchStore,
} from '../../../src/renderer/launch/launchStore';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { DEFAULT_APP_STATE, type LaunchInfo } from '../../../src/shared/appState';
import { latestNotes } from '../../../src/shared/whatsnew';

function bridge() {
  const krnl = {
    appPrefsSet: vi.fn(async (p: unknown) => ({ ...DEFAULT_APP_STATE, ...(p as object) })),
    appOpenExternal: vi.fn(async () => ({ ok: true, message: 'ok' })),
  };
  (window as unknown as { krnl: unknown }).krnl = krnl;
  return krnl;
}

const slippedBoard = {
  nodes: [
    { id: 'a', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Outline chapter 3', done: false, scheduledFor: '2020-01-02T09:00' } },
    { id: 'b', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Draft section 3.1', done: false } },
  ],
  edges: [{ id: 'e', from: { nodeId: 'a', event: 'task.next' }, to: { nodeId: 'b', command: 'task.activate' } }],
};

beforeEach(() => {
  useLaunchStore.setState({ info: null, prefs: null, whatsNew: null, patchVersion: null, welcome: null, feedback: null, milestone: null });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { krnl?: unknown }).krnl;
});

describe("What's new (F5, F6)", () => {
  it('steps through the highlights and marks the release seen when done', () => {
    const krnl = bridge();
    const notes = latestNotes()!;
    useLaunchStore.setState({ whatsNew: notes });
    render(<WhatsNewDialog />);
    expect(screen.getByRole('dialog').textContent).toContain(notes.items[0]!.label);
    for (let i = 1; i < notes.items.length; i++) fireEvent.click(screen.getByTestId('whatsnew-next'));
    expect(screen.getByTestId('whatsnew-next').textContent).toBe('Done');
    fireEvent.click(screen.getByTestId('whatsnew-next'));
    expect(useLaunchStore.getState().whatsNew).toBeNull();
    expect(krnl.appPrefsSet).toHaveBeenCalledWith({ whatsNewSeen: notes.minor });
  });
});

describe('launch flow (F5, F12)', () => {
  it("a feature update opens What's new, then Welcome back after it closes", () => {
    bridge();
    useBoardStore.setState({ board: slippedBoard as never });
    const notes = latestNotes()!;
    const info: LaunchInfo = {
      version: `${notes.minor}.0`, previousVersion: '0.0.1', kind: 'feature', backupFile: null, backupDir: '/b', backups: [],
      awayMs: 3 * 86_400_000, awayFrom: 0, simulated: false, system: 'test', prefs: { ...DEFAULT_APP_STATE },
    };
    useLaunchStore.setState({ info, prefs: info.prefs });
    runLaunchFlow();
    expect(useLaunchStore.getState().whatsNew?.minor).toBe(notes.minor);
    expect(useLaunchStore.getState().welcome).toBeNull();
    render(<WhatsNewDialog />);
    fireEvent.click(screen.getByTestId('whatsnew-later'));
    expect(useLaunchStore.getState().welcome?.catchup.tasks.map((t) => t.id)).toEqual(['a']);
  });
});

describe('Welcome back (F13, F14, F14c)', () => {
  it('lists what slipped as checklist rows (a connected task without a time is not one); Close moves nothing', () => {
    bridge();
    useBoardStore.setState({ board: slippedBoard as never });
    act(() => { openWelcomeBack(true, 4 * 86_400_000); });
    render(<WelcomeBack />);
    const dialog = screen.getByTestId('welcome-back');
    expect(dialog.textContent).toContain('Outline chapter 3');
    expect(dialog.textContent).toContain('4 days');
    // Decision 63: the connected task has no time of its own, so it did not slip.
    expect(screen.getByTestId('welcome-check-a')).toBeTruthy();
    expect(screen.queryByTestId('welcome-check-b')).toBeNull();
    expect(screen.getByTestId('welcome-tally').textContent).toBe('0 done · 1 open');
    fireEvent.click(screen.getByTestId('welcome-done'));
    expect(useLaunchStore.getState().welcome).toBeNull();
    expect((useBoardStore.getState().board!.nodes.find((n) => n.id === 'a')!.state as { scheduledFor?: string }).scheduledFor).toBe('2020-01-02T09:00');
  });
});

describe('Welcome back moves a chain together (F14)', () => {
  const runBringAll = async (clock: string) => {
    // Load the command module first: the dialog imports it on demand.
    await import('../../../src/renderer/components/Canvas/commandDispatch');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(clock));
    bridge();
    const board = {
      nodes: [
        { id: 'a', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Head', done: false, scheduledFor: '2020-01-02T09:00', plannedMin: 30 } },
        { id: 'b', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Follower', done: false, scheduledFor: '2020-01-03T15:30', plannedMin: 45 } },
      ],
      edges: [{ id: 'e', from: { nodeId: 'a', event: 'task.next' }, to: { nodeId: 'b', command: 'task.activate' } }],
    };
    useBoardStore.setState({ board: board as never });
    act(() => { openWelcomeBack(true, 4 * 86_400_000); });
    render(<WelcomeBack />);
    fireEvent.click(screen.getByTestId('welcome-move-all'));
    return (id: string) => (useBoardStore.getState().board!.nodes.find((n) => n.id === id)!.state as { scheduledFor?: string }).scheduledFor;
  };

  it('"Bring all" moves a follower that slipped too, keeping its time when that is still ahead', async () => {
    const st = await runBringAll('2026-11-07T06:00:00');
    await vi.waitFor(() => expect(st('a')).toBe('2026-11-07T09:00'), { timeout: 5000 });
    expect(st('b')).toBe('2026-11-07T15:30');
    vi.useRealTimers();
  }, 20_000);

  it('"Bring all" late in the day: times already past line up from now, never land in the past (F27)', async () => {
    const st = await runBringAll('2026-11-07T19:07:00');
    await vi.waitFor(() => expect(st('a')).toBe('2026-11-07T19:15'), { timeout: 5000 });
    expect(st('b')).toBe('2026-11-07T19:45');
    vi.useRealTimers();
  }, 20_000);
});

describe('Welcome back never moves by accident; Did it and Won’t do', () => {
  const setup = async () => {
    await import('../../../src/renderer/components/Canvas/commandDispatch');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T06:05:00'));
    bridge();
    const board = {
      nodes: [
        { id: 'todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: [
          { id: 'it-a', text: 'Day 3', done: false, createdAt: '2026-11-10T00:00:00.000Z', completedAt: null, taskNodeId: 'a', scheduledFor: '2026-11-15T10:00' },
        ] } },
        { id: 'a', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Day 3', done: false, kind: 'event', scheduledFor: '2026-11-15T10:00', plannedMin: 360, parentTodoId: 'todo', parentTaskId: null, todoItemId: 'it-a' } },
      ],
      edges: [],
    };
    useBoardStore.setState({ board: board as never });
    act(() => { openWelcomeBack(true, 4 * 86_400_000); });
    render(<WelcomeBack />);
    const node = (id: string) => useBoardStore.getState().board!.nodes.find((n) => n.id === id)!.state as Record<string, unknown>;
    return node;
  };

  it('the main button closes the dialog and moves nothing', async () => {
    const node = await setup();
    fireEvent.click(screen.getByTestId('welcome-done'));
    expect(useLaunchStore.getState().welcome).toBeNull();
    expect(node('a')['scheduledFor']).toBe('2026-11-15T10:00');
    vi.useRealTimers();
  });

  it('ticking counts on the planned day; the row stays, and unticking reopens', async () => {
    const node = await setup();
    fireEvent.click(screen.getByTestId('welcome-check-a'));
    await vi.waitFor(() => expect(node('a')['done']).toBe(true), { timeout: 5000 });
    expect(node('a')['scheduledFor']).toBe('2026-11-15T10:00');
    expect(node('a')['completedAt']).toBe(new Date('2026-11-15T16:00').toISOString());
    await vi.waitFor(() => expect(screen.getByTestId('welcome-row-a').textContent).toContain('done · counts Sun 15'), { timeout: 5000 });
    expect(screen.getByTestId('welcome-tally').textContent).toBe('1 done · 0 open');
    fireEvent.click(screen.getByTestId('welcome-check-a'));
    await vi.waitFor(() => expect(node('a')['done']).toBe(false), { timeout: 5000 });
    expect(node('a')['completedAt']).toBeUndefined();
    vi.useRealTimers();
  }, 20_000);

  it('Won’t do drops the row and takes it off the calendar (not deleted)', async () => {
    const node = await setup();
    fireEvent.click(screen.getByTestId('welcome-wontdo-a'));
    await vi.waitFor(() => expect(node('a')['scheduledFor']).toBeUndefined(), { timeout: 5000 });
    const items = node('todo')['items'] as Array<{ id: string; droppedAt?: string }>;
    expect(items.find((i) => i.id === 'it-a')?.droppedAt).toBeTruthy();
    expect(useBoardStore.getState().board!.nodes.some((n) => n.id === 'a')).toBe(true);
    vi.useRealTimers();
  }, 20_000);
});

describe('Send feedback (F17, F18)', () => {
  it('opens a filled-in GitHub issue and nothing else', () => {
    const krnl = bridge();
    act(() => { openFeedback('idea', 'Dark calendar'); });
    render(<FeedbackDialog />);
    expect((screen.getByTestId('feedback-title') as HTMLInputElement).value).toBe('Dark calendar');
    expect(screen.getByTestId('feedback-kind-idea').getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByTestId('feedback-text'), { target: { value: 'Please.' } });
    fireEvent.click(screen.getByTestId('feedback-send'));
    const url = new URL(krnl.appOpenExternal.mock.calls[0]![0] as string);
    expect(url.searchParams.get('title')).toBe('Idea: Dark calendar');
    expect(url.searchParams.get('body')).toContain('Please.');
    expect(useLaunchStore.getState().feedback).toBeNull();
  });
});
