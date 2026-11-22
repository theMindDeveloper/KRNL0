/**
 * Decision 63 — connections are only drawn. Nothing moves when they stop
 * placing tasks: a task placed only by its chain gets that time as its own,
 * once, when the board opens; every task starts and ends exactly where it did.
 */
import { describe, it, expect } from 'vitest';
import { buildWithChains, selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import { migrateChainTimes } from '../../../src/renderer/store/chainTimes';
import { migrateBoard } from '../../../src/shared/boardMigrate';
import { defaultPomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Board, Edge } from '../../../src/shared/types';

type T = { id: string; at?: string; min?: number; kind?: 'focus' | 'event'; done?: boolean; seconds?: number; seq?: number; dur?: number };
function task(t: T) {
  return {
    id: t.id, kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
    state: {
      text: t.id, done: t.done ?? false, durationMin: t.min ?? 30, eta: '', sequenceNumber: t.seq ?? 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin: t.min ?? 30, secondsAccumulated: t.seconds ?? 0, currentSessionElapsedSec: 0,
      kind: t.kind ?? 'event',
      ...(t.at ? { scheduledFor: t.at } : {}),
      ...(t.dur ? { scheduledDurationMin: t.dur } : {}),
    },
  };
}
const next = (from: string, to: string): Edge => ({ id: `e-${from}-${to}`, from: { nodeId: from, event: 'task.next' }, to: { nodeId: to, command: 'task.activate' }, enabled: true } as Edge);
const board = (tasks: T[], edges: Edge[]): Board => ({
  version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, layoutMode: 'canvas',
  nodes: [{ id: 'todo-1', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: [] } }, ...tasks.map(task)] as never,
  edges,
} as Board);

/** Before (the old rule, with the chain) and after (the migration, own times only): the same place for every task. */
function same(b: Board): void {
  const before = buildWithChains(b, defaultPomoConfig()).placements;
  const migrated = migrateChainTimes(b) as Board;
  const after = selectSchedule(migrated).placements;
  const pick = (m: ReadonlyMap<string, { startISO: string; endISO: string }>) =>
    Object.fromEntries([...m.values()].map((p) => [(p as { taskId: string }).taskId, [p.startISO, p.endISO]]));
  expect(pick(after)).toEqual(pick(before));
}

describe('nothing moves when connections stop placing tasks (F90)', () => {
  it('a straight chain from a timed task', () => {
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }, { id: 'c', min: 45 }], [next('a', 'b'), next('b', 'c')]));
  });

  it('a fork that joins again', () => {
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }, { id: 'c', min: 50 }, { id: 'd', min: 20 }],
      [next('a', 'b'), next('a', 'c'), next('b', 'd'), next('c', 'd')]));
  });

  it('after a focus task with breaks, and after one that ran over', () => {
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 100, kind: 'focus' }, { id: 'b', min: 30, kind: 'focus', seconds: 2400 }, { id: 'c', min: 25 }],
      [next('a', 'b'), next('b', 'c')]));
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 30, done: true, seconds: 5400, kind: 'focus' }, { id: 'b', min: 30 }], [next('a', 'b')]));
  });

  it('across midnight', () => {
    same(board([{ id: 'a', at: '2026-05-14T23:00', min: 90 }, { id: 'b', min: 60 }], [next('a', 'b')]));
  });

  it('a later task with its own time keeps it; the one after it follows it', () => {
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }, { id: 'c', at: '2026-05-14T14:00', min: 60 }, { id: 'd', min: 15 }],
      [next('a', 'b'), next('b', 'c'), next('c', 'd')]));
  });

  it('a length the chain ignored is not used later (the block keeps its length)', () => {
    same(board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30, dur: 120 }], [next('a', 'b')]));
  });

  it('a chain with no time at all, and a day-only start: nothing is invented', () => {
    const none = board([{ id: 'a', min: 30 }, { id: 'b', min: 30 }], [next('a', 'b')]);
    same(none);
    expect(migrateChainTimes(none)).toBe(none);
    same(board([{ id: 'a', at: '2026-05-14', min: 30 }, { id: 'b', min: 30 }], [next('a', 'b')]));
  });
});

describe('the migration', () => {
  it('gives the chained task its time as its own, once', () => {
    const b = board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }], [next('a', 'b')]);
    const once = migrateChainTimes(b) as Board;
    const st = (x: Board, id: string) => x.nodes.find((n) => n.id === id)!.state as { scheduledFor?: string };
    expect(st(once, 'b').scheduledFor).toBe('2026-05-14T10:00');
    expect(migrateChainTimes(once)).toBe(once);
    // The connection is kept (drawn), as it was.
    expect(once.edges).toEqual(b.edges);
  });

  it('runs when a board opens', () => {
    const b = board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }], [next('a', 'b')]);
    const opened = migrateBoard(JSON.parse(JSON.stringify(b))) as Board;
    expect((opened.nodes.find((n) => n.id === 'b')!.state as { scheduledFor?: string }).scheduledFor).toBe('2026-05-14T10:00');
  });
});

describe('connections are only drawn (F89)', () => {
  it('moving the first task does not move the one connected after it', () => {
    const b = migrateChainTimes(board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }], [next('a', 'b')])) as Board;
    const moved = { ...b, nodes: b.nodes.map((n) => (n.id === 'a' ? { ...n, state: { ...(n.state as object), scheduledFor: '2026-05-14T14:00' } } : n)) } as Board;
    expect(selectSchedule(moved).placements.get('b')!.startISO).toBe('2026-05-14T10:00');
  });

  it('a connected task with no time is not on the Calendar', () => {
    const b = board([{ id: 'a', at: '2026-05-14T09:00', min: 60 }, { id: 'b', min: 30 }], [next('a', 'b')]);
    expect(selectSchedule(b).placements.has('b')).toBe(false);
  });
});
