// ADR 0001 Decision 24 — WeekView (Slice 3).
// ADR 0002 — Habit drag-to-schedule integration + habit block visualisation.
// Renders a 7-column × N-row hour grid. Supports drag-to-schedule from TodoNode
// rows and TaskNode blocks. Supports drag-to-schedule from HabitNode rows via
// HabitSwapModal. NowLine is rendered as an overlay.

import { useMemo, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../../store/boardStore';
import { taskSetPlannedMin, taskSetSchedule } from '../TaskNode/commands';
import { pomoDeleteSegment, pomoRetagSegment } from '../PomoNode/commands';
import type { PomoState } from '../PomoNode/types';
import { saveBoard } from '../../../store/eventLog';
import { useShallow } from 'zustand/react/shallow';
import { selectScheduledTasksForRange, selectSchedule } from '../../../store/scheduleSelector';
import { packLanes } from '../../../store/laneLayout';
import { trackedSecondsByTask, selectPomoNode, pomoOnlyBoard } from '../../../store/trackedTime';
import { selectPomoReality, pomoIsLive } from '../../../store/pomoReality';
import { colorForTask, TASK_TONE_VAR } from '../../../utils/taskColor';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { TaskKind, TaskState } from '../TaskNode/types';
import type { CalendarConfig, CalendarState } from './types';
import { CAL_ZOOM_MIN, CAL_ZOOM_MAX, CAL_ZOOM_STEP, granularityFor } from './types';
import { getMondayOf, toYMD } from '../HabitNode/types';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';
import { NowLine } from './NowLine';
import { HabitSwapModal } from '../../ui/HabitSwapModal';
import { getHabitDrag, type HabitDragPayload } from '../../../dnd/habitDrag';
import { calcStreak } from '../HabitNode/commands';
import { toneVarForTask } from '../../../utils/taskColor';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Parse a YYYY-MM-DD string to a Date at local midnight.
function parseYMD(ymd: string): Date {
  return new Date(ymd + 'T00:00:00');
}

// Add n days to a YYYY-MM-DD string, returning the new YYYY-MM-DD.
function addDays(ymd: string, n: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

// Format a YYYY-MM-DD as "Month D", e.g. "May 12".
function formatWeekLabel(mondayYMD: string): string {
  const d = parseYMD(mondayYMD);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// Return the YYYY-MM-DD of the Monday of the week containing the anchor.
function getMondayYMD(anchorYMD: string): string {
  const d = parseYMD(anchorYMD);
  return toYMD(getMondayOf(d));
}

// Return today's YYYY-MM-DD.
function todayYMD(): string {
  return toYMD(new Date());
}

// Format an epoch-ms as local "HH:MM".
function fmtHM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Short day labels Mon-Sun.
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// Convert JS getDay() (0=Sun..6=Sat) to ISO-8601 day-of-week (1=Mon..7=Sun).
function jsGetDayToIsoDow(jsDay: number): IsoDow {
  return (jsDay === 0 ? 7 : jsDay) as IsoDow;
}

// Convert a YYYY-MM-DD to its ISO day-of-week (1=Mon..7=Sun).
function ymdToIsoDow(ymd: string): IsoDow {
  const d = parseYMD(ymd);
  return jsGetDayToIsoDow(d.getDay());
}

// Check if a habit is scheduled on a given ISO day-of-week.
function habitScheduledOnDow(schedule: HabitSchedule, isoDow: IsoDow): boolean {
  switch (schedule.kind) {
    case 'daily': return true;
    case 'weekly': return schedule.days.includes(isoDow);
    case 'weekdays': return isoDow >= 1 && isoDow <= 5;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduledTask {
  id: string;
  text: string;
  startISO: string;             // ADR 0003: cascade-derived placement start
  done: boolean;                // PR #122: for past/done graying
  scheduledDurationMin: number; // calendar block duration (fallback: plannedMin or durationMin)
  plannedMin: number;           // for drag payload
  isAnchor: boolean;            // ADR 0003: true iff the user explicitly anchored this task
  kind: TaskKind;               // Decision 28: 'focus' | 'event'
  breakdown: PomoBreakdown | null; // Decision 28: null iff kind === 'event'
}

// One day's slice of a (potentially multi-day) task. `sliceStartMin` and
// `sliceEndMin` are measured from local midnight of THIS day.
interface TaskSlice {
  task: ScheduledTask;
  sliceStartMin: number; // 0–1440
  sliceEndMin: number;   // 0–1440
  isContinuation: boolean; // true on every day after the first
  hasContinuation: boolean; // true if the task continues past this day
}

// Side-by-side columns for overlapping slices — the shared lane packer
// (store/laneLayout.ts) so Calendar and Clock agree on parallel tasks. Every
// slice in an overlap cluster gets the same column count, and a slice widens
// into columns that stay free for its whole interval.
function computeColumnLayout(
  slices: TaskSlice[],
  minVisualMin = 0,
): Map<string, { colIndex: number; colCount: number; span: number }> {
  // Pack by the DRAWN extent: a short block is stretched to a minimum height,
  // so two tasks that don't overlap in time can still overlap on screen.
  const lanes = packLanes(
    slices.map((sl) => ({
      id: sl.task.id,
      start: sl.sliceStartMin,
      end: Math.max(sl.sliceEndMin, sl.sliceStartMin + minVisualMin),
    })),
  );
  const result = new Map<string, { colIndex: number; colCount: number; span: number }>();
  for (const [id, p] of lanes) result.set(id, { colIndex: p.lane, colCount: p.laneCount, span: p.span });
  return result;
}

function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

function fmtMinOfDay(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface ScheduledHabit {
  id: string;
  name: string;
  color: string;        // CSS color token name (e.g. 'acid', 'cyan')
  icon: string | undefined;
  schedule: HabitSchedule;
}

interface WeekViewProps {
  state: CalendarState;
  config: CalendarConfig;
  onCommand: (cmd: string, args: Record<string, unknown>) => void;
  /** #10 — when true, render a single day (anchorDate) instead of Mon–Sun. */
  singleDay?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GUTTER_WIDTH = 36; // px — time gutter width
const MIN_ROW_HEIGHT = 28; // px — minimum row height
const MIN_BLOCK_PX = 14; // px — a planned block is never thinner than one text line

type HabitScheduleKind = 'weekly' | 'daily';

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekView({ state, config, onCommand, singleDay = false }: WeekViewProps) {
  // Width of the per-day reality rail (left edge of each column), as a CSS
  // length so it scales with the column: wide in the day view (carries a
  // minutes label), at most 12% of a narrow week column (station panels can
  // be ~25px per day).
  // A thin strip in every view: a wide labelled rail read as extra task
  // blocks next to the plan. Minutes live in the hover / click popup.
  const rail = 'min(6px, 10%)';
  // Always render the full day (00 → 23) regardless of any persisted
  // hourRange in the node config. This guarantees every calendar shows
  // the same 24-hour grid.
  void config;
  const hourRange = { start: 0, end: 23 };
  const rowCount = 24;
  const gridBodyRef = useRef<HTMLDivElement>(null);
  // Real grid width, so blocks know how many pixels they actually have and
  // only draw the text that fits (station panels give ~25px per day).
  const rootRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      setGridW((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // #10 — day view anchors on anchorDate and shows one column; week view anchors
  // on the Monday and shows seven. dayCount drives the column grid throughout.
  const dayCount = singleDay ? 1 : 7;
  const mondayYMD = getMondayYMD(state.anchorDate);
  const baseYMD = singleDay ? state.anchorDate : mondayYMD;

  // Build the day columns (1 for day view, Mon–Sun for week view).
  const weekDays = useMemo<string[]>(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(baseYMD, i));
  }, [baseYMD, dayCount]);

  const today = todayYMD();

  // Column index of today within the visible range, -1 if not shown.
  const todayColIndex = weekDays.indexOf(today);

  // #5 — ruler zoom. rowHeight scales with the persisted zoom multiplier so the
  // user can stretch the grid to clearly read where pomo sections start/end.
  // Default 2× (56px per hour): at 1× a 20-minute task is a ~10px sliver.
  // The whole day doesn't need to fit — the grid scrolls (see below).
  const zoom = Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, state.zoom ?? 2));
  const rowHeight = MIN_ROW_HEIGHT * zoom;
  // #11/#8 — one granularity drives gridlines, gutter labels, AND snapping.
  const gran = granularityFor(zoom);
  // Sub-hour marks at every granularity step inside the hour (skip :00).
  const subMarks: number[] = gran >= 60
    ? []
    : Array.from({ length: Math.floor(60 / gran) - 1 }, (_, i) => (i + 1) * gran);

  const setZoom = (z: number) => onCommand('calendar.setZoom', { zoom: z });
  const setToday = () => onCommand('calendar.setAnchor', { date: todayYMD() });

  // #8 — snap preview. While dragging over the grid we track the snapped slot
  // (day + minute-of-day) and paint a thin band there, so the user sees the
  // EXACT target slot instead of the whole hour cell lighting up.
  const [snapPreview, setSnapPreview] = useState<{ dayYMD: string; minute: number } | null>(null);

  // #7 — live resize draft. While dragging a task block's top/bottom edge we
  // hold a transient override (start-minute delta + duration) so the block
  // grows/shrinks under the cursor; commit on mouse-up, snapped to granularity.
  const [resizeDraft, setResizeDraft] = useState<
    { taskId: string; durationMin: number; startMinDelta: number } | null
  >(null);

  function startResize(
    edge: 'top' | 'bottom',
    task: ScheduledTask,
    sliceStartMin: number,
    origDurationMin: number,
    e: ReactMouseEvent<HTMLDivElement>,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const originY = e.clientY;
    const dayYMD = task.startISO.slice(0, 10);
    let last = { taskId: task.id, durationMin: origDurationMin, startMinDelta: 0 };
    const onMove = (ev: MouseEvent) => {
      const deltaMin = Math.round((((ev.clientY - originY) / rowHeight) * 60) / gran) * gran;
      if (edge === 'bottom') {
        last = { taskId: task.id, durationMin: Math.max(gran, origDurationMin + deltaMin), startMinDelta: 0 };
      } else {
        // Top edge: don't let the start cross the end; clamp the delta.
        const clamped = Math.min(deltaMin, origDurationMin - gran);
        last = { taskId: task.id, durationMin: Math.max(gran, origDurationMin - clamped), startMinDelta: clamped };
      }
      setResizeDraft(last);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResizeDraft(null);
      const newStartMin = Math.max(0, sliceStartMin + last.startMinDelta);
      const h = Math.floor(newStartMin / 60);
      const m = newStartMin % 60;
      const scheduledFor = `${dayYMD}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const durN = last.durationMin;
      applyTaskState(task.id, (s) =>
        taskSetSchedule(taskSetPlannedMin(s, { minutes: durN }), { scheduledFor, scheduledDurationMin: durN }),
      );
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Sub-header nav handlers — step a day in day view, a week otherwise.
  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: addDays(baseYMD, -dayCount) });
  };
  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: addDays(baseYMD, dayCount) });
  };

  const reactFlow = useReactFlow();

  // Recenter the canvas on a task's node — restored as an explicit popup action
  // (was previously a right-click side-effect on the block; the right-click is
  // now the overlap picker, so jump-to-node moved into the task info popup).
  const jumpToTaskNode = (taskId: string) => {
    const board = useBoardStore.getState().board;
    const taskNode = board?.nodes.find((n) => n.id === taskId);
    if (taskNode) {
      reactFlow.setCenter(taskNode.position.x + 110, taskNode.position.y + 80, { duration: 400, zoom: 0.9 });
    }
  };

  // Apply a pure TaskState transform to a task node, push history, and persist.
  // Dispatches via the store directly (not commandDispatch) to keep this heavy
  // module out of the calendar/clock render graph — importing it statically blew
  // render-only tests past their 5s timeout.
  const applyTaskState = (taskId: string, fn: (s: TaskState) => TaskState) => {
    const st = useBoardStore.getState();
    const node = st.board?.nodes.find((n) => n.id === taskId);
    if (!node || node.kind !== 'todo.task') return;
    st.updateNode(taskId, { state: fn(node.state as TaskState) });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  };

  // #12 — delete a tracked-reality segment by id (history-pushed → undoable;
  // analytics reads history live so it vanishes there too).
  const deleteRealitySegment = (segId: string) => {
    const st = useBoardStore.getState();
    const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
    if (!pomo) return;
    st.updateNode(pomo.id, { state: pomoDeleteSegment(pomo.state as PomoState, { id: segId }) });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  };

  // Plan vs reality — change which task a recorded span counts toward.
  const retagRealitySegment = (segId: string, taskId: string | null) => {
    const st = useBoardStore.getState();
    const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
    if (!pomo) return;
    const task = taskId ? st.board?.nodes.find((n) => n.id === taskId) : undefined;
    st.updateNode(pomo.id, {
      state: pomoRetagSegment(pomo.state as PomoState, {
        id: segId,
        taskId,
        ...(task ? { label: (task.state as TaskState).text } : {}),
      }),
    });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  };

  // 60-second tick for "now" — used to gray out past task blocks (PR #122).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Issue #166 — while a pomo session is live, the tracked block must grow in
  // real time. 1-second cursor that only runs when a segment is in-flight.
  const isLive = useBoardStore((s) => pomoIsLive(s.board));
  const [liveMs, setLiveMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isLive) return;
    setLiveMs(Date.now());
    const id = setInterval(() => setLiveMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Issue #166 — tracked REALITY blocks per day (work + break spans the pomo
  // actually recorded + the live in-flight span). Filled, drawn ON TOP of the
  // hour grid, distinct from scheduled event blocks. Same-day clipping only
  // (a span crossing midnight is clamped to its start day for now).
  const realityByDay = useBoardStore(
    useShallow((s) => {
      const segs = selectPomoReality(s.board, liveMs);
      const map = new Map<string, Array<{
        id: string; kind: 'work' | 'break'; taskId: string | null;
        startMin: number; endMin: number; live: boolean;
        startMs: number; endMs: number;
      }>>();
      for (const seg of segs) {
        // Split a span that crosses midnight into one piece per day.
        let cursor = seg.startMs;
        for (let guard = 0; guard < 14 && cursor < seg.endMs; guard++) {
          const d = new Date(cursor);
          const ymd = toYMD(d);
          const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
          const pieceEnd = Math.min(seg.endMs, dayEnd);
          const startMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
          const endMin = Math.min(1440, startMin + Math.max(1, (pieceEnd - cursor) / 60_000));
          const arr = map.get(ymd) ?? [];
          arr.push({ id: seg.id, kind: seg.kind, taskId: seg.taskId, startMin, endMin, live: seg.live, startMs: seg.startMs, endMs: seg.endMs });
          map.set(ymd, arr);
          cursor = pieceEnd;
        }
      }
      return map;
    }),
  );

  // Plan vs reality — tracked seconds per task (tagged pomo work spans), used
  // to flag an overrun on the planned block.
  const pomoNodeForTracked = useBoardStore(selectPomoNode);
  const trackedByTask = useMemo(
    () => trackedSecondsByTask(pomoOnlyBoard(pomoNodeForTracked), liveMs),
    [pomoNodeForTracked, liveMs],
  );

  // Open root tasks a reality span can be retagged to.
  const retagOptions = useBoardStore(
    useShallow((s) =>
      (s.board?.nodes ?? [])
        .filter((n) => n.kind === 'todo.task' && (n.state as TaskState).parentTaskId === null)
        .map((n) => `${n.id}\u0000${(n.state as TaskState).text}`),
    ),
  );

  // #168/#172 — when a drop lands later than requested (the chain pushes a
  // task after its predecessor), say so instead of silently moving it.
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!pushNotice) return;
    const id = setTimeout(() => setPushNotice(null), 4500);
    return () => clearTimeout(id);
  }, [pushNotice]);
  const scheduleTask = (taskId: string, scheduledFor: string, scheduledDurationMin: number) => {
    onCommand('calendar.schedule', { taskId, scheduledFor, scheduledDurationMin });
    const board = useBoardStore.getState().board;
    const placed = board ? selectSchedule(board).placements.get(taskId) : undefined;
    if (placed && placed.startISO.slice(0, 16) !== scheduledFor.slice(0, 16)) {
      const task = board?.nodes.find((n) => n.id === taskId);
      const name = task ? (task.state as TaskState).text : 'Task';
      setPushNotice(`“${name}” placed at ${placed.startISO.slice(11, 16)} — after the task before it in its chain`);
    }
  };

  // Popup shown when a task block is clicked (PR #122).
  const [taskPopup, setTaskPopup] = useState<{
    task: ScheduledTask;
    x: number;
    y: number;
  } | null>(null);

  // #6/#7 — a tracked-reality segment with the day it was clipped to, used by
  // the reality info popup (when it started / ended / duration).
  type RealitySeg = {
    id: string; kind: 'work' | 'break'; taskId: string | null;
    startMin: number; endMin: number; live: boolean; startMs: number; endMs: number;
  };
  // #7 — exact-time editor fields inside the task popup (seeded when it opens).
  const [exactTime, setExactTime] = useState('');
  const [exactDur, setExactDur] = useState('');
  useEffect(() => {
    if (!taskPopup) return;
    const d = new Date(taskPopup.task.startISO);
    setExactTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setExactDur(String(taskPopup.task.scheduledDurationMin));
  }, [taskPopup]);

  // #7 — apply the typed exact time + duration to the task (bypasses the grid
  // snap entirely → solves the "only 15-min grid" complaint). #4 — unschedule
  // pulls the task off the calendar. Both dispatch to the TASK node.
  const applyExactTime = (task: ScheduledTask) => {
    const day = task.startISO.slice(0, 10);
    const m = /^(\d{1,2}):(\d{2})$/.exec(exactTime.trim());
    const h = m ? Math.min(23, Math.max(0, parseInt(m[1]!, 10))) : new Date(task.startISO).getHours();
    const min = m ? Math.min(59, Math.max(0, parseInt(m[2]!, 10))) : 0;
    const durN = Math.max(1, Math.round(Number(exactDur) || task.scheduledDurationMin));
    const scheduledFor = `${day}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    applyTaskState(task.id, (s) =>
      taskSetSchedule(taskSetPlannedMin(s, { minutes: durN }), { scheduledFor, scheduledDurationMin: durN }),
    );
  };
  const unscheduleTask = (taskId: string) => {
    applyTaskState(taskId, (s) => taskSetSchedule(s, { scheduledFor: null }));
  };

  // #6 — info popup for a clicked tracked-reality (pomo) segment.
  const [realityPopup, setRealityPopup] = useState<{ seg: RealitySeg; x: number; y: number } | null>(null);
  // #7 — overlap disambiguation. A right-click enumerates EVERY layer under the
  // cursor (scheduled task blocks + tracked-reality segments) into one picker so
  // the user can choose which to act on even when they cover the same minute.
  type LayerItem =
    | { kind: 'task'; task: ScheduledTask }
    | { kind: 'reality'; seg: RealitySeg };
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; items: LayerItem[] } | null>(null);

  // ADR 0003 §4 — read placements from the cascade selector, not raw
  // scheduledFor. The selector derives successor start times from the chain's
  // single anchor; WeekView no longer cares which task is the anchor for
  // rendering, only the resulting placements.
  const weekRangeFromISO = `${baseYMD}T00:00`;
  const weekRangeToISO = `${addDays(baseYMD, dayCount)}T00:00`;
  const scheduledTasks = useBoardStore(
    useShallow((s): ScheduledTask[] => {
      if (!s.board) return [];
      const placements = selectScheduledTasksForRange(
        s.board,
        weekRangeFromISO,
        weekRangeToISO,
      );
      const out: ScheduledTask[] = [];
      for (const p of placements) {
        const node = s.board.nodes.find((n) => n.id === p.taskId);
        if (!node || node.kind !== 'todo.task') continue;
        const st = node.state as TaskState;
        if ((st.kind ?? 'focus') !== 'event') continue;
        const plannedMin = st.plannedMin ?? st.durationMin ?? 25;
        // Decision 28: block duration comes from placement endISO - startISO
        // (effectiveMin for focus tasks, which already includes breaks).
        // For event tasks and legacy cases, fall back to plannedMin.
        const startMs = new Date(p.startISO).getTime();
        const endMs = new Date(p.endISO).getTime();
        const blockDurationMin =
          Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
            ? Math.round((endMs - startMs) / 60_000)
            : plannedMin;
        out.push({
          id: p.taskId,
          text: typeof st.text === 'string' ? st.text : '',
          startISO: p.startISO,
          done: st.done === true,
          scheduledDurationMin: blockDurationMin,
          plannedMin,
          isAnchor: p.isAnchor,
          kind: p.kind,
          breakdown: p.breakdown,
        });
      }
      return out;
    }),
  );

  // Read scheduled habits from the board store (ADR 0002 §6).
  const scheduledHabits = useBoardStore(
    useShallow((s): ScheduledHabit[] => {
      if (!s.board) return [];
      const result: ScheduledHabit[] = [];
      for (const n of s.board.nodes) {
        if (n.kind !== 'habit') continue;
        const habitState = n.state as { habits?: Habit[] } | null;
        if (!habitState?.habits) continue;
        for (const h of habitState.habits) {
          if (h.archived || !h.schedule) continue;
          result.push({
            id: h.id,
            name: h.name,
            color: h.color,
            icon: h.icon,
            schedule: h.schedule,
          });
        }
      }
      return result;
    }),
  );

  // Build a map from YYYY-MM-DD → TaskSlice[], splitting any task whose
  // duration crosses midnight into one slice per affected day.
  const slicesByDay = useMemo(() => {
    const map = new Map<string, TaskSlice[]>();
    const weekSet = new Set(weekDays);
    for (const task of scheduledTasks) {
      const startDayYMD = task.startISO.slice(0, 10);
      const [hStr, mStr] = task.startISO.slice(11, 16).split(':');
      const startMinOfDay =
        (parseInt(hStr ?? '0', 10)) * 60 + (parseInt(mStr ?? '0', 10));
      let remainingMin = Math.max(1, task.scheduledDurationMin);
      let currentDayYMD = startDayYMD;
      let sliceStart = startMinOfDay;
      let isContinuation = false;
      // Hard safety cap — a single task should never span more than 14 days.
      for (let i = 0; i < 14 && remainingMin > 0; i++) {
        const dayCapacity = 1440 - sliceStart;
        const sliceLen = Math.min(remainingMin, dayCapacity);
        const sliceEnd = sliceStart + sliceLen;
        const hasContinuation = sliceLen < remainingMin;
        if (weekSet.has(currentDayYMD)) {
          const slice: TaskSlice = {
            task,
            sliceStartMin: sliceStart,
            sliceEndMin: sliceEnd,
            isContinuation,
            hasContinuation,
          };
          const arr = map.get(currentDayYMD);
          if (arr) arr.push(slice);
          else map.set(currentDayYMD, [slice]);
        }
        remainingMin -= sliceLen;
        sliceStart = 0;
        isContinuation = true;
        currentDayYMD = addDays(currentDayYMD, 1);
      }
    }
    return map;
  }, [scheduledTasks, weekDays]);

  // Open scrolled to where the day happens — 90 min before now when today is
  // shown, else the earliest planned block in view — instead of midnight.
  // Runs once per shown range so it never fights the user's own scrolling.
  const autoScrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const el = gridBodyRef.current;
    const key = `${baseYMD}:${dayCount}`;
    if (!el || autoScrolledFor.current === key) return;
    autoScrolledFor.current = key;
    let target = 8 * 60;
    let found = false;
    for (const ymd of weekDays) {
      for (const sl of slicesByDay.get(ymd) ?? []) {
        if (!found || sl.sliceStartMin < target) target = sl.sliceStartMin;
        found = true;
      }
    }
    const todayYmd = todayYMD();
    if (weekDays.includes(todayYmd)) {
      const now = new Date();
      // Today: start a little before now (what's next matters most).
      target = Math.max(0, now.getHours() * 60 + now.getMinutes() - 90);
    }
    el.scrollTop = Math.max(0, ((target - 20) / 60) * rowHeight);
  }, [baseYMD, dayCount, weekDays, slicesByDay, rowHeight]);

  // Whether any task is scheduled this week (controls empty-state hint).
  const hasTasksThisWeek = slicesByDay.size > 0;

  // Column width fallback for NowLine.
  const NOMINAL_COLUMN_WIDTH = 40;

  // ── HabitSwapModal for habit drops (ADR 0002 A1) ────────────────────────────

  // swapModal: set when a habit is dropped onto a cell; cleared on confirm/cancel.
  // Snapshots drop context at drop time because `dragend` fires after `drop`
  // and clears the habitDrag singleton — the payload must be captured here.
  const [swapModal, setSwapModal] = useState<{
    dayYMD: string;
    hour: number;
    habit: HabitDragPayload;
    isoDow: IsoDow;
  } | null>(null);

  const dispatchSchedule = useCallback(
    (
      kind: HabitScheduleKind,
      cell: { dayYMD: string; hour: number },
      habit: HabitDragPayload,
      timeOfDay: string,
      durationMin: number,
    ) => {
      const isoDow = ymdToIsoDow(cell.dayYMD);
      const schedule: HabitSchedule =
        kind === 'daily'
          ? { kind: 'daily', timeOfDay, durationMin }
          : { kind: 'weekly', timeOfDay, days: [isoDow], durationMin };
      onCommand('calendar.scheduleHabit', {
        habitId: habit.habitId,
        habitMotherId: habit.habitMotherId,
        schedule,
      });
    },
    [onCommand],
  );

  // Resolve the habit record and mother-node index for the HabitSwapModal header.
  // Reads directly from store state — no re-render subscription needed since
  // the modal is only mounted momentarily after a drop.
  function resolveHabitMeta(
    habitId: string,
    habitMotherId: string,
  ): { habitRecord: Habit | null; habitIndex: number } {
    const board = useBoardStore.getState().board;
    if (!board) return { habitRecord: null, habitIndex: 0 };
    const motherNode = board.nodes.find((n) => n.id === habitMotherId);
    if (!motherNode || motherNode.kind !== 'habit') return { habitRecord: null, habitIndex: 0 };
    const habitState = motherNode.state as { habits?: Habit[] };
    const habits = habitState.habits ?? [];
    const idx = habits.findIndex((h) => h.id === habitId);
    return {
      habitRecord: idx >= 0 ? (habits[idx] ?? null) : null,
      habitIndex: idx,
    };
  }

  // ── Drop target handler factory (ADR 0002 A1) ──────────────────────────────

  function makeCellHandlers(dayYMD: string, hour: number) {
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        const types = e.dataTransfer.types;

        // A1: habit MIME — only prevent default + highlight. Do NOT open chooser.
        if (types.includes('application/krnl-habit')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          e.currentTarget.setAttribute('data-drop-target', 'true');
          return;
        }

        if (!types.includes('application/krnl-task')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // #8 — instead of lighting the whole hour cell, track the exact snapped
        // slot under the cursor and render a thin band there (see snapPreview).
        const rect = e.currentTarget.getBoundingClientRect();
        const rectH = rect.height > 0 ? rect.height : rowHeight;
        const within = Math.max(0, Math.min(59, Math.floor(((Number.isFinite(e.clientY) ? e.clientY : 0) - rect.top) / rectH * 60)));
        const minute = hour * 60 + Math.floor(within / gran) * gran;
        setSnapPreview((p) => (p && p.dayYMD === dayYMD && p.minute === minute ? p : { dayYMD, minute }));
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        e.currentTarget.removeAttribute('data-drop-target');
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.removeAttribute('data-drop-target');
        setSnapPreview(null);

        // A1: habit drop — capture cell context AND habit payload at drop time,
        // then open HabitSwapModal. We snapshot the habit here because `dragend`
        // (which clears the habitDrag singleton) fires AFTER drop but BEFORE the
        // user can click a card to confirm.
        if (e.dataTransfer.types.includes('application/krnl-habit')) {
          const habit = getHabitDrag();
          if (!habit) return;
          setSwapModal({
            dayYMD,
            hour,
            habit,
            isoDow: ymdToIsoDow(dayYMD),
          });
          return;
        }

        const raw = e.dataTransfer.getData('application/krnl-task');
        if (!raw) return;
        const payload = JSON.parse(raw) as {
          taskId?: string;
          itemId?: string;
          durationMin: number;
        };
        if (!payload.taskId) return;
        // #11 — snap to the zoom-driven granularity (60/30/15/5), not a fixed 15.
        // Guard against jsdom (clientY undefined, rect.height = 0) so the
        // computed minute is always a finite integer in [0, 60-gran].
        const rect = e.currentTarget.getBoundingClientRect();
        const clientY = Number.isFinite(e.clientY) ? e.clientY : 0;
        const rectTop = Number.isFinite(rect.top) ? rect.top : 0;
        const rectH = rect.height > 0 ? rect.height : 60;
        const relY = Math.max(0, clientY - rectTop);
        const minuteRaw = Math.floor((relY / rectH) * 60);
        const safeMinute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
        const snappedMinute = Math.max(0, Math.min(60 - gran, Math.floor(safeMinute / gran) * gran));
        const scheduledFor = `${dayYMD}T${String(hour).padStart(2, '0')}:${String(snappedMinute).padStart(2, '0')}`;
        scheduleTask(payload.taskId, scheduledFor, payload.durationMin);
        // 240ms acid flash.
        e.currentTarget.classList.add('calendar-cell--just-dropped');
        const el = e.currentTarget;
        setTimeout(() => el.classList.remove('calendar-cell--just-dropped'), 240);
      },
    };
  }

  // ── Overlap disambiguation (#6 / #7) ────────────────────────────────────────
  // A right-click on a day column enumerates EVERY layer under the cursor —
  // scheduled task blocks AND tracked-reality (pomo) segments — into a single
  // picker. This solves both "let me click a pomo section for its info" (#6)
  // and "a task and a pomo section overlap, how do I select one" (#7) with one
  // interaction, instead of fighting z-index. Left-click on a task block keeps
  // its existing direct-open behaviour.
  function handleColumnContextMenu(dayYMD: string, e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = Math.max(0, e.clientY - rect.top);
    const minute = (relY / rowHeight) * 60;

    const items: LayerItem[] = [];
    // Task slices covering this minute on this day.
    for (const slice of slicesByDay.get(dayYMD) ?? []) {
      if (minute >= slice.sliceStartMin && minute < slice.sliceEndMin) {
        items.push({ kind: 'task', task: slice.task });
      }
    }
    // Tracked-reality segments covering this minute on this day.
    for (const seg of realityByDay.get(dayYMD) ?? []) {
      if (minute >= seg.startMin && minute < seg.endMin) {
        items.push({ kind: 'reality', seg });
      }
    }
    if (items.length === 0) return;

    // Single hit → act directly, no picker noise.
    if (items.length === 1) {
      const only = items[0]!;
      if (only.kind === 'task') setTaskPopup({ task: only.task, x: e.clientX, y: e.clientY });
      else setRealityPopup({ seg: only.seg, x: e.clientX, y: e.clientY });
      return;
    }
    setLayerMenu({ x: e.clientX, y: e.clientY, items });
  }

  // ── Task block renderer ─────────────────────────────────────────────────────

  function renderTaskBlocks(dayYMD: string) {
    const slices = slicesByDay.get(dayYMD);
    if (!slices || slices.length === 0) return null;

    const rawLayout = computeColumnLayout(slices, (MIN_BLOCK_PX / rowHeight) * 60);

    // Only as many parallel lanes as fit at a readable width (~80px); the
    // rest of a busy cluster collapses into a "+N" chip in the last lane
    // that lists them. Narrow week columns (<2 readable lanes) keep slivers.
    const colPxAll = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
    const maxLanes = Math.floor((colPxAll - Math.min(6, colPxAll * 0.1)) / 80);
    const colLayout = new Map<string, { colIndex: number; colCount: number; span: number }>();
    const hiddenSlices: TaskSlice[] = [];
    for (const sl of slices) {
      const pl = rawLayout.get(sl.task.id) ?? { colIndex: 0, colCount: 1, span: 1 };
      if (maxLanes >= 2 && pl.colCount > maxLanes) {
        if (pl.colIndex >= maxLanes - 1) hiddenSlices.push(sl);
        else colLayout.set(sl.task.id, { colIndex: pl.colIndex, colCount: maxLanes, span: Math.min(pl.span, maxLanes - 1 - pl.colIndex) });
      } else {
        colLayout.set(sl.task.id, pl);
      }
    }
    const hiddenIds = new Set(hiddenSlices.map((sl) => sl.task.id));

    // Group hidden slices that overlap in time → one chip per group.
    const groups: TaskSlice[][] = [];
    for (const sl of [...hiddenSlices].sort((a, b) => a.sliceStartMin - b.sliceStartMin)) {
      const last = groups[groups.length - 1];
      const lastEnd = last ? Math.max(...last.map((x) => x.sliceEndMin)) : -1;
      if (last && sl.sliceStartMin < lastEnd) last.push(sl);
      else groups.push([sl]);
    }
    const overflowChips = groups.map((g) => {
      const start = g[0]!.sliceStartMin;
      return (
        <button
          key={`overflow-${g[0]!.task.id}`}
          type="button"
          data-testid="calendar-overflow-chip"
          title={g.map((x) => x.task.text).join(', ')}
          onClick={(e) => {
            e.stopPropagation();
            setLayerMenu({ x: e.clientX, y: e.clientY, items: g.map((x) => ({ kind: 'task' as const, task: x.task })) });
          }}
          style={{
            position: 'absolute',
            top: (start / 60) * rowHeight,
            left: `calc(${rail} + (100% - ${rail}) * ${(maxLanes - 1) / maxLanes} + 4px)`,
            right: 3,
            height: Math.max(20, Math.min(28, rowHeight / 2)),
            zIndex: 3,
            border: '1px solid var(--paper-3)',
            borderRadius: 4,
            background: 'var(--paper-2)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          {g.slice(0, 3).map((x) => (
            <span key={x.task.id} aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: toneVarForTask(x.task.id) }} />
          ))}
          +{g.length}
        </button>
      );
    });

    const blocks = slices.filter((sl) => !hiddenIds.has(sl.task.id)).map((slice) => {
      const { task, sliceStartMin, sliceEndMin, isContinuation, hasContinuation } = slice;

      // #7 — apply a live resize draft (if this block is being dragged) so it
      // grows/shrinks under the cursor before the commit on mouse-up.
      const draft = resizeDraft && resizeDraft.taskId === task.id ? resizeDraft : null;
      const effStartMin = sliceStartMin + (draft?.startMinDelta ?? 0);
      const effLenMin = draft ? draft.durationMin : Math.max(1, sliceEndMin - sliceStartMin);

      // Convert minutes-from-midnight to grid-row offsets (rowHeight per hour).
      const topPx = (effStartMin / 60) * rowHeight;
      const sliceLen = effLenMin;
      const heightPx = Math.max(MIN_BLOCK_PX, (sliceLen / 60) * rowHeight);
      // Resize handles only on a self-contained head block (no cross-midnight).
      const resizable = !isContinuation && !hasContinuation;

      // Side-by-side layout inside the plan area (right of the reality rail):
      // equal columns per overlap cluster, widened over free columns.
      const { colIndex, colCount, span } = colLayout.get(task.id) ?? { colIndex: 0, colCount: 1, span: 1 };
      const leftFrac = colIndex / colCount;
      const rightFrac = (colCount - colIndex - span) / colCount;

      // Gray out if done OR if the WHOLE scheduled task has finished (not just
      // this slice — a multi-day task should not gray out the morning slice
      // while it's still running in the evening of the prior day).
      const scheduledEndMs =
        new Date(task.startISO).getTime() + task.scheduledDurationMin * 60_000;
      const isPast = scheduledEndMs <= nowMs;
      // #171 — completed and overrun must read differently. Done tasks get a
      // ✓ badge (and the grey treatment); overrun = scheduled time elapsed but
      // never marked done, which stays greyed-only with no checkmark.
      // Plan vs reality: done (✓), missed (planned time passed, still open)
      // and overrun (more tracked than planned) each read differently.
      const isDone = task.done;
      const isMissed = isPast && !task.done;
      const isGrayed = isDone;
      const trackedMin = (trackedByTask.get(task.id) ?? 0) / 60;
      const overrunMin = Math.round(trackedMin - task.plannedMin);
      // Labels show the task's real start/end, not this day's slice edges
      // (a 22:30–01:00 block must not read "22:30–00:00").
      const taskStartDate = new Date(task.startISO);
      const blockStartMin = draft
        ? effStartMin
        : taskStartDate.getHours() * 60 + taskStartDate.getMinutes();
      const blockEndMin = blockStartMin + (draft ? effLenMin : task.scheduledDurationMin);

      const handleBlockDragStart = (e: DragEvent<HTMLDivElement>) => {
        setTaskPopup(null);
        // BUGFIX: drag payload must carry WORK-time (plannedMin), not block
        // height. scheduledDurationMin on focus tasks is treated as work-time
        // override by the selector, which then adds breaks on top. Using the
        // block height (which already includes breaks) caused exponential
        // growth on every nudge.
        e.dataTransfer.setData(
          'application/krnl-task',
          JSON.stringify({ taskId: task.id, durationMin: task.plannedMin }),
        );
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(e.currentTarget, 0, 12);
      };

      // Only opt into being a drop target for TASK payloads. Habit drags are
      // ignored here so they bubble down to the underlying hour cell and
      // trigger the radial weekly/daily chooser.
      const handleBlockDragOver = (e: DragEvent<HTMLDivElement>) => {
        const t = e.dataTransfer.types;
        let isTask = false;
        for (let i = 0; i < t.length; i++) {
          if (t[i] === 'application/krnl-task') { isTask = true; break; }
        }
        if (!isTask) return; // fall through to cell
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      };

      const handleDropOnBlock = (e: DragEvent<HTMLDivElement>) => {
        const t = e.dataTransfer.types;
        let isTask = false;
        for (let i = 0; i < t.length; i++) {
          if (t[i] === 'application/krnl-task') { isTask = true; break; }
        }
        if (!isTask) return;
        e.preventDefault();
        e.stopPropagation();
        const raw = e.dataTransfer.getData('application/krnl-task');
        if (!raw) return;
        const payload = JSON.parse(raw) as { taskId?: string; durationMin: number };
        if (!payload.taskId) return;

        // Snap to the 15-min slot under the cursor within THIS block.
        // Works for both self-drop (nudge within own span) and other-drop
        // (place a second task at any slot inside this block's window — at
        // the exact same start the two render as a parallel pair, at a
        // different start they run consecutively / overlap partially).
        // Guarded against jsdom (clientY/rect.top undefined → NaN propagation).
        const rect = e.currentTarget.getBoundingClientRect();
        const clientY = Number.isFinite(e.clientY) ? e.clientY : 0;
        const rectTop = Number.isFinite(rect.top) ? rect.top : 0;
        const relY = Math.max(0, clientY - rectTop);
        const minutesIntoBlock = (relY / rowHeight) * 60;
        const absMinute = sliceStartMin + (Number.isFinite(minutesIntoBlock) ? minutesIntoBlock : 0);
        const snappedMin = Math.max(
          0,
          Math.min(1440 - gran, Math.floor(absMinute / gran) * gran),
        );
        const hour = Math.floor(snappedMin / 60);
        const minute = snappedMin % 60;
        scheduleTask(
          payload.taskId,
          `${dayYMD}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          payload.durationMin,
        );
      };

      const handleBlockClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        setTaskPopup({ task, x: e.clientX, y: e.clientY });
      };

      // Visual cue: continuation slices are clipped flat on the top edge,
      // slices that continue past midnight are clipped flat on the bottom.
      const borderTopLeftRadius = isContinuation ? 0 : 4;
      const borderTopRightRadius = isContinuation ? 0 : 4;
      const borderBottomLeftRadius = hasContinuation ? 0 : 4;
      const borderBottomRightRadius = hasContinuation ? 0 : 4;

      // Decision 28 §6 — break tail sub-region.
      // Render only when kind==='focus' AND breakdown.breakMin > 0.
      // §8: zero-breakMin → no DOM (not even a zero-height node, which would
      // produce a visible 1px hairline from the border).
      const breakdown = task.breakdown;
      const showTail =
        task.kind === 'focus' &&
        breakdown !== null &&
        breakdown.breakMin > 0 &&
        breakdown.effectiveMin > 0;

      // Per-task tone — shared palette with Clock + Todo so users can link
      // the same task visually across surfaces.
      const taskTone = toneVarForTask(task.id);
      // How much text fits: measured column width × this block's lanes.
      // Unmeasured (tests / first paint) counts as roomy.
      const colPx = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
      const railNum = Math.min(6, colPx * 0.1);
      const widthPx = ((colPx - railNum) * span) / colCount - 3;
      const detail: 'none' | 'title' | 'full' =
        widthPx < 34 || heightPx < 14 ? 'none' : widthPx < 110 || heightPx < 32 ? 'title' : 'full';

      return (
        <div
          key={`${task.id}-${isContinuation ? 'cont' : 'head'}`}
          data-testid={`task-block-${task.id}${isContinuation ? '-cont' : ''}`}
          draggable={!isContinuation}
          onDragStart={isContinuation ? undefined : handleBlockDragStart}
          onDragOver={handleBlockDragOver}
          onDrop={handleDropOnBlock}
          onClick={handleBlockClick}
          data-plan-state={isDone ? 'done' : isMissed ? 'missed' : 'planned'}
          title={
            `${task.text} · ${fmtMinOfDay(blockStartMin)}–${fmtMinOfDay(blockEndMin)} · plan ${fmtDur(task.plannedMin)}` +
            (trackedMin > 0 ? ` · tracked ${fmtDur(trackedMin)}` : '') +
            (isMissed ? ' · missed' : '') +
            (isContinuation ? ' (continued from previous day)' : '')
          }
          style={{
            position: 'absolute',
            top: topPx,
            left: `calc(${rail} + (100% - ${rail}) * ${leftFrac} + 4px)`,
            right: `calc((100% - ${rail}) * ${rightFrac} + 3px)`,
            height: heightPx,
            // Calm by default: a tinted card with a solid colour edge. Done
            // fades; missed is a lighter tint; overrun is a rust strip on the
            // right edge (drawn below) — states that survive any block size.
            background: `color-mix(in srgb, ${taskTone} ${isMissed ? 12 : 24}%, var(--paper))`,
            borderLeft: `3px solid ${taskTone}`,
            borderTopLeftRadius,
            borderTopRightRadius,
            borderBottomLeftRadius,
            borderBottomRightRadius,
            cursor: isContinuation ? 'pointer' : 'grab',
            overflow: 'hidden',
            zIndex: 2,
            padding: detail === 'full' ? '3px 6px' : detail === 'title' ? '0 4px' : 0,
            opacity: isGrayed ? 0.45 : 1,
            boxShadow: '0 0 0 1px var(--paper), 0 1px 2px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            // A one-line title sits centred in short blocks instead of being
            // clipped at the top.
            justifyContent: detail === 'title' ? 'center' : 'flex-start',
            gap: 1,
          }}
        >
          {/* Continuation arrows — ↑ on continuation slices, ↓ on slices that
              spill into the next day. */}
          {isContinuation && detail !== 'none' && (
            <span
              style={{
                position: 'absolute',
                top: 1,
                left: 2,
                fontSize: 9,
                color: 'var(--acid)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              ↑
            </span>
          )}
          {hasContinuation && detail !== 'none' && (
            <span
              style={{
                position: 'absolute',
                bottom: 1,
                right: 2,
                fontSize: 9,
                color: 'var(--acid)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              ↓
            </span>
          )}
          {/* #171 — completed marker. A done task shows a ✓ so it reads as
              "finished" rather than just "greyed", distinguishing it from an
              overrun (elapsed-but-undone) block which carries no checkmark. */}
          {isDone && !isContinuation && detail === 'full' && (
            <span
              data-testid={`task-done-check-${task.id}`}
              style={{
                position: 'absolute',
                top: 1,
                right: 3,
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--acid)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              ✓
            </span>
          )}
          {/* Decision 28 §6 — work/break sub-regions.
              Only rendered when showTail is true (focus task with break time > 0).
              The entire block height is effectiveMin (workMin + breakMin).
              Top region = workMin fraction of blockHeight (task tone colour).
              Bottom region = breakMin fraction of blockHeight (paper-3 + tone border).
              §8: when breakMin === 0, showTail is false and no sub-region DOM is emitted. */}
          {showTail && breakdown !== null && (
            <>
              {/* Work region — overlays the top fraction of the block */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${(breakdown.workMin / breakdown.effectiveMin) * 100}%`,
                  background: isGrayed ? 'var(--paper-3)' : 'color-mix(in srgb, ' + taskTone + ' 22%, transparent)',
                  pointerEvents: 'none',
                }}
              />
              {/* Break tail — bottom fraction of the block.
                  Diagonal-stripe texture in the task tone so it reads as
                  "same task, not work" instead of "different colored block".
                  No more solid green/black/gray zones.
                  Long-break stripes are wider so the eye can still see the cadence. */}
              {(() => {
                const tailPct = (breakdown.breakMin / breakdown.effectiveMin) * 100;
                const hasLong = breakdown.segments.some((seg) => seg.kind === 'long');
                // Wider stripe spacing if a long break exists in this block.
                const stripeSize = hasLong ? 10 : 6;
                return (
                  <div
                    data-testid="calendar-task-break-tail"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${tailPct}%`,
                      borderTop: `1px dashed ${taskTone}`,
                      pointerEvents: 'none',
                      backgroundImage: `repeating-linear-gradient(135deg, ${taskTone} 0 1px, transparent 1px ${stripeSize}px)`,
                      opacity: 0.6,
                    }}
                  />
                );
              })()}
            </>
          )}
          {/* Label — only what fits (see `detail`). Everything else is in the
              hover title and the click popup. */}
          {detail !== 'none' && (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: detail === 'full' ? 11.5 : 10,
                fontWeight: 600,
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
                minWidth: 0,
                paddingLeft: isContinuation ? 10 : 0,
                paddingRight: isDone && detail === 'full' ? 12 : 0,
                pointerEvents: 'none',
                position: 'relative',
                zIndex: 1,
                lineHeight: 1.2,
              }}
            >
              {task.text}
            </span>
          )}
          {detail === 'full' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none', position: 'relative', zIndex: 1 }}>
              {fmtMinOfDay(blockStartMin)}–{fmtMinOfDay(blockEndMin)}
              {overrunMin > 0
                ? <span data-testid={`task-overrun-${task.id}`} style={{ color: 'var(--rust)', fontWeight: 700 }}> · +{fmtDur(overrunMin)} over</span>
                : trackedMin > 0 ? ` · ${fmtDur(trackedMin)} tracked` : ''}
            </span>
          )}
          {/* Overrun at any size: a rust strip on the right edge. */}
          {overrunMin > 0 && !isContinuation && (
            <span
              aria-hidden
              data-testid={detail === 'full' ? undefined : `task-overrun-${task.id}`}
              style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 3, background: 'var(--rust)', pointerEvents: 'none', zIndex: 1 }}
            />
          )}
          {/* #7 — resize handles: drag the top edge to move the start, the
              bottom edge to change the duration. Snapped to granularity. */}
          {resizable && (
            <>
              <div
                data-testid={`task-resize-top-${task.id}`}
                onMouseDown={(e) => startResize('top', task, sliceStartMin, Math.max(1, sliceEndMin - sliceStartMin), e)}
                style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 3 }}
              />
              <div
                data-testid={`task-resize-bottom-${task.id}`}
                onMouseDown={(e) => startResize('bottom', task, sliceStartMin, Math.max(1, sliceEndMin - sliceStartMin), e)}
                style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 3 }}
              />
            </>
          )}
        </div>
      );
    });
    return [...blocks, ...overflowChips];
  }

  // ── Agenda (narrow day view) ────────────────────────────────────────────────
  // One full-width row per planned task / habit in time order, a "now"
  // divider, and a compact day strip on top (plan line + what the pomo
  // recorded). Parallel tasks are just consecutive rows with a pill — nothing
  // is ever squeezed side by side.
  function renderAgenda(dayYMD: string) {
    type Item = {
      key: string; taskId: string | null; title: string; tone: string;
      startMin: number; endMin: number; done: boolean; missed: boolean;
      plannedMin: number; trackedMin: number; habit: boolean; task?: ScheduledTask;
      /** Real end (minutes from this day's midnight; may exceed 1440). */
      endLabelMin: number;
    };
    const items: Item[] = [];
    for (const sl of slicesByDay.get(dayYMD) ?? []) {
      const t = sl.task;
      const endMs = new Date(t.startISO).getTime() + t.scheduledDurationMin * 60_000;
      items.push({
        key: t.id, taskId: t.id, title: t.text, tone: toneVarForTask(t.id),
        startMin: sl.sliceStartMin, endMin: sl.sliceEndMin, done: t.done,
        missed: !t.done && endMs <= nowMs, plannedMin: t.plannedMin,
        trackedMin: (trackedByTask.get(t.id) ?? 0) / 60, habit: false, task: t,
        endLabelMin: sl.isContinuation ? sl.sliceEndMin : sl.sliceStartMin + t.scheduledDurationMin,
      });
    }
    const isoDow = ymdToIsoDow(dayYMD);
    for (const h of scheduledHabits) {
      if (!habitScheduledOnDow(h.schedule, isoDow)) continue;
      const [hh, mm] = h.schedule.timeOfDay.split(':').map((x) => parseInt(x, 10));
      const start = (hh ?? 0) * 60 + (mm ?? 0);
      const dur = h.schedule.durationMin ?? 30;
      items.push({
        key: `habit-${h.id}`, taskId: null, title: h.name, tone: `var(--${h.color})`,
        startMin: start, endMin: start + dur, done: false, missed: false,
        plannedMin: dur, trackedMin: 0, habit: true, endLabelMin: start + dur,
      });
    }
    items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    const isToday = dayYMD === todayYMD();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const reality = realityByDay.get(dayYMD) ?? [];
    const trackedDayMin = reality.filter((r) => r.kind === 'work').reduce((a, r) => a + (r.endMin - r.startMin), 0);
    const plannedDayMin = items.filter((i) => !i.habit).reduce((a, i) => a + (i.endMin - i.startMin), 0);

    // Day strip window: from the earliest item/reality (or 06:00) to 24:00.
    const first = Math.min(6 * 60, ...items.map((i) => i.startMin), ...reality.map((r) => r.startMin));
    const stripStart = Math.floor(first / 60) * 60;
    const stripLen = 1440 - stripStart;
    const pct = (m: number) => `${((Math.max(stripStart, Math.min(1440, m)) - stripStart) / stripLen) * 100}%`;
    const widthPct = (a: number, b: number) => `${((Math.min(1440, b) - Math.max(stripStart, a)) / stripLen) * 100}%`;

    const parallelCount = (it: Item) =>
      items.filter((o) => o !== it && !o.habit && !it.habit && o.startMin < it.endMin && it.startMin < o.endMin).length;

    const dropAfter = (it: Item | null) => (e: DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData('application/krnl-task');
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = JSON.parse(raw) as { taskId?: string; durationMin: number };
      if (!payload.taskId) return;
      const base = it ? it.endMin : Math.ceil((isToday ? nowMin : 9 * 60) / 15) * 15;
      const m = Math.min(1440 - 15, base);
      scheduleTask(payload.taskId, `${dayYMD}T${fmtMinOfDay(m)}`, payload.durationMin);
    };
    const allowDrop = (e: DragEvent<HTMLDivElement>) => {
      if (Array.from(e.dataTransfer.types).includes('application/krnl-task')) e.preventDefault();
    };

    const rows: ReactNode[] = [];
    let nowPlaced = !isToday;
    const nowDivider = (
      <div
        key="now"
        data-testid="agenda-now"
        ref={(el) => {
          // Open today's list at "now" once per shown day.
          if (el && agendaScrolledFor.current !== dayYMD) {
            agendaScrolledFor.current = dayYMD;
            el.scrollIntoView?.({ block: 'center' });
          }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--rust)' }}>{fmtMinOfDay(nowMin)}</span>
        <span style={{ flex: 1, height: 2, background: 'var(--rust)', borderRadius: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--rust)', letterSpacing: '0.08em' }}>NOW</span>
      </div>
    );
    for (const it of items) {
      if (!nowPlaced && it.startMin > nowMin) { rows.push(nowDivider); nowPlaced = true; }
      const active = isToday && it.startMin <= nowMin && nowMin < it.endMin && !it.done;
      const over = Math.round(it.trackedMin - it.plannedMin);
      const par = parallelCount(it);
      rows.push(
        <div
          key={it.key}
          data-testid={`agenda-row-${it.key}`}
          draggable={!!it.task}
          onDragStart={(e) => {
            if (!it.task) return;
            e.dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId: it.task.id, durationMin: it.task.plannedMin }));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={allowDrop}
          onDrop={dropAfter(it)}
          onClick={(e) => { if (it.task) setTaskPopup({ task: it.task, x: e.clientX, y: e.clientY }); }}
          style={{
            display: 'grid', gridTemplateColumns: '42px 1fr', gap: 8, alignItems: 'start',
            padding: '7px 8px 7px 0', borderRadius: 6, cursor: it.task ? 'pointer' : 'default',
            background: active ? `color-mix(in srgb, ${it.tone} 14%, transparent)` : 'transparent',
            opacity: it.done ? 0.5 : 1,
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--acid)' : 'var(--ink)' }}>{fmtMinOfDay(it.startMin)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-4)' }}>{fmtMinOfDay(it.endLabelMin)}</div>
          </div>
          <div style={{ borderLeft: `3px solid ${it.tone}`, paddingLeft: 8, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25, wordBreak: 'break-word' }}>
              {it.done ? '✓ ' : ''}{it.title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-3)' }}>
              <span>{it.habit ? `habit · ${fmtDur(it.plannedMin)}` : `${fmtDur(it.plannedMin)} planned`}</span>
              {it.trackedMin > 0 && <span>· {fmtDur(it.trackedMin)} tracked</span>}
              {over > 0 && <span style={{ color: 'var(--rust)', fontWeight: 700 }}>+{fmtDur(over)} over</span>}
              {it.missed && <span style={{ color: 'var(--ink-4)' }}>· missed</span>}
              {par > 0 && (
                <span style={{ padding: '0 5px', borderRadius: 999, border: '1px solid var(--paper-3)', color: 'var(--ink-2)' }}>
                  overlaps {par}
                </span>
              )}
            </div>
          </div>
        </div>,
      );
    }
    if (!nowPlaced) rows.push(nowDivider);

    return (
      <div data-testid="calendar-agenda" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px 16px', position: 'relative' }}>
        {/* Day strip: plan line + reality line across the day */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-3)', marginBottom: 4 }}>
            <span>{fmtDur(plannedDayMin)} planned</span>
            <span style={{ color: 'var(--ink-2)' }}>{fmtDur(trackedDayMin)} tracked</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'var(--paper-2)', borderRadius: 2 }}>
            {items.filter((i) => !i.habit).map((i) => (
              <span key={`sp-${i.key}`} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(i.startMin), width: widthPct(i.startMin, i.endMin), background: i.tone, opacity: i.done ? 0.4 : 0.85, borderRadius: 1 }} />
            ))}
            {isToday && <span style={{ position: 'absolute', top: -2, bottom: -6, left: pct(nowMin), width: 2, background: 'var(--rust)' }} />}
          </div>
          <div style={{ position: 'relative', height: 4, marginTop: 2, background: 'var(--paper-2)', borderRadius: 2 }}>
            {reality.map((r, i) => (
              <span
                key={`sr-${r.id}-${i}`}
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: pct(r.startMin), width: widthPct(r.startMin, r.endMin),
                  background: r.kind === 'work' ? (r.taskId ? toneVarForTask(r.taskId) : 'var(--acid)') : 'transparent',
                  backgroundImage: r.kind === 'work' ? undefined : 'repeating-linear-gradient(135deg, var(--ink-3) 0 1px, transparent 1px 3px)',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-4)', marginTop: 3 }}>
            <span>{fmtMinOfDay(stripStart)}</span>
            <span>{fmtMinOfDay(stripStart + stripLen / 2)}</span>
            <span>24:00</span>
          </div>
        </div>

        <div onDragOver={allowDrop} onDrop={dropAfter(null)} style={{ minHeight: 40 }}>
          {items.length === 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', padding: '16px 4px' }}>
              Nothing planned. Drag a task here to plan it next.
            </div>
          )}
          {rows}
        </div>

        <button
          type="button"
          data-testid="calendar-show-grid"
          onClick={() => setLayoutPref('grid')}
          style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}
        >
          ▦ time grid
        </button>
      </div>
    );
  }

  // ── Tracked-reality rail (plan vs reality) ─────────────────────────────────
  // Reality gets its own rail on the left edge of each day column instead of a
  // full-width wash behind the plan (which was hard to tell apart from the
  // planned blocks). Work = solid, coloured by the task it is tagged with
  // (acid when untagged); break = hatched; a pause is a visible gap. Clicking a
  // span opens its info popup (times, retag, delete).
  function renderRealityBlocks(dayYMD: string) {
    const segs = realityByDay.get(dayYMD);
    if (!segs || segs.length === 0) return null;
    return segs.map((seg, i) => {
      const topPx = (seg.startMin / 60) * rowHeight;
      const heightPx = Math.max(3, ((seg.endMin - seg.startMin) / 60) * rowHeight);
      const isWork = seg.kind === 'work';
      const tone = isWork ? (seg.taskId ? toneVarForTask(seg.taskId) : 'var(--acid)') : 'var(--ink-3)';
      const minutes = Math.max(1, Math.round((seg.endMs - seg.startMs) / 60_000));
      const showLabel = false;
      return (
        <div
          key={`reality-${seg.id}-${i}`}
          data-testid="calendar-reality-block"
          data-reality-kind={seg.kind}
          data-reality-live={seg.live ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setRealityPopup({ seg, x: e.clientX, y: e.clientY });
          }}
          title={
            seg.live
              ? `${isWork ? 'Focus' : 'Break'} · ${fmtHM(seg.startMs)} → now (recording)`
              : `${isWork ? 'Focus' : 'Break'} · ${fmtHM(seg.startMs)}–${fmtHM(seg.endMs)} · ${minutes}m`
          }
          style={{
            position: 'absolute',
            top: topPx,
            left: 1,
            width: `calc(${rail} - 2px)`,
            height: heightPx,
            background: isWork ? `color-mix(in srgb, ${tone} ${seg.live ? 95 : 80}%, transparent)` : 'transparent',
            backgroundImage: isWork
              ? undefined
              : `repeating-linear-gradient(135deg, color-mix(in srgb, ${tone} 55%, transparent) 0 2px, transparent 2px 6px)`,
            border: isWork ? 'none' : `1px solid color-mix(in srgb, ${tone} 50%, transparent)`,
            borderRadius: 2,
            zIndex: 3,
            cursor: 'pointer',
            boxShadow: seg.live ? `0 0 8px color-mix(in srgb, ${tone} 60%, transparent)` : undefined,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
          }}
        >
          {showLabel && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, color: isWork ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)', paddingTop: 1, pointerEvents: 'none' }}>
              {minutes}m
            </span>
          )}
        </div>
      );
    });
  }

  // ── Habit block renderer (ADR 0002 §6) ──────────────────────────────────────

  function renderHabitBlocks(dayYMD: string) {
    const isoDow = ymdToIsoDow(dayYMD);
    const blocks: ReactNode[] = [];

    for (const habit of scheduledHabits) {
      if (!habitScheduledOnDow(habit.schedule, isoDow)) continue;

      const [hStr, mStr] = habit.schedule.timeOfDay.split(':');
      const habitHour = parseInt(hStr ?? '0', 10);
      const habitMin = parseInt(mStr ?? '0', 10);

      // Per ADR 0002 §6: if timeOfDay is outside hourRange, do not render.
      if (habitHour < hourRange.start || habitHour > hourRange.end) continue;

      const hoursFromStart = habitHour - hourRange.start + habitMin / 60;
      const topPx = Math.round(hoursFromStart * rowHeight);

      const nameLabel = habit.name.length > 10 ? habit.name.slice(0, 9) + '…' : habit.name;
      const blockHeight =
        habit.schedule.durationMin && habit.schedule.durationMin > 0
          ? Math.max(14, Math.round((habit.schedule.durationMin / 60) * rowHeight))
          : 12;
      const titleSuffix = habit.schedule.durationMin
        ? ` (${habit.schedule.durationMin} min)`
        : '';

      blocks.push(
        <div
          key={`habit-block-${habit.id}`}
          data-testid={`habit-block-${habit.id}-${dayYMD}`}
          title={`${habit.name} — ${habit.schedule.timeOfDay}${titleSuffix}`}
          style={{
            position: 'absolute',
            top: topPx,
            // Plan layer, right of the reality rail. A tinted block with a
            // coloured edge (like tasks) instead of a solid bright bar, so a
            // habit no longer shouts over tasks and tracked time.
            left: `calc(${rail} + 1px)`,
            right: 2,
            height: blockHeight,
            background: `color-mix(in srgb, var(--${habit.color}) 22%, var(--paper))`,
            borderLeft: `3px solid var(--${habit.color})`,
            borderRadius: 2,
            overflow: 'hidden',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '0 2px',
            pointerEvents: 'none',
          }}
        >
          {habit.icon && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                lineHeight: 1,
                flexShrink: 0,
                // Theme-locked dark — see tokens.css --ink-on-bright.
                color: 'var(--ink)',
              }}
            >
              {habit.icon}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 600,
              // KRNL0 contrast rule (see tokens.css --ink-on-bright):
              // never light text on a bright accent bg. Habit colors are
              // all bright/tinted, so the label is locked to dark in
              // every theme.
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1,
            }}
          >
            {nameLabel}
          </span>
        </div>,
      );
    }

    return blocks;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const weekLabel = formatWeekLabel(baseYMD);

  // Narrow day view → agenda. A proportional hour grid can't show parallel
  // or short tasks readably in ~200px; a time-ordered list can.
  const [layoutPref, setLayoutPref] = useState<'auto' | 'list' | 'grid'>('auto');
  const agendaScrolledFor = useRef<string | null>(null);
  const narrowDay = singleDay && gridW > 0 && gridW < 360;
  const useAgenda = singleDay && (layoutPref === 'list' || (layoutPref === 'auto' && narrowDay));

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Sub-header: [←] Week of {Month D} [→] */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--paper-3)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          data-testid="week-prev"
          onClick={handlePrev}
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          ←
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span
            data-testid="week-label"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-1)',
              letterSpacing: '0.06em',
            }}
          >
            {singleDay ? weekLabel : `Week of ${weekLabel}`}
          </span>

          {/* Legend chip — explains the two block treatments used on the
              calendar surface: solid = work session, diagonal-stripe with
              dashed top border = break. Same visual language as the actual
              calendar-task-break-tail renderer above. */}
          <div
            data-testid="week-legend"
            title="Solid = work session • Striped (dashed top) = break"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 7px',
              background: 'var(--paper-2)',
              border: '1px dashed var(--paper-3)',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              flexShrink: 0,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 9,
                  background: 'var(--acid)',
                  borderRadius: 1,
                  display: 'inline-block',
                  opacity: 0.85,
                }}
              />
              session
            </span>
            <span style={{ color: 'var(--ink-4)' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 9,
                  borderRadius: 1,
                  borderTop: '1px dashed var(--acid)',
                  backgroundImage:
                    'repeating-linear-gradient(135deg, var(--acid) 0 1px, transparent 1px 4px)',
                  display: 'inline-block',
                  opacity: 0.85,
                }}
              />
              break
            </span>
          </div>

          {/* #9 — jump to the current week (like the clock's "now"). */}
          <button
            type="button"
            data-testid="week-today"
            onClick={setToday}
            title="Jump to this week"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
              background: 'var(--paper-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 3,
              padding: '2px 7px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Today
          </button>

          {/* #5 — ruler zoom controls. Stretch the grid to read pomo/task
              section boundaries; the gutter gains :30/:15 sub-marks as you go. */}
          <div
            data-testid="week-zoom"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
          >
            <button
              type="button"
              data-testid="week-zoom-out"
              aria-label="Zoom out"
              disabled={zoom <= CAL_ZOOM_MIN}
              onClick={() => setZoom(zoom - CAL_ZOOM_STEP)}
              style={zoomBtnStyle(zoom <= CAL_ZOOM_MIN)}
            >
              −
            </button>
            <span
              data-testid="week-zoom-level"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                color: 'var(--ink-3)',
                minWidth: 26,
                textAlign: 'center',
                letterSpacing: '0.02em',
              }}
            >
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              data-testid="week-zoom-in"
              aria-label="Zoom in"
              disabled={zoom >= CAL_ZOOM_MAX}
              onClick={() => setZoom(zoom + CAL_ZOOM_STEP)}
              style={zoomBtnStyle(zoom >= CAL_ZOOM_MAX)}
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          data-testid="week-next"
          onClick={handleNext}
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          →
        </button>
      </div>

      {/* Day column headers (Mon-Sun) */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          paddingLeft: GUTTER_WIDTH,
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        {weekDays.map((dayYMD) => {
          const isToday = dayYMD === today;
          const dayNum = parseInt(dayYMD.slice(8, 10), 10);
          return (
            <div
              key={dayYMD}
              data-testid={`week-col-header-${dayYMD}`}
              data-today-col={isToday ? 'true' : undefined}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '4px 0 3px',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: isToday ? 'var(--acid)' : 'var(--ink-3)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                animation: isToday ? 'krnl-today-pulse 2s ease-in-out infinite' : undefined,
              }}
            >
              {DAY_LABELS[ymdToIsoDow(dayYMD) - 1]} {dayNum}
            </div>
          );
        })}
      </div>

      {useAgenda && renderAgenda(weekDays[0]!)}
      {!useAgenda && singleDay && narrowDay && (
        <button
          type="button"
          data-testid="calendar-show-list"
          onClick={() => setLayoutPref('list')}
          style={{ position: 'absolute', right: 8, bottom: 40, zIndex: 5, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          ≡ list
        </button>
      )}

      {/* Grid body: gutter + 7 columns — flex-fills the calendar card and scrolls */}
      <div
        ref={gridBodyRef}
        className="krnl-week-grid"
        style={{
          display: useAgenda ? 'none' : 'flex',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Time gutter */}
        <div
          style={{
            width: GUTTER_WIDTH,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {Array.from({ length: rowCount }, (_, i) => {
            const hour = hourRange.start + i;
            return (
              <div
                key={hour}
                style={{
                  height: rowHeight,
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
              >
                {/* Top-of-hour label, e.g. "13" */}
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--ink-3)',
                    lineHeight: 1,
                  }}
                >
                  {String(hour).padStart(2, '0')}
                </span>
                {/* #5 ruler sub-marks — appear as the grid is zoomed in, so the
                    gutter reads like a ruler (13:15 / 13:30 / 13:45). */}
                {subMarks.map((min) => (
                  <span
                    key={min}
                    style={{
                      position: 'absolute',
                      top: (min / 60) * rowHeight - 4,
                      right: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 7.5,
                      color: 'var(--ink-4)',
                      lineHeight: 1,
                    }}
                  >
                    {String(hour).padStart(2, '0')}:{String(min).padStart(2, '0')}
                  </span>
                ))}
              </div>
            );
          })}
        </div>

        {/* 7 day columns */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            position: 'relative',
            // Force the cols container to the natural content height (24 *
            // rowHeight) instead of stretching to gridBodyRef's clientHeight.
            // Without this, the cols container is a flex child of an overflow-
            // scroll container and align-items:stretch (default) sizes it to
            // the visible viewport — so day-separator borders only span the
            // visible portion, terminating at the scrollbar bottom. Hour cells
            // inside still overflow below (they have explicit rowHeight each),
            // but separator lines are tied to col height. Setting minHeight
            // matches scrollHeight and lets the overlay span the full grid.
            minHeight: rowCount * rowHeight,
          }}
        >
          {/* Day-separator lines overlay — absolute layer sized to the full
              content height so the lines never truncate at the scrollbar
              edge. pointer-events:none so drop handlers underneath still fire.
              Bug fix 2026-05-15. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {Array.from({ length: dayCount }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderLeft: i > 0 ? '1px solid rgba(154, 145, 128, 0.25)' : undefined,
                }}
              />
            ))}
          </div>
          {weekDays.map((dayYMD, _colIdx) => {
            const isToday = dayYMD === today;
            return (
              <div
                key={dayYMD}
                data-testid={`week-col-${dayYMD}`}
                onContextMenu={(e) => handleColumnContextMenu(dayYMD, e)}
                style={{
                  flex: 1,
                  position: 'relative',
                  background: isToday ? 'rgba(201, 241, 88, 0.08)' : 'transparent',
                  // borderLeft moved to the absolute overlay above so lines
                  // span the full scroll content, not just clientHeight.
                }}
              >
                {/* Hour rows — drop targets (15-min snap computed from mouse Y at drop time) */}
                {Array.from({ length: rowCount }, (_, rowIdx) => {
                  const hour = hourRange.start + rowIdx;
                  const handlers = makeCellHandlers(dayYMD, hour);
                  return (
                    <div
                      key={hour}
                      className="krnl-calendar-cell"
                      data-testid={`week-cell-${dayYMD}-${String(hour).padStart(2, '0')}`}
                      data-day={dayYMD}
                      data-hour={hour}
                      onDragOver={handlers.onDragOver}
                      onDragLeave={handlers.onDragLeave}
                      onDrop={handlers.onDrop}
                      style={{
                        height: rowHeight,
                        boxSizing: 'border-box',
                        borderBottom: '1px solid rgba(154, 145, 128, 0.25)',
                        // #4 — faint half-hour gridline once the grid is zoomed
                        // enough to warrant it, so blocks read against a ruler.
                        backgroundImage:
                          subMarks.length > 0
                            ? 'linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(154,145,128,0.12) 50%, transparent calc(50% + 0.5px))'
                            : undefined,
                      }}
                    />
                  );
                })}

                {/* Habit blocks (zIndex: 1 — behind tasks) */}
                {renderHabitBlocks(dayYMD)}

                {/* Task blocks rendered as absolute-positioned children */}
                {renderTaskBlocks(dayYMD)}

                {/* Issue #166 — tracked reality overlay (work/break spans) */}
                {renderRealityBlocks(dayYMD)}

                {/* #8 — snap-preview band: the exact slot the drop will land on,
                    so you see "13:45" not "the 13:00 hour". */}
                {snapPreview && snapPreview.dayYMD === dayYMD && (
                  <div
                    data-testid="calendar-snap-band"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: (snapPreview.minute / 60) * rowHeight,
                      height: Math.max(3, (gran / 60) * rowHeight),
                      background: 'color-mix(in srgb, var(--acid) 22%, transparent)',
                      borderTop: '2px solid var(--acid)',
                      zIndex: 4,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 2,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8.5,
                        fontWeight: 700,
                        color: 'var(--ink-on-bright)',
                        background: 'var(--acid)',
                        padding: '0 3px',
                        borderRadius: 2,
                        lineHeight: 1.3,
                      }}
                    >
                      {String(Math.floor(snapPreview.minute / 60)).padStart(2, '0')}:{String(snapPreview.minute % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* NowLine overlay */}
          {todayColIndex >= 0 && (
            <NowLine
              weekStartDate={mondayYMD}
              hourRange={hourRange}
              rowHeight={rowHeight}
              columnWidth={NOMINAL_COLUMN_WIDTH}
              gutterWidth={0}
            />
          )}
        </div>
      </div>

      {/* Empty-state hint — shown when no tasks scheduled this week.
          Rendered outside the scroll container so it stays centered as the
          user scrolls the grid. */}
      {!hasTasksThisWeek && (
        <div
          data-testid="week-empty-hint"
          style={{
            position: 'absolute',
            top: '50%',
            left: GUTTER_WIDTH,
            right: 0,
            transform: 'translateY(-50%)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--ink-4)',
            letterSpacing: '0.08em',
            opacity: 0.45,
            pointerEvents: 'none',
          }}
        >
          DRAG A TASK ONTO THE GRID
        </div>
      )}

      {/* Task info popup — shown on left-click of a task block */}
      {taskPopup && (() => {
        const startMs = new Date(taskPopup.task.startISO).getTime();
        const endMs = startMs + taskPopup.task.scheduledDurationMin * 60_000;
        const fmt = (ms: number) => {
          const d = new Date(ms);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const startStr = fmt(startMs);
        const endStr = fmt(endMs);
        const POPUP_W = 280;
        return createPortal(
        <>
          {/* Backdrop: click anywhere to dismiss */}
          <div
            onClick={() => setTaskPopup(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1998 }}
          />
          <div
            style={{
              position: 'fixed',
              left: Math.min(taskPopup.x + 4, window.innerWidth - POPUP_W - 8),
              top: taskPopup.y + 6,
              zIndex: 1999,
              background: 'var(--paper)',
              border: '1px solid var(--paper-3)',
              borderRadius: 8,
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink)',
              boxShadow: 'var(--shadow-1)',
              minWidth: 240,
              maxWidth: POPUP_W,
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink)',
                marginBottom: 10,
                wordBreak: 'break-word',
                lineHeight: 1.3,
              }}
            >
              {taskPopup.task.text}
            </div>

            {/* Start → End time row.
                Previous version painted the digits directly in --acid /
                --cyan with a glow — looked great on dark paper, but on
                the cream light-mode background the bright colors washed
                out against the paper and the popup became unreadable
                (user report 2026-05-17). Switched to colored chips with
                the theme-invariant --ink-on-bright text token — the chip
                background carries the color identity, the digits stay
                legible in every theme. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--ink-on-bright)',
                  background: 'var(--acid)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {startStr}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  background:
                    'linear-gradient(90deg, var(--acid) 0%, var(--cyan) 100%)',
                  opacity: 0.85,
                }}
              />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--ink-on-bright)',
                  background: 'var(--cyan)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {endStr}
              </span>
            </div>

            {/* #7 — exact-time editor. Type any start time + duration to place
                the task precisely, independent of the calendar's snap grid. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <input
                data-testid="task-popup-time"
                type="time"
                value={exactTime}
                onChange={(e) => setExactTime(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 5px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)' }}
              />
              <input
                data-testid="task-popup-duration"
                type="number"
                min={1}
                value={exactDur}
                onChange={(e) => setExactDur(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: 56, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 5px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)' }}
              />
              <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>min</span>
              <button
                type="button"
                data-testid="task-popup-apply-time"
                onClick={() => { applyExactTime(taskPopup.task); setTaskPopup(null); }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--ink-on-bright)', background: 'var(--cyan)', border: '1px solid var(--cyan)', borderRadius: 3, padding: '3px 8px', cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Set
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  onCommand('calendar.activateTask', { taskId: taskPopup.task.id });
                  setTaskPopup(null);
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--ink-on-bright)',
                  background: 'var(--acid)',
                  border: '1px solid var(--acid)',
                  borderRadius: 3,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Activate
              </button>
              <button
                type="button"
                data-testid="calendar-task-jump"
                onClick={() => {
                  jumpToTaskNode(taskPopup.task.id);
                  setTaskPopup(null);
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  background: 'transparent',
                  border: '1px solid var(--paper-3)',
                  borderRadius: 3,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Jump to node →
              </button>
              {/* #4 — unschedule: pull the task off the calendar. */}
              <button
                type="button"
                data-testid="calendar-task-unschedule"
                onClick={() => { unscheduleTask(taskPopup.task.id); setTaskPopup(null); }}
                title="Remove this task from the calendar (keeps the task)"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#ff8e64',
                  background: 'transparent',
                  border: '1px solid #ff8e64',
                  borderRadius: 3,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Unschedule
              </button>
            </div>
          </div>
        </>,
        document.body,
      );
      })()}

      {/* #7 — overlap layer picker. Right-click enumerates every block under the
          cursor; the user picks which to inspect. */}
      {layerMenu && createPortal(
        <>
          <div onClick={() => setLayerMenu(null)} onContextMenu={(e) => { e.preventDefault(); setLayerMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 2098 }} />
          <div
            data-testid="calendar-layer-menu"
            style={{
              position: 'fixed',
              left: Math.min(layerMenu.x + 4, window.innerWidth - 230),
              top: layerMenu.y + 4,
              zIndex: 2099,
              background: 'var(--paper)',
              border: '1px solid var(--paper-3)',
              borderRadius: 8,
              padding: 5,
              minWidth: 200,
              boxShadow: 'var(--shadow-1)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ fontSize: 8, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 6px 5px' }}>
              {layerMenu.items.length} items here
            </div>
            {layerMenu.items.map((item, i) => {
              const isTask = item.kind === 'task';
              const tone = isTask ? toneVarForTask(item.task.id) : (item.seg.kind === 'work' ? 'var(--rust)' : 'var(--ink-3)');
              const label = isTask
                ? item.task.text || 'Untitled task'
                : `Tracked · ${item.seg.kind === 'work' ? 'focus' : 'break'} ${fmtHM(item.seg.startMs)}–${fmtHM(item.seg.endMs)}`;
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`calendar-layer-item-${item.kind}`}
                  onClick={() => {
                    if (item.kind === 'task') setTaskPopup({ task: item.task, x: layerMenu.x, y: layerMenu.y });
                    else setRealityPopup({ seg: item.seg, x: layerMenu.x, y: layerMenu.y });
                    setLayerMenu(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 5,
                    padding: '6px 6px',
                    cursor: 'pointer',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: isTask ? 2 : 999, background: tone, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 7.5, color: 'var(--ink-4)', textTransform: 'uppercase' }}>{isTask ? 'plan' : 'real'}</span>
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}

      {/* #168/#172 — tell the user when a drop was pushed later by its chain. */}
      {pushNotice && createPortal(
        <div
          role="status"
          data-testid="calendar-push-notice"
          onClick={() => setPushNotice(null)}
          style={{
            position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 2100,
            background: 'var(--paper)', border: '1px solid var(--acid)', borderRadius: 6,
            padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)',
            boxShadow: 'var(--shadow-1)', cursor: 'pointer', maxWidth: 520,
          }}
        >
          {pushNotice}
        </div>,
        document.body,
      )}

      {/* #6 — tracked-reality (pomo) segment info popup. */}
      {realityPopup && createPortal(
        <>
          <div onClick={() => setRealityPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1998 }} />
          <div
            data-testid="calendar-reality-popup"
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
              minWidth: 220,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 10, height: 10, borderRadius: 999, flexShrink: 0,
                  background: realityPopup.seg.kind === 'work' ? 'var(--rust)' : 'var(--ink-3)',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                {realityPopup.seg.kind === 'work' ? 'Focus session' : 'Break'}
              </span>
              {realityPopup.seg.live && (
                <span style={{ fontSize: 8, color: 'var(--acid)', letterSpacing: '0.08em' }}>◆ LIVE</span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 8, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>tracked reality</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-on-bright)', background: 'var(--rust)', padding: '3px 8px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                {fmtHM(realityPopup.seg.startMs)}
              </span>
              <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'var(--paper-3)' }} />
              {/* #3 — a live (in-flight) span reads "→ now" so it's obvious it's
                  still recording, not a fixed end time. */}
              <span style={{ fontSize: 15, fontWeight: 700, color: realityPopup.seg.live ? 'var(--acid)' : 'var(--ink)', background: 'var(--paper-2)', padding: '3px 8px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                {realityPopup.seg.live ? 'now' : fmtHM(realityPopup.seg.endMs)}
              </span>
            </div>
            <div style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {realityPopup.seg.live ? 'So far · ' : 'Duration · '}
              {Math.max(1, Math.round((realityPopup.seg.endMs - realityPopup.seg.startMs) / 60_000))} min
            </div>
            {/* Plan vs reality — which task this time counts toward. Only work
                spans carry a tag; the live span is retagged from the Pomo. */}
            {realityPopup.seg.kind === 'work' && !realityPopup.seg.live && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Counts toward
                <select
                  data-testid="calendar-reality-retag"
                  value={realityPopup.seg.taskId ?? ''}
                  onChange={(e) => {
                    const taskId = e.target.value === '' ? null : e.target.value;
                    retagRealitySegment(realityPopup.seg.id, taskId);
                    setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, taskId } });
                  }}
                  style={{ flex: 1, minWidth: 0, background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--paper-3)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 4px', textTransform: 'none' }}
                >
                  <option value="">untagged</option>
                  {retagOptions.map((pair) => {
                    const [id, text] = pair.split('\u0000') as [string, string];
                    return <option key={id} value={id}>{text}</option>;
                  })}
                </select>
              </label>
            )}
            {/* #12 — delete a recorded segment (removes it from analytics too).
                The live in-flight span can't be deleted; stop it first. */}
            {!realityPopup.seg.live && (
              <button
                type="button"
                data-testid="calendar-reality-delete"
                onClick={() => { deleteRealitySegment(realityPopup.seg.id); setRealityPopup(null); }}
                style={{
                  marginTop: 12,
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#ff8e64',
                  background: 'transparent',
                  border: '1px solid #ff8e64',
                  borderRadius: 4,
                  padding: '5px 8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Delete segment
              </button>
            )}
          </div>
        </>,
        document.body,
      )}

      {/* HabitSwapModal — shown after a habit is dropped on a cell.
          Collects kind, time, and duration in one step. */}
      {swapModal && (() => {
        const { habitRecord, habitIndex } = resolveHabitMeta(
          swapModal.habit.habitId,
          swapModal.habit.habitMotherId,
        );
        const todayStr = todayYMD();
        const defaultTimeOfDay = `${String(swapModal.hour).padStart(2, '0')}:00`;
        return (
          <HabitSwapModal
            habitName={habitRecord?.name ?? swapModal.habit.name}
            habitIcon={habitRecord?.icon}
            habitNumber={habitIndex + 1}
            streakDays={habitRecord ? calcStreak(habitRecord.log, todayStr, habitRecord.schedule ?? undefined) : 0}
            dropDayYMD={swapModal.dayYMD}
            isoDow={swapModal.isoDow}
            defaultTimeOfDay={defaultTimeOfDay}
            defaultDurationMin={25}
            onConfirm={(kind, timeOfDay, durationMin) => {
              const snap = swapModal;
              setSwapModal(null);
              dispatchSchedule(
                kind,
                { dayYMD: snap.dayYMD, hour: snap.hour },
                snap.habit,
                timeOfDay,
                durationMin,
              );
            }}
            onCancel={() => setSwapModal(null)}
          />
        );
      })()}
    </div>
  );
}

// Compact zoom button (− / +). Disabled state dims and blocks the cursor.
function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    display: 'grid',
    placeItems: 'center',
    background: 'var(--paper-2)',
    border: '1px solid var(--paper-3)',
    borderRadius: 3,
    color: disabled ? 'var(--ink-4)' : 'var(--ink-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0,
    opacity: disabled ? 0.5 : 1,
  };
}

// Shared nav button style — mirrors MonthView.
const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--ink-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 3,
  lineHeight: 1,
};
