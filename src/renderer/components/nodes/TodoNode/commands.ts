// Decision #10 — TodoNode FSM. Each handler is pure: (state, args) => state.
// Time and id sources are injected so tests can pin them; the kernel passes
// real Date.now and crypto.randomUUID at runtime.

import type { TodoConfig, TodoItem, TodoState } from './types';

export interface TodoEnv {
  uuid: () => string;
  now: () => string; // ISO 8601 timestamp
}

const defaultEnv: TodoEnv = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

// todo.add — append a new item; trims text; no-op on empty.
// Optional `tag` arg is a short label (e.g. "WORK") stored on the item.
// Optional `durationMin` arg is forwarded to commandDispatch for TaskNode creation.
export const todoAdd = (
  state: TodoState,
  args: { text: string; tag?: string; durationMin?: number },
  env: TodoEnv = defaultEnv,
): TodoState => {
  const trimmed = args.text.trim();
  if (!trimmed) return state;
  const item: TodoItem = {
    id: env.uuid(),
    text: trimmed,
    done: false,
    ...(args.tag !== undefined ? { tag: args.tag } : {}),
    createdAt: env.now(),
    completedAt: null,
    taskNodeId: null,
  };
  return { ...state, items: [...state.items, item] };
};

// todo.toggle — flip done; set completedAt = now() when going done, null when undoing.
export const todoToggle = (
  state: TodoState,
  args: { id: string },
  env: TodoEnv = defaultEnv,
): TodoState => ({
  ...state,
  items: state.items.map((item) => {
    if (item.id !== args.id) return item;
    const done = !item.done;
    return { ...item, done, completedAt: done ? env.now() : null };
  }),
});

// todo.edit — update text; no-op if id is missing.
export const todoEdit = (
  state: TodoState,
  args: { id: string; text: string },
): TodoState => ({
  ...state,
  items: state.items.map((item) =>
    item.id === args.id ? { ...item, text: args.text } : item,
  ),
});

// todo.remove — filter out one item by id.
export const todoRemove = (
  state: TodoState,
  args: { id: string },
): TodoState => ({
  ...state,
  items: state.items.filter((item) => item.id !== args.id),
});

// todo.clearDone — remove all completed items.
export const todoClearDone = (state: TodoState): TodoState => ({
  ...state,
  items: state.items.filter((item) => !item.done),
});

// todo.linkTask — set taskNodeId on an item (called after task node is spawned).
export const todoLinkTask = (
  state: TodoState,
  args: { itemId: string; taskNodeId: string },
): TodoState => ({
  ...state,
  items: state.items.map((item) =>
    item.id === args.itemId ? { ...item, taskNodeId: args.taskNodeId } : item,
  ),
});

// todo.setItemSchedule — ADR 0001: set or clear scheduledFor on a TodoItem.
// Mirrors task.setSchedule; used for items that haven't spawned a TaskNode yet,
// and for the bidirectional invariant when task.setSchedule cascades to the item.
export const todoSetItemSchedule = (
  state: TodoState,
  args: { itemId: string; scheduledFor: string | null },
): TodoState => ({
  ...state,
  items: state.items.map((item) => {
    if (item.id !== args.itemId) return item;
    if (args.scheduledFor === null) {
      const { scheduledFor: _sf, ...rest } = item;
      void _sf;
      return rest;
    }
    return { ...item, scheduledFor: args.scheduledFor };
  }),
});

// Render helper (pure, applied to a copy — Decision #10):
//   1. Filter by showCompleted if false
//   2. Sort: undone first (ascending createdAt), done last (ascending createdAt)
//   3. Slice to maxVisible
export const visibleItems = (state: TodoState, config: TodoConfig): TodoItem[] =>
  [...state.items]
    .filter((i) => config.showCompleted || !i.done)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, config.maxVisible);
