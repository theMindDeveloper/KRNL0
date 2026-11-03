/** Station panels come back at the sizes the user dragged them to. */
import { describe, it, expect } from 'vitest';
import { restoredSizes } from '../../../src/renderer/components/Station/restoredSizes';

describe('restoredSizes', () => {
  const ids = ['canvas', 'terminal', 'clock'];
  const defaults = [60, 15, 25];
  const mins = [30, 14, 14];

  it('uses the saved fractions, scaled to fill the row', () => {
    const out = restoredSizes(ids, defaults, mins, { canvas: 0.5, terminal: 0.3, clock: 0.2 });
    expect(out.map(Math.round)).toEqual([50, 30, 20]);
  });

  it('scales the visible subset when another panel is hidden', () => {
    const out = restoredSizes(['canvas', 'clock'], [70, 30], [30, 14], { canvas: 0.5, terminal: 0.3, clock: 0.2 });
    expect(out.map(Math.round)).toEqual([71, 29]);
  });

  it('falls back to defaults when a panel was never saved or would be too small', () => {
    expect(restoredSizes(ids, defaults, mins, { canvas: 0.6, clock: 0.25 })).toEqual(defaults);
    expect(restoredSizes(ids, defaults, mins, { canvas: 0.9, terminal: 0.05, clock: 0.05 })).toEqual(defaults);
    expect(restoredSizes(ids, defaults, mins, undefined)).toEqual(defaults);
  });
});
