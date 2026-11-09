// @vitest-environment jsdom
/** The assistant's flow runner: krnl commands run in main with argv intact; stopped flows stay stopped. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptRunner, type RunnerDeps } from '../../../src/renderer/components/Assistant/ScriptRunner';
import type { BoardSnapshot, Flow } from '../../../src/renderer/components/Assistant/types';

const snapshot = {} as BoardSnapshot;
let sysRun: ReturnType<typeof vi.fn>;
let captions: Array<string | null>;

const deps = (): RunnerDeps => ({
  voice: { play: () => Promise.resolve(), stop: () => undefined } as unknown as RunnerDeps['voice'],
  setCaption: (t) => { captions.push(t); },
  setOrbState: () => undefined,
  setActiveFlowId: () => undefined,
  setViewport: () => undefined,
  getBoardSnapshot: () => snapshot,
});

beforeEach(() => {
  captions = [];
  sysRun = vi.fn(async () => ({ ok: true, message: 'done' }));
  (window as unknown as { krnl: unknown }).krnl = { sysRun };
});
afterEach(() => { delete (window as unknown as { krnl?: unknown }).krnl; vi.useRealTimers(); });

describe('ScriptRunner', () => {
  it('runs a command with multi-word arguments intact (no shell splitting)', async () => {
    const flow: Flow = { id: 'f', label: 'f', description: '', steps: () => [
      { kind: 'runCommand', label: 'x', argv: ['task', 'add', "review notes, don't forget #2"] },
    ] };
    await new ScriptRunner(deps()).run(flow);
    expect(sysRun).toHaveBeenCalledWith(['task', 'add', "review notes, don't forget #2"]);
  });

  it('shows a failed command in the caption', async () => {
    sysRun.mockResolvedValueOnce({ ok: false, message: 'No task matching "x"' });
    vi.useFakeTimers();
    const flow: Flow = { id: 'f', label: 'f', description: '', steps: () => [
      { kind: 'runCommand', label: 'x', argv: ['task', 'schedule', 'x', '--at', '2026-11-04T09:00'] },
    ] };
    const done = new ScriptRunner(deps()).run(flow);
    await vi.runAllTimersAsync();
    await done;
    expect(captions).toContain('krnl task: No task matching "x"');
  });

  it('a flow stopped during a wait does not resume when another flow starts', async () => {
    vi.useFakeTimers();
    const runner = new ScriptRunner(deps());
    const slow: Flow = { id: 'slow', label: 'slow', description: '', steps: () => [
      { kind: 'wait', ms: 1000 },
      { kind: 'runCommand', label: 'late', argv: ['pomo', 'start'] },
    ] };
    const quick: Flow = { id: 'quick', label: 'quick', description: '', steps: () => [{ kind: 'wait', ms: 10 }] };
    const first = runner.run(slow);
    runner.abort();
    const second = runner.run(quick);
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(sysRun).not.toHaveBeenCalled();
  });
});
// (The old Pomo/Todo walkthrough flow and its 'tutorial waits' test were removed:
// the guided tours replaced it — Tour/tours.ts, tests/unit/renderer/tours.test.tsx.)
