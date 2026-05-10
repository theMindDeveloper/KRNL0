import { describe, it, expect } from 'vitest';
import {
  todoAdd,
  todoToggle,
  todoEdit,
  todoRemove,
  todoClearDone,
  visibleItems,
  type TodoEnv,
} from '../../../src/renderer/components/nodes/TodoNode/commands';
import { defaultTodoConfig, defaultTodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

// Fixed timestamps for deterministic tests
const T0 = '2026-05-10T12:00:00.000Z';
const T1 = '2026-05-10T12:01:00.000Z';
const T2 = '2026-05-10T12:02:00.000Z';
const T3 = '2026-05-10T12:03:00.000Z';

const env = (iso: string, id = 'fixed-id'): TodoEnv => ({
  uuid: () => id,
  now: () => iso,
});

// ────────────────────────────────────────────────────────────────────────────
describe('TodoNode commands (Decision #10)', () => {

  // ── todoAdd ──────────────────────────────────────────────────────────────
  describe('todo.add', () => {
    it('appends an item with correct shape', () => {
      const s = defaultTodoState();
      const next = todoAdd(s, { text: 'buy oat milk' }, env(T0, 'id-1'));
      expect(next.items).toHaveLength(1);
      expect(next.items[0]).toEqual({
        id: 'id-1',
        text: 'buy oat milk',
        done: false,
        createdAt: T0,
        completedAt: null,
      });
    });

    it('trims whitespace from text', () => {
      const next = todoAdd(defaultTodoState(), { text: '  walk dog  ' }, env(T0));
      expect(next.items[0]?.text).toBe('walk dog');
    });

    it('is a no-op when text is empty', () => {
      const s = defaultTodoState();
      const next = todoAdd(s, { text: '' }, env(T0));
      expect(next).toBe(s);
    });

    it('is a no-op when text is only whitespace', () => {
      const s = defaultTodoState();
      const next = todoAdd(s, { text: '   ' }, env(T0));
      expect(next).toBe(s);
    });

    it('preserves existing items (insertion order)', () => {
      const s1 = todoAdd(defaultTodoState(), { text: 'first' }, env(T0, 'a'));
      const s2 = todoAdd(s1, { text: 'second' }, env(T1, 'b'));
      expect(s2.items).toHaveLength(2);
      expect(s2.items[0]?.id).toBe('a');
      expect(s2.items[1]?.id).toBe('b');
    });

    it('stores tag on the item when provided', () => {
      const s = todoAdd(defaultTodoState(), { text: 'tagged task', tag: 'WORK' }, env(T0, 'id-1'));
      expect(s.items[0]?.tag).toBe('WORK');
    });

    it('omits tag from item when not provided', () => {
      const s = todoAdd(defaultTodoState(), { text: 'no tag' }, env(T0, 'id-1'));
      expect(s.items[0]?.tag).toBeUndefined();
    });
  });

  // ── todoToggle ───────────────────────────────────────────────────────────
  describe('todo.toggle', () => {
    it('marks an undone item done and sets completedAt', () => {
      const s = todoAdd(defaultTodoState(), { text: 'foo' }, env(T0, 'id-1'));
      const next = todoToggle(s, { id: 'id-1' }, env(T1));
      expect(next.items[0]?.done).toBe(true);
      expect(next.items[0]?.completedAt).toBe(T1);
    });

    it('marks a done item undone and clears completedAt', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'foo' }, env(T0, 'id-1'));
      const s1 = todoToggle(s0, { id: 'id-1' }, env(T1));
      const s2 = todoToggle(s1, { id: 'id-1' }, env(T2));
      expect(s2.items[0]?.done).toBe(false);
      expect(s2.items[0]?.completedAt).toBeNull();
    });

    it('leaves other items untouched', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'b' }, env(T1, 'id-b'));
      const next = todoToggle(s1, { id: 'id-a' }, env(T2));
      expect(next.items[0]?.done).toBe(true);
      expect(next.items[1]?.done).toBe(false);
    });

    it('is a no-op when id does not exist (items unchanged)', () => {
      const s = todoAdd(defaultTodoState(), { text: 'x' }, env(T0, 'id-x'));
      const next = todoToggle(s, { id: 'missing' }, env(T1));
      expect(next.items[0]?.done).toBe(false);
    });
  });

  // ── todoEdit ─────────────────────────────────────────────────────────────
  describe('todo.edit', () => {
    it('updates the text of the matching item', () => {
      const s = todoAdd(defaultTodoState(), { text: 'old text' }, env(T0, 'id-1'));
      const next = todoEdit(s, { id: 'id-1', text: 'new text' });
      expect(next.items[0]?.text).toBe('new text');
    });

    it('leaves all other fields of the item intact', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'old' }, env(T0, 'id-1'));
      const s1 = todoToggle(s0, { id: 'id-1' }, env(T1));
      const s2 = todoEdit(s1, { id: 'id-1', text: 'new' });
      expect(s2.items[0]?.done).toBe(true);
      expect(s2.items[0]?.completedAt).toBe(T1);
    });

    it('is a no-op when id is missing (items unchanged, same ref)', () => {
      const s = todoAdd(defaultTodoState(), { text: 'x' }, env(T0, 'id-x'));
      const next = todoEdit(s, { id: 'missing', text: 'y' });
      expect(next.items[0]?.text).toBe('x');
    });
  });

  // ── todoRemove ───────────────────────────────────────────────────────────
  describe('todo.remove', () => {
    it('removes the item with the given id', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'b' }, env(T1, 'id-b'));
      const next = todoRemove(s1, { id: 'id-a' });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.id).toBe('id-b');
    });

    it('is a no-op when id is missing', () => {
      const s = todoAdd(defaultTodoState(), { text: 'x' }, env(T0, 'id-x'));
      const next = todoRemove(s, { id: 'missing' });
      expect(next.items).toHaveLength(1);
    });

    it('leaves an empty list when last item is removed', () => {
      const s = todoAdd(defaultTodoState(), { text: 'only' }, env(T0, 'id-1'));
      const next = todoRemove(s, { id: 'id-1' });
      expect(next.items).toHaveLength(0);
    });
  });

  // ── todoClearDone ────────────────────────────────────────────────────────
  describe('todo.clearDone', () => {
    it('removes all done items', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'b' }, env(T1, 'id-b'));
      const s2 = todoToggle(s1, { id: 'id-a' }, env(T2));
      const next = todoClearDone(s2);
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.id).toBe('id-b');
    });

    it('is a no-op when no items are done', () => {
      const s = todoAdd(defaultTodoState(), { text: 'x' }, env(T0, 'id-x'));
      const next = todoClearDone(s);
      expect(next.items).toHaveLength(1);
    });

    it('returns an empty list when all items are done', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoToggle(s0, { id: 'id-a' }, env(T1));
      const next = todoClearDone(s1);
      expect(next.items).toHaveLength(0);
    });
  });

  // ── visibleItems (render sort) ────────────────────────────────────────────
  describe('visibleItems (render sort)', () => {
    it('puts undone items before done items', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'first' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'second' }, env(T1, 'id-b'));
      const s2 = todoToggle(s1, { id: 'id-a' }, env(T2));
      const vis = visibleItems(s2, defaultTodoConfig());
      expect(vis[0]?.id).toBe('id-b');
      expect(vis[1]?.id).toBe('id-a');
    });

    it('sorts undone items ascending by createdAt', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'later' }, env(T1, 'id-b'));
      const s1 = todoAdd(s0, { text: 'earlier' }, env(T0, 'id-a'));
      const vis = visibleItems(s1, defaultTodoConfig());
      expect(vis[0]?.id).toBe('id-a');
      expect(vis[1]?.id).toBe('id-b');
    });

    it('sorts done items ascending by createdAt within the done group', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'done-later' }, env(T1, 'id-b'));
      const s1 = todoAdd(s0, { text: 'done-earlier' }, env(T0, 'id-a'));
      const s2 = todoToggle(s1, { id: 'id-b' }, env(T2));
      const s3 = todoToggle(s2, { id: 'id-a' }, env(T3));
      const vis = visibleItems(s3, defaultTodoConfig());
      expect(vis[0]?.id).toBe('id-a');
      expect(vis[1]?.id).toBe('id-b');
    });

    it('hides done items when showCompleted is false', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'b' }, env(T1, 'id-b'));
      const s2 = todoToggle(s1, { id: 'id-a' }, env(T2));
      const vis = visibleItems(s2, { showCompleted: false, maxVisible: 50 });
      expect(vis).toHaveLength(1);
      expect(vis[0]?.id).toBe('id-b');
    });

    it('respects maxVisible limit', () => {
      let s = defaultTodoState();
      for (let i = 0; i < 10; i++) {
        s = todoAdd(s, { text: `item ${i}` }, env(T0, `id-${i}`));
      }
      const vis = visibleItems(s, { showCompleted: true, maxVisible: 3 });
      expect(vis).toHaveLength(3);
    });

    it('does not mutate the original state.items array', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'a' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'b' }, env(T1, 'id-b'));
      const original = [...s1.items];
      visibleItems(s1, defaultTodoConfig());
      expect(s1.items).toEqual(original);
    });
  });

  // ── Persistence rule ─────────────────────────────────────────────────────
  describe('persistence rule (Decision #10)', () => {
    it('storage order remains insertion order regardless of done status', () => {
      const s0 = todoAdd(defaultTodoState(), { text: 'first' }, env(T0, 'id-a'));
      const s1 = todoAdd(s0, { text: 'second' }, env(T1, 'id-b'));
      const s2 = todoToggle(s1, { id: 'id-a' }, env(T2));
      // items array itself preserves insertion order
      expect(s2.items[0]?.id).toBe('id-a');
      expect(s2.items[1]?.id).toBe('id-b');
    });
  });
});
