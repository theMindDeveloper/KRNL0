// Task info popup — left-click a task (or a habit, id `habit-<id>`) on the
// Clock or the Calendar month view to see what it is: colour, name, category,
// planned time, time actually tracked on it, and quick actions. Mirrors the
// tracked-span popup so tasks, habits and observed time behave the same on click.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';
import { selectPomoReality } from '../../store/pomoReality';
import { boardTagLibrary } from '../../store/spanTags';
import { focusNode, scheduleAnchorOf, startFocusOnTask, toggleHabitToday, toggleTaskDone, unscheduleTask } from '../../store/scheduleActions';
import { tagDisplay } from '../../../shared/tags/classify';
import { toneVarForTask } from '../../utils/taskColor';
import type { TaskState } from '../nodes/TaskNode/types';
import type { TodoState } from '../nodes/TodoNode/types';
import { calcStreak } from '../nodes/HabitNode/commands';
import { todayLocal, type HabitState } from '../nodes/HabitNode/types';
import { CategoryIcon } from '../nodes/PomoNode/CategoryIcon';
import { useEasyMode } from '../../store/uiMode';
import { Z } from './layers';
import { TaskTimeline } from './TaskTimeline';

export interface TaskInfoPopupProps {
  /** A task node id, or `habit-<habitId>` for a habit on the dial. */
  taskId: string;
  x: number;
  y: number;
  /** Planned span shown in the header, when the caller knows it. */
  startMs?: number;
  endMs?: number;
  onClose: () => void;
}

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtMin = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}`);

const btn: React.CSSProperties = {
  flex: 1, padding: '5px 6px', background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 4,
  color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer',
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        data-testid="task-info-popup"
        style={{
          position: 'fixed',
          left: Math.min(x + 4, window.innerWidth - 270),
          top: Math.max(8, Math.min(y + 6, window.innerHeight - 170)),
          // A tall popup near the bottom scrolls instead of leaving the screen.
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
          zIndex: Z.popup,
          width: 250,
          background: 'var(--paper)',
          border: '1px solid var(--paper-3)',
          borderRadius: 8,
          padding: '12px 14px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink)',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

function TaskInfo({ taskId, x, y, startMs, endMs, onClose }: TaskInfoPopupProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: tone }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: info.done ? 'line-through' : 'none' }}>
          {info.text || 'Untitled task'}
        </span>
        {info.done && <span style={{ fontSize: 8, color: 'var(--acid-ink, var(--acid))' }}>✓ DONE</span>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 8 }}>{when}</div>
      {!easy && <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--ink-2)', marginBottom: 10, flexWrap: 'wrap' }}>
        {info.catId && info.catColor && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CategoryIcon id={info.catId} color={info.catColor} size={11} />{info.catLabel}
          </span>
        )}
        <span>plan {info.plannedMin ? fmtMin(info.plannedMin) : '—'}</span>
        <span style={{ color: info.trackedMin > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>tracked {fmtMin(info.trackedMin)}</span>
      </div>}
      {/* #207 — the task's story from the time log (per-day work, plan moves, completions). */}
      {!easy && <TaskTimeline taskId={taskId} />}
      <div style={{ display: 'flex', gap: 4 }}>
        {!info.done && !easy && <button type="button" data-testid="task-info-focus" style={btn} onClick={act(() => { void startFocusOnTask(taskId); })}>Focus</button>}
        <button type="button" data-testid="task-info-done" style={btn} onClick={act(() => { void toggleTaskDone(taskId); })}>{info.done ? 'Reopen' : 'Done'}</button>
        <button type="button" data-testid="task-info-show" style={btn} onClick={act(() => focusNode(taskId))}>Show</button>
        {/* A chain successor has no scheduledFor of its own but is planned too. */}
        {planAnchor && <button type="button" data-testid="task-info-unschedule" title={planAnchor === taskId ? 'Remove from the calendar (keeps the task)' : 'Remove the whole chain from the calendar (keeps the tasks)'} style={{ ...btn, color: 'var(--rust)', borderColor: 'var(--rust)' }} onClick={act(() => { void unscheduleTask(taskId); })}>{planAnchor === taskId ? 'Unplan' : 'Unplan chain'}</button>}
      </div>
    </Shell>
  );
}

function HabitInfo({ taskId, x, y, startMs, endMs, onClose }: TaskInfoPopupProps) {
  const habitId = taskId.slice('habit-'.length);
  const info = useBoardStore(
    useShallow((s) => {
      const node = s.board?.nodes.find((n) => n.kind === 'habit' && n.isMother);
      const h = (node?.state as HabitState | undefined)?.habits.find((x) => x.id === habitId);
      if (!h) return null;
      const today = todayLocal();
      return { name: h.name, color: h.color, doneToday: h.log.includes(today), streak: calcStreak(h.log, today, h.schedule) };
    }),
  );
  if (!info) return null;
  return (
    <Shell x={x} y={y} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, background: `var(--${info.color})` }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</span>
        <span style={{ fontSize: 8, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>HABIT</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10 }}>
        {startMs !== undefined && `${hm(startMs)}${endMs !== undefined ? `–${hm(endMs)}` : ''} · `}
        streak {info.streak} day{info.streak === 1 ? '' : 's'}
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
