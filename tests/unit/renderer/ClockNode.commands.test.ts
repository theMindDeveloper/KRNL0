/**
 * ClockNode command unit tests — Decision 23.1 (PR #112)
 *
 * Covers AC8:
 *   - clock.linkTodo  sets / clears linkedTodoId
 *   - clock.setWindowStart clamps to [0, 23] and rounds fractional inputs
 */

import { describe, it, expect } from 'vitest';
import {
  clockLinkTodo,
  clockSetWindowStart,
} from '../../../src/renderer/components/nodes/ClockNode/commands';
import { defaultClockState } from '../../../src/renderer/components/nodes/ClockNode/types';

describe('ClockNode commands (Decision 23.1)', () => {
  // ── clock.linkTodo ─────────────────────────────────────────────────────────

  describe('clock.linkTodo', () => {
    it('sets linkedTodoId to a given node id', () => {
      const s = defaultClockState();
      const next = clockLinkTodo(s, { todoNodeId: 'todo-abc123' });
      expect(next.linkedTodoId).toBe('todo-abc123');
    });

    it('clears linkedTodoId when passed null', () => {
      const s = { ...defaultClockState(), linkedTodoId: 'todo-abc123' };
      const next = clockLinkTodo(s, { todoNodeId: null });
      expect(next.linkedTodoId).toBeNull();
    });

    it('does not mutate the original state', () => {
      const s = defaultClockState();
      clockLinkTodo(s, { todoNodeId: 'todo-xyz' });
      expect(s.linkedTodoId).toBeNull();
    });

    it('preserves windowStartHour when linking', () => {
      const s = { ...defaultClockState(), windowStartHour: 14 };
      const next = clockLinkTodo(s, { todoNodeId: 'todo-xyz' });
      expect(next.windowStartHour).toBe(14);
    });
  });

  // ── clock.setWindowStart ───────────────────────────────────────────────────

  describe('clock.setWindowStart', () => {
    it('accepts a valid mid-range hour (8 → 8)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 8 });
      expect(next.windowStartHour).toBe(8);
    });

    it('accepts the lower boundary (0 → 0)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 0 });
      expect(next.windowStartHour).toBe(0);
    });

    it('accepts the upper boundary (23 → 23)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 23 });
      expect(next.windowStartHour).toBe(23);
    });

    it('clamps below zero to 0 (-5 → 0)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: -5 });
      expect(next.windowStartHour).toBe(0);
    });

    it('clamps above 23 to 23 (99 → 23)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 99 });
      expect(next.windowStartHour).toBe(23);
    });

    it('rounds fractional inputs (7.6 → 8)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 7.6 });
      expect(next.windowStartHour).toBe(8);
    });

    it('rounds fractional inputs (7.4 → 7)', () => {
      const s = defaultClockState();
      const next = clockSetWindowStart(s, { hour: 7.4 });
      expect(next.windowStartHour).toBe(7);
    });

    it('does not mutate the original state', () => {
      const s = defaultClockState();
      clockSetWindowStart(s, { hour: 12 });
      expect(s.windowStartHour).toBe(8);
    });

    it('preserves linkedTodoId when changing window start', () => {
      const s = { ...defaultClockState(), linkedTodoId: 'todo-abc' };
      const next = clockSetWindowStart(s, { hour: 12 });
      expect(next.linkedTodoId).toBe('todo-abc');
    });
  });
});
