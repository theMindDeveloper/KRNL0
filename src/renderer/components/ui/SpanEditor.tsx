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
import { spanProblem, timesFromFields, hmOf, ymdOf } from '../nodes/PomoNode/spanEdit';
import { spanTaskTargets } from '../nodes/PomoNode/taskTargets';
import { addPastSegment, editSegmentTimes, stopSessionAt } from '../../store/scheduleActions';
import { TimeField, parseTime } from './TimeField';
import { AppSelect } from './AppSelect';
import { Z } from './layers';
import { TaskTagPicker } from './TaskTagPicker';
import { LogTimeDayPicker, LogTimeBar, LogTimeQuickFill } from './LogTimeDial';
import { SPACE, popupColumn } from './spacing';
import { toneVarForTask } from '../../utils/taskColor';
import { boardTagLibrary } from '../../store/spanTags';
import { CategoryIcon } from '../nodes/PomoNode/CategoryIcon';
import { Popover } from './Popover';
import { retagSegment } from '../../store/scheduleActions';

const chip = (active: boolean, accent = false): CSSProperties => ({
  fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: '3px 8px', borderRadius: 4,
  border: active ? '1px dashed var(--ink-3)' : '1px solid transparent',
  background: accent ? 'var(--rust)' : 'var(--paper-2)',
  color: accent ? 'var(--ink-on-bright)' : 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
});
const btn = (primary: boolean, disabled = false): CSSProperties => ({
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
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
    // Unchanged → just close.
    if (!seg.live && times.startMs === seg.startMs && Math.abs(times.endMs - seg.endMs) < 60_000) { cancel(); return; }
    let err: string | null;
    if (seg.live) {
      // The typed time is on the session's own day; only a session that really
      // ran past midnight puts an earlier time on the next day.
      const [yy, mo, dd] = ymdOf(seg.startMs).split('-').map(Number) as [number, number, number];
      let endMs = new Date(yy, mo - 1, dd, Math.floor(toMinutes(hmv) / 60), toMinutes(hmv) % 60).getTime();
      if (endMs <= seg.startMs && ymdOf(Date.now()) !== ymdOf(seg.startMs)) endMs += 86_400_000;
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
        <div role="alert" data-testid={`${testIdPrefix}-problem`} style={{ fontSize: 10, color: 'var(--rust)', marginTop: 4 }}>{error}</div>
      )}
      {editing && !error && (
        <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 4 }}>
          {seg.live && editing === 'end' ? 'Enter stops the session at this time · Esc cancels' : 'Enter saves · Esc cancels'}
        </div>
      )}
    </div>
  );
}

// ── Task picker button (Log time, Counts toward) ───────────────────────────

