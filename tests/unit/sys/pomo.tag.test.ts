/** `krnl pomo tag` / `krnl pomo retag` — CLI parity for plan-vs-reality tagging. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-pomo-tag-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

function seed(): void {
  writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: { sessionMin: 25 },
        state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0,
          activeTaskId: null, pausedAt: null, pausedElapsedMs: 0, sessionWorkSec: 0,
          history: [{ id: 'seg-1234', startedAt: '2026-11-01T09:00:00.000Z', endedAt: '2026-11-01T09:30:00.000Z',
            durationMin: 30, label: '', completed: false, taskId: null, kind: 'work' }] } },
      { id: 'task-math', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
        state: { text: 'Study math', done: false, parentTaskId: null } },
    ],
  }), 'utf-8');
}

const pomoState = () => JSON.parse(readFileSync(boardPath, 'utf-8')).nodes[0].state;

let mod: typeof import('../../../src/sys/commands/pomo');
beforeAll(async () => { mod = await import('../../../src/sys/commands/pomo'); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('pomo tag / retag', () => {
  it('tags and untags the pomo without starting it', () => {
    seed();
    expect(mod.pomoTag({ boardPath }, 'task-math').ok).toBe(true);
    expect(pomoState().activeTaskId).toBe('task-math');
    expect(pomoState().label).toBe('Study math');
    expect(pomoState().status).toBe('idle');
    expect(mod.pomoTag({ boardPath }, 'none').ok).toBe(true);
    expect(pomoState().activeTaskId).toBeNull();
  });

  it('retags a recorded span by id prefix', () => {
    seed();
    const res = mod.pomoRetag({ boardPath }, 'seg-12', 'task-math');
    expect(res.ok).toBe(true);
    expect(pomoState().history[0].taskId).toBe('task-math');
  });

  it('rejects an unknown task or segment', () => {
    seed();
    expect(mod.pomoTag({ boardPath }, 'nope').ok).toBe(false);
    expect(mod.pomoRetag({ boardPath }, 'zzz', 'task-math').ok).toBe(false);
  });
});
