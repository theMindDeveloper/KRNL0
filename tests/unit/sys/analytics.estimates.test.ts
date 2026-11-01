/** `krnl analytics show --view estimates` — CLI parity for the plan-vs-actual view. */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { analyticsShow } from '../../../src/sys/commands/analytics';

const dir = mkdtempSync(join(tmpdir(), 'krnl0-est-'));
const boardPath = join(dir, 'board.json');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

writeFileSync(boardPath, JSON.stringify({
  version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [], completions: [],
  nodes: [
    { id: 'pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {},
      state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0,
        activeTaskId: null, pausedAt: null, pausedElapsedMs: 0, sessionWorkSec: 0,
        history: [{ id: 's1', startedAt: hoursAgo(3), endedAt: hoursAgo(1.5), durationMin: 90, label: 'Math', completed: true, taskId: 'math', kind: 'work' }] } },
    { id: 'math', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
      state: { text: 'Math', done: true, plannedMin: 60, durationMin: 60, parentTaskId: null, parentTodoId: 'todo' } },
  ],
}), 'utf-8');

describe('analytics show --view estimates', () => {
  it('reports estimate vs tracked per task', async () => {
    const res = await analyticsShow({ boardPath }, { view: 'estimates', range: 7 });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('plan vs actual');
    expect(res.message).toMatch(/Math\s+plan\s+1h00\s+tracked\s+1h30\s+OVER/);
    expect(res.message).toContain('×1.50');
  });

  it('returns structured JSON', async () => {
    const res = await analyticsShow({ boardPath }, { view: 'estimates', range: 7, json: true });
    const data = JSON.parse(res.message) as { tasks: Array<{ taskId: string; trackedMin: number }> };
    expect(data.tasks[0]).toMatchObject({ taskId: 'math', trackedMin: 90 });
  });
});
