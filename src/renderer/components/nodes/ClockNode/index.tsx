import { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { SettingsIcon } from '../../ui/SettingsIcons';
import { createPortal } from 'react-dom';
import type { NodeProps } from '../types';
import { pomoDeleteSegment, pomoRetagSegment } from '../PomoNode/commands';
import { packLanes } from '../../../store/laneLayout';
import { toneVarForTask } from '../../../utils/taskColor';
import { boardTagLibrary, spanTone } from '../../../store/spanTags';
import { TaskInfoPopup } from '../../ui/TaskInfoPopup';
import { useEasyMode } from '../../../store/uiMode';
import type { PomoState } from '../PomoNode/types';
import { saveBoard } from '../../../store/eventLog';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { dayProgress, progressRatio, weekProgress } from '../../../store/dayProgress';
import { MotherFrame, MotherFrameStationContext, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import { selectPomoReality, pomoIsLive, type RealitySegment } from '../../../store/pomoReality';
import type { TaskState } from '../TaskNode/types';
import { Z } from '../../ui/layers';

import { useFrameTheme } from '../../../themes/useFrameTheme';
import { ClockBezel } from './ClockBezel';
import { ClockWeek, buildWeek } from './ClockWeek';
import { useAppMarkers } from '../../../store/appSessions';
import { PagedView } from '../../ui/PagedView';
import { ContextMenu, type ContextMenuItem } from '../../ContextMenu';
import { segmentMenuItems, taskMenuItems } from '../../ContextMenu/scheduleMenus';
import { spanTaskName, spanTaskTargets } from '../PomoNode/taskTargets';
import { AppSelect } from '../../ui/AppSelect';
import { SpanTimeEditor, CountsToward, openLogTime, logTimeDefaults } from '../../ui/SpanEditor';
import { SPACE, popupColumn } from '../../ui/spacing';
import { msAtWallHours } from './wallHours';
import { localYMD } from '../../../../shared/ymd';
import { CX, CY, R_FACE, pt, arcPath, sectorPath } from './dialGeometry';
import {
  planForDay, realityForDay, collectTaskInfo, collectScheduledHabits, type TaskEntry,
} from './dayModel';
import { halfOf, startupFollow, rolloverFollow, claimStartup, type ClockNowMark } from './follow';

// ── Geometry constants ─────────────────────────────────────────────────────────
// CX / CY / R_FACE and the arc helpers live in dialGeometry.ts (shared with
// the Week view's small dials).
const R_TICK_OUT = 84;
const R_TICK_IN = 76;
const R_TICK_IN_MAJ = 72;
const R_NUM = 60;

/** Format hour-float as "9:30am". */
function fmtTime(h: number): string {
  // Whole minutes, wrapped into one day: a task that began yesterday
  // (h < 0) or ends tomorrow (h > 24) shows its wall-clock time, and
  // 9.9999 h reads 10:00, not 9:60.
  const total = ((Math.round(h * 60) % 1440) + 1440) % 1440;
  const hr = Math.floor(total / 60);
  const m = total % 60;
  const ampm = hr >= 12 ? 'pm' : 'am';
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

// Numerals 1–12. 12 at index 0 so hourToRad(12)=top.
const NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/**
 * Hour/minute hand, drawn pointing along +x (the parent <g> rotates it).
 * 'line' is the original Classic hand; 'sword' and 'block' are frame-style
 * variants (ADR 0009 F6). Same length and pivot in every style.
 */
function Hand({ kind, back, len, width }: { kind: 'line' | 'sword' | 'block'; back: number; len: number; width: number }) {
  const color = 'var(--k-clock-hand, var(--ink))';
  if (kind === 'sword') {
    const w = width * 1.4;
    return <path d={`M ${CX - back} ${CY} L ${CX} ${CY - w} L ${CX + len} ${CY} L ${CX} ${CY + w} Z`} fill={color} />;
  }
  return (
    <line
      x1={CX - back} y1={CY} x2={CX + len} y2={CY}
      stroke={color}
      strokeWidth={kind === 'block' ? width * 2 : width}
      strokeLinecap={kind === 'block' ? 'butt' : 'round'}
    />
  );
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
  const dialOnly = node.state.dialOnly === true;
  const weekView = node.state.weekView === true;
  // ADR 0009 F6 — the frame style only restyles the dial; every feature stays.
  const clockSkin = useFrameTheme().manifest.components.clock;

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
  // Easy mode: recorded time in one colour, no retag / focus links.
  const easy = useEasyMode();
  const tagLibrary = boardTagLibrary(board0);
  const isLive = pomoIsLive(board0);
  const [liveMs, setLiveMs] = useState(() => Date.now());

  // #6/#12 — right-click a tracked-reality arc → info popup with delete.
  const [realityPopup, setRealityPopup] = useState<{ seg: RealitySegment; x: number; y: number } | null>(null);
  // Hover feedback: the task (arc or list row) or pomo wedge under the pointer
  // gets a soft highlight, so you can see which one a click will act on.
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null);
  const [hoverSegId, setHoverSegId] = useState<string | null>(null);
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
  // Right-click menus — the same builders as the Calendar, so a task or a
  // pomo segment offers the same actions on both surfaces.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  // Recorded time: right-click opens the same popup as left-click (one place).
  const openSegmentMenu = (seg: RealitySegment, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRealityPopup({ seg, x: e.clientX, y: e.clientY });
  };
  const openTaskMenu = (taskId: string, startH: number, endH: number, e: React.MouseEvent) => {
    const node = useBoardStore.getState().board?.nodes.find((n) => n.id === taskId);
    // Habits ride the dial too but aren't tasks — no task menu for them.
    if (!node || node.kind !== 'todo.task') return;
    e.preventDefault();
    e.stopPropagation();
    const ts = node.state as TaskState;
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: taskMenuItems(
        {
          id: taskId,
          text: ts.text,
          done: ts.done,
          startMs: msAtWallHours(selectedDate, startH),
          endMs: msAtWallHours(selectedDate, endH),
        },
        // Same menu as the Calendar: Easy mode has no focus linking.
        { easy, onDetails: () => setTaskPopup({ taskId, x: e.clientX, y: e.clientY, startMs: msAtWallHours(selectedDate, startH), endMs: msAtWallHours(selectedDate, endH) }) },
      ),
    });
  };
  // Left-click a task (arc or list row) → what it is: name, plan, tracked time.
  const [taskPopup, setTaskPopup] = useState<{ taskId: string; x: number; y: number; startMs: number; endMs: number } | null>(null);
  const openTaskInfo = (taskId: string, startH: number, endH: number, e: React.MouseEvent) => {
    // Habits ride the dial as `habit-<id>`; the popup shows them too.
    const node = useBoardStore.getState().board?.nodes.find((n) => n.id === taskId);
    if (!taskId.startsWith('habit-') && (!node || node.kind !== 'todo.task')) return;
    e.stopPropagation();
    setTaskPopup({ taskId, x: e.clientX, y: e.clientY, startMs: msAtWallHours(selectedDate, startH), endMs: msAtWallHours(selectedDate, endH) });
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

  // Task facts + scheduled habits for the day model (dayModel.ts).
  const taskInfo = useMemo(() => collectTaskInfo(board), [board?.nodes]);
  const scheduledHabits = useMemo(() => collectScheduledHabits(board), [board?.nodes]);

  // Today (real wall-clock day) — used to decide whether `now`-derived UI
  // (now-pointer, active task, now-playing strip) is meaningful for the
  // currently selected day.
  const today = todayLocalYMD();
  const isToday = selectedDate === today;

  // #201 — follow now by default (rules in follow.ts). Runs on mount (app
  // start, once per clock) and whenever the 30-second tick crosses midnight
  // or noon; it never fires on a ‹ › browse, so a browsed day is left alone.
  // Day and half both come from the same `now` sample so they flip together.
  const nowDay = localYMD(now);
  const nowHalf = halfOf(now);
  const nowMarkRef = useRef<ClockNowMark | null>(null);
  useEffect(() => {
    const next: ClockNowMark = { today: nowDay, half: nowHalf };
    const prev = nowMarkRef.current;
    nowMarkRef.current = next;
    const view = { selectedDate, viewWindow };
    const cmd = prev === null
      ? (claimStartup(node.id) ? startupFollow(view, next) : null)
      : rolloverFollow(prev, next, view);
    if (cmd) onCommand(cmd.command, cmd.args);
    // Deliberately keyed on the real time only — a browse must not trigger it.
  }, [nowDay, nowHalf]);

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

  // Flatten placements + scheduled habits → TaskEntry[].
  // Filter by selected day and 12-hour viewWindow.
  const tasks: TaskEntry[] = useMemo(
    () => (placementsMap ? planForDay(placementsMap.values(), taskInfo, scheduledHabits, selectedDate, viewWindow) : []),
    [placementsMap, taskInfo, viewWindow, scheduledHabits, selectedDate],
  );

  // Issue #166 — tracked REALITY segments for the selected day, clipped to the
  // 12-hour window. These are the filled "what actually happened" arcs (work +
  // break), distinct from the hollow scheduled-event plan arcs above.
  const realitySegments = useMemo(
    () => realityForDay(selectPomoReality(board0, liveMs), selectedDate, viewWindow),
    [board0, liveMs, selectedDate, viewWindow],
  );

  // #207 follow-up — app open / close markers for the shown day.
  const appMarkers = useAppMarkers(selectedDate, selectedDate);

  // #207 — Week view model (built only while the week is shown).
  const week = useMemo(
    () => (weekView
      ? buildWeek(todayLocalYMD(), selectPomoReality(board0, liveMs), placementsMap ? placementsMap.values() : null, taskInfo, scheduledHabits, tagLibrary, easy)
      : []),
    // `now` re-buckets the days after midnight.
    [weekView, board0, liveMs, placementsMap, taskInfo, scheduledHabits, tagLibrary, easy, now],
  );

  // Active-task / now-pointer concepts only apply when the user is viewing
  // today. On any other day, `now` has no meaning relative to the day being
  // shown — silently lighting up a task as "active" would be a lie.
  // "Now" is only on this dial when the shown 12-hour half contains it —
  // in the AM half at 17:14 the pointer used to sit at 5 o'clock (05:14).
  const nowInWindow = isToday && (viewWindow === 1 ? nowFloat >= 12 : nowFloat < 12);
  const activeIdx = nowInWindow
    ? tasks.findIndex((t) => nowFloat >= t.start && nowFloat < t.end)
    : -1;

  // Ring geometry (outward from the dial):
  //   face (R_FACE) → reality ring (what the pomo observed) → plan lanes
  //   (one concentric lane per parallel task, from the shared lane packer so
  //   Clock and Calendar agree on which tasks run in parallel).
  // Pomo is drawn as colour INSIDE the face (wedges); task arcs ("worms")
  // ride lanes just outside it.
  const REALITY_R = R_FACE;
  const REALITY_SW = 0;
  const trackBaseR = R_FACE + 9; // center radius of plan lane 0
  const laneByTaskId = useMemo(() => {
    const lanes = packLanes(tasks.map((t) => ({ id: t.id, start: t.start, end: t.end })));
    const m = new Map<string, number>();
    for (const [id, pl] of lanes) m.set(id, pl.lane);
    return m;
  }, [tasks]);
  const trackTotalLanes = Math.max(1, ...[...laneByTaskId.values()].map((l) => l + 1));
  // Thinner lanes when many run in parallel, so the dial doesn't shrink to
  // make room for them (the viewBox grows with the outermost lane).
  const TRACK_STROKE = trackTotalLanes <= 2 ? 7 : trackTotalLanes <= 4 ? 5 : 4;
  const TRACK_LANE_GAP = trackTotalLanes <= 2 ? 2 : 1.5;
  const trackInnerEdge = REALITY_R - REALITY_SW / 2;
  const trackOuterEdge = trackBaseR + (trackTotalLanes - 1) * (TRACK_STROKE + TRACK_LANE_GAP) + TRACK_STROKE / 2;

  const activeProgress = activeIdx >= 0
    ? (nowFloat - tasks[activeIdx]!.start) / (tasks[activeIdx]!.end - tasks[activeIdx]!.start)
    : 0;
  const activeColor = activeIdx >= 0 ? tasks[activeIdx]!.colorVar : 'var(--ink-3)';

  // Station mode: the bottom-right Clock panel is much taller than the canvas-
  // mode fixed mother (540px) — scale the dial up so it fills the space
  // instead of leaving a strip of empty card around a tiny 244px square.
  const inStation = useContext(MotherFrameStationContext);
  // engagement.md F18 — the outer ring closes as the day's planned blocks are
  // ticked; under the dial, one small ring per day of this week.
  const dayDone = useMemo(() => dayProgress(board0, selectedDate), [board0, selectedDate]);
  const weekMarks = useMemo(() => weekProgress(board0, todayLocalYMD()), [board0]);
  const ringR = trackOuterEdge + 6;
  const ringC = 2 * Math.PI * ringR;

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
          // No scrolling: the dial flexes to the free space and the task
          // list pages (PagedView).
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="krnl-node-header"
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
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: isToday ? 'var(--cyan)' : 'var(--ink-4)', boxShadow: isToday ? '0 0 0 2px color-mix(in srgb, var(--cyan) 25%, transparent)' : 'none' }} />
            {isToday ? 'Today · Schedule' : 'Day · Schedule'}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            data-testid="clock-week-toggle"
            aria-pressed={weekView}
            title={weekView ? 'Back to the day' : 'Last 7 days at a glance'}
            onClick={(e) => { e.stopPropagation(); onCommand('clock.setWeekView', {}); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: weekView ? 'var(--acid)' : 'transparent',
              color: weekView ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
              border: '1px solid var(--paper-3)', borderRadius: 4, padding: '2px 7px',
              fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {weekView ? <><SettingsIcon name="clock" size={11} /> DAY</> : <><SettingsIcon name="dial" size={11} /> WEEK</>}
          </button>
          <button
            type="button"
            data-testid="clock-dial-only"
            aria-pressed={dialOnly}
            hidden={weekView}
            title={dialOnly ? 'Show schedule' : 'Big clock — dial only'}
            onClick={(e) => { e.stopPropagation(); onCommand('clock.setDialOnly', {}); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: dialOnly ? 'var(--acid)' : 'transparent',
              color: dialOnly ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
              border: '1px solid var(--paper-3)', borderRadius: 4, padding: '2px 7px',
              fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', cursor: 'pointer',
            }}
          >
            {dialOnly ? <><SettingsIcon name="menu" size={11} /> SCHEDULE</> : <><SettingsIcon name="expand" size={11} /> BIG CLOCK</>}
          </button>
          </span>
        </div>
        {/* #207 — Week view replaces the day view; the day view stays mounted
            (display: contents keeps its flex layout) so switching back is instant. */}
        {weekView && (
          <ClockWeek
            week={week}
            nowH={now.getHours() + now.getMinutes() / 60}
            onPick={(ymd) => { onCommand('clock.setSelectedDate', { date: ymd }); onCommand('clock.setWeekView', { on: false }); }}
          />
        )}
        <div style={{ display: weekView ? 'none' : 'contents' }}>

        {/* Day selector — ADR 0004 §3.3. Lets the user page through days
            (← / →), jump to any date via native picker (covers month/year),
            and snap back to today. Disabled when already on today.
            Buttons share a single `clock-day-btn` class so hover/focus
            polish lives in tokens.css (rather than 5 inline copies). */}
        <div
          data-testid="clock-day-bar"
          style={{
            display: dialOnly ? 'none' : 'flex',
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
            display: dialOnly ? 'none' : 'flex',
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
              background: viewWindow === 0 ? 'var(--rust-deep, var(--rust))' : 'transparent',
              color: viewWindow === 0 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 0 ? 'var(--rust-deep, var(--rust))' : 'var(--paper-3)'}`,
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
              // rust-deep: the paper-coloured label reads on it in both themes.
              background: viewWindow === 1 ? 'var(--rust-deep, var(--rust))' : 'transparent',
              color: viewWindow === 1 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 1 ? 'var(--rust-deep, var(--rust))' : 'var(--paper-3)'}`,
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
          data-testid="clock-dial"
          style={{
            position: 'relative',
            // Flexes with the window so the whole clock always fits: the
            // dial's height comes from the free space, its width follows.
            flex: dialOnly ? '1 1 auto' : '3 1 0',
            minHeight: 140,
            maxHeight: dialOnly ? '100%' : inStation ? 620 : 300,
            aspectRatio: '1 / 1',
            maxWidth: '100%',
            margin: '0 auto',
            overflow: 'visible',
          }}
        >
          <svg
            // #207 F7b — right-click an empty part of the dial: log time that
            // wasn't recorded at that hour (arcs and wedges stop their own).
            onContextMenu={(ev) => {
              ev.preventDefault();
              const r = ev.currentTarget.getBoundingClientRect();
              const a = Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
              const h12 = ((((a + Math.PI / 2) / (Math.PI * 2)) * 12) % 12 + 12) % 12;
              const [yy, mm, dd] = selectedDate.split('-').map(Number) as [number, number, number];
              const clickMs = new Date(yy, mm - 1, dd, 0, Math.floor((viewWindow * 12 + h12) * 60)).getTime();
              const x = ev.clientX;
              const y = ev.clientY;
              const future = clickMs > Date.now();
              setCtxMenu({
                x, y,
                items: [{
                  label: future ? 'Log time… (only past time)' : `Log time at ${fmtClockHM(clickMs)}…`,
                  disabled: future,
                  onSelect: () => openLogTime({ ...logTimeDefaults(clickMs), x, y }),
                }],
              });
            }}
            viewBox={(() => {
              // Grow the drawing area with the plan lanes so many parallel
              // tasks are never clipped by the panel (240 = the base dial).
              const half = Math.max(120, Math.ceil(trackOuterEdge + (dayDone.planned > 0 ? 10 : 4)));
              return `${CX - half} ${CY - half} ${half * 2} ${half * 2}`;
            })()}
            style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          >
            {/* Frame-style bezel (ADR 0009) — under everything, Classic draws none. */}
            <ClockBezel kind={clockSkin.bezel} outerR={trackOuterEdge} />

            {dayDone.planned > 0 && (
              <g data-testid="clock-done-ring" data-done={dayDone.done} data-planned={dayDone.planned} pointerEvents="none">
                <title>{`${dayDone.done} of ${dayDone.planned} planned done`}</title>
                <circle cx={CX} cy={CY} r={ringR} fill="none" stroke="var(--paper-3)" strokeWidth={2.5} />
                <circle
                  cx={CX} cy={CY} r={ringR} fill="none" stroke="var(--acid)" strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray={`${(progressRatio(dayDone) * ringC).toFixed(2)} ${ringC.toFixed(2)}`}
                  transform={`rotate(-90 ${CX} ${CY})`}
                  style={{ transition: 'stroke-dasharray 400ms cubic-bezier(0.32, 0.72, 0, 1)' }}
                />
              </g>
            )}

            <defs>
              <pattern id="clock-break-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1.2" height="4" fill="var(--ink-3)" />
              </pattern>
            </defs>
            {/* Train-track concentric lanes.
                One gray "track" circle per overlapping-task lane.
                Tasks ride their assigned lane's track.
                Stroke width auto-shrinks as lanes are added so all rings
                fit within the outer band without crossing the numerals. */}
            {(() => {
              const totalLanes = trackTotalLanes;

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
                    stroke="var(--k-clock-track, var(--paper-3))"
                    strokeWidth={stroke}
                    // Faint guide only — empty lanes were heavy grey rings.
                    opacity={0.18}
                  />,
                );
              }

              // ── Task arcs riding their lane's track ──
              const arcs = tasks.flatMap((t, i) => {
                // `ended` (faded arc) only makes sense for today — a 9am task
                // on tomorrow is not "ended" at 3pm today.
                const ended = isToday && nowFloat >= t.realEnd;
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
                const hovered = hoverTaskId === t.id;
                const hoverOn = () => setHoverTaskId(t.id);
                const hoverOff = () => setHoverTaskId((h) => (h === t.id ? null : h));
                const baseArc = (
                  key: string,
                  s: number,
                  e: number,
                  cap: 'round' | 'butt',
                ): React.ReactElement => (
                  <g key={`${key}-base`} onPointerEnter={hoverOn} onPointerLeave={hoverOff}>
                    {/* Wide invisible hit area: the drawn arc is thin, this
                        makes it easy to hover, click and right-click. */}
                    <path
                      data-testid="clock-plan-arc-hit"
                      d={arcPath(s, e, r)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(12, sw + 8)}
                      strokeLinecap={cap}
                      pointerEvents="stroke"
                      style={{ cursor: 'pointer' }}
                      onClick={(ev) => openTaskInfo(t.id, t.realStart, t.realEnd, ev)}
                      onContextMenu={(ev) => openTaskMenu(t.id, t.realStart, t.realEnd, ev)}
                    >
                      <title>{`${t.name} · ${fmtTime(t.realStart)}–${fmtTime(t.realEnd)} · click for details, right-click for actions`}</title>
                    </path>
                    <path
                      data-testid="clock-plan-arc"
                      data-task-id={t.id}
                      onClick={(ev) => openTaskInfo(t.id, t.realStart, t.realEnd, ev)}
                      onContextMenu={(ev) => openTaskMenu(t.id, t.realStart, t.realEnd, ev)}
                      d={arcPath(s, e, r)}
                      fill="none"
                      stroke={t.colorVar}
                      strokeWidth={sw}
                      strokeLinecap={cap}
                      opacity={hovered ? 1 : opacity * (active ? 0.95 : 0.7)}
                      data-hovered={hovered ? 'true' : undefined}
                      style={{ ...activeStyle, cursor: 'context-menu', transition: 'opacity 120ms, filter 120ms', filter: hovered ? 'brightness(1.35)' : undefined }}
                    >
                      <title>{`${t.name} · ${fmtTime(t.realStart)}–${fmtTime(t.realEnd)}`}</title>
                    </path>
                  </g>
                );

                // No set time: one arc whose colour fades smoothly to nothing
                // toward its end (a gradient laid along the arc's chord).
                if (t.timeOpen) {
                  const p0 = pt(t.start, r);
                  const p1 = pt(t.end, r);
                  const gid = `clock-open-${t.id}`;
                  const hit = baseArc(t.id, t.start, t.end, 'round');
                  return [
                    <defs key={`${t.id}-open-defs`}>
                      <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}>
                        <stop offset="0%" stopColor={t.colorVar} stopOpacity={opacity * (active ? 0.95 : 0.8)} />
                        <stop offset="55%" stopColor={t.colorVar} stopOpacity={opacity * 0.35} />
                        <stop offset="100%" stopColor={t.colorVar} stopOpacity={0} />
                      </linearGradient>
                    </defs>,
                    <g key={`${t.id}-open`} data-time-open="true" opacity={0}>{hit}</g>,
                    <path
                      key={`${t.id}-open-arc`}
                      d={arcPath(t.start, t.end, r)}
                      fill="none"
                      stroke={`url(#${gid})`}
                      strokeWidth={sw}
                      style={{ transition: 'filter 120ms', filter: hovered ? 'brightness(1.35)' : undefined }}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />,
                  ];
                }
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
                        stroke="var(--k-clock-track, var(--paper-3))"
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

            {/* #180 — tracked reality moved to a dial-face wash (drawn above,
                under the ticks). The old lane-ring stroke is gone so reality
                and event arcs no longer share the track lanes. */}

            {/* Now-pointer — spans exactly the train-track band.
                Only rendered when viewing today.

                Contrast trick — the pointer paints in --rust, the same
                family as user's rust-toned task arcs, so without help
                it vanishes over them. We use a thin near-white core
                running through a slightly wider rust stroke (double-
                stroke, no extra DOM cost) and a tiny dot with a small
                pulse. No SVG filter halos: previous version's glow
                overflowed the node's clip box. */}
            {nowInWindow && (() => {
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
                    stroke="var(--k-pointer-core, #fff5ec)"
                    strokeWidth={0.8}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                  <circle
                    cx={pDot.x} cy={pDot.y} r={3}
                    fill="var(--rust)"
                    stroke="var(--k-pointer-core, #fff5ec)"
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
              fill="var(--k-clock-face, var(--node-bg))"
              stroke="var(--k-clock-face-edge, var(--paper-3))"
              strokeWidth={1}
            />

            {/* Pomo = colour inside the clock: each recorded span fills its
                wedge of the face, in the colour of the task it is tagged with
                (acid when untagged); breaks are a faint hatched wedge; a pause
                is empty face. Drawn under the ticks, numerals and hands.
                Click a wedge for times, retag and delete. */}
            {realitySegments.map((seg) => {
              const isWork = seg.kind === 'work';
              const tone = spanTone(tagLibrary, seg, easy);
              const open = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setRealityPopup({ seg, x: e.clientX, y: e.clientY });
              };
              const menu = (e: React.MouseEvent) => openSegmentMenu(seg, e);
              return (
                <path
                  key={`reality-${seg.id}`}
                  data-testid="clock-reality-arc"
                  data-reality-kind={seg.kind}
                  data-reality-live={seg.live ? 'true' : undefined}
                  onClick={open}
                  onContextMenu={menu}
                  onPointerEnter={() => setHoverSegId(seg.id)}
                  onPointerLeave={() => setHoverSegId((h) => (h === seg.id ? null : h))}
                  d={sectorPath(seg.startH, seg.endH, R_FACE - 1)}
                  fill={isWork ? tone : 'url(#clock-break-hatch)'}
                  stroke="none"
                  opacity={(isWork ? (seg.live ? 0.42 : 0.3) : 0.5) + (hoverSegId === seg.id ? 0.2 : 0)}
                  style={
                    seg.live
                      ? { animation: 'clock-arc-pulse 2.4s ease-in-out infinite', color: tone, cursor: 'pointer' }
                      : { cursor: 'pointer' }
                  }
                >
                  <title>{`${isWork ? 'Focus' : 'Break'} · ${fmtClockHM(seg.startMs)}${seg.live ? ' → now' : `–${fmtClockHM(seg.endMs)}`}`}</title>
                </path>
              );
            })}

            {/* #202 — everything painted over the wedges (ticks, numerals,
                readout, hands, sweeping second hand, hub) is decoration: it
                must never take the pointer, or hovering a numeral (or the
                second hand passing under a still cursor) "leaves" the wedge
                and the hover flickers / the click misses. */}
            <g data-testid="clock-face-overlay" pointerEvents="none">
            {/* #207 follow-up — when KRNL0 was opened / closed (small rim ticks). */}
            {appMarkers.map((m) => {
              const d = new Date(m.ms);
              const h = d.getHours() + d.getMinutes() / 60;
              if (h < viewWindow * 12 || h >= viewWindow * 12 + 12) return null;
              const a = pt(h, R_FACE + 2);
              const b = pt(h, R_FACE - 4);
              return (
                <line
                  key={`app-${m.kind}-${m.ms}`}
                  data-testid={`clock-app-${m.kind}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={m.kind === 'open' ? 'var(--cyan, var(--ink-3))' : 'var(--ink-4)'}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                >
                  <title>{`KRNL0 ${m.kind === 'open' ? 'opened' : 'closed'} ${fmtClockHM(m.ms)}`}</title>
                </line>
              );
            })}
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
                  stroke={isHour ? 'var(--k-clock-tick-major, var(--ink-2))' : 'var(--k-clock-tick-minor, var(--ink-3))'}
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
                  fontFamily="var(--k-clock-font, var(--font-mono))"
                  fontSize={11}
                  fontWeight={n === 12 ? 700 : 600}
                  fill={n === 12 ? 'var(--rust)' : 'var(--k-clock-num, var(--ink-2))'}
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
            {clockSkin.readoutWindow && (
              <rect
                data-testid="clock-readout-window"
                x={CX - 19} y={CY - 34} width={38} height={12} rx={2}
                fill="var(--k-clock-face, var(--node-bg))"
                stroke="var(--k-clock-tick-minor, var(--paper-3))"
                strokeWidth={0.8}
              />
            )}
            <text
              x={CX}
              y={CY - 28}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--k-clock-font, var(--font-mono))"
              fontSize={8}
              letterSpacing="1.4"
              fill="var(--k-clock-readout, var(--ink-4))"
              style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
            >
              {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}
            </text>

            {/* Hour hand */}
            <g transform={`rotate(${hourAng - 90} ${CX} ${CY})`}>
              <Hand kind={clockSkin.hand} back={8} len={38} width={3.2} />
            </g>

            {/* Minute hand */}
            <g transform={`rotate(${minAng - 90} ${CX} ${CY})`}>
              <Hand kind={clockSkin.hand} back={10} len={56} width={2} />
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
            <circle cx={CX} cy={CY} r={5} fill="var(--k-clock-hand, var(--ink))" />
            <circle cx={CX} cy={CY} r={1.6} fill="var(--acid)" />
            </g>
          </svg>

          {/* HH:MM digital readout moved into the SVG (above) so it
              paints behind the hour/minute/second hands. */}
        </div>

        {/* engagement.md F18 — this week, one ring per day (planned blocks done). */}
        <div
          data-testid="clock-week-marks"
          style={{ display: dialOnly ? 'none' : 'flex', justifyContent: 'center', gap: 6, width: '100%' }}
        >
          {weekMarks.map((d) => {
            const isToday = d.date === today;
            const ratio = progressRatio(d);
            const full = d.planned > 0 && d.done === d.planned;
            const dow = new Date(`${d.date}T00:00:00`).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <button
                key={d.date}
                type="button"
                data-testid={`clock-week-mark-${d.date}`}
                title={d.planned > 0 ? `${d.done} of ${d.planned} planned done` : 'nothing planned'}
                onClick={() => onCommand('clock.setSelectedDate', { date: d.date })}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 24 }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  {isToday && <circle cx="10" cy="10" r="9.3" fill="none" stroke="var(--ink-3)" strokeWidth="0.8" />}
                  <circle cx="10" cy="10" r="7" fill="none" stroke="var(--paper-3)" strokeWidth="2.4" strokeDasharray={d.planned > 0 ? undefined : '1.6 2'} />
                  {ratio > 0 && (
                    <circle cx="10" cy="10" r="7" fill="none" stroke="var(--acid)" strokeWidth="2.4" strokeLinecap="round"
                      strokeDasharray={`${(ratio * 2 * Math.PI * 7).toFixed(2)} 44`} transform="rotate(-90 10 10)" />
                  )}
                  {full && <path d="M6.6 10.2l2.2 2.2 4.4-4.6" fill="none" stroke="var(--acid-ink, var(--acid))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: isToday ? 'var(--ink)' : 'var(--ink-3)', textTransform: 'uppercase' }}>{dow}</span>
              </button>
            );
          })}
        </div>

        {/* Now-playing strip */}
        <div
          style={{
            display: dialOnly ? 'none' : 'flex',
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

        {/* Task list — pages of whole rows, never a scrollbar. */}
        <PagedView
          testId="clock-task-pages"
          resetKey={selectedDate}
          style={{ width: '100%', flex: tasks.length > 0 ? '1 1 0' : '0 0 auto', minHeight: tasks.length > 0 ? 64 : 0, display: dialOnly ? 'none' : undefined }}
          contentStyle={{ display: 'flex', flexDirection: 'column', gap: 1, fontFamily: 'var(--font-mono)' }}
          revealIndex={activeIdx}
        >
          {tasks.map((t, i) => {
            const ended = isToday && nowFloat >= t.realEnd;
            const on    = i === activeIdx;
            // Strike through only what is actually done; a past task that is
            // still open is just dimmed (striking it read as "finished").
            const isDone = taskInfo.get(t.id)?.done === true;
            return (
              <div
                key={t.id}
                data-testid="clock-task-row"
                onClick={(ev) => openTaskInfo(t.id, t.realStart, t.realEnd, ev)}
                onContextMenu={(ev) => openTaskMenu(t.id, t.realStart, t.realEnd, ev)}
                onPointerEnter={() => setHoverTaskId(t.id)}
                onPointerLeave={() => setHoverTaskId((h) => (h === t.id ? null : h))}
                style={{
                  borderRadius: 4,
                  background: hoverTaskId === t.id ? 'color-mix(in srgb, var(--ink) 6%, transparent)' : 'transparent',
                  transition: 'background 120ms',
                  display: 'grid',
                  gridTemplateColumns: '4px 56px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  // Over: quieter ink, never faded below readable.
                  opacity: 1,
                  position: 'relative',
                }}
              >
                {/* The task's colour as a dot, as in the Todo rows (no left bar). */}
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: t.colorVar,
                    display: 'inline-block',
                    alignSelf: 'center',
                    opacity: ended ? 0.5 : 1,
                  }}
                />
                {/* Start time */}
                <span
                  style={{
                    color: on ? 'color-mix(in srgb, var(--rust) 75%, var(--ink))' : 'var(--ink-3)',
                    fontSize: 10,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtTime(t.realStart)}
                </span>
                {/* Name */}
                <span
                  style={{
                    color: ended ? 'var(--ink-3)' : 'var(--ink)',
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
                    color: 'var(--ink-3)',
                    fontSize: 10,
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmtDur(t.end - t.start)}
                </span>
              </div>
            );
          })}
        </PagedView>
        </div>
      </div>

      {/* #6/#12 — tracked-reality info + delete popup (right-click an arc). */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onDismiss={() => setCtxMenu(null)} />
      )}
      {taskPopup && (
        <TaskInfoPopup {...taskPopup} onClose={() => setTaskPopup(null)} />
      )}
      {realityPopup && createPortal(
        <>
          <div onClick={() => setRealityPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
          <div
            data-testid="clock-reality-popup"
            style={{
              position: 'fixed',
              left: Math.min(realityPopup.x + 4, window.innerWidth - 250),
              top: realityPopup.y + 6,
              zIndex: Z.popup,
              background: 'var(--paper)',
              border: '1px solid var(--paper-3)',
              borderRadius: 8,
              padding: SPACE.panelPad,
              ...popupColumn,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink)',
              minWidth: 210,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, background: spanTone(tagLibrary, realityPopup.seg, easy) }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{realityPopup.seg.kind === 'work' ? (!easy && !realityPopup.seg.taskId && realityPopup.seg.label) || 'Focus session' : 'Break'}</span>
              {realityPopup.seg.live && <span style={{ fontSize: 8, color: 'var(--acid-ink, var(--acid))' }}>◆ LIVE</span>}
            </div>
            {/* #207 — click a time to change it; a running session's "now" becomes "Stop at". */}
            <SpanTimeEditor
              testIdPrefix="clock-reality-time"
              seg={realityPopup.seg}
              onSaved={(startMs, endMs) => {
                if (realityPopup.seg.live) setRealityPopup(null);
                else setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, startMs, endMs } });
              }}
            />
            <div style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.04em' }}>
              {realityPopup.seg.live ? 'So far · ' : 'Duration · '}
              {Math.max(1, Math.round((realityPopup.seg.endMs - realityPopup.seg.startMs) / 60_000))} min
            </div>
            {!easy && realityPopup.seg.kind === 'work' && !realityPopup.seg.live && (
              <CountsToward
                testId="clock-reality-retag"
                segId={realityPopup.seg.id}
                taskId={realityPopup.seg.taskId ?? null}
                taskName={spanTaskName(useBoardStore.getState().board?.nodes, realityPopup.seg)}
                categoryTag={realityPopup.seg.tag ?? null}
                onChanged={(taskId) => setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, taskId } })}
              />
            )}
            {!realityPopup.seg.live && (
              <button
                type="button"
                data-testid="clock-reality-delete"
                onClick={() => { deleteClockSegment(realityPopup.seg.id); setRealityPopup(null); }}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--rust)', background: 'transparent', border: '1px solid var(--rust)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
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
