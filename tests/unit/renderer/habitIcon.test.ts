import { describe, it, expect } from 'vitest';
import { HABIT_ICONS } from '../../../src/renderer/components/nodes/HabitNode/types';
import { HABIT_ICON_IDS, habitIconId } from '../../../src/renderer/components/nodes/HabitNode/HabitIcon';

describe('habit icons are app SVGs, not emoji', () => {
  it('the palette ids all have an SVG', () => {
    expect([...HABIT_ICONS]).toEqual([...HABIT_ICON_IDS]);
    for (const id of HABIT_ICONS) expect(/^[a-z]+$/.test(id)).toBe(true);
  });
  it('old glyph / emoji values map to an icon', () => {
    for (const g of ['🧘', '🏃', '📖', '💧', '☀️', '🌙', '✎', '◆']) expect(habitIconId(g)).not.toBeNull();
    expect(habitIconId('water')).toBe('water');
    expect(habitIconId('xyz')).toBeNull();
    expect(habitIconId(undefined)).toBeNull();
  });
});
