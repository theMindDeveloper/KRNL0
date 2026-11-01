import { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { NodeProps } from '../types';
import { pomoDeleteSegment, pomoRetagSegment } from '../PomoNode/commands';
import { DayDial } from './DayDial';
import { toneVarForTask } from '../../../utils/taskColor';
import type { PomoState } from '../PomoNode/types';
import { saveBoard } from '../../../store/eventLog';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { MotherFrame, MotherFrameStationContext, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import { selectPomoReality, pomoIsLive, type RealitySegment } from '../../../store/pomoReality';
import type { TaskState, TaskKind } from '../TaskNode/types';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';

// Kept for backward-compat — timelineSelector.colorTokens.test.ts imports this.
// The new analog design no longer renders break arcs, but the tokens must still
// exist in tokens.css (Decision 24.2 contract test).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

// Shared palette across Clock, Calendar, Todo. See src/renderer/utils/taskColor.ts.
import { colorForTask as colorFor, TASK_TONE_VAR as TONE_VAR } from '../../../utils/taskColor';

function fmtTime(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const ampm = hr >= 12 && hr < 24 ? 'pm' : 'am';
  const hr12 = ((hr + 11) % 12) + 1;
  return `${hr12}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Format hour-float duration as "1h30" / "45m". */
function fmtDur(h: number): string {
  const total = Math.round(h * 60);
  if (total >= 60) {
    const hr = Math.floor(total / 60);
    const mn = total % 60;
    return mn ? `${hr}h${mn}` : `${hr}h`;
  }
  return `${total}m`;
}

/** Parse a "YYYY-MM-DDTHH:MM" local-ISO into hour-float (0–24, ignores date). */
function isoToHourFloat(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const hh = Number.parseInt(m[4]!, 10);
  const mm = Number.parseInt(m[5]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh + mm / 60;
}

/**
 * Return hours elapsed since midnight of referenceDate (YYYY-MM-DD).
 * Cross-midnight tasks get negative startH (started yesterday) or endH > 24 (ends tomorrow).
 */
function isoHoursFromDayStart(iso: string, referenceDate: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const isoDate = m[1]!;
  const hh = Number.parseInt(m[2]!, 10);
  const mm = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const dayOffsetMs = new Date(isoDate).getTime() - new Date(referenceDate).getTime();
  const dayOffset = Math.round(dayOffsetMs / 86400000);
  return dayOffset * 24 + hh + mm / 60;
}


// ── Flattened task type for display ───────────────────────────────────────────
// Entries can come from two sources: scheduled tasks (from the schedule
// selector) and habits dropped on the calendar (from habit mothers). Both
// render as arcs in the clock; habits behave like events (no breakdown).
interface TaskEntry {
  id: string;
  start: number;   // hour-float, e.g. 9.5 = 9:30 AM
  end: number;
  name: string;
  /** Resolved CSS color (a `var(--token)` string). Tasks use their tone,
   *  habits use their habit color. Single source of truth — render code
   *  reads `colorVar` directly and never re-maps from a tone token. */
  colorVar: string;
  plannedMin: number;
  /** Decision 28: null for event tasks AND habits, non-null for focus tasks. */
  breakdown: PomoBreakdown | null;
  /** Parallel group id; null if this task is sequential or a habit. */
  parallelGroupId: string | null;
  /** 0-based branch index within the parallel group; null if sequential. */
  parallelBranchIndex: number | null;
  /** 'task' or 'habit' — for future styling differentiation. */
  source: 'task' | 'habit';
}

/** Check if a habit schedule fires on a given ISO day-of-week. */
function habitOnDow(schedule: HabitSchedule, isoDow: IsoDow): boolean {
  switch (schedule.kind) {
    case 'daily': return true;
    case 'weekly': return schedule.days.includes(isoDow);
    case 'weekdays': return isoDow >= 1 && isoDow <= 5;
  }
}

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<ClockState, ClockConfig>) {
  // `linkedTodoId` is preserved on state for backward-compat with persisted
  // boards (and any in-flight FSM logic) but is no longer consulted at render
  // time. The clock now shows ALL scheduled tasks + ALL scheduled habits for
  // the selected day — there's effectively one user todo list per board, and
  // the manual link picker was redundant.
  //
  // ADR 0004 §3 — `selectedDate` (YYYY-MM-DD, local) drives task/habit
  // filtering. Defaults to today; the day-selector UI below lets the user
  // page through other days without touching the wall-clock hands.
  const { viewWindow, selectedDate } = node.state;

  // PERF (Wave C+): the previous 1-second setInterval re-rendered this
  // entire SVG (60 ticks + 12 numerals + arcs + 3 hands + meridiem + task
  // list) every second via React reconciliation — a once-per-second frame
  // hitch that contributed to the canvas stutter. Replaced with:
  //   1. A 30-second state tick that drives hour/minute hands, meridiem,
  //      active-task highlight, and the "now notch" position. Minute
  //      precision is unaffected (still updates twice per minute).
  //   2. A pure CSS rotation animation on the second hand (60s linear
  //      infinite) with `animation-delay: -${initialSeconds}s` so the
  //      starting position is correct without any per-frame React work.
  //      The hand sweeps continuously, GPU-composited, zero JS cost.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Issue #166 — while a pomo session is live, the tracked arc must GROW in
  // real time. The 30-second hand tick is too coarse; add a 1-second cursor
  // that only runs when there is an in-flight segment (zero idle cost).
  const board0 = useBoardStore((s) => s.board);
  const isLive = pomoIsLive(board0);
  const [liveMs, setLiveMs] = useState(() => Date.now());

  // #6/#12 — right-click a tracked-reality arc → info popup with delete.
  const [realityPopup, setRealityPopup] = useState<{ seg: RealitySegment; x: number; y: number } | null>(null);
  const deleteClockSegment = (segId: string) => {
    const st = useBoardStore.getState();
    const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
    if (!pomo) return;
    st.updateNode(pomo.id, { state: pomoDeleteSegment(pomo.state as PomoState, { id: segId }) });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  };
  // Plan vs reality — change which task a recorded span counts toward.
  const retagClockSegment = (segId: string, taskId: string | null) => {
    const st = useBoardStore.getState();
    const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
    if (!pomo) return;
    const task = taskId ? st.board?.nodes.find((n) => n.id === taskId) : undefined;
    st.updateNode(pomo.id, {
      state: pomoRetagSegment(pomo.state as PomoState, {
        id: segId,
        taskId,
        ...(task ? { label: (task.state as { text: string }).text } : {}),
      }),
    });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  };
  const fmtClockHM = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  useEffect(() => {
    if (!isLive) return;
    setLiveMs(Date.now());
    const id = setInterval(() => setLiveMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Initial seconds offset for the CSS-driven second-hand sweep. Captured
  // once at mount; the hand continues sweeping via CSS regardless of React.
  const initialSecOffsetRef = useRef<number>(new Date().getSeconds());

  const hours = now.getHours();
  const mins  = now.getMinutes();
  // nowFloat uses minute granularity — enough for the now needle / NOW text.
  const nowFloat = hours + mins / 60;

  // Board + selectors
  const board = useBoardStore((s) => s.board);

  const placementsMap = useMemo(() => {
    if (!board) return null;
    return selectSchedule(board).placements;
  }, [board]);

  // Task info — includes text now.
  const taskInfo = useMemo(() => {
    const m = new Map<string, { done: boolean; plannedMin: number; parentTodoId: string; text: string; kind: TaskKind }>();
    if (!board) return m;
    for (const n of board.nodes) {
      if (n.kind !== 'todo.task') continue;
      const ts = n.state as TaskState;
      m.set(n.id, {
        done: ts.done,
        plannedMin: ts.plannedMin ?? ts.durationMin,
        parentTodoId: ts.parentTodoId,
        text: ts.text,
        kind: ts.kind ?? 'focus',
      });
    }
    return m;
  }, [board?.nodes]);

  // Scheduled habits — same source the WeekView consumes (ADR 0002 §6).
  // A habit is "scheduled" once the user drops it on the calendar; the drop
  // writes `schedule: { kind, timeOfDay, durationMin }` onto the habit record.
  // The clock visualizes these the same way it visualizes event tasks:
  // single arc, no break overlays, habit color.
  const scheduledHabits = useMemo(() => {
    const out: Array<{ id: string; name: string; color: string; schedule: HabitSchedule }> = [];
    if (!board) return out;
    for (const n of board.nodes) {
      if (n.kind !== 'habit') continue;
      const hs = n.state as { habits?: Habit[] } | null;
      if (!hs?.habits) continue;
      for (const h of hs.habits) {
        if (h.archived || !h.schedule) continue;
        out.push({ id: h.id, name: h.name, color: h.color ?? 'acid', schedule: h.schedule });
      }
    }
    return out;
  }, [board?.nodes]);

  // Today (real wall-clock day) — used to decide whether `now`-derived UI
  // (now-pointer, active task, now-playing strip) is meaningful for the
  // currently selected day.
  const today = todayLocalYMD();
  const isToday = selectedDate === today;

  // Parse the selected date once. Used both for the ISO DoW (habit matching)
  // and for the day-selector header label.
  const selectedDateObj = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate);
    if (!m) return new Date();
    return new Date(
      Number.parseInt(m[1]!, 10),
      Number.parseInt(m[2]!, 10) - 1,
      Number.parseInt(m[3]!, 10),
    );
  }, [selectedDate]);

  // Selected day's ISO day-of-week (1=Mon..7=Sun) — habits fire based on the
  // selected day, not "today", so the user sees a habit on Sunday when
  // viewing a Sunday in the future.
  const selectedIsoDow: IsoDow = (() => {
    const jsDay = selectedDateObj.getDay(); // 0=Sun..6=Sat
    return (jsDay === 0 ? 7 : jsDay) as IsoDow;
  })();

  // Flatten placements + scheduled habits → TaskEntry[].
  // Filter by selected day and 12-hour viewWindow.
  const tasks: TaskEntry[] = useMemo(() => {
    if (!placementsMap) return [];
    const winLo = viewWindow === 1 ? 12 : 0;
    const winHi = viewWindow === 1 ? 24 : 12;
    const out: TaskEntry[] = [];

    // 1) Scheduled tasks from the selector.
    // Use day-relative hours so cross-midnight tasks (startH<0 or endH>24) are handled correctly.
    for (const p of placementsMap.values()) {
      const info = taskInfo.get(p.taskId);
      if (!info || info.kind !== 'event') continue;
      const startH = isoHoursFromDayStart(p.startISO, selectedDate);
      if (startH === null) continue;
      const endHRaw = isoHoursFromDayStart(p.endISO, selectedDate);
      const endH = endHRaw !== null ? endHRaw : startH + info.plannedMin / 60;
      if (endH <= startH) continue;
      // Skip if the task doesn't overlap this day at all (0–24).
      if (endH <= 0 || startH >= 24) continue;
      if (endH <= winLo || startH >= winHi) continue;
      out.push({
        id: p.taskId,
        start: Math.max(startH, winLo),
        end: Math.min(endH, winHi),
        name: info.text,
        colorVar: TONE_VAR[colorFor(p.taskId)],
        plannedMin: info.plannedMin,
        breakdown: p.breakdown,
        parallelGroupId: p.parallelGroupId,
        parallelBranchIndex: p.parallelBranchIndex,
        source: 'task',
      });
    }

    // 2) Scheduled habits that fire on the selected day.
    for (const h of scheduledHabits) {
      if (!habitOnDow(h.schedule, selectedIsoDow)) continue;
      const [hhStr, mmStr] = h.schedule.timeOfDay.split(':');
      const hh = Number.parseInt(hhStr ?? '0', 10);
      const mm = Number.parseInt(mmStr ?? '0', 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      const durMin = h.schedule.durationMin && h.schedule.durationMin > 0 ? h.schedule.durationMin : 30;
      const startH = hh + mm / 60;
      const endH = startH + durMin / 60;
      if (endH <= winLo || startH >= winHi) continue;
      out.push({
        id: `habit-${h.id}`,
        start: Math.max(startH, winLo),
        end: Math.min(endH, winHi),
        name: h.name,
        colorVar: `var(--${h.color})`,
        plannedMin: durMin,
        breakdown: null, // habits = single block (event-like)
        parallelGroupId: null,
        parallelBranchIndex: null,
        source: 'habit',
      });
    }

    // Sort by start time
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [placementsMap, taskInfo, viewWindow, scheduledHabits, selectedIsoDow, selectedDate]);

  // Issue #166 — tracked REALITY segments for the selected day, clipped to the
  // 12-hour window. These are the filled "what actually happened" arcs (work +
  // break), distinct from the hollow scheduled-event plan arcs above.
  const realitySegments = useMemo(() => {
    const segs = selectPomoReality(board0, liveMs);
    if (segs.length === 0) return [] as Array<RealitySegment & { startH: number; endH: number }>;
    const dayStartMs = new Date(selectedDate + 'T00:00:00').getTime();
    const winLo = viewWindow === 1 ? 12 : 0;
    const winHi = viewWindow === 1 ? 24 : 12;
    const out: Array<RealitySegment & { startH: number; endH: number }> = [];
    for (const seg of segs) {
      const startH = (seg.startMs - dayStartMs) / 3_600_000;
      const endH = (seg.endMs - dayStartMs) / 3_600_000;
      if (!(endH > startH)) continue;
      if (endH <= 0 || startH >= 24) continue;
      if (endH <= winLo || startH >= winHi) continue;
      out.push({ ...seg, startH: Math.max(startH, winLo), endH: Math.min(endH, winHi) });
    }
    return out;
  }, [board0, liveMs, selectedDate, viewWindow]);

  // Minutes of pomo work recorded on the selected day (both halves).
  const trackedTodayMin = useMemo(() => {
    const dayStart = new Date(selectedDate + 'T00:00:00').getTime();
    const dayEnd = dayStart + 86_400_000;
    let ms = 0;
    for (const seg of selectPomoReality(board0, liveMs)) {
      if (seg.kind !== 'work') continue;
      ms += Math.max(0, Math.min(seg.endMs, dayEnd) - Math.max(seg.startMs, dayStart));
    }
    return ms / 60_000;
  }, [board0, liveMs, selectedDate]);

  // Active-task / now-pointer concepts only apply when the user is viewing
  // today. On any other day, `now` has no meaning relative to the day being
  // shown — silently lighting up a task as "active" would be a lie.
  // "Now" is only on this dial when the shown 12-hour half contains it —
  // in the AM half at 17:14 the pointer used to sit at 5 o'clock (05:14).
  const nowInWindow = isToday && (viewWindow === 1 ? nowFloat >= 12 : nowFloat < 12);
  const activeIdx = nowInWindow
    ? tasks.findIndex((t) => nowFloat >= t.start && nowFloat < t.end)
    : -1;

  const activeProgress = activeIdx >= 0
    ? (nowFloat - tasks[activeIdx]!.start) / (tasks[activeIdx]!.end - tasks[activeIdx]!.start)
    : 0;
  const activeColor = activeIdx >= 0 ? tasks[activeIdx]!.colorVar : 'var(--ink-3)';

  // Station mode: the bottom-right Clock panel is much taller than the canvas-
  // mode fixed mother (540px) — scale the dial up so it fills the space
  // instead of leaving a strip of empty card around a tiny 244px square.
  const inStation = useContext(MotherFrameStationContext);

  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      position={node.position}
    >
      <div
        style={{
          padding: '10px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          height: '100%',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
            <span style={{ color: isToday ? 'var(--cyan)' : 'var(--ink-4)', fontSize: 9 }}>◉</span>
            {isToday ? 'Today · Schedule' : 'Day · Schedule'}
          </span>
          <span style={{ color: 'var(--ink-4)' }}>CLK.12H</span>
        </div>

        {/* Day selector — ADR 0004 §3.3. Lets the user page through days
            (← / →), jump to any date via native picker (covers month/year),
            and snap back to today. Disabled when already on today.
            Buttons share a single `clock-day-btn` class so hover/focus
            polish lives in tokens.css (rather than 5 inline copies). */}
        <div
          data-testid="clock-day-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '2px 0',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.04em',
            userSelect: 'none',
          }}
        >
          <button
            type="button"
            className="clock-day-btn"
            data-testid="clock-day-prev"
            onClick={() => onCommand('clock.advanceDay', { delta: -1 })}
            title="Previous day"
            aria-label="Previous day"
          >
            ‹
          </button>
          {/* Static date label.
              The native <input type="date"> picker was removed in favour of
              the canonical day-selection path: click a day in the Calendar
              node, which mirrors to every clock via calendar.selectDate
              (commandDispatch.ts). Two date pickers competing on one screen
              was the wrong UX — the calendar IS the picker. */}
          <span
            className="clock-day-chip"
            data-state={isToday ? 'today' : 'other'}
            data-testid="clock-day-label"
            title="Click a day on the calendar to change"
          >
            {selectedDateObj.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <button
            type="button"
            className="clock-day-btn clock-day-today"
            data-testid="clock-day-today"
            data-state={isToday ? 'today' : 'other'}
            onClick={() => onCommand('clock.goToday', {})}
            disabled={isToday}
            title="Jump back to today"
          >
            Today
          </button>
          {/* #9 — snap to NOW: today + the 12-hour half that contains this hour. */}
          <button
            type="button"
            className="clock-day-btn"
            data-testid="clock-day-now"
            onClick={() => onCommand('clock.goNow', {})}
            title="Jump to now (today + current 12-hour half)"
          >
            Now
          </button>
          <button
            type="button"
            className="clock-day-btn"
            data-testid="clock-day-next"
            onClick={() => onCommand('clock.advanceDay', { delta: 1 })}
            title="Next day"
            aria-label="Next day"
          >
            ›
          </button>
        </div>

        {/* 12-hour window toggle bar — prominent, above the clock face.
            Shows which half-day the arcs reflect and lets users swap. */}
        <div
          data-testid="clock-window-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '4px 0 2px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          <button
            type="button"
            data-testid="clock-window-am"
            onClick={() => onCommand('clock.setViewWindow', { window: 0 })}
            style={{
              padding: '3px 10px',
              background: viewWindow === 0 ? 'var(--rust)' : 'transparent',
              color: viewWindow === 0 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 0 ? 'var(--rust)' : 'var(--paper-3)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              fontWeight: viewWindow === 0 ? 700 : 400,
            }}
          >
            AM · 0–12
          </button>
          <button
            type="button"
            data-testid="clock-window-swap"
            onClick={() => onCommand('clock.setViewWindow', { window: viewWindow === 0 ? 1 : 0 })}
            title="Show next 12 hours"
            style={{
              padding: '3px 8px',
              background: 'transparent',
              color: 'var(--ink-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ⇆
          </button>
          <button
            type="button"
            data-testid="clock-window-pm"
            onClick={() => onCommand('clock.setViewWindow', { window: 1 })}
            style={{
              padding: '3px 10px',
              background: viewWindow === 1 ? 'var(--rust)' : 'transparent',
              color: viewWindow === 1 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 1 ? 'var(--rust)' : 'var(--paper-3)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              fontWeight: viewWindow === 1 ? 700 : 400,
            }}
          >
            PM · 12–24
          </button>
        </div>

        {/* Clock face — container wider than SVG viewBox so outward-growing
            train tracks don't clip on the parent div edge. Station mode:
            scale up to fill the panel (capped so very-wide panels don't
            give a giant dial). Canvas mode: fixed dial diameter.
            Sizes shrunk ~10% from the prior 92%/460/244 so labels above
            and below stay visible on smaller screens. */}
        <div
          style={
            inStation
              ? { position: 'relative', width: '83%', maxWidth: 414, aspectRatio: '1 / 1', margin: '0 auto', overflow: 'visible' }
              : { position: 'relative', width: 220, height: 220, margin: '0 auto', overflow: 'visible' }
          }
        >
          <DayDial
            tasks={tasks.map((t) => ({
              id: t.id,
              start: t.start,
              end: t.end,
              name: t.name,
              colorVar: t.colorVar,
              source: t.source,
              done: taskInfo.get(t.id)?.done === true,
            }))}
            reality={realitySegments.map((seg) => ({
              id: seg.id,
              startH: seg.startH,
              endH: seg.endH,
              kind: seg.kind,
              colorVar: seg.kind === 'work' ? (seg.taskId ? toneVarForTask(seg.taskId) : 'var(--acid)') : 'var(--ink-3)',
              live: seg.live,
            }))}
            winLo={viewWindow === 1 ? 12 : 0}
            nowH={nowInWindow ? nowFloat : null}
            isToday={isToday}
            todayNowH={isToday ? nowFloat : null}
            trackedTodayMin={trackedTodayMin}
            dateLabel={selectedDateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            onRealityClick={(id, e) => {
              const seg = realitySegments.find((r) => r.id === id);
              if (seg) setRealityPopup({ seg, x: e.clientX, y: e.clientY });
            }}
          />

          {/* HH:MM digital readout moved into the SVG (above) so it
              paints behind the hour/minute/second hands. */}
        </div>

        {/* Now-playing strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 10px',
            background: 'var(--paper-2)',
            border: '1px solid var(--paper-3)',
            borderRadius: 5,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
            color: activeColor,
          }}
        >
          {/* Progress fill */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, currentColor 0%, currentColor 100%)',
              opacity: 0.1,
              pointerEvents: 'none',
              transformOrigin: '0 50%',
              transform: `scaleX(${activeProgress})`,
            }}
          />
          {activeIdx >= 0 ? (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: activeColor,
                  boxShadow: `0 0 8px ${activeColor}`,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  color: 'var(--ink)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 130,
                }}
              >
                {tasks[activeIdx]!.name}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  color: 'var(--ink-3)',
                  fontSize: 9.5,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {fmtTime(tasks[activeIdx]!.start)} → {fmtTime(tasks[activeIdx]!.end)}
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'var(--ink-3)',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  color: 'var(--ink-3)',
                  textTransform: 'none',
                  fontWeight: 400,
                  fontSize: 10.5,
                }}
              >
                {isToday
                  ? `free · ${fmtTime(nowFloat)}`
                  : `viewing ${selectedDateObj.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}`}
              </span>
            </>
          )}
        </div>

        {/* Task list */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {tasks.map((t, i) => {
            const ended = isToday && nowFloat >= t.end;
            const on    = i === activeIdx;
            // Strike through only what is actually done; a past task that is
            // still open is just dimmed (striking it read as "finished").
            const isDone = taskInfo.get(t.id)?.done === true;
            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '4px 56px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  opacity: ended ? 0.42 : 1,
                  position: 'relative',
                }}
              >
                {/* Color bar */}
                <span
                  style={{
                    width: 4,
                    height: 16,
                    borderRadius: 1,
                    background: t.colorVar,
                    display: 'inline-block',
                    alignSelf: 'center',
                  }}
                />
                {/* Start time */}
                <span
                  style={{
                    color: on ? 'var(--rust)' : 'var(--ink-3)',
                    fontSize: 9.5,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtTime(t.start)}
                </span>
                {/* Name */}
                <span
                  style={{
                    color: 'var(--ink)',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: on ? 600 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textDecoration: isDone ? 'line-through' : 'none',
                    textDecorationColor: 'var(--ink-4)',
                  }}
                >
                  {t.name}
                </span>
                {/* Duration */}
                <span
                  style={{
                    color: 'var(--ink-4)',
                    fontSize: 9.5,
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmtDur(t.end - t.start)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* #6/#12 — tracked-reality info + delete popup (right-click an arc). */}
      {realityPopup && createPortal(
        <>
          <div onClick={() => setRealityPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1998 }} />
          <div
            data-testid="clock-reality-popup"
            style={{
              position: 'fixed',
              left: Math.min(realityPopup.x + 4, window.innerWidth - 250),
              top: realityPopup.y + 6,
              zIndex: 1999,
              background: 'var(--paper)',
              border: '1px solid var(--paper-3)',
              borderRadius: 8,
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink)',
              minWidth: 210,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, background: realityPopup.seg.kind === 'work' ? 'var(--rust)' : 'var(--ink-3)' }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{realityPopup.seg.kind === 'work' ? 'Focus session' : 'Break'}</span>
              {realityPopup.seg.live && <span style={{ fontSize: 8, color: 'var(--acid)' }}>◆ LIVE</span>}
            </div>
            <div style={{ color: 'var(--ink-3)', fontSize: 10, marginBottom: 10, letterSpacing: '0.04em' }}>
              {fmtClockHM(realityPopup.seg.startMs)} {realityPopup.seg.live ? '→ now' : `– ${fmtClockHM(realityPopup.seg.endMs)}`}
              {' · '}{Math.max(1, Math.round((realityPopup.seg.endMs - realityPopup.seg.startMs) / 60_000))} min
            </div>
            {realityPopup.seg.kind === 'work' && !realityPopup.seg.live && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Counts toward
                <select
                  data-testid="clock-reality-retag"
                  value={realityPopup.seg.taskId ?? ''}
                  onChange={(e) => {
                    const taskId = e.target.value === '' ? null : e.target.value;
                    retagClockSegment(realityPopup.seg.id, taskId);
                    setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, taskId } });
                  }}
                  style={{ flex: 1, minWidth: 0, background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--paper-3)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 4px', textTransform: 'none' }}
                >
                  <option value="">untagged</option>
                  {(board0?.nodes ?? [])
                    .filter((n) => n.kind === 'todo.task' && (n.state as { parentTaskId: string | null }).parentTaskId === null)
                    .map((n) => (
                      <option key={n.id} value={n.id}>{(n.state as { text: string }).text}</option>
                    ))}
                </select>
              </label>
            )}
            {!realityPopup.seg.live && (
              <button
                type="button"
                data-testid="clock-reality-delete"
                onClick={() => { deleteClockSegment(realityPopup.seg.id); setRealityPopup(null); }}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: '#ff8e64', background: 'transparent', border: '1px solid #ff8e64', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Delete segment
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </MotherFrame>
  );
}
