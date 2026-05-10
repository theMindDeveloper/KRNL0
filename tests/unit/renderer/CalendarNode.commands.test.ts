import { describe, it, expect } from 'vitest';
import { applyCommand } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Node } from '../../../src/shared/types/node';
import type { CalendarState } from '../../../src/renderer/components/nodes/CalendarNode/types';

function makeCalNode(month: number, year: number): Node {
  return {
    id: 'cal-1',
    kind: 'calendar',
    position: { x: 0, y: 0 },
    isMother: false,
    state: { month, year, events: [] } as CalendarState,
    config: { firstDay: 1 },
  };
}

describe('CalendarNode commands (Decision #14)', () => {
  describe('calendar.prevMonth', () => {
    it('decrements month within same year', () => {
      const node = makeCalNode(5, 2026); // June
      const next = applyCommand(node, 'calendar.prevMonth', {}) as CalendarState;
      expect(next.month).toBe(4); // May
      expect(next.year).toBe(2026);
    });

    it('wraps December → January correctly (Dec → Nov is prev, but Jan → Dec wraps year)', () => {
      const node = makeCalNode(0, 2026); // January
      const next = applyCommand(node, 'calendar.prevMonth', {}) as CalendarState;
      expect(next.month).toBe(11); // December
      expect(next.year).toBe(2025); // year wraps back
    });

    it('wraps from January (month=0) to December (month=11) and decrements year', () => {
      const node = makeCalNode(0, 2030);
      const next = applyCommand(node, 'calendar.prevMonth', {}) as CalendarState;
      expect(next.month).toBe(11);
      expect(next.year).toBe(2029);
    });

    it('preserves events array unchanged', () => {
      const events = [{ date: '2026-05-01', title: 'Test' }];
      const node = makeCalNode(5, 2026);
      (node.state as CalendarState).events = events;
      const next = applyCommand(node, 'calendar.prevMonth', {}) as CalendarState;
      expect(next.events).toEqual(events);
    });
  });

  describe('calendar.nextMonth', () => {
    it('increments month within same year', () => {
      const node = makeCalNode(3, 2026); // April
      const next = applyCommand(node, 'calendar.nextMonth', {}) as CalendarState;
      expect(next.month).toBe(4); // May
      expect(next.year).toBe(2026);
    });

    it('wraps from December (month=11) to January (month=0) and increments year', () => {
      const node = makeCalNode(11, 2026); // December
      const next = applyCommand(node, 'calendar.nextMonth', {}) as CalendarState;
      expect(next.month).toBe(0); // January
      expect(next.year).toBe(2027); // year wraps forward
    });

    it('wraps from December (month=11) across a decade boundary', () => {
      const node = makeCalNode(11, 2029);
      const next = applyCommand(node, 'calendar.nextMonth', {}) as CalendarState;
      expect(next.month).toBe(0);
      expect(next.year).toBe(2030);
    });

    it('preserves events array unchanged', () => {
      const events = [{ date: '2026-12-25', title: 'Christmas' }];
      const node = makeCalNode(11, 2026);
      (node.state as CalendarState).events = events;
      const next = applyCommand(node, 'calendar.nextMonth', {}) as CalendarState;
      expect(next.events).toEqual(events);
    });
  });

  describe('unknown calendar command', () => {
    it('returns null for an unrecognized calendar command', () => {
      const node = makeCalNode(5, 2026);
      const result = applyCommand(node, 'calendar.unknownCommand', {});
      expect(result).toBeNull();
    });
  });
});
