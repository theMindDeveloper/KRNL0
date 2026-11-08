// Decision #10 — TodoNode FSM. Each handler is pure: (state, args) => state.
// Time and id sources are injected so tests can pin them; the kernel passes
// real Date.now and crypto.randomUUID at runtime.

import type { TodoConfig, TodoItem, TodoState } from './types';
import {
  classifyTask,
  findTag,
  mergeTagLibrary,
  slugifyTag,
} from '../../../../shared/tags/classify';
import type { TagDef, TagExample } from '../../../../shared/tags/classify';
import { isoToYMD, toYMD } from '../../../analytics/dateRange';

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
  // ADR 0016 — an explicit tag is a hand tag; otherwise ask the classifier.
  const autoTag = args.tag === undefined ? autoTagFor(state, trimmed) : null;
  const item: TodoItem = {
    id: env.uuid(),
    text: trimmed,
    done: false,
    ...(args.tag !== undefined ? { tag: args.tag, tagSource: 'user' as const } : {}),
    ...(autoTag !== null ? { tag: autoTag, tagSource: 'auto' as const } : {}),
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
    // Reopening pulls the item out of Done/Archive, so a manual archive mark
    // must not survive it.
    const { archivedAt: _a, ...rest } = item;
    void _a;
    return { ...rest, done, completedAt: done ? env.now() : null };
  }),
});

// todo.edit — update text; no-op if id is missing. Auto tags are re-derived
// from the new text; hand tags are kept.
export const todoEdit = (
  state: TodoState,
  args: { id: string; text: string },
): TodoState => ({
  ...state,
  items: state.items.map((item) => {
    if (item.id !== args.id) return item;
    const edited = { ...item, text: args.text };
    return isHandTagged(item) ? edited : withAutoTag(edited, autoTagFor(state, args.text, item.id));
  }),
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
// todo.setDue — the day it must be done by (YYYY-MM-DD), or null to clear.
export const todoSetDue = (
  state: TodoState,
  args: { id: string; dueOn: string | null },
): TodoState => {
  if (args.dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(args.dueOn)) return state;
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== args.id) return item;
      if (args.dueOn === null) { const { dueOn: _drop, ...rest } = item; return rest; }
      return { ...item, dueOn: args.dueOn };
    }),
  };
};

// todo.drop — "not doing this any more" (review 6.1). Only open items drop.
export const todoDrop = (state: TodoState, args: { id: string }, env: TodoEnv = defaultEnv): TodoState => {
  const stamp = env.now();
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== args.id || item.done || item.droppedAt !== undefined) return item;
    changed = true;
    return { ...item, droppedAt: stamp };
  });
  return changed ? { ...state, items } : state;
};

// todo.undrop — back on the open list.
export const todoUndrop = (state: TodoState, args: { id: string }): TodoState => {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== args.id || item.droppedAt === undefined) return item;
    changed = true;
    const { droppedAt: _drop, ...rest } = item;
    return rest;
  });
  return changed ? { ...state, items } : state;
};

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
    // Decision 40 — a time on the Calendar is its When: no any-time day too.
    const { onDay: _od, ...timed } = item;
    void _od;
    return { ...timed, scheduledFor: args.scheduledFor };
  }),
});

// todo.setOnDay — Decision 40: the plan's When as a day with no time (the
// Calendar's ANY TIME strip), or null for no day. The caller takes it off the
// grid first when it had a time.
export const todoSetOnDay = (state: TodoState, args: { id: string; onDay: string | null }): TodoState => {
  if (args.onDay !== null && !/^\d{4}-\d{2}-\d{2}$/.test(args.onDay)) return state;
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== args.id) return item;
      if (args.onDay === null) { const { onDay: _o, ...rest } = item; void _o; return rest; }
      return { ...item, onDay: args.onDay };
    }),
  };
};

// ── ADR 0016 — tags ─────────────────────────────────────────────────────────

/** Built-in tags followed by this list's custom tags. */
export const todoTagLibrary = (state: TodoState): readonly TagDef[] =>
  mergeTagLibrary(state.tagLibrary);

/** A tag the user chose (legacy tags without a source count as chosen). */
const isHandTagged = (item: TodoItem): boolean =>
  item.tag !== undefined && item.tagSource !== 'auto';

/** Hand-tagged items are the classifier's training set. */
export const tagExamples = (state: TodoState, excludeId?: string): TagExample[] =>
  state.items
    .filter((i) => i.id !== excludeId && isHandTagged(i))
    .map((i) => ({ text: i.text, tag: i.tag as string }));

function autoTagFor(state: TodoState, text: string, excludeId?: string): string | null {
  return classifyTask(text, todoTagLibrary(state), tagExamples(state, excludeId));
}

function withAutoTag(item: TodoItem, tagId: string | null): TodoItem {
  const { tag: _t, tagSource: _s, ...rest } = item;
  void _t; void _s;
  return tagId === null ? rest : { ...rest, tag: tagId, tagSource: 'auto' };
}

// todo.setItemTag — hand-tag an item. `tag` is an id or label; an unknown
// label creates a custom tag on the fly. `null` hands the item back to the
// classifier. Every other open, auto-tagged item is then re-classified so one
// correction immediately improves the rest of the list.
export const todoSetItemTag = (
  state: TodoState,
  args: { id: string; tag: string | null },
): TodoState => {
  if (!state.items.some((i) => i.id === args.id)) return state;
  let next = state;
  let tagId: string | null = null;
  if (args.tag !== null) {
    const label = args.tag.trim();
    if (!label) return state;
    if (!findTag(todoTagLibrary(next), label)) next = todoAddTag(next, { label });
    tagId = findTag(todoTagLibrary(next), label)?.id ?? null;
    if (tagId === null) return state;
  }
  const items = next.items.map((item) => {
    if (item.id !== args.id) return item;
    if (tagId !== null) return { ...item, tag: tagId, tagSource: 'user' as const };
    return withAutoTag(item, autoTagFor(next, item.text, item.id));
  });
  return todoReclassify({ ...next, items });
};

