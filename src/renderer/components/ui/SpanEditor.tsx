// #207 / time-log F7, F7b — correct recorded time where it is shown.
//
//   SpanTimeEditor  The start → end row of a recorded-session popup (Calendar,
//                   Clock). Click a time to change it; a running session's
//                   "now" becomes "Stop at". Same rules as the CLI
//                   (`krnl pomo segment`, `krnl pomo stop --at`).
//   LogTimeHost     One app-wide popover for adding time you didn't record
//                   ("Log time here…" on the Calendar / Clock, "+ Log past
//                   time" on the Pomo). Open it with openLogTime().
//
// Live validation: Save stays disabled and the reason is shown in plain words
// ("The end must be after the start", "Overlaps "emails" 10:00–11:00").

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/boardStore';
import type { PomoState } from '../nodes/PomoNode/types';
import { spanProblem, timesFromFields, hmOf, ymdOf, freeParts } from '../nodes/PomoNode/spanEdit';
import { spanTaskTargets } from '../nodes/PomoNode/taskTargets';
import { addPastSegment, editSegmentTimes, stopSessionAt } from '../../store/scheduleActions';
import { TimeField, parseTime } from './TimeField';
import { AppSelect } from './AppSelect';
import { Z } from './layers';
import { DoingList, ChoiceIcon, type DoingChoice } from '../nodes/PomoNode/DoingPicker';
import { LogTimeBar, LogTimeDayStepper } from './LogTimeDial';
import { SPACE, popupColumn } from './spacing';
import { toneVarForTask } from '../../utils/taskColor';
import { boardTagLibrary } from '../../store/spanTags';
import { CategoryIcon } from '../nodes/PomoNode/CategoryIcon';
import { Popover } from './Popover';
import { setSegmentWhat } from '../../store/scheduleActions';
import { LineGlyph } from './LineGlyph';
import { CARD_W, CardClose, CardGroup, cardBox, cardCtls, cardFoot, cardHead, cardLabel, cardNote, cardPrimary, cardRow, cardTime, cardTitle } from './addCard';

