import { useState, useEffect, useMemo, useRef, useContext } from 'react';
import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { MotherFrame, MotherFrameStationContext, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import { selectPomoReality, pomoIsLive, type RealitySegment } from '../../../store/pomoReality';
import type { TaskState } from '../TaskNode/types';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';

// Kept for backward-compat — timelineSelector.colorTokens.test.ts imports this.
// The new analog design no longer renders break arcs, but the tokens must still
// exist in tokens.css (Decision 24.2 contract test).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

// Shared palette across Clock, Calendar, Todo. See src/renderer/utils/taskColor.ts.
import { colorForTask as colorFor, TASK_TONE_VAR as TONE_VAR } from '../../../utils/taskColor';

// ── Geometry constants ─────────────────────────────────────────────────────────
const CX = 120;
const CY = 120;
const R_ARC = 102;
const R_FACE = 86;
const R_TICK_OUT = 84;
const R_TICK_IN = 76;
const R_TICK_IN_MAJ = 72;
const R_NUM = 60;

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Map an hour 0–24 onto its angle on a 12-hour face. 12 sits at top. */
function hourToRad(h: number): number {
  return ((h % 12) / 12) * Math.PI * 2 - Math.PI / 2;
}

function pt(h: number, r: number): { x: number; y: number } {
  const a = hourToRad(h);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

/** SVG arc path from startH to endH on the 12-h face at radius r. */
function arcPath(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, endH - startH);
  const a1 = hourToRad(startH);
  const a2 = hourToRad(startH + span);
  const x1 = CX + r * Math.cos(a1);
  const y1 = CY + r * Math.sin(a1);
  const x2 = CX + r * Math.cos(a2);
  const y2 = CY + r * Math.sin(a2);
  const large = span > 6 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Format hour-float as "9:30am". */
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

// Numerals 1–12. 12 at index 0 so hourToRad(12)=top.
const NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

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
  // No `secs` here — second-hand position comes from CSS animation.
  // nowFloat uses minute granularity which is fine for activeIdx / now notch.
  const nowFloat = hours + mins / 60;

  // Hand angles (degrees from 12, CW)
  const hourAng = ((hours % 12) + mins / 60) / 12 * 360;
  const minAng  = mins / 60 * 360;

  // Board + selectors
  const board = useBoardStore((s) => s.board);

  const placementsMap = useMemo(() => {
    if (!board) return null;
    return selectSchedule(board).placements;
  }, [board]);

  // Task info — includes text now.
  const taskInfo = useMemo(() => {
    const m = new Map<string, { done: boolean; plannedMin: number; parentTodoId: string; text: string }>();
    if (!board) return m;
    for (const n of board.nodes) {
      if (n.kind !== 'todo.task') continue;
      const ts = n.state as TaskState;
      m.set(n.id, {
        done: ts.done,
        plannedMin: ts.plannedMin ?? ts.durationMin,
        parentTodoId: ts.parentTodoId,
        text: ts.text,
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
      if (!info) continue;
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

  // Active-task / now-pointer concepts only apply when the user is viewing
  // today. On any other day, `now` has no meaning relative to the day being
  // shown — silently lighting up a task as "active" would be a lie.
  const activeIdx = isToday
    ? tasks.findIndex((t) => nowFloat >= t.start && nowFloat < t.end)
    : -1;

  // Hoisted track-geometry constants — also consumed by the now-pointer
  // so it spans exactly from the innermost ring inner-edge to the outermost
  // ring outer-edge (no spill under the clock, no overshoot past max ring).
  const TRACK_STROKE = 7;
  const TRACK_LANE_GAP = 2;
  const trackBaseR = R_TICK_OUT + 8; // center radius of lane 0
  const trackTotalLanes = (() => {
    // Re-run the same overlap lane assignment used inside the SVG IIFE
    // to know how many concentric tracks exist.
    const sorted = [...tasks].sort((a, b) => a.start - b.start);
    const ends: number[] = [];
    for (const t of sorted) {
      const lane = ends.findIndex((end) => end <= t.start);
      if (lane === -1) ends.push(t.end);
      else ends[lane] = t.end;
    }
    return Math.max(1, ends.length);
  })();
  const trackInnerEdge = trackBaseR - TRACK_STROKE / 2;
  const trackOuterEdge = trackBaseR + (trackTotalLanes - 1) * (TRACK_STROKE + TRACK_LANE_GAP) + TRACK_STROKE / 2;

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
          <svg
            viewBox="0 0 240 240"
            style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          >
            {/* Train-track concentric lanes.
                One gray "track" circle per overlapping-task lane.
                Tasks ride their assigned lane's track.
                Stroke width auto-shrinks as lanes are added so all rings
                fit within the outer band without crossing the numerals. */}
            {(() => {
              // ── Lane assignment (interval-graph coloring on time overlap) ──
              const sortedByStart = [...tasks].sort((a, b) => a.start - b.start);
              const laneEnds: number[] = [];
              const laneByTaskId = new Map<string, number>();
              for (const t of sortedByStart) {
                let lane = laneEnds.findIndex((end) => end <= t.start);
                if (lane === -1) {
                  lane = laneEnds.length;
                  laneEnds.push(t.end);
                } else {
                  laneEnds[lane] = t.end;
                }
                laneByTaskId.set(t.id, lane);
              }
              const totalLanes = Math.max(1, laneEnds.length);

              // ── Geometry: tracks grow OUTWARD from the clock edge ──
              // Lane 0 = innermost, sits just outside the clock face.
              // Each new lane stacks further outward (larger radius).
              // Thin uniform stroke — no shrinking; the clock has free space
              // around it for many tracks before overflowing the node bounds.
              // Track geometry comes from the hoisted constants so the
              // now-pointer (rendered after this IIFE) can use the same span.
              const STROKE = TRACK_STROKE;
              const LANE_GAP = TRACK_LANE_GAP;
              const radiusForLane = (lane: number): number =>
                trackBaseR + lane * (STROKE + LANE_GAP);
              const radiusFor = (t: TaskEntry): number =>
                radiusForLane(laneByTaskId.get(t.id) ?? 0);
              const stroke = STROKE;

              // ── Gray train tracks, one per lane in use ──
              const tracks: React.ReactElement[] = [];
              for (let lane = 0; lane < totalLanes; lane++) {
                tracks.push(
                  <circle
                    key={`track-${lane}`}
                    cx={CX} cy={CY} r={radiusForLane(lane)}
                    fill="none"
                    stroke="var(--paper-3)"
                    strokeWidth={stroke}
                    opacity={0.55}
                  />,
                );
              }

              // ── Task arcs riding their lane's track ──
              const arcs = tasks.flatMap((t, i) => {
                // `ended` (faded arc) only makes sense for today — a 9am task
                // on tomorrow is not "ended" at 3pm today.
                const ended = isToday && nowFloat >= t.end;
                const active = i === activeIdx;
                const opacity = ended ? 0.4 : 1;
                const sw = stroke;
                const r = radiusFor(t);
                const activeStyle: React.CSSProperties = active
                  ? { animation: 'clock-arc-pulse 2.4s ease-in-out infinite', color: t.colorVar }
                  : {};
                const breakdown = t.breakdown;

                // Single-stroke ring — same visual language as calendar.
                // Calendar uses task-tone background + tone-color border;
                // we render the analog equivalent as one solid arc in tone.
                const baseArc = (
                  key: string,
                  s: number,
                  e: number,
                  cap: 'round' | 'butt',
                ): React.ReactElement => (
                  <path
                    key={`${key}-base`}
                    d={arcPath(s, e, r)}
                    fill="none"
                    stroke={t.colorVar}
                    strokeWidth={sw}
                    strokeLinecap={cap}
                    opacity={opacity}
                    style={activeStyle}
                  />
                );

                if (breakdown === null || breakdown.segments.length <= 1) {
                  return [baseArc(t.id, t.start, t.end, 'round')];
                }

                const out: React.ReactElement[] = [];
                out.push(baseArc(t.id, t.start, t.end, 'round'));

                // Break overlays — track-color stroke cuts through the task
                // arc cleanly (matches the calendar's dashed-border + stripe
                // language — neutral panel break in the timeline).
                //
                // Break overlay stroke matches the task arc exactly.
                // (Earlier polish bumped this to +2 and then +1 to kill an
                // AA halo, but the user judged both visibly too thick — a
                // faint edge of tone is the acceptable trade.)
                const breakStroke = sw;
                let segCursor = t.start;
                for (let sIdx = 0; sIdx < breakdown.segments.length; sIdx++) {
                  const seg = breakdown.segments[sIdx]!;
                  const segEnd = Math.min(segCursor + seg.min / 60, t.end);
                  if (seg.kind !== 'work' && segEnd > segCursor) {
                    out.push(
                      <path
                        key={`${t.id}-seg-${sIdx}`}
                        data-testid="clock-task-break-arc"
                        data-break-kind={seg.kind}
                        d={arcPath(segCursor, segEnd, r)}
                        fill="none"
                        stroke="var(--paper-3)"
                        strokeWidth={breakStroke}
                        strokeLinecap="butt"
                        opacity={opacity}
                      />,
                    );
                  }
                  segCursor = segEnd;
                }
                return out;
              });

              return [...tracks, ...arcs];
            })()}

            {/* Issue #166 — tracked REALITY ring. Sits just outside the tick
                marks and inside the scheduled-event lanes, so "what happened"
                reads as a bold filled band hugging the dial, visually distinct
                from the thin hollow event plan arcs further out. Work = filled
                tone (rust when unlabeled), break = dashed neutral. The live
                segment pulses. */}
            {(() => {
              // Reality arcs ride the innermost task track ring so they appear
              // ON the trail lines, not in the dead zone between face and lanes.
              const R_REALITY = trackBaseR; // 92 — same radius as lane 0
              return realitySegments.map((seg) => {
                const isWork = seg.kind === 'work';
                const tone = isWork
                  ? (seg.taskId ? TONE_VAR[colorFor(seg.taskId)] : 'var(--rust)')
                  : 'var(--ink-3)';
                return (
                  <path
                    key={`reality-${seg.id}`}
                    data-testid="clock-reality-arc"
                    data-reality-kind={seg.kind}
                    data-reality-live={seg.live ? 'true' : undefined}
                    d={arcPath(seg.startH, seg.endH, R_REALITY)}
                    fill="none"
                    stroke={tone}
                    strokeWidth={isWork ? 6 : 4}
                    strokeLinecap="round"
                    strokeDasharray={isWork ? undefined : '2 3'}
                    opacity={seg.live ? 1 : 0.85}
                    style={
                      seg.live
                        ? { animation: 'clock-arc-pulse 2.4s ease-in-out infinite', color: tone }
                        : undefined
                    }
                  />
                );
              });
            })()}

            {/* Now-pointer — spans exactly the train-track band.
                Only rendered when viewing today.

                Contrast trick — the pointer paints in --rust, the same
                family as user's rust-toned task arcs, so without help
                it vanishes over them. We use a thin near-white core
                running through a slightly wider rust stroke (double-
                stroke, no extra DOM cost) and a tiny dot with a small
                pulse. No SVG filter halos: previous version's glow
                overflowed the node's clip box. */}
            {isToday && (() => {
              const pIn  = pt(nowFloat, trackInnerEdge);
              const pOut = pt(nowFloat, trackOuterEdge);
              const pDot = pt(nowFloat, trackBaseR);
              return (
                <>
                  <line
                    x1={pIn.x} y1={pIn.y}
                    x2={pOut.x} y2={pOut.y}
                    stroke="var(--rust)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    opacity={0.95}
                  />
                  <line
                    x1={pIn.x} y1={pIn.y}
                    x2={pOut.x} y2={pOut.y}
                    stroke="#fff5ec"
                    strokeWidth={0.8}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                  <circle
                    cx={pDot.x} cy={pDot.y} r={3}
                    fill="var(--rust)"
                    stroke="#fff5ec"
                    strokeWidth={0.8}
                    style={{
                      animation: 'clock-now-pulse 2s ease-in-out infinite',
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                    }}
                  />
                </>
              );
            })()}

            {/* Inner face */}
            <circle
              cx={CX} cy={CY} r={R_FACE}
              fill="var(--node-bg)"
              stroke="var(--paper-3)"
              strokeWidth={1}
            />

            {/* 60 tick marks */}
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
              const isHour = i % 5 === 0;
              const r1 = isHour ? R_TICK_IN_MAJ : R_TICK_IN;
              return (
                <line
                  key={i}
                  x1={CX + r1 * Math.cos(a)}
                  y1={CY + r1 * Math.sin(a)}
                  x2={CX + R_TICK_OUT * Math.cos(a)}
                  y2={CY + R_TICK_OUT * Math.sin(a)}
                  stroke={isHour ? 'var(--ink-2)' : 'var(--ink-3)'}
                  strokeWidth={isHour ? 1.5 : 0.8}
                />
              );
            })}

            {/* Numerals 1–12 */}
            {NUMERALS.map((n) => {
              const p = pt(n, R_NUM);
              return (
                <text
                  key={n}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--font-mono)"
                  fontSize={11}
                  fontWeight={n === 12 ? 700 : 600}
                  fill={n === 12 ? 'var(--rust)' : 'var(--ink-2)'}
                  letterSpacing="0.02em"
                >
                  {n}
                </text>
              );
            })}

            {/* Digital HH:MM readout — drawn here (between numerals and
                hands) so SVG paint order places it BEHIND the hour /
                minute / second hands. Previously rendered as an HTML
                overlay sibling of the SVG, which floated above
                everything and crossed the minute hand. */}
            <text
              x={CX}
              y={CY - 28}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--font-mono)"
              fontSize={8}
              letterSpacing="1.4"
              fill="var(--ink-4)"
              style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
            >
              {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}
            </text>

            {/* Hour hand */}
            <g transform={`rotate(${hourAng - 90} ${CX} ${CY})`}>
              <line
                x1={CX - 8} y1={CY} x2={CX + 38} y2={CY}
                stroke="var(--ink)"
                strokeWidth={3.2}
                strokeLinecap="round"
              />
            </g>

            {/* Minute hand */}
            <g transform={`rotate(${minAng - 90} ${CX} ${CY})`}>
              <line
                x1={CX - 10} y1={CY} x2={CX + 56} y2={CY}
                stroke="var(--ink)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>

            {/* Second hand — CSS keyframe sweep (60s linear infinite).
                Continuous, GPU-composited, zero React work per frame.
                animation-delay aligns the starting angle to the current
                seconds at mount. */}
            <g
              style={{
                transformOrigin: `${CX}px ${CY}px`,
                animation: 'clock-sec-sweep 60s linear infinite',
                animationDelay: `-${initialSecOffsetRef.current}s`,
              }}
            >
              <line
                x1={CX - 14} y1={CY} x2={CX + 62} y2={CY}
                stroke="var(--rust)"
                strokeWidth={1}
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle cx={CX + 60} cy={CY} r={2} fill="var(--rust)" />
            </g>

            {/* Hub */}
            <circle cx={CX} cy={CY} r={5} fill="var(--ink)" />
            <circle cx={CX} cy={CY} r={1.6} fill="var(--acid)" />
          </svg>

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
                    textDecoration: ended ? 'line-through' : 'none',
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
    </MotherFrame>
  );
}
