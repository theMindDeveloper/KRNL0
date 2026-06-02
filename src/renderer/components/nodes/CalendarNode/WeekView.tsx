// ADR 0001 Decision 24 — WeekView (Slice 3).
// ADR 0002 — Habit drag-to-schedule integration + habit block visualisation.
// Renders a 7-column × N-row hour grid. Supports drag-to-schedule from TodoNode
// rows and TaskNode blocks. Supports drag-to-schedule from HabitNode rows via
// HabitSwapModal. NowLine is rendered as an overlay.

import { useMemo, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { selectScheduledTasksForRange } from '../../../store/scheduleSelector';
import { selectPomoReality, pomoIsLive } from '../../../store/pomoReality';
import { colorForTask, TASK_TONE_VAR } from '../../../utils/taskColor';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { TaskKind, TaskState } from '../TaskNode/types';
import type { CalendarConfig, CalendarState } from './types';
import { CAL_ZOOM_MIN, CAL_ZOOM_MAX, CAL_ZOOM_STEP } from './types';
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

// Assign non-overlapping columns to slices using a greedy interval-graph
// approach. Slices on the same day are laid out side-by-side when they overlap
// in time.
function computeColumnLayout(
  slices: TaskSlice[],
): Map<string, { colIndex: number; colCount: number }> {
  if (slices.length === 0) return new Map();
  const intervals = slices.map((s) => ({
    id: s.task.id,
    startMin: s.sliceStartMin,
    endMin: s.sliceEndMin,
  }));
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin);
  const colEndMin: number[] = [];
  const assignments = new Map<string, number>();
  for (const interval of sorted) {
    let col = 0;
    while (col < colEndMin.length && (colEndMin[col] ?? 0) > interval.startMin) col++;
    assignments.set(interval.id, col);
    colEndMin[col] = interval.endMin;
  }
  const result = new Map<string, { colIndex: number; colCount: number }>();
  for (const interval of intervals) {
    const colIndex = assignments.get(interval.id) ?? 0;
    let maxCol = colIndex;
    for (const other of intervals) {
      if (other.id !== interval.id && interval.startMin < other.endMin && other.startMin < interval.endMin)
        maxCol = Math.max(maxCol, assignments.get(other.id) ?? 0);
    }
    result.set(interval.id, { colIndex, colCount: maxCol + 1 });
  }
  return result;
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
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GUTTER_WIDTH = 36; // px — time gutter width
const MIN_ROW_HEIGHT = 28; // px — minimum row height

type HabitScheduleKind = 'weekly' | 'daily';

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekView({ state, config, onCommand }: WeekViewProps) {
  // Always render the full day (00 → 23) regardless of any persisted
  // hourRange in the node config. This guarantees every calendar shows
  // the same 24-hour grid.
  void config;
  const hourRange = { start: 0, end: 23 };
  const rowCount = 24;
  const gridBodyRef = useRef<HTMLDivElement>(null);

  // Compute the Monday that anchors this week.
  const mondayYMD = getMondayYMD(state.anchorDate);

  // Build array of 7 day YYYY-MM-DD strings (Mon-Sun).
  const weekDays = useMemo<string[]>(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(mondayYMD, i));
  }, [mondayYMD]);

  const today = todayYMD();

  // Column index (0-6) of today, -1 if not in this week.
  const todayColIndex = weekDays.indexOf(today);

  // #5 — ruler zoom. rowHeight scales with the persisted zoom multiplier so the
  // user can stretch the grid to clearly read where pomo sections start/end.
  const zoom = Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, state.zoom ?? 1));
  const rowHeight = MIN_ROW_HEIGHT * zoom;
  // Sub-mark cadence for the gutter ruler: once a row is tall enough, draw
  // half-hour (and then quarter-hour) tick labels like "13:30".
  const subMarks: number[] = rowHeight >= 96 ? [15, 30, 45] : rowHeight >= 52 ? [30] : [];

  const setZoom = (z: number) => onCommand('calendar.setZoom', { zoom: z });

  // Sub-header nav handlers.
  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, -7) });
  };
  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, 7) });
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
        const d = new Date(seg.startMs);
        const ymd = toYMD(d);
        const startMin = d.getHours() * 60 + d.getMinutes();
        const endMin = Math.min(1440, startMin + Math.max(1, (seg.endMs - seg.startMs) / 60_000));
        const arr = map.get(ymd) ?? [];
        arr.push({ id: seg.id, kind: seg.kind, taskId: seg.taskId, startMin, endMin, live: seg.live, startMs: seg.startMs, endMs: seg.endMs });
        map.set(ymd, arr);
      }
      return map;
    }),
  );

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
  const weekRangeFromISO = `${mondayYMD}T00:00`;
  const weekRangeToISO = `${addDays(mondayYMD, 7)}T00:00`;
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
        e.currentTarget.setAttribute('data-drop-target', 'true');
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        e.currentTarget.removeAttribute('data-drop-target');
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.removeAttribute('data-drop-target');

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
        // Compute 15-min snap from mouse Y position within the hour cell.
        // Guard against jsdom (clientY undefined, rect.height = 0) so the
        // computed minute is always a finite integer in [0, 45].
        const rect = e.currentTarget.getBoundingClientRect();
        const clientY = Number.isFinite(e.clientY) ? e.clientY : 0;
        const rectTop = Number.isFinite(rect.top) ? rect.top : 0;
        const rectH = rect.height > 0 ? rect.height : 60;
        const relY = Math.max(0, clientY - rectTop);
        const minuteRaw = Math.floor((relY / rectH) * 60);
        const safeMinute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
        const snappedMinute = Math.max(0, Math.min(45, Math.floor(safeMinute / 15) * 15));
        const scheduledFor = `${dayYMD}T${String(hour).padStart(2, '0')}:${String(snappedMinute).padStart(2, '0')}`;
        onCommand('calendar.schedule', {
          taskId: payload.taskId,
          scheduledFor,
          scheduledDurationMin: payload.durationMin,
        });
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

    const colLayout = computeColumnLayout(slices);

    return slices.map((slice) => {
      const { task, sliceStartMin, sliceEndMin, isContinuation, hasContinuation } = slice;

      // Convert minutes-from-midnight to grid-row offsets (rowHeight per hour).
      const topPx = (sliceStartMin / 60) * rowHeight;
      const sliceLen = Math.max(1, sliceEndMin - sliceStartMin);
      const heightPx = Math.max(10, (sliceLen / 60) * rowHeight);

      // Side-by-side layout: divide column width equally.
      const { colIndex, colCount } = colLayout.get(task.id) ?? { colIndex: 0, colCount: 1 };
      const colWidthPct = 100 / colCount;
      const leftPct = colIndex * colWidthPct;
      const rightPct = 100 - (colIndex + 1) * colWidthPct;

      // Gray out if done OR if the WHOLE scheduled task has finished (not just
      // this slice — a multi-day task should not gray out the morning slice
      // while it's still running in the evening of the prior day).
      const scheduledEndMs =
        new Date(task.startISO).getTime() + task.scheduledDurationMin * 60_000;
      const isPast = scheduledEndMs <= nowMs;
      // #171 — completed and overrun must read differently. Done tasks get a
      // ✓ badge (and the grey treatment); overrun = scheduled time elapsed but
      // never marked done, which stays greyed-only with no checkmark.
      const isDone = task.done;
      const isOverrun = isPast && !task.done;
      const isGrayed = isDone || isOverrun;

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
          Math.min(1440 - 15, Math.floor(absMinute / 15) * 15),
        );
        const hour = Math.floor(snappedMin / 60);
        const minute = snappedMin % 60;
        onCommand('calendar.schedule', {
          taskId: payload.taskId,
          scheduledFor: `${dayYMD}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          scheduledDurationMin: payload.durationMin,
        });
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
      const taskTone = isGrayed ? 'var(--ink-4)' : toneVarForTask(task.id);

      return (
        <div
          key={`${task.id}-${isContinuation ? 'cont' : 'head'}`}
          data-testid={`task-block-${task.id}${isContinuation ? '-cont' : ''}`}
          draggable={!isContinuation}
          onDragStart={isContinuation ? undefined : handleBlockDragStart}
          onDragOver={handleBlockDragOver}
          onDrop={handleDropOnBlock}
          onClick={handleBlockClick}
          title={task.text + (isContinuation ? ' (continued from previous day)' : '')}
          style={{
            position: 'absolute',
            top: topPx,
            left: `calc(${leftPct}% + 2px)`,
            right: `calc(${rightPct}% + 2px)`,
            height: heightPx,
            background: isGrayed ? 'var(--paper-3)' : 'color-mix(in srgb, ' + taskTone + ' 18%, transparent)',
            border: `1px solid ${isGrayed ? 'var(--ink-4)' : taskTone}`,
            borderTopLeftRadius,
            borderTopRightRadius,
            borderBottomLeftRadius,
            borderBottomRightRadius,
            cursor: isContinuation ? 'pointer' : 'grab',
            overflow: 'hidden',
            zIndex: 2,
            padding: '1px 3px',
            opacity: isGrayed ? 0.5 : 1,
          }}
        >
          {/* Continuation arrows — ↑ on continuation slices, ↓ on slices that
              spill into the next day. */}
          {isContinuation && (
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
          {hasContinuation && (
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
          {isDone && !isContinuation && (
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
          {heightPx >= 12 && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
                paddingLeft: isContinuation ? 10 : 0,
                pointerEvents: 'none',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {task.text}
            </span>
          )}
        </div>
      );
    });
  }

  // ── Tracked-reality block renderer (#180) ───────────────────────────────────
  // #180 dual visualization: the Pomodoro is an OBSERVER. Its tracked work/break
  // segments render as an ambient BACKGROUND WASH spanning the full column,
  // sitting BEHIND event blocks (low z-index, no hard border). Events — the
  // PLAN — are bordered foreground blocks that overlap on top. This makes "what
  // actually happened" (wash) and "what I planned" (block) co-readable even when
  // they cover the same time. Work = warm rust tint; break = neutral striped.
  function renderRealityBlocks(dayYMD: string) {
    const segs = realityByDay.get(dayYMD);
    if (!segs || segs.length === 0) return null;
    return segs.map((seg) => {
      const topPx = (seg.startMin / 60) * rowHeight;
      const heightPx = Math.max(3, ((seg.endMin - seg.startMin) / 60) * rowHeight);
      const isWork = seg.kind === 'work';
      // Reality wash uses a single ambient palette (NOT per-task colour — the
      // pomo has no task). Work = rust wash, break = neutral ink stripes.
      const tone = isWork ? 'var(--rust)' : 'var(--ink-3)';
      const liveGlow = seg.live ? 0.22 : 0.14;
      return (
        <div
          key={`reality-${seg.id}`}
          data-testid="calendar-reality-block"
          data-reality-kind={seg.kind}
          data-reality-live={seg.live ? 'true' : undefined}
          title={`${isWork ? 'Focus' : 'Break'} (tracked reality)`}
          style={{
            position: 'absolute',
            top: topPx,
            // Full-column ambient wash — spans edge to edge, behind events.
            left: 0,
            right: 0,
            height: heightPx,
            background: isWork
              ? `color-mix(in srgb, ${tone} ${seg.live ? 22 : 14}%, transparent)`
              : 'transparent',
            backgroundImage: isWork
              ? undefined
              : `repeating-linear-gradient(135deg, color-mix(in srgb, ${tone} 30%, transparent) 0 2px, transparent 2px 7px)`,
            // No hard border — a soft left accent rail marks the segment edge so
            // the wash reads as "ambient happened-time", distinct from a block.
            borderLeft: `2px solid color-mix(in srgb, ${tone} ${seg.live ? 70 : 45}%, transparent)`,
            // Behind event blocks (zIndex 2) and habits, above the grid.
            zIndex: 0,
            boxShadow: seg.live ? `inset 0 0 12px color-mix(in srgb, ${tone} ${liveGlow * 100}%, transparent)` : undefined,
            pointerEvents: 'none',
          }}
        />
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
            left: 2,
            right: 2,
            height: blockHeight,
            background: `var(--${habit.color})`,
            // Bumped from 0.7 → 0.9 so the dark text on bright fill
            // doesn't get washed out by alpha. Contrast was the user's
            // explicit complaint; opacity was making it worse.
            opacity: 0.9,
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
                color: 'var(--ink-on-bright)',
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
              color: 'var(--ink-on-bright)',
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

  const weekLabel = formatWeekLabel(mondayYMD);

  return (
    <div
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
            Week of {weekLabel}
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
        {weekDays.map((dayYMD, colIdx) => {
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
              {DAY_LABELS[colIdx]} {dayNum}
            </div>
          );
        })}
      </div>

      {/* Grid body: gutter + 7 columns — flex-fills the calendar card and scrolls */}
      <div
        ref={gridBodyRef}
        className="krnl-week-grid"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
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
            {Array.from({ length: 7 }, (_, i) => (
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

            <div
              style={{
                color: 'var(--ink-3)',
                fontSize: 10,
                marginBottom: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Duration · {taskPopup.task.scheduledDurationMin} min
            </div>
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
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', background: 'var(--paper-2)', padding: '3px 8px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                {fmtHM(realityPopup.seg.endMs)}
              </span>
            </div>
            <div style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Duration · {Math.max(1, Math.round((realityPopup.seg.endMs - realityPopup.seg.startMs) / 60_000))} min
            </div>
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
            streakDays={habitRecord ? calcStreak(habitRecord.log, todayStr) : 0}
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
