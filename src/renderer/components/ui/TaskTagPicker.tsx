// One compact "what does this time count toward?" picker (#207 UX), used by
// the Pomo's "name this span" and the Calendar / Clock "Change task…".
//
//   [ Find a task or category…        ]
//   TASKS        agentic coding vl 2
//                front end 2
//                +4 more — keep typing
//   DONE TODAY   ✓ cluster build
//   CATEGORY     [⌘ Code] [📖 Study] [✎ Writing]   ← icon chips, 3 per row
//                + Add category "deep work"        ← only when typed and new
//
// Search filters both lists; ↑ ↓ move, Enter picks, Esc closes. Tasks come
// first because they are what time is usually counted toward.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { TagDef } from '../../../shared/tags/classify';
import { slugifyTag } from '../../../shared/tags/classify';
import { CategoryIcon } from '../nodes/PomoNode/CategoryIcon';
import { useBoardStore } from '../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { boardTagLibrary } from '../../store/spanTags';
import { toneVarForTask } from '../../utils/taskColor';

export interface PickerTask { id: string; text: string; done?: boolean }
export type PickerValue = { kind: 'task'; id: string } | { kind: 'tag'; id: string } | null;

export interface TaskTagPickerProps {
  tasks: readonly PickerTask[];
  /** Category library; omit to pick tasks only. */
  library?: readonly TagDef[];
  value: PickerValue;
  onPick: (v: Exclude<PickerValue, null>) => void;
  /** Adds a "untagged" choice (Calendar / Clock retag). */
  onUntag?: () => void;
  onAddCategory?: (label: string) => void;
  onClose?: () => void;
  testIdPrefix?: string;
}

const MAX_OPEN = 6;
const MAX_DONE = 3;
const caption: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', padding: '6px 8px 2px' };

type Item =
  | { key: string; kind: 'task'; id: string; label: string; done: boolean }
  | { key: string; kind: 'tag'; id: string; label: string; tag: TagDef }
  | { key: string; kind: 'untag'; label: string }
  | { key: string; kind: 'add'; label: string; value: string };

