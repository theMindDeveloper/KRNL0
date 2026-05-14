// Tests for board / node / edge CLI commands (issue #117 §2, §3 + visibility expansion).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { boardShow, boardSummary, type BoardCtx } from '../../../src/sys/commands/board';
import { nodeList, nodeRead, nodeRemove, nodeSetPosition, type NodeCtx } from '../../../src/sys/commands/node';
import { edgeAdd, edgeList, edgeRemove, edgeEnable, type EdgeCtx } from '../../../src/sys/commands/edge';
import { taskAdd, type TaskCtx } from '../../../src/sys/commands/task';

const TODO_MOTHER = 'mother-todo';
const POMO_MOTHER = 'mother-pomo';

let tmpDir = '';
let boardPath = '';

function seed(): void {
  const board = {
    schemaVersion: 1,
    nodes: [
      {
        id: TODO_MOTHER,
        kind: 'todo',
        isMother: true,
        position: { x: 0, y: 0 },
        state: { items: [] },
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: POMO_MOTHER,
        kind: 'pomo',
        isMother: true,
        position: { x: 0, y: 0 },
        state: {
          status: 'idle', startedAt: null, durationMin: 25, breakMin: 5,
          label: '', sessionsCompleted: 0, activeTaskId: null, history: [],
          pausedAt: null, pausedElapsedMs: 0,
        },
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-bne-'));
  boardPath = join(tmpDir, 'board.json');
  seed();
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ── board show ─────────────────────────────────────────────────────────────

describe('board show (issue #117 §2)', () => {
  it('emits bare JSON when --json is set — output is parseable', async () => {
    const ctx: BoardCtx = { boardPath };
    const res = await boardShow(ctx, true);
    expect(res.ok).toBe(true);
    // Must be valid JSON — issue #117 §2 was that result.message was non-JSON.
    expect(() => JSON.parse(res.message!)).not.toThrow();
    const parsed = JSON.parse(res.message!) as { nodes: unknown[]; edges: unknown[] };
    // 2 seeded + calendar + clock mothers auto-injected by migrations
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });

  it('emits a human summary when json=false', async () => {
    const ctx: BoardCtx = { boardPath };
    const res = await boardShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('nodes:');
    expect(res.message).toContain('by kind:');
  });
});

describe('board summary', () => {
  it('returns counts', async () => {
    const ctx: BoardCtx = { boardPath };
    const res = await boardSummary(ctx, false);
    expect(res.ok).toBe(true);
    const data = res.data as { nodes: number; edges: number };
    expect(data.nodes).toBeGreaterThanOrEqual(2);
    expect(data.edges).toBe(0);
  });
});

// ── node list / read / remove (issue #117 §3) ──────────────────────────────

describe('node list', () => {
  it('lists every node with id, kind, summary', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeList(ctx, {}, false);
    expect(res.ok).toBe(true);
    // Result includes both mother nodes
    expect(res.message).toContain('todo');
    expect(res.message).toContain('pomo');
  });

  it('--json emits parseable bare JSON', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeList(ctx, {}, true);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.message!) as Array<{ id: string; kind: string }>;
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.every((n) => typeof n.id === 'string' && typeof n.kind === 'string')).toBe(true);
  });

  it('filters by kind', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeList(ctx, { kind: 'todo' }, true);
    const parsed = JSON.parse(res.message!) as Array<{ kind: string }>;
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.kind).toBe('todo');
  });

  it('--mother filters to mother nodes only', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeList(ctx, { motherOnly: true }, true);
    const parsed = JSON.parse(res.message!) as Array<{ isMother: boolean }>;
    expect(parsed.every((n) => n.isMother === true)).toBe(true);
  });
});

describe('node read', () => {
  it('returns state + config + incident edges for one node', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeRead(ctx, TODO_MOTHER, true);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.message!) as { id: string; state: unknown; incidentEdges: unknown[] };
    expect(parsed.id).toBe(TODO_MOTHER);
    expect(Array.isArray(parsed.incidentEdges)).toBe(true);
  });

  it('resolves the ref by prefix', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeRead(ctx, 'mother-pomo', true);
    expect(res.ok).toBe(true);
  });

  it('errors on unknown ref', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeRead(ctx, 'nothing-here', true);
    expect(res.ok).toBe(false);
  });
});

