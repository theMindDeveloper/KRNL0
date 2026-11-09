// Decision #10 — TodoNode state contract.
// Persistence rule: store items in insertion order; sort a copy at render time.

import type { TagDef } from '../../../../shared/tags/taxonomy';

export interface TodoItem {
  id: string;            // crypto.randomUUID()
  text: string;
  done: boolean;
  // ADR 0016 — tag id from the merged library (built-ins + tagLibrary), or a
  // legacy free-text label like "WORK". Absent = untagged ("Other").
  tag?: string;
  // 'auto' = set by the classifier (re-classified on edit / when the user
  // teaches it); 'user' = chosen by hand, never overwritten. Absent with a
  // tag = legacy hand tag, treated as 'user'.
  tagSource?: 'auto' | 'user';
  createdAt: string;     // ISO 8601
  completedAt: string | null; // ISO when done = true, null otherwise
  // ADR 0016 — set by "Archive now". Done items also archive on their own once
  // their completion day has passed (see todoBuckets); this only forces it early.
  archivedAt?: string;
  taskNodeId: string | null;  // Decision 20: back-link to spawned TaskNode.id
  // ADR 0001 — Calendar integration: mirrors TaskState.scheduledFor for items
  // that haven't spawned a TaskNode yet. Optional — absence means unscheduled.
  scheduledFor?: string;      // ISO 8601 local datetime, e.g. "2026-05-20T14:30"
  // Review 2.1 — the day it must be done by (YYYY-MM-DD), apart from when you
  // plan to work on it. Absent = no deadline.
  dueOn?: string;
  // Review 6.1 — "not doing this any more": set when dropped. A dropped item
  // is neither done nor deleted; it sits in the Archive marked "dropped" and
  // can be brought back. Analytics never counts it as done.
  droppedAt?: string;
  // Decision 40 — its When as a day with no time (the Calendar's ANY TIME
  // strip). Set only while the plan has no Calendar time; `dueOn` is its
  // Deadline and nothing else.
  onDay?: string;
}

export interface TodoState {
  items: TodoItem[];     // insertion order; render sorts a copy
  // ADR 0016 — user-created tags. Built-ins live in code (shared/tags) and are
  // merged in at read time, so this holds only the custom additions.
  tagLibrary?: TagDef[];
}

export interface TodoConfig {
  showCompleted: boolean; // default true
  maxVisible: number;     // default 50
}

export const defaultTodoState = (): TodoState => ({ items: [] });

export const defaultTodoConfig = (): TodoConfig => ({
  showCompleted: true,
  maxVisible: 50,
});
