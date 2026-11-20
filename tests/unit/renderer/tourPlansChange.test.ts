/**
 * "When plans change" tour (guided-tours F13): a missed plan is settled with
 * Done on its day or Won't do, a done card is archived; the tour brings a
 * missed example on a board that has none, and takes it (and any completion
 * of it) away again.
 */
import { describe, it, expect } from 'vitest';
import type { Board } from '../../../src/shared/types';
import { stepsFor, tourById } from '../../../src/renderer/components/Tour/tours';
import { EXAMPLE_MISSED, EXAMPLE_PLAN, missingExamples, withoutExamples } from '../../../src/renderer/store/tourExamples';

const NOW = new Date(2026, 10, 18, 9, 0);
type Loose = Record<string, unknown>;
const b = (items: Loose[] = [], tasks: Loose[] = [], completions?: Loose[]): Board => ({
  nodes: [
    { id: 'todo', kind: 'todo', isMother: true, state: { items } },
    ...tasks.map((state, i) => ({ id: `t${i}`, kind: 'todo.task', state })),
  ],
  edges: [],
  ...(completions ? { completions } : {}),
} as unknown as Board);

const tour = tourById('plans-change')!;
const waits = tour.steps.filter((s) => s.waitFor && 'board' in s.waitFor).map((s) => (s.waitFor as { board: (a: Board, c: Board) => boolean }).board);

describe('When plans change — steps', () => {
  it('Easy gets the missed plan, the Calendar, tick, archive, Welcome back; Advanced adds finished cards, chains and canvases', () => {
    const easy = stepsFor(tour, 'easy');
    const adv = stepsFor(tour, 'advanced');
    expect(easy).toHaveLength(7);
    expect(adv).toHaveLength(11);
    expect(easy.some((s) => s.target?.includes('settings-finished') || s.target?.includes('canvas-switcher'))).toBe(false);
    expect(adv.some((s) => s.target?.includes('settings-finished'))).toBe(true);
    expect(adv.some((s) => s.target?.includes('topbar-canvas-switcher'))).toBe(true);
  });
  it('rings the example cards by their names', () => {
    const named = tour.steps.map((s) => s.targetText).filter(Boolean);
    expect(named).toEqual([EXAMPLE_MISSED, EXAMPLE_PLAN]);
  });
  it('waits for the missed plan to be settled (done or Won’t do), a tick, and Archive', () => {
    expect(waits).toHaveLength(3);
    const [settled, ticked, archived] = waits;
    const start = b([{ id: 'a', done: false }], [{ done: false }]);
    expect(settled!(b([{ id: 'a', done: true }]), start)).toBe(true);
    expect(settled!(b([{ id: 'a', done: false, droppedAt: '2026-11-18T09:00:00.000Z' }]), start)).toBe(true);
    expect(settled!(start, start)).toBe(false);
    expect(ticked!(b([{ id: 'a', done: true }]), start)).toBe(true);
    expect(archived!(b([], [{ done: true, archivedAt: '2026-11-18T09:00:00.000Z' }]), b([], [{ done: true }]))).toBe(true);
    expect(archived!(start, start)).toBe(false);
  });
});

describe('The missed example', () => {
  it('is missing unless an earlier day has a plan that is not done', () => {
    expect(missingExamples(b(), ['missed'], NOW)).toEqual(['missed']);
    expect(missingExamples(b([], [{ done: false, scheduledFor: '2026-11-17T14:00' }]), ['missed'], NOW)).toEqual([]);
    expect(missingExamples(b([], [{ done: true, scheduledFor: '2026-11-17T14:00' }]), ['missed'], NOW)).toEqual(['missed']);
    expect(missingExamples(b([], [{ done: false, scheduledFor: '2026-11-18T08:00' }]), ['missed'], NOW)).toEqual(['missed']);
  });
  it('goes at the end with its completion, so Analytics never counts it', () => {
    const board = b(
      [{ id: 'ex', text: EXAMPLE_MISSED, taskNodeId: 't0' }, { id: 'mine', text: 'Essay', taskNodeId: 't1' }],
      [{ done: true }, { done: true }],
      [{ taskId: 't0', text: EXAMPLE_MISSED, plannedMin: 45, completedAt: '2026-11-17T14:45:00.000Z' }, { taskId: 't1', text: 'Essay', plannedMin: 60, completedAt: '2026-11-18T08:00:00.000Z' }],
    );
    const out = withoutExamples(board, { itemIds: ['ex'], taskIds: ['t0'], segIds: [], habitIds: [] });
    expect(out.nodes.map((n) => n.id)).toEqual(['todo', 't1']);
    expect(out.completions!.map((c) => c.taskId)).toEqual(['t1']);
  });
});
