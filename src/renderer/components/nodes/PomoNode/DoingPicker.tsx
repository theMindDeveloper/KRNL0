// Observe mode — "what am I doing?" in one row. Shows the current name
// (with its category or ☑ task) and opens a list of recent names, your
// tasks, and a field to type a new one. Picking sets what Start / Continue /
// Back to work records; ✕ clears it so the next span is asked about.

import { useRef, useState } from 'react';
import type { TagDef } from '../../../../shared/tags/classify';
import { Popover } from '../../ui/Popover';
import { CategoryIcon } from './CategoryIcon';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { toneVarForTask } from '../../../utils/taskColor';
import { toggleTaskDone } from '../../../store/scheduleActions';

export interface DoingChoice {
  label: string;
  tag: string | null;
  taskId: string | null;
}

export interface DoingPickerProps {
  /** Word shown before the name: DOING while recording, NEXT when idle. */
  caption: string;
  current: DoingChoice | null;
  recents: readonly DoingChoice[];
  /** Open tasks, then tasks done today (`done: true`, own group — #204). */
  tasks: ReadonlyArray<{ id: string; text: string; done?: boolean }>;
  library: readonly TagDef[];
  onPick: (choice: DoingChoice) => void;
  onClear: () => void;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' };

export function DoingPicker({ caption, current, recents, tasks, library, onPick, onClear }: DoingPickerProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  // Typing filters the lists; done tasks show the newest 4 (search finds older).
  const q = typed.trim().toLowerCase();
  const hit = (t: { text: string }): boolean => !q || t.text.toLowerCase().includes(q);
  const openTasks = tasks.filter((t) => !t.done && hit(t));
  // Done tasks are hidden; to work on one it is reopened first (#207).
  const [showDone, setShowDone] = useState(false);
  const doneAll = tasks.filter((t) => t.done && hit(t));
  const doneTasks = showDone || q ? doneAll.slice(0, 4) : [];
  const cat = (tag: string | null) => (tag ? library.find((t) => t.id === tag) : undefined);
  const curCat = current && !current.taskId ? cat(current.tag) : undefined;

  const pick = (c: DoingChoice) => { setOpen(false); setTyped(''); onPick(c); };
  // #207 — each task shows its tag, colour-coded; tasks keep their own colour dot.
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
  const pill = (tagId: string | null | undefined) => {
    const t = cat(tagId ?? null);
    if (!t) return null;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '1px 6px', borderRadius: 999,
        fontSize: 9, color: t.color, background: `color-mix(in srgb, ${t.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 45%, transparent)`,
      }}>
        <CategoryIcon id={t.id} color={t.color} size={9} />{t.label}
      </span>
    );
  };
  const typedHit = q !== '' && (recents.some((c) => c.label.toLowerCase() === q) || tasks.some((t) => t.text.toLowerCase() === q));
  const shownRecents = recents.filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 3);
  const shownOpen = openTasks.slice(0, 6);
  const cats = library.filter((t) => !q || t.label.toLowerCase().includes(q) || q.length > 0);
  const icon = (c: DoingChoice) => {
    if (c.taskId) return <span aria-hidden style={{ color: 'var(--ink-3)', width: 12, textAlign: 'center' }}>☑</span>;
    const t = cat(c.tag);
    return t ? <CategoryIcon id={t.id} color={t.color} size={12} /> : <span aria-hidden style={{ width: 12, textAlign: 'center', color: 'var(--ink-4)' }}>·</span>;
  };
  const row = (key: string, c: DoingChoice, testId: string, done = false) => {
    const on = !!current && current.label === c.label && current.taskId === c.taskId;
    const t = cat(c.tag);
    return (
      <button
        key={key}
        type="button"
        data-testid={testId}
        onClick={() => pick(c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '6px 8px', borderRadius: 6, border: 'none',
          background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
          color: on ? 'var(--ink)' : 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 11,
        }}
      >
        {c.taskId
          ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(c.taskId), opacity: done ? 0.5 : 1 }} />
          : t ? <CategoryIcon id={t.id} color={t.color} size={12} /> : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, border: '1px solid var(--ink-4)' }} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none', textDecorationColor: 'var(--ink-4)' }}>{c.label}</span>
        {pill(c.taskId ? taskTag[c.taskId] : c.tag)}
      </button>
    );
  };

  return (
    <>
      <div
        data-testid="pomo-now"
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 4px 0 8px', border: `1px solid ${curCat?.color ?? (current ? 'var(--acid)' : 'var(--paper-3)')}`, borderRadius: 5 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span style={mono}>{caption}</span>
        <button
          ref={anchor}
          type="button"
          data-testid="pomo-now-pick"
          title="Pick what you're doing: a recent one, a task, or type a new name"
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, height: '100%', padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: current ? 'var(--ink)' : 'var(--ink-4)',
          }}
        >
          {current && icon(current)}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ? current.label : 'pick or type what you’re doing…'}
          </span>
          {curCat && <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>{curCat.label}</span>}
          <span aria-hidden style={{ opacity: 0.6, fontSize: 8, color: 'var(--ink-3)' }}>▾</span>
        </button>
        {current && (
          <button
            type="button"
            data-testid="pomo-now-clear"
            aria-label="Clear"
            title="Clear — the next span will be asked about"
            onClick={onClear}
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, padding: '0 4px', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>

      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} minWidth={280}>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
          <input
            data-testid="pomo-now-type"
            autoFocus
            value={typed}
            placeholder="Search, or type something new…"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !typed.trim()) return;
              const only = shownOpen.length + shownRecents.length === 1 ? (shownOpen[0] ? { label: shownOpen[0].text, tag: null, taskId: shownOpen[0].id } : shownRecents[0]) : null;
              pick(only ?? { label: typed.trim(), tag: null, taskId: null });
            }}
            style={{ margin: '0 0 6px', padding: '7px 9px', background: 'var(--paper-2)', border: '1px solid var(--paper-3)', borderRadius: 6, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
          />
          {q && !typedHit && row('new', { label: typed.trim(), tag: null, taskId: null }, 'pomo-now-new')}
          {shownRecents.length > 0 && <span style={{ ...mono, padding: '6px 8px 2px' }}>Recent</span>}
          {shownRecents.map((c, i) => row(`r-${i}`, c, `pomo-now-recent-${i}`))}
          {shownOpen.length > 0 && <span style={{ ...mono, padding: '8px 8px 2px' }}>Tasks</span>}
          {shownOpen.map((t) => row(`t-${t.id}`, { label: t.text, tag: null, taskId: t.id }, `pomo-now-task-${t.id}`))}
          {openTasks.length > shownOpen.length && <span style={{ ...mono, textTransform: 'none', letterSpacing: 0, padding: '0 8px' }}>+{openTasks.length - shownOpen.length} more — keep typing</span>}
          {doneAll.length > 0 && !q && (
            <button type="button" data-testid="pomo-now-show-done" onClick={() => setShowDone((v) => !v)}
              style={{ ...mono, padding: '8px 8px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {showDone ? 'Hide done' : `Show done (${doneAll.length})`}
            </button>
          )}
          {doneTasks.map((t) => (
            <button key={`d-${t.id}`} type="button" data-testid={`pomo-now-reopen-${t.id}`}
              title={`"${t.text}" is done — reopen it to work on it`}
              onClick={() => { void toggleTaskDone(t.id).then(() => pick({ label: t.text, tag: null, taskId: t.id })); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(t.id), opacity: 0.5 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{t.text}</span>
              <span style={{ fontSize: 9, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>↺ reopen &amp; track</span>
            </button>
          ))}
          {cats.length > 0 && <span style={{ ...mono, padding: '8px 8px 4px' }}>{q ? `"${typed.trim()}" as category` : 'Or track a category'}</span>}
          {cats.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, padding: '0 4px 4px' }}>
              {cats.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`pomo-now-cat-${t.id}`}
                  title={q ? `"${typed.trim()}" as ${t.label}` : t.label}
                  onClick={() => pick({ label: q ? typed.trim() : t.label, tag: t.id, taskId: null })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)',
                    background: `color-mix(in srgb, ${t.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 40%, transparent)`,
                  }}
                >
                  <CategoryIcon id={t.id} color={t.color} size={11} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