// todo.reclassify — re-run the classifier over open, auto-tagged (or
// untagged) items. Done/archived items keep the tag they were completed under
// so history doesn't shift underneath the analytics.
export const todoReclassify = (state: TodoState): TodoState => {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.done || isHandTagged(item)) return item;
    const tagId = autoTagFor(state, item.text, item.id);
    if ((item.tag ?? null) === tagId) return item;
    changed = true;
    return withAutoTag(item, tagId);
  });
  return changed ? { ...state, items } : state;
};

// todo.addTag — create a custom tag. No-op on an empty label or one that
// already exists. Keywords are optional extra trigger words for the classifier.
const CUSTOM_TAG_COLORS = ['#e8a33d', '#4fb3ff', '#c07bff', '#57d19a', '#ff7b7b', '#b8c46a'];
export const todoAddTag = (
  state: TodoState,
  args: { label: string; color?: string; keywords?: string[] },
): TodoState => {
  const label = args.label.trim().slice(0, 24);
  const id = slugifyTag(label);
  if (!label || !id) return state;
  const library = todoTagLibrary(state);
  if (findTag(library, label) || library.some((t) => t.id === id)) return state;
  const custom = state.tagLibrary ?? [];
  const keywords = (args.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const tag: TagDef = {
    id,
    label,
    color: args.color ?? CUSTOM_TAG_COLORS[custom.length % CUSTOM_TAG_COLORS.length]!,
    ...(keywords.length > 0 ? { keywords } : {}),
  };
  return todoReclassify({ ...state, tagLibrary: [...custom, tag] });
};

// todo.removeTag — delete a custom tag (built-ins can't be removed). Open
// items that carried it go back to the classifier; done items keep the id so
// their history still groups together (it then renders as a plain label).
export const todoRemoveTag = (state: TodoState, args: { id: string }): TodoState => {
  const custom = state.tagLibrary ?? [];
  if (!custom.some((t) => t.id === args.id)) return state;
  const next: TodoState = {
    ...state,
    tagLibrary: custom.filter((t) => t.id !== args.id),
    items: state.items.map((i) => (i.tag === args.id && !i.done ? withAutoTag(i, null) : i)),
  };
  return todoReclassify(next);
};

// ── ADR 0016 — Done / Archive lifecycle ─────────────────────────────────────
// Buckets are derived, not stored: a done item sits in "Done" while its
// completion day is today and moves to "Archive" once that day is over, so the
// rollover needs no midnight job and survives the app being closed overnight.
// archivedAt only forces an early archive ("Archive now").

export interface TodoBuckets {
  active: TodoItem[];
  done: TodoItem[];
  archived: TodoItem[];
}

export const isArchived = (item: TodoItem, today: string): boolean =>
  item.droppedAt !== undefined ||
  (item.done &&
    (item.archivedAt !== undefined ||
      (item.completedAt !== null && isoToYMD(item.completedAt) < today)));

export const todoBuckets = (state: TodoState, nowMs: number = Date.now()): TodoBuckets => {
  const today = toYMD(new Date(nowMs));
  const out: TodoBuckets = { active: [], done: [], archived: [] };
  for (const item of state.items) {
    if (item.droppedAt !== undefined) out.archived.push(item);
    else if (!item.done) out.active.push(item);
    else if (isArchived(item, today)) out.archived.push(item);
    else out.done.push(item);
  }
  // Archive reads newest-first; the other two keep insertion order.
  out.archived.sort((a, b) => (b.completedAt ?? b.droppedAt ?? '').localeCompare(a.completedAt ?? a.droppedAt ?? ''));
  return out;
};

// todo.archiveDone — "Archive now": move every done-today item to the archive.
export const todoArchiveDone = (state: TodoState, env: TodoEnv = defaultEnv): TodoState => {
  const stamp = env.now();
  let changed = false;
  const items = state.items.map((item) => {
    if (!item.done || item.archivedAt !== undefined) return item;
    changed = true;
    return { ...item, archivedAt: stamp };
  });
  return changed ? { ...state, items } : state;
};

// todo.clearArchived — permanently drop archived items. Analytics is
// unaffected: completions live in the board ledger (#169), not on the list.
export const todoClearArchived = (state: TodoState, nowMs: number = Date.now()): TodoState => {
  const today = toYMD(new Date(nowMs));
  const items = state.items.filter((i) => !isArchived(i, today));
  return items.length === state.items.length ? state : { ...state, items };
};

// Render helper (pure, applied to a copy — Decision #10):
//   1. Filter by showCompleted if false
//   2. Sort: undone first (ascending createdAt), done last (ascending createdAt)
//   3. Slice to maxVisible — but never past an open item: the list pages its
//      rows, and a cap that hid open items made a newly added task (sorted
//      last) silently missing while the header still counted it.
export const visibleItems = (state: TodoState, config: TodoConfig): TodoItem[] => {
  const sorted = [...state.items]
    .filter((i) => config.showCompleted || !i.done)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  const open = sorted.filter((i) => !i.done).length;
  return sorted.slice(0, Math.max(config.maxVisible, open));
};
