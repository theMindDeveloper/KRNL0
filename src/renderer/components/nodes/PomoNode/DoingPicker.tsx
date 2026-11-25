// Observe mode — "what am I doing?" in one row. Shows the current name
// (with its category or ☑ task) and opens the list below. Picking sets what
// Start / Continue / Back to work records; ✕ clears it so the next span is
// asked about.
//
// The list (DoingList) is the ONE "what was this time?" list of the app:
// the Pomo, Log past time, "Time spent on" and Analytics' merge open it
// (time-log F21, F22). It is a field and at most five lines, one fixed size:
//   - opened: the names you used last, then your plans (five in all);
//   - typing: the best matches ("aoe" finds "Age of Empires 2"), finished in
//     grey inside the field (Tab or Enter takes it), and "New name";
//   - a small kind pill in the field files a free name under a kind of work
//     (the kind it had last time, else a guess from the name).

import { LineGlyph } from '../../ui/LineGlyph';
import { useMemo, useRef, useState } from 'react';
import type { TagDef } from '../../../../shared/tags/classify';
import { Popover } from '../../ui/Popover';
import { CategoryIcon } from './CategoryIcon';
import { useBoardStore } from '../../../store/boardStore';
import { toneVarForTask } from '../../../utils/taskColor';
import { addKind, toggleTaskDone } from '../../../store/scheduleActions';
import { spanTagFor } from '../../../store/spanTags';
import { nameKey, nameScore, usedNames, type UsedName } from './nameMatch';

export interface DoingChoice {
  label: string;
  tag: string | null;
  taskId: string | null;
}

export interface DoingPickerProps {
  /** Word shown before the name: DOING while recording, NEXT when idle. */
  caption: string;
  current: DoingChoice | null;
  /** Open tasks, then tasks done today (`done: true`, own group — #204). */
  tasks: ReadonlyArray<{ id: string; text: string; done?: boolean }>;
  library: readonly TagDef[];
  onPick: (choice: DoingChoice) => void;
  onClear: () => void;
}

export function DoingPicker({ caption, current, tasks, library, onPick, onClear }: DoingPickerProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const curCat = current && !current.taskId && current.tag ? library.find((t) => t.id === current.tag) : undefined;

  return (
    <>
      <div
        data-testid="pomo-now"
        data-caption={caption}
        style={{ alignSelf: 'center', maxWidth: '100%', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 8px 0 14px', borderRadius: 999, background: 'var(--paper-2)', fontFamily: 'var(--font-read)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={anchor}
          type="button"
          data-testid="pomo-now-pick"
          title="Pick what you're doing: a name you used, a task, or type a new name"
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: '100%', padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-read)', fontSize: 13.5, fontWeight: current ? 600 : 400, color: current ? 'var(--ink)' : 'var(--ink-3)',
          }}
        >
          {current && <ChoiceIcon choice={current} library={library} />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ? current.label : 'What are you doing?'}
          </span>
          {/* The kind of work, unless it is the name itself ("Study Study"). */}
          {curCat && current && curCat.label.toLowerCase() !== current.label.toLowerCase() && <span style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--ink-3)', flexShrink: 0 }}>{curCat.label}</span>}
          <span aria-hidden style={{ opacity: 0.6, fontSize: 11, color: 'var(--ink-3)' }}><LineGlyph name="caretDown" size={9} /></span>
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
            <LineGlyph name="close" size={10} />
          </button>
        )}
      </div>

      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} minWidth={300}>
        <DoingList current={current} tasks={tasks} library={library} onPick={(c) => { setOpen(false); onPick(c); }} onClose={() => setOpen(false)} />
      </Popover>
    </>
  );
}

/** The small mark before a choice: a task's colour dot, a kind of work's icon, or an empty ring. */
export function ChoiceIcon({ choice, library }: { choice: DoingChoice; library: readonly TagDef[] }): JSX.Element {
  if (choice.taskId) return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(choice.taskId) }} />;
  const t = choice.tag ? library.find((x) => x.id === choice.tag) : undefined;
  return t ? <CategoryIcon id={t.id} color={t.color} size={12} /> : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, border: '1.5px solid var(--ink-4)', boxSizing: 'border-box' }} />;
}

/** Names used in recorded time on this board, newest first (time-log F22). */
export function useUsedNames(): UsedName[] {
  const history = useBoardStore((s) => (s.board?.nodes.find((n) => n.kind === 'pomo')?.state as { history?: unknown[] } | undefined)?.history);
  return useMemo(() => usedNames((history ?? []) as Parameters<typeof usedNames>[0]), [history]);
}

