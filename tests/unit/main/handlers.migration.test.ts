import { describe, it, expect, vi } from 'vitest';

// handlers.ts top-level reads `app.getName()`. In a vitest non-Electron run,
// `electron` is undefined; mock it up before importing the module.
vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'krnl0-test'),
    getAppPath: vi.fn(() => '/tmp/krnl0-test'),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('node-pty', () => ({ spawn: vi.fn() }));

import { migratePomoConfig, migrateTaskPomo } from '../../../src/main/ipc/handlers';

describe('Decision 9 Addendum — board migrations', () => {
  describe('migratePomoConfig', () => {
    it('renames shortBreakMin → defaultBreakMin and sessionsUntilLongBreak → longBreakEvery', () => {
      const board = {
        nodes: [
          {
            id: 'mother-pomo',
            kind: 'pomo',
            isMother: true,
            state: {},
            config: { shortBreakMin: 7, longBreakMin: 25, sessionsUntilLongBreak: 3 },
          },
        ],
      };
      const out = migratePomoConfig(board) as { nodes: { config: Record<string, unknown> }[] };
      expect(out.nodes[0]!.config).toEqual({
        defaultDurationMin: 25,
        defaultBreakMin: 7,
        longBreakEvery: 3,
        longBreakMin: 25,
      });
    });

    it('is idempotent — re-running on a migrated board does not regress', () => {
      const board = {
        nodes: [
          {
            id: 'mother-pomo',
            kind: 'pomo',
            isMother: true,
            state: {},
            config: {
              defaultDurationMin: 30,
              defaultBreakMin: 6,
              longBreakEvery: 5,
              longBreakMin: 20,
            },
          },
        ],
      };
      const once = migratePomoConfig(board) as { nodes: { config: Record<string, unknown> }[] };
      const twice = migratePomoConfig(once as Record<string, unknown>) as { nodes: { config: Record<string, unknown> }[] };
      expect(twice.nodes[0]!.config).toEqual(once.nodes[0]!.config);
    });

    it('fills missing fields with sensible defaults', () => {
      const board = {
        nodes: [
          { id: 'mother-pomo', kind: 'pomo', isMother: true, state: {}, config: {} },
        ],
      };
      const out = migratePomoConfig(board) as { nodes: { config: Record<string, unknown> }[] };
      expect(out.nodes[0]!.config).toEqual({
        defaultDurationMin: 25,
        defaultBreakMin: 5,
        longBreakEvery: 4,
        longBreakMin: 15,
      });
    });

    it('leaves non-pomo nodes alone', () => {
      const board = {
        nodes: [{ id: 'mother-todo', kind: 'todo', state: { items: [] }, config: {} }],
      };
      const out = migratePomoConfig(board) as { nodes: { id: string }[] };
      expect(out.nodes[0]).toEqual({
        id: 'mother-todo',
        kind: 'todo',
        state: { items: [] },
        config: {},
      });
    });
  });

  describe('migrateTaskPomo', () => {
    it('backfills state.pomo on existing todo.task nodes using mother config', () => {
      const board = {
        nodes: [
          {
            id: 'mother-pomo',
            kind: 'pomo',
            isMother: true,
            state: {},
            config: { defaultDurationMin: 50, defaultBreakMin: 10, longBreakEvery: 4, longBreakMin: 15 },
          },
          {
            id: 'task-1',
            kind: 'todo.task',
            state: { text: 'write docs', done: false },
            config: {},
          },
        ],
      };
      const out = migrateTaskPomo(board) as {
        nodes: Array<{ kind: string; state?: Record<string, unknown> }>;
      };
      const task = out.nodes[1]!;
      expect(task.state?.['pomo']).toMatchObject({
        status: 'idle',
        startedAt: null,
        durationMin: 50,
        breakMin: 10,
        sessionsCompleted: 0,
        history: [],
      });
    });

    it('does not overwrite an existing state.pomo block', () => {
      const board = {
        nodes: [
          {
            id: 'mother-pomo',
            kind: 'pomo',
            isMother: true,
            state: {},
            config: { defaultDurationMin: 25, defaultBreakMin: 5, longBreakEvery: 4, longBreakMin: 15 },
          },
          {
            id: 'task-1',
            kind: 'todo.task',
            state: {
              text: 'write docs',
              done: false,
              pomo: { status: 'running', startedAt: '2026-05-12T10:00:00.000Z', durationMin: 25, breakMin: 5, label: 'x', sessionsCompleted: 3, history: [] },
            },
            config: {},
          },
        ],
      };
      const out = migrateTaskPomo(board) as {
        nodes: Array<{ kind: string; state?: Record<string, unknown> }>;
      };
      const task = out.nodes[1]!;
      expect((task.state?.['pomo'] as { sessionsCompleted: number }).sessionsCompleted).toBe(3);
    });
  });
});
