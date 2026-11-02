/**
 * Decision 32 — Analytics became a fixed mother. Migration + seed tests.
 *   F1  seedBoard() carries mother-analytics in slot 'main'
 *   F2  older boards get mother-analytics injected
 *   F3  a free-floating analytics child is adopted (view state kept) and removed,
 *       along with its edges
 *   F4  the migration is idempotent
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, seedBoard } from '../../../src/main/persistence/board';

interface N { id: string; kind: string; isMother?: boolean; position?: { x: number; y: number }; state?: Record<string, unknown>; config?: Record<string, unknown> }
interface B { nodes: N[]; edges: Array<{ source: string; target: string }> }

const legacy = (extraNodes: unknown[] = [], edges: unknown[] = []) => ({
  version: 1, schemaVersion: 2, layoutMode: 'station', viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: -1400, y: 0 }, state: {}, config: {} },
    { id: 't1', kind: 'todo.task', isMother: false, position: { x: 0, y: 900 }, state: { text: 'a', parentTaskId: null, parentTodoId: 'mother-todo' }, config: {} },
    ...extraNodes,
  ],
  edges,
});

describe('Decision 32 — analytics mother', () => {
  let dir: string;
  let boardPath: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'krnl0-analytics-')); boardPath = join(dir, 'board.json'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const load = (raw: unknown): B => {
    writeFileSync(boardPath, JSON.stringify(raw), 'utf-8');
    return loadBoardFrom(boardPath) as B;
  };

  it('F1: seed includes mother-analytics in the bottom-right-pre slot, right of the terminal', () => {
    const m = (seedBoard().nodes as N[]).find((n) => n.id === 'mother-analytics');
    expect(m).toBeDefined();
    expect(m!.kind).toBe('analytics');
    expect(m!.isMother).toBe(true);
    expect(m!.position).toEqual({ x: 1960, y: 0 });
    expect(m!.config).toMatchObject({ stationSlot: 'bottom-right-pre' });
  });

  it('F2: injects mother-analytics into a board that predates it', () => {
    const b = load(legacy());
    const m = b.nodes.find((n) => n.id === 'mother-analytics');
    expect(m?.isMother).toBe(true);
    expect(m?.config?.['stationSlot']).toBe('bottom-right-pre');
    // Default station visibility is "hidden" — no flag is written.
    expect(m?.config?.['stationHidden']).toBeUndefined();
  });

  it('F3: adopts a free-floating analytics child and drops it and its edges', () => {
    const child = {
      id: 'node-an-1', kind: 'analytics', isMother: false, position: { x: 50, y: 50 },
      state: { view: 'estimates', rangeDays: 7, metric: 'focusMin', width: 900, height: 700, pinnedCards: ['estimates.kpis'] },
      config: {},
    };
    const dup = { ...child, id: 'node-an-2', state: { view: 'calendar' } };
    const b = load(legacy([child, dup], [
      { id: 'e1', source: 'node-an-1', target: 't1', sourceEvent: 'x', targetCommand: 'y' },
      { id: 'e2', source: 't1', target: 'mother-pomo', sourceEvent: 'x', targetCommand: 'y' },
    ]));
    const analytics = b.nodes.filter((n) => n.kind === 'analytics');
    expect(analytics).toHaveLength(1);
    const m = analytics[0]!;
    expect(m.id).toBe('mother-analytics');
    expect(m.state).toMatchObject({ view: 'estimates', rangeDays: 7, metric: 'focusMin', pinnedCards: ['estimates.kpis'] });
    // Mother size is fixed by the frame — the stale persisted size is not carried.
    expect(m.state?.['width']).toBe(540);
    expect(b.edges.map((e) => e.source)).toEqual(['t1']);
  });

  it('F4: running the load twice keeps a single mother and is otherwise unchanged', () => {
    const once = load(legacy());
    const twice = load(once);
    expect(twice.nodes.filter((n) => n.kind === 'analytics')).toHaveLength(1);
    expect(twice.nodes.find((n) => n.id === 'mother-analytics')).toEqual(once.nodes.find((n) => n.id === 'mother-analytics'));
  });

  it('keeps a user-chosen station visibility', () => {
    const b = load(legacy([{ id: 'mother-analytics', kind: 'analytics', isMother: true, position: { x: 1960, y: 0 }, state: {}, config: { stationSlot: 'bottom-right-pre', stationHidden: false } }]));
    expect(b.nodes.find((n) => n.id === 'mother-analytics')?.config?.['stationHidden']).toBe(false);
  });
});
