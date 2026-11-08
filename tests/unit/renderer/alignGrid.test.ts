/** Align to grid (docs/06-requirements/align-grid.md). */
import { describe, it, expect } from 'vitest';
import { GAP, GRID, alignAll, landing, onGrid, snap, type Box } from '../../../src/renderer/components/Canvas/alignGrid';

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;

describe('landing (F1–F2)', () => {
  it('F1: a drop in free space snaps its corner to the nearest grid point', () => {
    expect(landing({ x: 47, y: 15, w: 220, h: 120 }, [])).toEqual({ x: 80, y: 0 });
    expect(snap(-50)).toBe(-80);
    expect(GRID).toBe(80);
  });

  it('F2: a drop on top of something goes to the nearest free grid spot, not on it', () => {
    const card: Box = { x: 0, y: 0, w: 220, h: 120 };
    const dropped: Box = { x: 30, y: 10, w: 220, h: 120 };
    const p = landing(dropped, [card]);
    expect(p.x % GRID).toBe(0);
    expect(p.y % GRID).toBe(0);
    expect(overlaps({ ...dropped, ...p }, card)).toBe(false);
    // nearest: just below the card (y 128 → grid 160), not far away
    expect(p).toEqual({ x: 0, y: 160 });
  });

  it('F2: a crowded spot still finds the closest free cell around it', () => {
    const wall: Box[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) wall.push({ x: i * 256, y: j * 160, w: 220, h: 120 });
    const p = landing({ x: 5, y: 5, w: 100, h: 60 }, wall);
    expect(wall.some((w) => overlaps({ x: p.x, y: p.y, w: 100, h: 60 }, w))).toBe(false);
  });
});

describe('alignAll — turning it on tidies once (F3)', () => {
  it('fixed things stay; the rest land on the grid without overlapping, in reading order', () => {
    const items = [
      { id: 'todo', box: { x: 0, y: 0, w: 400, h: 300 }, movable: false },
      { id: 'a', box: { x: 410, y: 13, w: 220, h: 120 }, movable: true },
      { id: 'b', box: { x: 425, y: 40, w: 220, h: 120 }, movable: true }, // on top of a
      { id: 'c', box: { x: 100, y: 250, w: 220, h: 120 }, movable: true }, // on top of the window
    ];
    const moves = alignAll(items);
    expect(moves.has('todo')).toBe(false);
    const final = items.map((i) => ({ ...i.box, ...(moves.get(i.id) ?? {}) }));
    for (let i = 1; i < final.length; i++) {
      expect(final[i]!.x % GRID).toBe(0);
      expect(final[i]!.y % GRID).toBe(0);
      for (let j = 0; j < i; j++) expect(overlaps(final[i]!, final[j]!)).toBe(false);
    }
    // "a" was read first, so it gets the spot nearest to it (just right of the window)
    expect(moves.get('a')).toEqual({ x: 480, y: 0 });
  });

  it('things already on the grid and apart do not move', () => {
    expect(alignAll([{ id: 'a', box: { x: 160, y: 80, w: 220, h: 120 }, movable: true }]).size).toBe(0);
  });
});

describe('what aligns (F6)', () => {
  it('off by default; "cards" is plan, habit and event cards only; "all" is everything but windows', () => {
    expect(onGrid(undefined, 'todo.task')).toBe(false);
    expect(onGrid('cards', 'todo.task')).toBe(true);
    expect(onGrid('cards', 'habit.lane')).toBe(true);
    expect(onGrid('cards', 'text')).toBe(false);
    expect(onGrid('cards', 'image')).toBe(false);
    expect(onGrid('all', 'image')).toBe(true);
    expect(onGrid('all', 'frame')).toBe(true);
    expect(onGrid('all', 'todo', true)).toBe(false);
  });
});