export interface DoingListProps {
  current: DoingChoice | null;
  tasks: ReadonlyArray<{ id: string; text: string; done?: boolean }>;
  library: readonly TagDef[];
  onPick: (choice: DoingChoice) => void;
  /**
   * Time already recorded (Log past time, "Time spent on"): a done task is
   * picked as it is. While recording, a done task is reopened first (#207).
   */
  pastTime?: boolean;
  /** Adds "Leave it unnamed" (no name, no task). */
  onNone?: () => void;
  /** Names only (Analytics' merge): no plans, no kind pill. */
  namesOnly?: boolean;
  /** Names to leave out (Analytics' merge: the name being merged). */
  exclude?: readonly string[];
  /** Escape. */
  onClose?: () => void;
  /** Test ids: `${prefix}-type`, `-new`, `-task-<id>`, `-name-<n>`, `-kind`, `-kind-<id>`, `-none`. */
  testIdPrefix?: string;
  /** Its width (300 in a popover of its own; '100%' inside a card that already has one). */
  width?: number | string;
}

const ROWS = 5;
const ROW_H = 30;

type Row =
  | { key: string; kind: 'name'; choice: DoingChoice; done: boolean }
  | { key: string; kind: 'new'; label: string }
  | { key: string; kind: 'none' };

/** Test id part for a free name: "Age of Empires 2" → "age-of-empires-2". */
export const nameTestId = (label: string): string => nameKey(label).replace(/[^a-z0-9]+/g, '-');

/**
 * The list behind "What are you doing?" (time-log F22, draft C): a field and
 * at most five lines; the box fits its lines, never taller than five.
 */