export function TaskTagPicker({ tasks, library, value, onPick, onUntag, onAddCategory, onClose, testIdPrefix = 'picker' }: TaskTagPickerProps): JSX.Element {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const needle = q.trim().toLowerCase();
  const match = (s: string): boolean => !needle || s.toLowerCase().includes(needle);
  const open = tasks.filter((t) => !t.done && match(t.text));
  const done = tasks.filter((t) => t.done && match(t.text));
  const tags = (library ?? []).filter((t) => match(t.label));
  const canAdd = !!onAddCategory && !!library && needle !== '' && !(library ?? []).some((t) => t.label.toLowerCase() === needle);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const t of open.slice(0, MAX_OPEN)) out.push({ key: `t-${t.id}`, kind: 'task', id: t.id, label: t.text, done: false });
    for (const t of done.slice(0, MAX_DONE)) out.push({ key: `t-${t.id}`, kind: 'task', id: t.id, label: t.text, done: true });
    for (const t of tags) out.push({ key: `g-${t.id}`, kind: 'tag', id: t.id, label: t.label, tag: t });
    if (canAdd) out.push({ key: 'add', kind: 'add', label: `+ Add category "${q.trim()}"`, value: q.trim() });
    if (onUntag && !needle) out.push({ key: 'untag', kind: 'untag', label: 'untagged' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, tasks, library, canAdd, onUntag]);
  useEffect(() => { setActive(0); }, [needle]);

  const choose = (it: Item): void => {
    if (it.kind === 'task') onPick({ kind: 'task', id: it.id });
    else if (it.kind === 'tag') onPick({ kind: 'tag', id: it.id });
    else if (it.kind === 'untag') onUntag?.();
    else { onAddCategory?.(it.value); onPick({ kind: 'tag', id: slugifyTag(it.value) }); }
  };
  const isOn = (it: Item): boolean =>
    !!value && ((it.kind === 'task' && value.kind === 'task' && value.id === it.id) || (it.kind === 'tag' && value.kind === 'tag' && value.id === it.id));

  const idx = (it: Item): number => items.findIndex((x) => x.key === it.key);
  const rowStyle = (it: Item): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '4px 8px', borderRadius: 5, border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11,
    background: idx(it) === active ? 'var(--paper-2)' : isOn(it) ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
    color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden',
  });
  const chipStyle = (it: Item & { kind: 'tag' }): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, cursor: 'pointer',
    padding: '3px 6px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 10,
    border: `1px solid ${isOn(it) ? it.tag.color : `color-mix(in srgb, ${it.tag.color} 40%, transparent)`}`,
    background: idx(it) === active ? 'var(--paper-2)' : `color-mix(in srgb, ${it.tag.color} 10%, transparent)`, color: 'var(--ink-2)',
  });

  // Each task shows its own colour and its tag, colour-coded (#207).
  // Select the todo node (stable reference), derive the library in a memo —
  // a selector returning a fresh array would re-render forever.
  const todoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'todo' && n.isMother));
  const boardLib = useMemo(() => boardTagLibrary(todoNode ? { nodes: [todoNode] } : null), [todoNode]);
  const lib = library ?? boardLib;
  const taskTag = useBoardStore(useShallow((st) => {
    const out: Record<string, string> = {};
    for (const n of st.board?.nodes ?? []) {
      if (n.kind !== 'todo') continue;
      for (const it of ((n.state as { items?: Array<{ taskNodeId?: string | null; tag?: string }> }).items ?? [])) {
        if (it.taskNodeId && it.tag) out[it.taskNodeId] = it.tag;
      }
    }
    return out;
  }));
  const pill = (taskId: string): JSX.Element | null => {
    const t = lib.find((x) => x.id === taskTag[taskId]);
    if (!t) return null;
    return (
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 999, fontSize: 9,
        color: t.color, background: `color-mix(in srgb, ${t.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 45%, transparent)` }}>
        <CategoryIcon id={t.id} color={t.color} size={9} />{t.label}
      </span>
    );
  };
  const taskItems = items.filter((i): i is Item & { kind: 'task' } => i.kind === 'task');
  const tagItems = items.filter((i): i is Item & { kind: 'tag' } => i.kind === 'tag');
  const moreOpen = open.length - Math.min(open.length, MAX_OPEN);

  return (
    <div
      data-testid={`${testIdPrefix}`}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ width: 250, display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}
    >
      <input
        ref={input}
        data-testid={`${testIdPrefix}-search`}
        value={q}
        placeholder={library ? 'Find a task or category…' : 'Find a task…'}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) choose(it); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
          e.stopPropagation();
        }}
        style={{
          margin: 2, padding: '6px 8px', background: 'var(--paper-2)', border: '1px solid var(--paper-3)', borderRadius: 5,
          color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
        }}
      />

      {taskItems.some((t) => !t.done) && <span style={caption}>Tasks</span>}
      {taskItems.filter((t) => !t.done).map((it) => (
        <button key={it.key} type="button" data-testid={`${testIdPrefix}-task-${it.id}`} style={rowStyle(it)} onMouseEnter={() => setActive(idx(it))} onClick={() => choose(it)}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(it.id), boxShadow: isOn(it) ? '0 0 0 2px var(--paper), 0 0 0 3px var(--ink-3)' : 'none' }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
          {pill(it.id)}
        </button>
      ))}
      {moreOpen > 0 && <span style={{ ...caption, textTransform: 'none', letterSpacing: 0 }}>+{moreOpen} more — keep typing</span>}

      {taskItems.some((t) => t.done) && <span style={caption}>Done</span>}
      {taskItems.filter((t) => t.done).map((it) => (
        <button key={it.key} type="button" data-testid={`${testIdPrefix}-task-${it.id}`} style={{ ...rowStyle(it), color: 'var(--ink-3)' }} onMouseEnter={() => setActive(idx(it))} onClick={() => choose(it)}>
          <span aria-hidden style={{ width: 10, color: 'var(--acid-ink, var(--acid))' }}>✓</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through', textDecorationColor: 'var(--ink-4)' }}>{it.label}</span>
          {pill(it.id)}
        </button>
      ))}

      {library && (tagItems.length > 0 || canAdd) && <span style={caption}>Category</span>}
      {tagItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, padding: '2px 4px' }}>
          {tagItems.map((it) => (
            <button key={it.key} type="button" data-testid={`${testIdPrefix}-tag-${it.id}`} title={it.label} style={chipStyle(it)} onMouseEnter={() => setActive(idx(it))} onClick={() => choose(it)}>
              <CategoryIcon id={it.tag.id} color={it.tag.color} size={11} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            </button>
          ))}
        </div>
      )}
      {items.filter((i) => i.kind === 'add' || i.kind === 'untag').map((it) => (
        <button key={it.key} type="button" data-testid={`${testIdPrefix}-${it.kind}`} style={{ ...rowStyle(it), color: 'var(--ink-3)', fontSize: 10 }} onMouseEnter={() => setActive(idx(it))} onClick={() => choose(it)}>
          {it.label}
        </button>
      ))}
      {items.length === 0 && <span style={{ ...caption, textTransform: 'none', letterSpacing: 0 }}>Nothing matches “{q}”</span>}
    </div>
  );
}