const chip = (active: boolean, accent = false): CSSProperties => ({
  fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: '3px 8px', borderRadius: 4,
  border: active ? '1px dashed var(--ink-3)' : '1px solid transparent',
  background: accent ? 'var(--rust)' : 'var(--paper-2)',
  color: accent ? 'var(--ink-on-bright)' : 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
});
const btn = (primary: boolean, disabled = false): CSSProperties => ({
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '5px 10px', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--paper-3)'}`,
  background: primary ? 'var(--ink)' : 'transparent', color: primary ? 'var(--paper)' : 'var(--ink-2)',
});
const toMinutes = (hm: string): number => { const [h, m] = hm.split(':').map(Number) as [number, number]; return h * 60 + m; };
const durLabel = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`;
};

function usePomoState(): PomoState | null {
  return useBoardStore((s) => (s.board?.nodes.find((n) => n.kind === 'pomo')?.state as PomoState | undefined) ?? null);
}

export interface EditableSpan {
  id: string;
  startMs: number;
  endMs: number;
  live: boolean;
  kind: 'work' | 'break';
}

/**
 * The start → end row of a recorded-session popup. Double-click a time to edit
 * it in place (Enter / click away saves, Esc undoes) — no extra panel. On a
 * running session the end reads "now"; editing it stops the session there.
 */
export function SpanTimeEditor({ seg, onSaved, testIdPrefix = 'span', autoEdit, onCancel }: {
  seg: EditableSpan;
  /** Open straight into editing this time (the Pomo's "stopped earlier?"). */
  autoEdit?: 'end';
  /** Esc / unchanged — the host may close (the Pomo link collapses). */
  onCancel?: () => void;
  /** Called with the new times after a successful save (or the stop moment). */
  onSaved?: (startMs: number, endMs: number) => void;
  testIdPrefix?: string;
}): JSX.Element {
  const pomo = usePomoState();
  const [editing, setEditing] = useState<'start' | 'end' | null>(autoEdit ?? null);
  const [draft, setDraft] = useState(() => (autoEdit ? hmOf(seg.live ? Date.now() : seg.endMs) : ''));
  // Esc unmounts the field; its blur must not save what was typed.
  const skipBlur = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!autoEdit) { setEditing(null); setError(null); } }, [seg.id, seg.startMs, seg.endMs, seg.live, autoEdit]);

  const begin = (which: 'start' | 'end'): void => {
    if (which === 'start' && seg.live) return;
    setDraft(which === 'start' ? hmOf(seg.startMs) : seg.live ? hmOf(Date.now()) : hmOf(seg.endMs));
    setError(null);
    skipBlur.current = false;
    setEditing(which);
  };
  const cancel = (): void => { skipBlur.current = true; setEditing(null); setError(null); onCancel?.(); };
  const commit = (): void => {
    if (!editing) return;
    const hmv = parseTime(draft);
    if (!hmv) { setError('Type a time like 18:30'); return; }
    const day = ymdOf(seg.startMs);
    const startHM = editing === 'start' ? hmv : hmOf(seg.startMs);
    const endHM = editing === 'end' ? hmv : hmOf(seg.endMs);
    const times = timesFromFields(day, startHM, endHM);
    if (!times) { setError('Type a time like 18:30'); return; }
    // A session that ended on its own day doesn't become a next-morning one
    // because of a typo (09:00 → 08:30 was saved as 23.5 hours).
    if (!seg.live && ymdOf(seg.endMs - 1) === day && ymdOf(times.endMs - 1) !== day) { setError('The end must be after the start'); return; }
    // Unchanged → just close.
    if (!seg.live && times.startMs === seg.startMs && Math.abs(times.endMs - seg.endMs) < 60_000) { cancel(); return; }
    let err: string | null;
    if (seg.live) {
      // The typed time is on the session's own day; only a session that really
      // ran past midnight puts an earlier time on the next day.
      const [yy, mo, dd] = ymdOf(seg.startMs).split('-').map(Number) as [number, number, number];
      let endMs = new Date(yy, mo - 1, dd, Math.floor(toMinutes(hmv) / 60), toMinutes(hmv) % 60).getTime();
      if (endMs <= seg.startMs && ymdOf(Date.now()) !== ymdOf(seg.startMs)) endMs = new Date(yy, mo - 1, dd + 1, Math.floor(toMinutes(hmv) / 60), toMinutes(hmv) % 60).getTime();
      err = endMs <= seg.startMs ? 'That is before the session started'
        : endMs > Date.now() ? 'That time is in the future'
        : stopSessionAt(endMs);
      if (!err) { skipBlur.current = true; setEditing(null); setError(null); onSaved?.(seg.startMs, endMs); return; }
    } else {
      err = pomo ? spanProblem(pomo, times, Date.now(), { exceptId: seg.id, kind: seg.kind }) : null;
      if (!err) err = editSegmentTimes(seg.id, times.startMs, times.endMs);
    }
    if (err) { setError(err); return; }
    skipBlur.current = true;
    setEditing(null);
    setError(null);
    onSaved?.(times.startMs, times.endMs);
  };

  const field = (which: 'start' | 'end', accent: boolean): JSX.Element => (
    <input
      autoFocus
      data-testid={`${testIdPrefix}-${which}-field`}
      aria-label={which === 'start' ? 'Start time' : seg.live ? 'Stopped at' : 'End time'}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); setError(null); }}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      onBlur={() => { if (!skipBlur.current && error === null) commit(); }}
      style={{
        ...chip(false, accent), width: 62, textAlign: 'center', outline: 'none', cursor: 'text',
        border: `1px solid ${error ? 'var(--rust)' : 'var(--ink-3)'}`,
      }}
    />
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.inline }}>
        {editing === 'start' ? field('start', true) : (
          <button type="button" data-testid={`${testIdPrefix}-start`}
            title={seg.live ? 'Started at' : 'Double-click to change the start'}
            onDoubleClick={() => begin('start')}
            style={{ ...chip(false, true), cursor: seg.live ? 'default' : 'text' }}>
            {hmOf(seg.startMs)}
          </button>
        )}
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'var(--paper-3)' }} />
        {editing === 'end' ? field('end', false) : (
          <button type="button" data-testid={`${testIdPrefix}-end`}
            title={seg.live ? 'Stopped earlier? Double-click to stop it at the right time' : 'Double-click to change the end'}
            onDoubleClick={() => begin('end')}
            style={{ ...chip(false), cursor: 'text', color: seg.live ? 'var(--acid-ink, var(--acid))' : 'var(--ink)' }}>
            {seg.live ? 'now' : hmOf(seg.endMs)}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" data-testid={`${testIdPrefix}-problem`} style={{ fontSize: 11, color: 'var(--rust)', marginTop: 4 }}>{error}</div>
      )}
      {editing && !error && (
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
          {seg.live && editing === 'end' ? 'Enter stops the session at this time · Esc cancels' : 'Enter saves · Esc cancels'}
        </div>
      )}
    </div>
  );
}

// ── "What was it" button (Log time, Time spent on, Change…) ───────────────

/** The board's tasks and kinds of work, for the "what was this time" list. */
function useWhatOptions(): { tasks: ReturnType<typeof spanTaskTargets>; library: ReturnType<typeof boardTagLibrary> } {
  const nodes = useBoardStore((s) => s.board?.nodes);
  const tasks = useMemo(() => spanTaskTargets(nodes), [nodes]);
  // Select the todo node (stable reference) and derive the library in a memo:
  // a selector returning a fresh array would re-render forever.
  const todoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'todo' && n.isMother));
  const library = useMemo(() => boardTagLibrary(todoNode ? { nodes: [todoNode] } : null), [todoNode]);
  return { tasks, library };
}

/**
 * A select-like button showing what a stretch of time was (a task, a free
 * name with its kind of work such as "Age of Empires 2", or nothing) and
 * opening the same list as "What are you doing?" (time-log F21).
 */
export function WhatPickButton({ value, onChange, testId, emptyLabel = 'Nothing yet: pick or type', deletedName }: {
  value: DoingChoice | null;
  /** null = left unnamed. */
  onChange: (choice: DoingChoice | null) => void;
  testId: string;
  emptyLabel?: string;
  /** Name to show when `value` is a task that no longer exists. */
  deletedName?: string | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const { tasks, library } = useWhatOptions();
  const task = value?.taskId ? tasks.find((t) => t.id === value.taskId) : undefined;
  const kind = value && !value.taskId && value.tag ? library.find((t) => t.id === value.tag) : undefined;
  const label = !value
    ? emptyLabel
    : value.taskId
      ? (task ? `${task.done ? '✓ ' : ''}${task.text}` : `${deletedName ?? (value.label || 'task')} (deleted)`)
      : value.label;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: SPACE.caption, cursor: 'pointer', textAlign: 'left',
          height: 30, padding: '0 10px', borderRadius: 8, border: 'none', background: 'var(--paper-3)', boxSizing: 'border-box',
          color: value ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--font-read)', fontSize: 13, textTransform: 'none', letterSpacing: 0,
        }}
      >
        {value?.taskId && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(value.taskId) }} />}
        {value && !value.taskId && <ChoiceIcon choice={value} library={library} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {/* The kind of work beside a free name, unless it is the name itself. */}
        {kind && value && kind.label.toLowerCase() !== value.label.toLowerCase() && <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}>{kind.label}</span>}
        <span aria-hidden style={{ opacity: 0.6, fontSize: 11 }}><LineGlyph name="caretDown" size={9} /></span>
      </button>
      <Popover anchor={anchorRef.current} open={open} onClose={() => setOpen(false)} minWidth={300}>
        <DoingList
          testIdPrefix={`${testId}-picker`}
          current={value}
          tasks={tasks}
          library={library}
          pastTime
          onPick={(c) => { onChange(c); setOpen(false); }}
          onNone={() => { onChange(null); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </>
  );
}

/** A recorded span's "what" as a choice (null when unnamed). */
export function spanChoice(seg: { taskId: string | null | undefined; label?: string | null; tag?: string | null }, taskName?: string | null): DoingChoice | null {
  if (seg.taskId) return { label: taskName ?? seg.label ?? '', tag: null, taskId: seg.taskId };
  const label = (seg.label ?? '').trim();
  return label ? { label, tag: seg.tag ?? null, taskId: null } : null;
}

// ── Log time (add a session after the fact) ────────────────────────────────

export const LOG_TIME_EVENT = 'krnl:log-time';

export interface LogTimeRequest {
  /** Local day the session is on. */
  dayYMD: string;
  startHM: string;
  endHM: string;
  /** Screen position to open at. */
  x: number;
  y: number;
  /** Preselected task. */
  taskId?: string | null;
}

export function openLogTime(req: LogTimeRequest): void {
  window.dispatchEvent(new CustomEvent<LogTimeRequest>(LOG_TIME_EVENT, { detail: req }));
}

/** Default "log time" window around a clicked moment: 1h from the click, rounded to 15 min, never in the future. */
export function logTimeDefaults(clickMs: number, nowMs = Date.now()): { dayYMD: string; startHM: string; endHM: string } {
  const q = 15 * 60_000;
  let start = Math.floor(clickMs / q) * q;
  let end = start + 60 * 60_000;
  if (end > nowMs) { end = Math.floor(nowMs / 60_000) * 60_000; start = Math.min(start, end - q); }
  return { dayYMD: ymdOf(start), startHM: hmOf(start), endHM: hmOf(end) };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Mount once (App). Shows the Log-time popover when openLogTime() is called. */
export function LogTimeHost(): JSX.Element | null {
  const [req, setReq] = useState<LogTimeRequest | null>(null);
  const [startHM, setStartHM] = useState('');
  const [endHM, setEndHM] = useState('');
  const [what, setWhat] = useState<DoingChoice | null>(null);
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pomo = usePomoState();

  useEffect(() => {
    const on = (e: Event): void => {
      const d = (e as CustomEvent<LogTimeRequest>).detail;
      setReq(d); setDay(d.dayYMD); setStartHM(d.startHM); setEndHM(d.endHM); setWhat(d.taskId ? { label: '', tag: null, taskId: d.taskId } : null); setError(null);
    };
    window.addEventListener(LOG_TIME_EVENT, on);
    return () => window.removeEventListener(LOG_TIME_EVENT, on);
  }, []);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setReq(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const times = timesFromFields(day, startHM, endHM);
  const crossesMidnight = !!times && ymdOf(times.endMs) !== day;
  const raw = !times ? 'Enter times as HH:MM' : pomo ? spanProblem(pomo, times, Date.now()) : 'No Pomodoro on the board';
  // time-log F23 — over something already recorded, only the free parts are added
  // (it never refuses the whole stretch for a small recorded piece in it).
  const parts = raw && raw.startsWith('Overlaps') && times && pomo ? freeParts(pomo, times, Date.now()) : null;
  const freeMs = parts ? parts.reduce((n, p) => n + (p.endMs - p.startMs), 0) : 0;
  const problem = parts ? (parts.length ? null : 'All of that time is already recorded') : raw;
  const save = (): void => {
    if (!times || problem) return;
    const err = what?.taskId
      ? addPastSegment(times.startMs, times.endMs, what.taskId)
      : addPastSegment(times.startMs, times.endMs, null, what?.label ?? '', what?.tag ?? null);
    if (err) { setError(err); return; }
    setReq(null);
  };
  const W = CARD_W;

  return createPortal(
    <>
      <div onClick={() => setReq(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="log-time-popover"
        role="dialog"
        aria-label="Log time"
        className="kw-card"
        style={{
          ...cardBox, position: 'fixed', left: Math.max(8, Math.min(req.x + 4, window.innerWidth - W - 8)),
          top: Math.max(8, Math.min(req.y + 6, window.innerHeight - 480)), zIndex: Z.popup,
        }}
      >
        <div style={cardHead}>
          <span style={cardTitle}>Log time you didn't record</span>
          <CardClose onClick={() => setReq(null)} label="Cancel" />
        </div>
        {/* #207 — simple: day, from/to, what it was for. The strip only shows it. */}
        <CardGroup>
          <div style={{ padding: '7px 8px' }}>
            <LogTimeDayStepper dayYMD={day} onChange={(d2) => { setDay(d2); setError(null); }} />
          </div>
          <div style={cardRow}>
            <span style={cardLabel}>From</span>
            <TimeField testId="log-time-start" value={startHM} onChange={(v) => { setStartHM(v); setError(null); }} onEnter={save} onEscape={() => setReq(null)} minuteStep={5} style={cardTime} />
          </div>
          <div style={cardRow}>
            <span style={cardLabel}>To</span>
            <div style={cardCtls}>
              {crossesMidnight && <span style={cardNote}>next day</span>}
              <TimeField testId="log-time-end" value={endHM} onChange={(v) => { setEndHM(v); setError(null); }} onEnter={save} onEscape={() => setReq(null)} minuteStep={5} style={cardTime} />
            </div>
          </div>
          <div style={cardRow}>
            <span style={{ ...cardLabel, flex: '0 0 auto' }}>What</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
              {/* time-log F21: a task, a typed name, or a kind of work, the same list as "What are you doing?". */}
              <WhatPickButton testId="log-time-task" value={what} onChange={setWhat} />
            </div>
          </div>
        </CardGroup>
        <LogTimeBar dayYMD={day} startHM={startHM} endHM={endHM} />
        {(error ?? problem) && (
          <div role="alert" data-testid="log-time-problem" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--rust) 12%, transparent)', fontSize: 13, color: 'var(--ink)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{error ?? problem}</span>
          </div>
        )}
        {!problem && !error && parts && parts.length > 0 && (
          <div data-testid="log-time-around" style={{ padding: '0 4px', fontSize: 12, color: 'var(--ink-3)' }}>
            What is already recorded in that time stays; the rest is added.
          </div>
        )}
        <div style={cardFoot}>
          <button type="button" data-testid="log-time-save" disabled={!!problem} onClick={save} style={{ ...cardPrimary(!problem), width: '100%' }}>
            {times && !problem ? `Add ${durLabel(parts ? freeMs : times.endMs - times.startMs)}` : 'Add'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Change what a recorded span was (right-click "Change…") ────────────────

export const RETAG_EVENT = 'krnl:retag-span';
export interface RetagRequest { segId: string; taskId: string | null; label?: string | null; tag?: string | null; x: number; y: number }

export function openRetagPicker(req: RetagRequest): void {
  window.dispatchEvent(new CustomEvent<RetagRequest>(RETAG_EVENT, { detail: req }));
}

/** Mount once (App). The list behind "Change what it was…" (same as "What are you doing?"). */
export function RetagPickerHost(): JSX.Element | null {
  const [req, setReq] = useState<RetagRequest | null>(null);
  const { tasks, library } = useWhatOptions();
  useEffect(() => {
    const on = (e: Event): void => setReq((e as CustomEvent<RetagRequest>).detail);
    window.addEventListener(RETAG_EVENT, on);
    return () => window.removeEventListener(RETAG_EVENT, on);
  }, []);
  if (!req) return null;
  const W = 302;
  return createPortal(
    <>
      <div onClick={() => setReq(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="retag-popover"
        role="dialog"
        aria-label="What it was"
        style={{
          position: 'fixed', width: W, left: Math.max(8, Math.min(req.x + 4, window.innerWidth - W - 8)),
          top: Math.max(8, Math.min(req.y + 6, window.innerHeight - 420)), zIndex: Z.popup,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', borderRadius: 8, boxShadow: 'var(--shadow-1)',
        }}
      >
        <DoingList
          testIdPrefix="retag"
          current={spanChoice(req)}
          tasks={tasks}
          library={library}
          pastTime
          onPick={(c) => { setSegmentWhat(req.segId, c); setReq(null); }}
          onNone={() => { setSegmentWhat(req.segId, null); setReq(null); }}
          onClose={() => setReq(null)}
        />
      </div>
    </>,
    document.body,
  );
}

// ── "Time spent on" in the recorded-span popup ────────────────────────────

/**
 * What a recorded span was spent on: a task, a free name with its kind of
 * work, or nothing. Click to change it with the "What are you doing?" list
 * (time-log F21). Keeps its old component name; the caption says "Time spent on".
 */
export function CountsToward({ segId, taskId, taskName, label, onChanged, testId = 'span-counts-toward', categoryTag }: {
  segId: string;
  taskId: string | null;
  /** The span's kind of work when it was named freely (no task). */
  categoryTag?: string | null;
  /** Name shown for the current task (also for a deleted one). */
  taskName: string | null;
  /** The span's own name ("Age of Empires 2"; the task text for a task span). */
  label?: string | null;
  onChanged?: (what: { taskId: string | null; label: string; tag: string | null }) => void;
  testId?: string;
}): JSX.Element {
  const value = spanChoice({ taskId, label: label ?? null, tag: categoryTag ?? null }, taskName);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.caption }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Time spent on</span>
      <WhatPickButton
        testId={testId}
        value={value}
        deletedName={taskName}
        emptyLabel="Unnamed: pick or type"
        onChange={(c) => {
          setSegmentWhat(segId, c);
          onChanged?.(c ? { taskId: c.taskId, label: c.label, tag: c.taskId ? null : c.tag } : { taskId: null, label: '', tag: null });
        }}
      />
    </div>
  );
}
