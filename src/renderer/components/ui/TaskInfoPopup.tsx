// Task info popup — left-click a task (or a habit, id `habit-<id>`) on the
// Clock or the Calendar month view to see what it is: colour, name, category,
// planned time, time actually tracked on it, and quick actions. Mirrors the
// tracked-span popup so tasks, habits and observed time behave the same on click.

import { LineGlyph } from './LineGlyph';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';
import { selectPomoReality } from '../../store/pomoReality';
import { boardTagLibrary } from '../../store/spanTags';
import { focusNode, habitMotherCommand, scheduleAnchorOf, startFocusOnTask, toggleHabitToday, toggleTaskDone, unscheduleTask } from '../../store/scheduleActions';
import { tagDisplay } from '../../../shared/tags/classify';
import { toneVarForTask } from '../../utils/taskColor';
import type { TaskState } from '../nodes/TaskNode/types';
import type { TodoState } from '../nodes/TodoNode/types';
import { habitStreak } from '../nodes/HabitNode/commands';
import { isOneTimeEvent, todayLocal, type HabitState } from '../nodes/HabitNode/types';
import { CategoryIcon } from '../nodes/PomoNode/CategoryIcon';
import { useEasyMode } from '../../store/uiMode';
import { Z } from './layers';

export interface TaskInfoPopupProps {
  /** A task node id, or `habit-<habitId>` for a habit on the dial. */
  taskId: string;
  x: number;
  y: number;
  /** Planned span shown in the header, when the caller knows it. */
  startMs?: number;
  endMs?: number;
  onClose: () => void;
  /** Decision 59 — the Calendar's "Details": the card that changes it. */
  onDetails?: () => void;
}

const ymdOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtMin = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}`);

// window-frame.md, cards — filled buttons in sentence case, no outlined boxes.
const btn: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 34, padding: '0 8px', background: 'var(--paper-2)', border: 'none', borderRadius: 10,
  color: 'var(--ink)', fontFamily: 'var(--font-read)', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
};

export function TaskInfoPopup(props: TaskInfoPopupProps) {
  return props.taskId.startsWith('habit-') ? <HabitInfo {...props} /> : <TaskInfo {...props} />;
}

function Shell({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  // Esc closes, like the Calendar's task popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="task-info-popup"
        className="kw-card"
        style={{
          position: 'fixed',
          left: Math.max(8, Math.min(x + 4, window.innerWidth - 308)),
          top: Math.max(8, Math.min(y + 6, window.innerHeight - 170)),
          // A tall popup near the bottom scrolls instead of leaving the screen.
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
          zIndex: Z.popup,
          width: 300,
          boxSizing: 'border-box',
          background: 'var(--paper)',
          border: '1px solid var(--paper-3)',
          borderRadius: 14,
          padding: 16,
          fontFamily: 'var(--font-read)',
          fontSize: 13,
          color: 'var(--ink)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

function TaskInfo({ taskId, x, y, startMs, endMs, onClose, onDetails }: TaskInfoPopupProps) {
  // Easy mode: name, time and done only — no category, tracked time or focus.
  const easy = useEasyMode();
  const info = useBoardStore(
    useShallow((s) => {
      const board = s.board;
      const node = board?.nodes.find((n) => n.id === taskId);
      if (!board || !node || node.kind !== 'todo.task') return null;
      const ts = node.state as TaskState;
      const todo = board.nodes.find((n) => n.id === ts.parentTodoId)?.state as TodoState | undefined;
      const item = ts.todoItemId ? todo?.items.find((i) => i.id === ts.todoItemId) : undefined;
      const tag = item?.tag ?? ts.tag;
      const cat = tag ? tagDisplay(boardTagLibrary(board), tag) : null;
      let trackedMs = 0;
      for (const seg of selectPomoReality(board, Date.now())) {
        if (seg.kind === 'work' && seg.taskId === taskId) trackedMs += seg.endMs - seg.startMs;
      }
      return {
        text: ts.text,
        done: ts.done,
        plannedMin: ts.scheduledDurationMin ?? ts.plannedMin ?? ts.durationMin,
        scheduledFor: ts.scheduledFor ?? null,
        catId: cat?.id ?? null,
        catLabel: cat?.label ?? null,
        catColor: cat?.color ?? null,
        trackedMin: Math.round(trackedMs / 60_000),
      };
    }),
  );
  if (!info) return null;

  // The task whose time places this one (itself, or its chain's anchor).
  const planAnchor = scheduleAnchorOf(taskId);
  const tone = toneVarForTask(taskId);
  const start = startMs ?? (info.scheduledFor ? new Date(info.scheduledFor).getTime() : undefined);
  const end = endMs ?? (start !== undefined && info.plannedMin ? start + info.plannedMin * 60_000 : undefined);
  const when = start !== undefined
    ? `${new Date(start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(start)}${end !== undefined ? `–${hm(end)}` : ''}`
    : 'not scheduled';
  const act = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <Shell x={x} y={y} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: tone }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: info.done ? 'line-through' : 'none' }}>
          {info.text || 'Untitled task'}
        </span>
        {info.done && <span style={{ fontSize: 12.5, color: 'var(--acid-ink, var(--acid))' }} ><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LineGlyph name="check" size={10} weight={2.6} />Done</span></span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, paddingLeft: 19 }}>{when}</div>
      {!easy && <div style={{ display: 'flex', gap: '4px 16px', fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--paper-2)' }}>
        {info.catId && info.catColor && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CategoryIcon id={info.catId} color={info.catColor} size={11} />{info.catLabel}
          </span>
        )}
        <span>Planned <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--ink)' }}>{info.plannedMin ? fmtMin(info.plannedMin) : '—'}</b></span>
        <span>Recorded <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: info.trackedMin > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>{fmtMin(info.trackedMin)}</b></span>
      </div>}
      {/* Decision 60 — only what you need here: no history line ("planned … (moved 6×)"). */}
      <div style={{ display: 'flex', gap: 6 }}>
        {!info.done && !easy && <button type="button" data-testid="task-info-focus" title="Start the Timer on this plan" style={{ ...btn, background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontWeight: 600 }} onClick={act(() => { void startFocusOnTask(taskId); })}>Start</button>}
        <button type="button" data-testid="task-info-done" style={btn} onClick={act(() => { void toggleTaskDone(taskId); })}>{info.done ? 'Reopen' : 'Done'}</button>
        {onDetails
          ? <button type="button" data-testid="task-info-details" title="Change the day, time, length, reminder or deadline" style={btn} onClick={act(onDetails)}>Details</button>
          : <button type="button" data-testid="task-info-show" style={btn} onClick={act(() => focusNode(taskId))}>Show</button>}
        {/* A chain successor has no scheduledFor of its own but is planned too. */}
        {!onDetails && planAnchor && <button type="button" data-testid="task-info-unschedule" title={planAnchor === taskId ? 'Remove from the calendar (keeps the task)' : 'Remove the whole chain from the calendar (keeps the tasks)'} style={{ ...btn, color: 'var(--rust)' }} onClick={act(() => { void unscheduleTask(taskId); })}>{planAnchor === taskId ? 'Unplan' : 'Unplan chain'}</button>}
      </div>
      {onDetails && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" data-testid="task-info-show" style={btn} onClick={act(() => focusNode(taskId))}>Show in Todos</button>
          {planAnchor && <button type="button" data-testid="task-info-unschedule" title={planAnchor === taskId ? 'Remove from the calendar (keeps the task)' : 'Remove the whole chain from the calendar (keeps the tasks)'} style={{ ...btn, color: 'var(--rust)' }} onClick={act(() => { void unscheduleTask(taskId); })}>{planAnchor === taskId ? 'Unplan' : 'Unplan chain'}</button>}
        </div>
      )}
    </Shell>
  );
}

function HabitInfo({ taskId, x, y, startMs, endMs, onClose, onDetails }: TaskInfoPopupProps) {
  const habitId = taskId.slice('habit-'.length);
  const info = useBoardStore(
    useShallow((s) => {
      const node = s.board?.nodes.find((n) => n.kind === 'habit' && n.isMother);
      const h = (node?.state as HabitState | undefined)?.habits.find((x) => x.id === habitId);
      if (!h) return null;
      const today = todayLocal();
      const date = startMs !== undefined ? ymdOf(startMs) : today;
      return {
        name: h.name, color: h.color, doneToday: h.log.includes(today), streak: habitStreak(h, today).current, streakUnit: habitStreak(h, today).unit,
        routine: h.kind === 'routine', once: isOneTimeEvent(h), date, skipped: !!h.exceptions?.some((e) => e.date === date && e.skip),
      };
    }),
  );
  if (!info) return null;
  // Decision 39 — a routine is never ticked: say when, and offer to skip this one.
  if (info.routine) {
    return (
      <Shell x={x} y={y} onClose={onClose}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: `var(--${info.color})` }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{info.once ? 'Event' : 'Repeats'}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, paddingLeft: 19 }}>
          {/* Decision 62 — a one-time event: its day and time. */}
          {info.once && `${new Date(`${info.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · `}
          {startMs !== undefined && `${hm(startMs)}${endMs !== undefined ? `–${hm(endMs)}` : ''}`}
          {!info.once && ` · ${info.skipped ? 'skipped this time' : 'every week'}`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!info.once && <button type="button" data-testid="routine-info-skip" style={btn}
            onClick={() => { void habitMotherCommand(info.skipped ? 'routine.unskip' : 'routine.skip', { id: habitId, date: info.date }); onClose(); }}>
            {info.skipped ? 'Undo skip' : 'Skip this one'}
          </button>}
          {onDetails && <button type="button" data-testid="routine-info-details" title="Change its name, days, time or length" style={btn} onClick={() => { onDetails(); onClose(); }}>Details</button>}
        </div>
      </Shell>
    );
  }
  return (
    <Shell x={x} y={y} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: `var(--${info.color})` }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Habit</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, paddingLeft: 19 }}>
        {startMs !== undefined && `${hm(startMs)}${endMs !== undefined ? `–${hm(endMs)}` : ''} · `}
        streak {info.streak} {info.streakUnit ?? 'day'}{info.streak === 1 ? '' : 's'}
        {' · '}
        <span style={{ color: info.doneToday ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>{info.doneToday ? 'done today' : 'not done today'}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" data-testid="habit-info-toggle" style={btn} onClick={() => { void toggleHabitToday(habitId); onClose(); }}>
          {info.doneToday ? 'Undo today' : 'Done today'}
        </button>
      </div>
    </Shell>
  );
}
