/**
 * ClockNode command unit tests — Decision 24.2 (supersedes Decision 23.1)
 *
 * Covers:
 *   - clock.linkTodo  sets / clears linkedTodoId
 *   - clock.setViewWindow sets viewWindow to 0 or 1; coerces non-1 to 0
 */

import { describe, it, expect } from 'vitest';
import {
  clockLinkTodo,
  clockSetViewWindow,
} from '../../../src/renderer/components/nodes/ClockNode/commands';
import type { ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';
import { defaultClockState } from '../../../src/renderer/components/nodes/ClockNode/types';

describe('ClockNode commands (Decision 24.2)', () => {
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

    it('preserves viewWindow when linking', () => {
      const s: ClockState = { ...defaultClockState(), viewWindow: 1 };
      const next = clockLinkTodo(s, { todoNodeId: 'todo-y' });
      expect(next.viewWindow).toBe(1);
    });
  });

  // ── clock.setViewWindow ────────────────────────────────────────────────────

  describe('clock.setViewWindow', () => {
    it('sets viewWindow to 0', () => {
      const next = clockSetViewWindow({ ...defaultClockState(), viewWindow: 1 }, { window: 0 });
      expect(next.viewWindow).toBe(0);
    });

    it('sets viewWindow to 1', () => {
      const next = clockSetViewWindow(defaultClockState(), { window: 1 });
      expect(next.viewWindow).toBe(1);
    });

    it('coerces non-1 inputs to 0', () => {
      const next = clockSetViewWindow(defaultClockState(), { window: 2 as 0 | 1 });
      expect(next.viewWindow).toBe(0);
    });

    it('preserves linkedTodoId', () => {
      const next = clockSetViewWindow({ linkedTodoId: 'todo-x', viewWindow: 0 }, { window: 1 });
      expect(next.linkedTodoId).toBe('todo-x');
    });

    it('is pure (does not mutate input)', () => {
      const s = defaultClockState();
      clockSetViewWindow(s, { window: 1 });
      expect(s.viewWindow).toBe(0);
    });
  });
});
