/** Decision 60 — a resizable Calendar on the Free canvas; the windows beside it make room. */
import { describe, it, expect } from 'vitest';
import { MOTHER_GAP, clampMotherSize, motherSizeOf, reflowMotherRow, resizeMotherIn } from '../../../src/shared/motherLayout';

const m = (id: string, kind: string, x: number, extra: Record<string, unknown> = {}) => ({ id, kind, isMother: true, position: { x, y: 0 }, config: {}, state: {}, ...extra });
const row = () => [
  m('pomo', 'pomo', -1400), m('todo', 'todo', -840), m('cal', 'calendar', -280), m('clock', 'clock', 280), m('ana', 'analytics', 840),
  { id: 'task-1', kind: 'todo.task', isMother: false, position: { x: -200, y: 600 }, config: {}, state: { width: 220 } },
  { id: 'task-2', kind: 'todo.task', isMother: false, position: { x: 1400, y: 600 }, config: {}, state: { width: 220 } },
];
const at = (nodes: ReturnType<typeof row>, id: string) => nodes.find((n) => n.id === id)!;

describe('motherLayout', () => {
  it('a window without its own size is 540 × 540', () => {
    expect(motherSizeOf(m('x', 'todo', 0))).toEqual({ width: 540, height: 540 });
  });

  it('widening the Calendar moves the windows to its right along; the left ones stay', () => {
    const out = resizeMotherIn(row(), 'cal', 900, 540);
    expect((at(out, 'cal').config as { canvasSize: unknown }).canvasSize).toEqual({ width: 900, height: 540 });
    expect(at(out, 'todo').position.x).toBe(-840);
    expect(at(out, 'clock').position.x).toBe(-280 + 900 + MOTHER_GAP);
    expect(at(out, 'ana').position.x).toBe(-280 + 900 + MOTHER_GAP + 540 + MOTHER_GAP);
  });

  it('a taller Calendar moves the notes under it down; notes elsewhere stay', () => {
    const out = resizeMotherIn(row(), 'cal', 540, 800);
    expect(at(out, 'task-1').position.y).toBe(600 + 260);
    expect(at(out, 'task-2').position.y).toBe(600);
  });

  it('shrinking pulls the row together but never pulls notes up', () => {
    const wide = resizeMotherIn(row(), 'cal', 900, 800);
    const back = resizeMotherIn(wide, 'cal', 540, 540);
    expect(at(back, 'clock').position.x).toBe(280);
    expect(at(back, 'task-1').position.y).toBe(860);
  });

  it('sizes stay within bounds and snap to 10 px', () => {
    expect(clampMotherSize(100, 9999)).toEqual({ width: 420, height: 1400 });
    expect(clampMotherSize(903, 707)).toEqual({ width: 900, height: 710 });
  });

  it('after a swap the row is laid out again, so a wide window never covers its neighbour', () => {
    const wide = resizeMotherIn(row(), 'cal', 900, 540);
    // swap Calendar (x=-280, 900 wide) and Todos (x=-840)
    const swapped = wide.map((n) => (n.id === 'cal' ? { ...n, position: { x: -840, y: 0 } } : n.id === 'todo' ? { ...n, position: { x: -280, y: 0 } } : n));
    const out = reflowMotherRow(swapped);
    expect(at(out, 'cal').position.x).toBe(-840);
    expect(at(out, 'todo').position.x).toBe(-840 + 900 + MOTHER_GAP);
    expect(at(out, 'clock').position.x).toBe(at(out, 'todo').position.x + 540 + MOTHER_GAP);
  });

  it('a row of standard windows is left exactly as it is', () => {
    const r = row();
    const out = reflowMotherRow(r);
    out.forEach((n, i) => expect(n).toBe(r[i]));
  });
});