/** A select-like button that opens the compact searchable task picker. */
export function TaskPickButton({ value, onChange, testId, emptyLabel = 'untagged', deletedName, categoryTag }: {
  value: string | null;
  /** No task, but tracked as a category (Observe "Code") — shown instead of "untagged". */
  categoryTag?: string | null;
  onChange: (taskId: string | null) => void;
  testId: string;
  emptyLabel?: string;
  /** Name to show when `value` is a task that no longer exists. */
  deletedName?: string | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const nodes = useBoardStore((s) => s.board?.nodes);
  const targets = useMemo(() => spanTaskTargets(nodes), [nodes]);
  const current = value ? targets.find((t) => t.id === value) : undefined;
  const todoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'todo' && n.isMother));
  const category = useMemo(() => {
    if (value || !categoryTag) return null;
    return boardTagLibrary(todoNode ? { nodes: [todoNode] } : null).find((t) => t.id === categoryTag) ?? null;
  }, [value, categoryTag, todoNode]);
  const label = !value
    ? (category ? `${category.label} · category` : emptyLabel)
    : current ? `${current.done ? '✓ ' : ''}${current.text}` : `${deletedName ?? 'task'} (deleted)`;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: SPACE.caption, cursor: 'pointer', textAlign: 'left',
          padding: '6px 10px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'var(--paper-2)',
          color: value ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'none', letterSpacing: 0,
        }}
      >
        {value && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(value) }} />}
        {category && <CategoryIcon id={category.id} color={category.color} size={11} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden style={{ opacity: 0.6, fontSize: 8 }}>▾</span>
      </button>
      <Popover anchor={anchorRef.current} open={open} onClose={() => setOpen(false)} minWidth={260}>
        <TaskTagPicker
          testIdPrefix={`${testId}-picker`}
          tasks={targets}
          value={value ? { kind: 'task', id: value } : null}
          onPick={(v) => { if (v.kind === 'task') { onChange(v.id); setOpen(false); } }}
          {...(value ? { onUntag: () => { onChange(null); setOpen(false); } } : {})}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </>
  );
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
  const [taskId, setTaskId] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pomo = usePomoState();

  useEffect(() => {
    const on = (e: Event): void => {
      const d = (e as CustomEvent<LogTimeRequest>).detail;
      setReq(d); setDay(d.dayYMD); setStartHM(d.startHM); setEndHM(d.endHM); setTaskId(d.taskId ?? ''); setError(null);
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
  const setRange = (a2: string, b2: string): void => { setStartHM(a2); setEndHM(b2); setError(null); };
  const problem = !times ? 'Enter times as HH:MM' : pomo ? spanProblem(pomo, times, Date.now()) : 'No Pomodoro on the board';
  const save = (): void => {
    if (!times || problem) return;
    const err = addPastSegment(times.startMs, times.endMs, taskId || null);
    if (err) { setError(err); return; }
    setReq(null);
  };
  const W = 340;

  return createPortal(
    <>
      <div onClick={() => setReq(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="log-time-popover"
        role="dialog"
        aria-label="Log time"
        style={{
          position: 'fixed', left: Math.max(8, Math.min(req.x + 4, window.innerWidth - W - 8)),
          top: Math.max(8, Math.min(req.y + 6, window.innerHeight - 470)), width: W, zIndex: Z.popup,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', borderRadius: 10, padding: SPACE.panelPad,
          fontFamily: 'var(--font-mono)', color: 'var(--ink)', boxShadow: 'var(--shadow-1)',
          ...popupColumn,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.inline }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>Log time</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 8, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>work you didn't record</span>
        </div>
        {/* #207 — day, then the time: a strip of the day you can drag on, or type. */}
        <LogTimeDayPicker dayYMD={day} onChange={(d2) => { setDay(d2); setError(null); }} />
        <LogTimeBar dayYMD={day} startHM={startHM} endHM={endHM} onChange={setRange} />
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.inline }}>
          <TimeField testId="log-time-start" value={startHM} onChange={(v) => { setStartHM(v); setError(null); }} onEnter={save} onEscape={() => setReq(null)} minuteStep={5} />
          <span style={{ color: 'var(--ink-4)' }}>→</span>
          <TimeField testId="log-time-end" value={endHM} onChange={(v) => { setEndHM(v); setError(null); }} onEnter={save} onEscape={() => setReq(null)} minuteStep={5} />
          {times && <span style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{durLabel(times.endMs - times.startMs)}{crossesMidnight ? ' · +1 day' : ''}</span>}
        </div>
        <LogTimeQuickFill dayYMD={day} startHM={startHM} onChange={setRange} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.caption }}>
          <span style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Counts toward</span>
          <TaskPickButton testId="log-time-task" value={taskId || null} onChange={(id) => setTaskId(id ?? '')} />
        </div>
        {(error ?? problem) && <div role="alert" data-testid="log-time-problem" style={{ fontSize: 10, color: 'var(--rust)' }}>{error ?? problem}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.inline }}>
          <button type="button" onClick={() => setReq(null)} style={btn(false)}>Cancel</button>
          <button type="button" data-testid="log-time-save" disabled={!!problem} onClick={save} style={btn(true, !!problem)}>
            {times && !problem ? `Add ${durLabel(times.endMs - times.startMs)}` : 'Add'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Change task (retag a recorded span) ─────────────────────────────────────

export const RETAG_EVENT = 'krnl:retag-span';
export interface RetagRequest { segId: string; taskId: string | null; x: number; y: number }

export function openRetagPicker(req: RetagRequest): void {
  window.dispatchEvent(new CustomEvent<RetagRequest>(RETAG_EVENT, { detail: req }));
}

/** Mount once (App). The searchable task picker behind "Change task…". */
export function RetagPickerHost(): JSX.Element | null {
  const [req, setReq] = useState<RetagRequest | null>(null);
  const nodes = useBoardStore((s) => s.board?.nodes);
  const targets = useMemo(() => spanTaskTargets(nodes), [nodes]);
  useEffect(() => {
    const on = (e: Event): void => setReq((e as CustomEvent<RetagRequest>).detail);
    window.addEventListener(RETAG_EVENT, on);
    return () => window.removeEventListener(RETAG_EVENT, on);
  }, []);
  if (!req) return null;
  const W = 262;
  return createPortal(
    <>
      <div onClick={() => setReq(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="retag-popover"
        role="dialog"
        aria-label="Change task"
        style={{
          position: 'fixed', left: Math.max(8, Math.min(req.x + 4, window.innerWidth - W - 8)),
          top: Math.max(8, Math.min(req.y + 6, window.innerHeight - 340)), zIndex: Z.popup,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', borderRadius: 8, boxShadow: 'var(--shadow-1)',
        }}
      >
        <TaskTagPicker
          testIdPrefix="retag"
          tasks={targets}
          value={req.taskId ? { kind: 'task', id: req.taskId } : null}
          onPick={(v) => { if (v.kind === 'task') retagSegment(req.segId, v.id); setReq(null); }}
          {...(req.taskId ? { onUntag: () => { retagSegment(req.segId, null); setReq(null); } } : {})}
          onClose={() => setReq(null)}
        />
      </div>
    </>,
    document.body,
  );
}

// ── "Counts toward" in the recorded-span popup ─────────────────────────────

/** The task a recorded span counts toward; click to change it with the compact picker. */
export function CountsToward({ segId, taskId, taskName, onChanged, testId = 'span-counts-toward', categoryTag }: {
  segId: string;
  taskId: string | null;
  /** The span's category when it was tracked as one (no task). */
  categoryTag?: string | null;
  /** Name shown for the current task (also for a deleted one). */
  taskName: string | null;
  onChanged?: (taskId: string | null) => void;
  testId?: string;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.caption }}>
      <span style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Counts toward</span>
      <TaskPickButton
        testId={testId}
        value={taskId}
        deletedName={taskName}
        categoryTag={categoryTag ?? null}
        onChange={(id) => { retagSegment(segId, id); onChanged?.(id); }}
      />
    </div>
  );
}
