/** Decision 60 — a resizable Calendar on the Free canvas (per device, square, never under 540). */
import { describe, it, expect } from 'vitest';
import { MOTHER_GAP, clampMotherSize, motherRowXs, motherSizeOf, resizeMotherIn, tallestMother } from '../../../src/shared/motherLayout';

const m = (id: string, kind: string, x: number, extra: Record<string, unknown> = {}) => ({ id, kind, isMother: true, position: { x, y: 0 }, config: {}, state: {}, ...extra });

describe('motherLayout', () => {
  it('a window without its own size is 540 × 540', () => {
    expect(motherSizeOf(m('x', 'todo', 0))).toEqual({ width: 540, height: 540 });
  });

  it('it keeps its shape, never goes under 540 and snaps back near it', () => {
    expect(clampMotherSize(900, 600)).toEqual({ width: 900, height: 900 });
    expect(clampMotherSize(560)).toEqual({ width: 540, height: 540 });
    expect(clampMotherSize(300)).toEqual({ width: 540, height: 540 });
    expect(clampMotherSize(9999)).toEqual({ width: 1400, height: 1400 });
    expect(clampMotherSize(903)).toEqual({ width: 900, height: 900 });
  });

  it('only the Calendar resizes, and only its own config changes', () => {
    const nodes = [m('todo', 'todo', -840), m('cal', 'calendar', -280), m('clock', 'clock', 280)];
    const out = resizeMotherIn(nodes, 'cal', 900);
    expect((out[1]!.config as { canvasSize?: unknown }).canvasSize).toEqual({ width: 900, height: 900 });
    expect(out[0]).toBe(nodes[0]);
    expect(out[2]).toBe(nodes[2]);
    expect(out.map((n) => n.position)).toEqual(nodes.map((n) => n.position));
    expect(resizeMotherIn(nodes, 'todo', 900)).toEqual(nodes);
  });

  it('the Calendar starts at its largest size; back to it leaves nothing on the node (Decision 61)', () => {
    expect(motherSizeOf(m('cal', 'calendar', 0))).toEqual({ width: 1400, height: 1400 });
    const small = resizeMotherIn([m('cal', 'calendar', 0)], 'cal', 550);
    expect((small[0]!.config as { canvasSize?: unknown }).canvasSize).toEqual({ width: 540, height: 540 });
    const back = resizeMotherIn(small, 'cal', 1390);
    expect((back[0]!.config as Record<string, unknown>)['canvasSize']).toBeUndefined();
  });

  it('the canvas draws the row at each window\'s width, so a wide one never covers the next', () => {
    const row = [m('todo', 'todo', -840), { ...m('cal', 'calendar', -280), config: { canvasSize: { width: 900, height: 900 } } }, m('clock', 'clock', 280)];
    const xs = motherRowXs(row, -840);
    expect(xs.get('todo')).toBe(-840);
    expect(xs.get('cal')).toBe(-840 + 540 + MOTHER_GAP);
    expect(xs.get('clock')).toBe(-840 + 540 + MOTHER_GAP + 900 + MOTHER_GAP);
    expect(tallestMother(row)).toBe(900);
  });
});
