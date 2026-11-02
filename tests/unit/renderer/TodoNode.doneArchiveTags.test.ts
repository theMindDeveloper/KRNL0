// ADR 0016 — Done / Archive lifecycle + tags on the Todo FSM.
// Maps F16–F23 in docs/06-requirements/todo-node.md.

import { describe, it, expect } from 'vitest';
import {
  todoAdd,
  todoAddTag,
  todoArchiveDone,
  todoBuckets,
  todoClearArchived,
  todoEdit,
  todoRemoveTag,
  todoSetItemTag,
  todoToggle,
  tagExamples,
  type TodoEnv,
} from '../../../src/renderer/components/nodes/TodoNode/commands';
import { defaultTodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

// Local-time fixtures so "today" doesn't depend on the runner's timezone.
const at = (ymd: string, hh = 10) => new Date(`${ymd}T${String(hh).padStart(2, '0')}:00:00`).toISOString();
const TODAY = '2026-11-02';
const YESTERDAY = '2026-11-01';
const NOW_MS = new Date(`${TODAY}T15:00:00`).getTime();

const env = (iso: string, id = 'id'): TodoEnv => ({ uuid: () => id, now: () => iso });

function seed(): TodoState {
  let s = defaultTodoState();
  s = todoAdd(s, { text: 'open task' }, env(at(YESTERDAY, 8), 'a'));
  s = todoAdd(s, { text: 'done today' }, env(at(YESTERDAY, 8), 'b'));
  s = todoAdd(s, { text: 'done yesterday' }, env(at(YESTERDAY, 8), 'c'));
  s = todoToggle(s, { id: 'b' }, env(at(TODAY, 9)));
  s = todoToggle(s, { id: 'c' }, env(at(YESTERDAY, 20)));
  return s;
}

describe('F16 — completed items move to Done, not out of the list', () => {
  it('splits items into active / done (today) / archived (earlier days)', () => {
    const b = todoBuckets(seed(), NOW_MS);
    expect(b.active.map((i) => i.id)).toEqual(['a']);
    expect(b.done.map((i) => i.id)).toEqual(['b']);
    expect(b.archived.map((i) => i.id)).toEqual(['c']);
  });
});

describe('F17 — Done rolls into Archive when the day ends', () => {
  it('the same state re-buckets once the clock passes midnight', () => {
    const s = seed();
    const tomorrow = new Date(`2026-11-03T00:01:00`).getTime();
    expect(todoBuckets(s, NOW_MS).done).toHaveLength(1);
    const later = todoBuckets(s, tomorrow);
    expect(later.done).toHaveLength(0);
    expect(later.archived.map((i) => i.id)).toEqual(['b', 'c']); // newest first
  });
});

describe('F18 — Archive now', () => {
  it('stamps archivedAt on every done item and leaves open items alone', () => {
    const s = todoArchiveDone(seed(), env(at(TODAY, 16)));
    const b = todoBuckets(s, NOW_MS);
    expect(b.done).toHaveLength(0);
    expect(b.archived.map((i) => i.id).sort()).toEqual(['b', 'c']);
    expect(s.items.find((i) => i.id === 'a')?.archivedAt).toBeUndefined();
  });

  it('is a no-op (same reference) when nothing is done', () => {
    const s = todoAdd(defaultTodoState(), { text: 'x' }, env(at(TODAY), 'x'));
    expect(todoArchiveDone(s)).toBe(s);
  });
});

describe('F19 — restoring an archived item reopens it', () => {
  it('toggling an archived item clears archivedAt and puts it back in active', () => {
    let s = todoArchiveDone(seed(), env(at(TODAY, 16)));
    s = todoToggle(s, { id: 'b' }, env(at(TODAY, 17)));
    const item = s.items.find((i) => i.id === 'b')!;
    expect(item.done).toBe(false);
    expect(item.archivedAt).toBeUndefined();
    expect(todoBuckets(s, NOW_MS).active.map((i) => i.id)).toContain('b');
  });
});

describe('F20 — clear archive', () => {
  it('drops archived items only', () => {
    const s = todoClearArchived(seed(), NOW_MS);
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('F21 — auto tags on add and edit, hand tags are sticky', () => {
  it('auto-tags a new item from its text', () => {
    const s = todoAdd(defaultTodoState(), { text: 'Reply to emails' }, env(at(TODAY), 'e'));
    expect(s.items[0]).toMatchObject({ tag: 'admin', tagSource: 'auto' });
  });

  it('an explicit tag is a hand tag', () => {
    const s = todoAdd(defaultTodoState(), { text: 'Reply to emails', tag: 'code' }, env(at(TODAY), 'e'));
    expect(s.items[0]).toMatchObject({ tag: 'code', tagSource: 'user' });
  });

  it('editing text re-classifies an auto tag', () => {
    let s = todoAdd(defaultTodoState(), { text: 'Reply to emails' }, env(at(TODAY), 'e'));
    s = todoEdit(s, { id: 'e', text: 'Go to the gym' });
    expect(s.items[0]).toMatchObject({ tag: 'health', tagSource: 'auto' });
  });

  it('editing text keeps a hand tag', () => {
    let s = todoAdd(defaultTodoState(), { text: 'Reply to emails' }, env(at(TODAY), 'e'));
    s = todoSetItemTag(s, { id: 'e', tag: 'planning' });
    s = todoEdit(s, { id: 'e', text: 'Go to the gym' });
    expect(s.items[0]).toMatchObject({ tag: 'planning', tagSource: 'user' });
  });
});

describe('F22 — re-tagging teaches the classifier', () => {
  it('a correction re-classifies similar open auto-tagged items', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'krnl0 sprint review' }, env(at(TODAY), 'one'));
    s = todoAdd(s, { text: 'krnl0 sprint demo' }, env(at(TODAY), 'two'));
    s = todoSetItemTag(s, { id: 'one', tag: 'study' });
    expect(tagExamples(s)).toEqual([{ text: 'krnl0 sprint review', tag: 'study' }]);
    expect(s.items.find((i) => i.id === 'two')?.tag).toBe('study');
  });

  it('does not re-file done items (history stays put)', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'krnl0 sprint review' }, env(at(TODAY), 'one'));
    s = todoAdd(s, { text: 'krnl0 sprint retro notes' }, env(at(TODAY), 'two'));
    const before = s.items.find((i) => i.id === 'two')?.tag;
    s = todoToggle(s, { id: 'two' }, env(at(TODAY)));
    s = todoSetItemTag(s, { id: 'one', tag: 'study' });
    expect(s.items.find((i) => i.id === 'two')?.tag).toBe(before);
  });

  it('tag: null hands an item back to the classifier', () => {
    let s = todoAdd(defaultTodoState(), { text: 'Reply to emails', tag: 'code' }, env(at(TODAY), 'e'));
    s = todoSetItemTag(s, { id: 'e', tag: null });
    expect(s.items[0]).toMatchObject({ tag: 'admin', tagSource: 'auto' });
  });
});