export function DoingList({ current, tasks, library, onPick, pastTime = false, onNone, namesOnly = false, exclude, onClose, testIdPrefix = 'pomo-now', width = 300 }: DoingListProps): JSX.Element {
  const id = (s: string): string => `${testIdPrefix}-${s}`;
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState(0);
  // undefined = not set by hand; null = "No kind" picked.
  const [kindPick, setKindPick] = useState<string | null | undefined>(undefined);
  const [kindOpen, setKindOpen] = useState(false);
  // "+ New kind": the name being typed for a kind of work that does not exist yet (Play).
  const [newKind, setNewKind] = useState<string | null>(null);
  const used = useUsedNames();
  const q = typed.trim();
  const excludeKey = (exclude ?? []).map(nameKey).join('\n');
  const excluded = useMemo(() => new Set(excludeKey ? excludeKey.split('\n') : []), [excludeKey]);

  // Every name you can pick: names you used (newest first), then plans.
  const pool = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const out: Array<{ choice: DoingChoice; done: boolean }> = [];
    const seen = new Set<string>();
    for (const u of used) {
      if (u.taskId) {
        if (namesOnly) continue;
        const t = taskById.get(u.taskId);
        if (!t || seen.has(`t:${t.id}`)) continue; // a deleted task is not offered
        seen.add(`t:${t.id}`);
        out.push({ choice: { label: t.text, tag: null, taskId: t.id }, done: !!t.done });
      } else {
        const k = nameKey(u.label);
        if (excluded.has(k) || seen.has(`n:${k}`)) continue;
        seen.add(`n:${k}`);
        out.push({ choice: { label: u.label, tag: u.tag, taskId: null }, done: false });
      }
    }
    if (!namesOnly) {
      for (const t of tasks) {
        if (seen.has(`t:${t.id}`)) continue;
        seen.add(`t:${t.id}`);
        out.push({ choice: { label: t.text, tag: null, taskId: t.id }, done: !!t.done });
      }
    }
    return out;
  }, [used, tasks, namesOnly, excluded]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (!q) {
      // Opened: your last names, then plans (done ones only come up by typing).
      const slots = onNone && current ? ROWS - 1 : ROWS;
      pool.filter((p) => !p.done).slice(0, slots).forEach((p, i) => out.push({ key: `p-${i}`, kind: 'name', choice: p.choice, done: false }));
      if (onNone && current) out.push({ key: 'none', kind: 'none' });
      return out;
    }
    const scored = pool
      .map((p, i) => ({ p, i, s: nameScore(q, p.choice.label) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i);
    // No "New name" when the typed name already exists as a free name.
    const exact = scored.some((x) => x.s === 100 && !x.p.choice.taskId);
    const room = exact ? ROWS : ROWS - 1;
    scored.slice(0, room).forEach((x) => out.push({ key: `m-${x.i}`, kind: 'name', choice: x.p.choice, done: x.p.done }));
    if (!exact) out.push({ key: 'new', kind: 'new', label: q });
    return out;
  }, [q, pool, onNone, current]);

  // The grey completion and the kind pill follow the best match / the row in focus.
  const top = q ? rows.find((r): r is Extract<Row, { kind: 'name' }> => r.kind === 'name') : undefined;
  const ghost = top && nameKey(top.choice.label) !== nameKey(q) ? top.choice.label : '';
  const target = rows[active] ?? rows[0];
  const targetIsTask = target?.kind === 'name' && !!target.choice.taskId;
  const autoKind = target?.kind === 'name' ? target.choice.tag
    : target?.kind === 'new' ? spanTagFor(useBoardStore.getState().board ?? null, target.label, null)
    : null;
  const kindId = kindPick === undefined ? autoKind : kindPick;
  const kind = kindId ? library.find((t) => t.id === kindId) : undefined;
  const showPill = !namesOnly && !!q && !targetIsTask && target?.kind !== 'none';

  const finish = (c: DoingChoice): void => { setTyped(''); setActive(0); setKindPick(undefined); setKindOpen(false); onPick(c); };
  const choose = (r: Row | undefined): void => {
    if (!r) return;
    if (r.kind === 'none') { setTyped(''); onNone?.(); return; }
    if (r.kind === 'new') { finish({ label: r.label, tag: namesOnly ? null : kindId ?? null, taskId: null }); return; }
    const c = r.choice;
    if (c.taskId) {
      // While recording, a done task is reopened first; past time takes it as it is.
      if (r.done && !pastTime) { const taskId = c.taskId; void toggleTaskDone(taskId).then(() => finish(c)); return; }
      finish(c);
      return;
    }
    finish({ label: c.label, tag: namesOnly ? c.tag : kindPick === undefined ? c.tag : kindPick, taskId: null });
  };

  const rowStyle = (on: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: ROW_H, flexShrink: 0, padding: '0 10px', boxSizing: 'border-box',
    border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
    background: on ? 'var(--paper-3)' : 'transparent', color: 'var(--ink)', fontFamily: 'var(--font-read)', fontSize: 13,
  });
  const kindOf = (tag: string | null) => (tag ? library.find((t) => t.id === tag) : undefined);
  const field: React.CSSProperties = { fontFamily: 'var(--font-read)', fontSize: 13, lineHeight: '34px', padding: '0 10px', whiteSpace: 'pre' };

  return (
    <div
      data-testid={testIdPrefix === 'pomo-now' ? undefined : testIdPrefix}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ width, boxSizing: 'border-box', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--font-read)' }}
    >
      {/* The field: what you typed, the rest of the best match in grey, the kind pill. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, borderRadius: 8, background: 'var(--paper-2)', paddingRight: showPill ? 5 : 0 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: 34, overflow: 'hidden' }}>
          <div aria-hidden style={{ ...field, position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ visibility: 'hidden' }}>{typed}</span>
            {ghost && <span data-testid={id('ghost')} style={{ color: 'var(--ink-4)' }}>{' · '}{ghost}</span>}
          </div>
          <input
            data-testid={id('type')}
            aria-label="What was it"
            autoFocus
            value={typed}
            placeholder={namesOnly ? 'Find or type a name' : 'What was it?'}
            onChange={(e) => { setTyped(e.target.value); setActive(0); setKindOpen(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { onClose?.(); return; }
              e.stopPropagation();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); }
              else if (e.key === 'Tab' && q && top) { e.preventDefault(); choose(top); }
            }}
            style={{ ...field, position: 'relative', width: '100%', height: 34, boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)' }}
          />
        </div>
        {showPill && (
          <button
            type="button"
            data-testid={id('kind')}
            title="Kind of work this time counts under"
            onClick={() => { setKindOpen((o) => !o); setNewKind(null); }}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-read)', fontSize: 11.5,
              border: `1px solid ${kind ? `color-mix(in srgb, ${kind.color} 45%, transparent)` : 'var(--paper-3)'}`,
              background: kind ? `color-mix(in srgb, ${kind.color} 14%, transparent)` : 'transparent',
              color: kind ? kind.color : 'var(--ink-3)',
            }}
          >
            {kind ? kind.label : 'Kind'}
            <LineGlyph name="caretDown" size={7} />
          </button>
        )}
      </div>

      {/* At most five lines, the box as tall as what it shows: names, or the kinds while the pill is open. */}
      <div data-testid={id('rows')} style={{ maxHeight: ROWS * ROW_H + (ROWS - 1), display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
        {kindOpen ? (
          <div role="listbox" aria-label="Kind of work" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2, alignContent: 'start', maxHeight: ROWS * ROW_H + (ROWS - 1), overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {[...library.map((t) => ({ id: t.id as string | null, label: t.label, color: t.color })), { id: null as string | null, label: 'No kind', color: 'var(--ink-4)' }].map((t) => (
              <button
                key={t.id ?? 'none'}
                type="button"
                role="option"
                aria-selected={kindId === t.id}
                data-testid={id(`kind-${t.id ?? 'none'}`)}
                onClick={() => { setKindPick(t.id); setKindOpen(false); }}
                style={{ ...rowStyle(kindId === t.id), height: 28, padding: '0 8px', gap: 6, fontSize: 12.5 }}
              >
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: t.id ? t.color : 'transparent', border: t.id ? 'none' : '1.5px solid var(--ink-4)', boxSizing: 'border-box' }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              </button>
            ))}
            {/* A kind that does not exist yet (Play): typed here, made at once, filed under it. */}
            {newKind === null ? (
              <button type="button" data-testid={id('kind-new')} onClick={() => setNewKind('')}
                style={{ ...rowStyle(false), height: 28, padding: '0 8px', gap: 6, fontSize: 12.5, color: 'var(--ink-3)' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                <span style={{ whiteSpace: 'nowrap' }}>New kind</span>
              </button>
            ) : (
              <input
                data-testid={id('kind-new-name')}
                aria-label="New kind of work"
                autoFocus
                value={newKind}
                placeholder="Name the kind (Play…)"
                onChange={(e) => setNewKind(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.stopPropagation(); setNewKind(null); return; }
                  e.stopPropagation();
                  if (e.key !== 'Enter' || !newKind.trim()) return;
                  e.preventDefault();
                  const made = addKind(newKind);
                  setNewKind(null);
                  if (made) { setKindPick(made); setKindOpen(false); }
                }}
                style={{ gridColumn: '1 / -1', height: 28, boxSizing: 'border-box', padding: '0 8px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'var(--font-read)', fontSize: 12.5, outline: 'none' }}
              />
            )}
          </div>
        ) : rows.map((r, i) => {
          const on = i === active && !!q;
          if (r.kind === 'none') {
            return (
              <button key={r.key} type="button" data-testid={id('none')} onMouseEnter={() => setActive(i)} onClick={() => choose(r)} style={{ ...rowStyle(on), color: 'var(--ink-3)' }}>
                <span aria-hidden style={{ display: 'inline-flex', width: 8, justifyContent: 'center' }}><LineGlyph name="close" size={9} /></span>
                <span>Leave it unnamed</span>
              </button>
            );
          }
          if (r.kind === 'new') {
            return (
              <button key={r.key} type="button" data-testid={id('new')} onMouseEnter={() => setActive(i)} onClick={() => choose(r)} style={{ ...rowStyle(on), color: 'var(--ink-2)' }}>
                <span aria-hidden style={{ display: 'inline-flex', width: 8, justifyContent: 'center' }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{namesOnly ? 'Rename to' : 'New name'} “{r.label}”</span>
              </button>
            );
          }
          const c = r.choice;
          const k = c.taskId ? undefined : kindOf(c.tag);
          const isCurrent = !!current && current.taskId === c.taskId && nameKey(current.label) === nameKey(c.label);
          return (
            <button
              key={r.key}
              type="button"
              data-testid={c.taskId ? id(`task-${c.taskId}`) : id(`name-${nameTestId(c.label)}`)}
              title={r.done ? (pastTime ? `"${c.label}" is done` : `"${c.label}" is done: picking it reopens it`) : c.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
              style={{ ...rowStyle(on), background: on ? 'var(--paper-3)' : isCurrent ? 'color-mix(in srgb, var(--acid) 12%, transparent)' : 'transparent' }}
            >
              {c.taskId
                ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: toneVarForTask(c.taskId), opacity: r.done ? 0.5 : 1 }} />
                : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, border: `1.5px solid ${k ? k.color : 'var(--ink-4)'}`, boxSizing: 'border-box' }} />}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: r.done ? 'line-through' : 'none', textDecorationColor: 'var(--ink-4)' }}>{c.label}</span>
              {k && <span style={{ flexShrink: 0, fontSize: 11.5, color: k.color }}>{k.label}</span>}
              {c.taskId && <span style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--ink-4)' }}>plan</span>}
              {on && <span aria-hidden style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>{i === 0 ? 'tab' : '↵'}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
