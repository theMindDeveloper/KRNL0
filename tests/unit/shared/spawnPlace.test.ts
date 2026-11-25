/** New nodes never land on a window or on another card (owner, 2026-11-25). */
import { describe, it, expect } from 'vitest';
import { clearSpot, drawnMotherBoxes, placeClear, MIN_GAP } from '../../../src/shared/spawnPlace';
import { migrateBoard, migrateRetireEasy, seedBoard } from '../../../src/shared/boardMigrate';

const mother = (id: string, kind: string, x: number, extra: Record<string, unknown> = {}) => ({ id, kind, isMother: true, position: { x, y: 0 }, config: {}, state: {}, ...extra });
const task = (id: string, x: number, y: number, canvasId?: string) => ({ id, kind: 'todo.task', isMother: false, position: { x, y }, state: {}, config: {}, ...(canvasId ? { canvasId } : {}) });
const touches = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w + MIN_GAP && b.x < a.x + a.w + MIN_GAP && a.y < b.y + b.h + MIN_GAP && b.y < a.y + a.h + MIN_GAP;

describe('spawnPlace', () => {
  it('a free spot is kept as it is', () => {
    expect(clearSpot([{ x: 0, y: 0, w: 100, h: 100 }], { x: 500, y: 500, w: 100, h: 100 })).toEqual({ x: 500, y: 500 });
  });

  it('the windows are taken where the canvas draws them (the Calendar is 1400 tall)', () => {
    const boxes = drawnMotherBoxes([mother('todo', 'todo', -1400), mother('cal', 'calendar', -840)]);
    expect(boxes).toEqual([
      { x: -1400, y: 0, w: 540, h: 540 },
      { x: -840, y: 0, w: 1400, h: 1400 },
    ]);
  });

  it('a task that would land on the Calendar goes to the nearest free spot, off every window and card', () => {
    // The screenshot: the next task steps right into the Calendar's body.
    const nodes = [mother('todo', 'todo', -1400), mother('cal', 'calendar', -840), task('t1', -1400, 580), task('t2', -1148, 580)];
    const placed = placeClear(nodes, task('t3', -896, 580));
    const box = { x: placed.position.x, y: placed.position.y, w: 220, h: 140 };
    for (const o of [...drawnMotherBoxes(nodes), { x: -1400, y: 580, w: 220, h: 140 }, { x: -1148, y: 580, w: 220, h: 140 }]) {
      expect(touches(box, o)).toBe(false);
    }
    // It stays near: the next row under the tasks, not past the Calendar.
    expect(placed.position.x).toBeLessThan(-840);
  });

  it('a hidden window (the Terminal) is not in the way, and cards on another canvas are not either', () => {
    const nodes = [mother('term', 'term', -1400), task('other', 0, 900, 'c2')];
    expect(placeClear(nodes, task('n', -1400, 0)).position).toEqual({ x: -1400, y: 0 });
    expect(placeClear(nodes, task('n', 0, 900, 'c1')).position).toEqual({ x: 0, y: 900 });
    expect(placeClear(nodes, task('n', 0, 900, 'c2')).position).not.toEqual({ x: 0, y: 900 });
  });

  it('frames hold cards, so a card may land inside one', () => {
    const nodes = [{ id: 'f', kind: 'frame', isMother: false, position: { x: 0, y: 900 }, state: { width: 800, height: 600 }, config: {} }];
    expect(placeClear(nodes, task('n', 40, 960)).position).toEqual({ x: 40, y: 960 });
  });
});

describe('Easy mode is retired (owner, 2026-11-25)', () => {
  it('a board still in Easy opens in Advanced; nothing else changes', () => {
    const b = { nodes: [], edges: [], uiMode: 'easy', layoutMode: 'canvas' };
    expect(migrateRetireEasy(b)).toEqual({ nodes: [], edges: [], layoutMode: 'canvas' });
    expect((migrateBoard(b) as { uiMode?: string }).uiMode).toBeUndefined();
    const adv = { nodes: [], edges: [], uiMode: 'advanced' };
    expect(migrateRetireEasy(adv)).toBe(adv);
  });

  it('an Easy board keeps its stopwatch (Pomo Stopwatch), unless a timer mode was already picked', () => {
    const pomo = (config: Record<string, unknown>) => ({ id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, state: {}, config });
    const out = migrateRetireEasy({ nodes: [pomo({ sessionMin: 25 })], edges: [], uiMode: 'easy' }) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(out.nodes[0]!.config).toEqual({ sessionMin: 25, mode: 'observe' });
    const kept = migrateRetireEasy({ nodes: [pomo({ mode: 'pomodoro' })], edges: [], uiMode: 'easy' }) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(kept.nodes[0]!.config['mode']).toBe('pomodoro');
    const adv = migrateRetireEasy({ nodes: [pomo({})], edges: [] }) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(adv.nodes[0]!.config['mode']).toBeUndefined();
    expect(((migrateBoard({ nodes: [pomo({})], edges: [], uiMode: 'easy' }) as { nodes: Array<{ kind: string; config: Record<string, unknown> }> }).nodes.find((n) => n.kind === 'pomo')!.config)['mode']).toBe('observe');
  });

  it('a new board is Advanced and its timer starts on Stopwatch, as Easy did', () => {
    expect(seedBoard().uiMode).toBeUndefined();
    const pomoOf = (b: unknown) => (b as { nodes: Array<{ kind: string; config: Record<string, unknown> }> }).nodes.find((n) => n.kind === 'pomo')!;
    expect(pomoOf(seedBoard()).config['mode']).toBe('observe');
    expect(pomoOf(migrateBoard(seedBoard())).config['mode']).toBe('observe');
  });
});