describe('F23 — custom tags', () => {
  it('setting an unknown label creates a custom tag', () => {
    let s = todoAdd(defaultTodoState(), { text: 'Elden ring' }, env(at(TODAY), 'g'));
    s = todoSetItemTag(s, { id: 'g', tag: 'Gaming' });
    expect(s.tagLibrary?.map((t) => t.id)).toEqual(['gaming']);
    expect(s.items[0]).toMatchObject({ tag: 'gaming', tagSource: 'user' });
  });

  it('addTag rejects duplicates and built-in names', () => {
    let s = todoAddTag(defaultTodoState(), { label: 'Gaming' });
    expect(todoAddTag(s, { label: 'gaming' })).toBe(s);
    expect(todoAddTag(s, { label: 'Code' })).toBe(s);
    s = todoAddTag(s, { label: 'Side project', keywords: ['krnl0'] });
    expect(s.tagLibrary?.map((t) => t.id)).toEqual(['gaming', 'side-project']);
  });

  it('a new tag with keywords immediately claims matching open items', () => {
    let s = todoAdd(defaultTodoState(), { text: 'steam sale' }, env(at(TODAY), 'g'));
    s = todoAddTag(s, { label: 'Gaming', keywords: ['steam'] });
    expect(s.items[0]).toMatchObject({ tag: 'gaming', tagSource: 'auto' });
  });

  it('removeTag deletes a custom tag and re-classifies its open items', () => {
    let s = todoAdd(defaultTodoState(), { text: 'steam sale' }, env(at(TODAY), 'g'));
    s = todoAddTag(s, { label: 'Gaming', keywords: ['steam'] });
    s = todoRemoveTag(s, { id: 'gaming' });
    expect(s.tagLibrary).toEqual([]);
    expect(s.items[0]?.tag).not.toBe('gaming');
  });

  it('built-in tags cannot be removed', () => {
    const s = defaultTodoState();
    expect(todoRemoveTag(s, { id: 'code' })).toBe(s);
  });
});
