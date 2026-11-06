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

describe('Welcome back (F13, F14)', () => {
  it('only the first task of a chain gets buttons', () => {
    bridge();
    useBoardStore.setState({ board: slippedBoard as never });
    act(() => { openWelcomeBack(true, 4 * 86_400_000); });
    render(<WelcomeBack />);
    const dialog = screen.getByTestId('welcome-back');
    expect(dialog.textContent).toContain('Outline chapter 3');
    expect(dialog.textContent).toContain('comes along');
    expect(dialog.textContent).toContain('4 days');
    // Only the first task of the chain gets buttons: one "Plan it today" button.
    expect(screen.getAllByTitle(/^Plan it today/)).toHaveLength(1);
    fireEvent.click(screen.getByText('Later'));
    expect(useLaunchStore.getState().welcome).toBeNull();
  });
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