describe('node remove', () => {
  it('refuses to remove a mother node without --force', async () => {
    const ctx: NodeCtx = { boardPath };
    const res = await nodeRemove(ctx, TODO_MOTHER, false);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('--force');
  });

  it('cascades a task removal via shared dispatch', async () => {
    const taskCtx: TaskCtx = { boardPath };
    await taskAdd(taskCtx, TODO_MOTHER, 'task to delete');
    const nCtx: NodeCtx = { boardPath };
    const list1 = await nodeList(nCtx, { kind: 'todo.task' }, true);
    const tasks = JSON.parse(list1.message!) as Array<{ id: string }>;
    expect(tasks.length).toBe(1);

    const res = await nodeRemove(nCtx, tasks[0]!.id, false);
    expect(res.ok).toBe(true);

    const list2 = await nodeList(nCtx, { kind: 'todo.task' }, true);
    const tasksAfter = JSON.parse(list2.message!) as unknown[];
    expect(tasksAfter.length).toBe(0);
  });
});

describe('node set-position', () => {
  it('writes a new position to a child task node', async () => {
    // Mother-node positions are pinned by migrateMotherPositions on every load,
    // so set-position only sticks for child nodes.
    const taskCtx: TaskCtx = { boardPath };
    await taskAdd(taskCtx, TODO_MOTHER, 'task');
    const ctx: NodeCtx = { boardPath };
    const list = JSON.parse((await nodeList(ctx, { kind: 'todo.task' }, true)).message!) as Array<{ id: string }>;
    const taskId = list[0]!.id;
    const res = await nodeSetPosition(ctx, taskId, 1234, 5678);
    expect(res.ok).toBe(true);
    const read = await nodeRead(ctx, taskId, true);
    const parsed = JSON.parse(read.message!) as { position: { x: number; y: number } };
    expect(parsed.position).toEqual({ x: 1234, y: 5678 });
  });
});

// ── edge add / remove / list / enable / disable ────────────────────────────

describe('edge CRUD', () => {
  it('adds an edge resolving both endpoints by prefix', async () => {
    const taskCtx: TaskCtx = { boardPath };
    await taskAdd(taskCtx, TODO_MOTHER, 'first');
    await taskAdd(taskCtx, TODO_MOTHER, 'second');
    const nCtx: NodeCtx = { boardPath };
    const tasks = JSON.parse((await nodeList(nCtx, { kind: 'todo.task' }, true)).message!) as Array<{ id: string }>;
    const a = tasks[0]!.id;
    const b = tasks[1]!.id;

    const eCtx: EdgeCtx = { boardPath };
    const res = await edgeAdd(eCtx, `${a.slice(0, 10)}:done`, `${b.slice(0, 10)}:start`);
    expect(res.ok).toBe(true);
  });

  it('rejects missing colon in endpoint', async () => {
    const eCtx: EdgeCtx = { boardPath };
    const res = await edgeAdd(eCtx, 'mother-todo', 'mother-pomo:foo');
    expect(res.ok).toBe(false);
  });

  it('lists edges with --json as bare JSON', async () => {
    const eCtx: EdgeCtx = { boardPath };
    await edgeAdd(eCtx, `${TODO_MOTHER}:done`, `${POMO_MOTHER}:start`);
    const res = await edgeList(eCtx, true);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.message!) as unknown[];
    expect(parsed.length).toBe(1);
  });

  it('removes an edge by prefix', async () => {
    const eCtx: EdgeCtx = { boardPath };
    const add = await edgeAdd(eCtx, `${TODO_MOTHER}:done`, `${POMO_MOTHER}:start`);
    expect(add.ok).toBe(true);
    const edgeId = (add.data as { id: string }).id;
    const res = await edgeRemove(eCtx, edgeId.slice(0, 10));
    expect(res.ok).toBe(true);
    const list = await edgeList(eCtx, true);
    expect(JSON.parse(list.message!).length).toBe(0);
  });

  it('enable/disable flips the enabled flag', async () => {
    const eCtx: EdgeCtx = { boardPath };
    const add = await edgeAdd(eCtx, `${TODO_MOTHER}:done`, `${POMO_MOTHER}:start`);
    const edgeId = (add.data as { id: string }).id;
    await edgeEnable(eCtx, edgeId, false);
    const list = JSON.parse((await edgeList(eCtx, true)).message!) as Array<{ enabled: boolean }>;
    expect(list[0]!.enabled).toBe(false);
    await edgeEnable(eCtx, edgeId, true);
    const list2 = JSON.parse((await edgeList(eCtx, true)).message!) as Array<{ enabled: boolean }>;
    expect(list2[0]!.enabled).toBe(true);
  });
});
