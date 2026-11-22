// ADR 0001 Decision 24 — WeekView (Slice 3).
// ADR 0002 — Habit drag-to-schedule integration + habit block visualisation.
// Renders a 7-column × N-row hour grid. Supports drag-to-schedule from TodoNode
// rows and TaskNode blocks. Supports drag-to-schedule from HabitNode rows via
// HabitSwapModal. NowLine is rendered as an overlay.

import { pickerOpen } from '../../ui/Popover';
import { sharedLanes, type KindSpan } from './routineLanes';
import { CalendarGhostLayer, calendarGhost, ghostTimes, setCalendarGhost, startCarry } from './DropGhost';
import { beginTaskDragInfo, endTaskDragInfo, taskDragInfo } from '../../../store/taskDrag';
import { doneLabel, markDoneAsPlanned, plannedEndMs, todoRowOf, wontDoTask } from '../../../store/planActions';
import { CALENDAR_LAYOUT_EVENT, CALENDAR_REVEAL_EVENT, showTask, unscheduleTask } from '../../../store/scheduleActions';
import { highlightElement } from '../../../store/highlight';
import { startTransition, useMemo, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../../store/boardStore';
import { effectiveDraft, type PlanDraft, type PlanOverrides } from '../TodoNode/PlanAddCard';
import { taskSetPlannedMin, taskSetSchedule } from '../TaskNode/commands';
import { pomoDeleteSegment, pomoRetagSegment } from '../PomoNode/commands';
import type { PomoState } from '../PomoNode/types';
import { decodeTargets, encodeTargets, spanTaskName as spanTaskNameOf, spanTaskTargets } from '../PomoNode/taskTargets';
import { saveBoard } from '../../../store/eventLog';
import { useShallow } from 'zustand/react/shallow';
import { selectScheduledTasksForRange, selectSchedule } from '../../../store/scheduleSelector';
import { packLanes } from '../../../store/laneLayout';
import { layoutDayBlocks, BLOCK_TEXT_INSET, LANE_CAP, MIN_LANE_PX, READABLE_LANE_PX } from './dayBlockLayout';
import { clashLabels } from './clashLabels';
import { lineUp } from './lineUp';
import { AppSelect } from '../../ui/AppSelect';
import { SpanTimeEditor, CountsToward, openLogTime, logTimeDefaults } from '../../ui/SpanEditor';
import { SPACE, popupColumn } from '../../ui/spacing';
import { useAppMarkers } from '../../../store/appSessions';
import { trackedSecondsByTask, selectPomoNode, pomoOnlyBoard } from '../../../store/trackedTime';
import { selectPomoReality, pomoIsLive } from '../../../store/pomoReality';
import { colorForTask, TASK_TONE_VAR } from '../../../utils/taskColor';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { TaskKind, TaskState } from '../TaskNode/types';
import type { CalendarConfig, CalendarLayers, CalendarState } from './types';
import { CAL_ZOOM_MIN, CAL_ZOOM_MAX, CAL_ZOOM_STEP, calendarLayersOf, granularityFor } from './types';
import { getMondayOf, toYMD, hasTimeOfDay, isRoutine, isOneTimeEvent, routineOccurrence, routineSpansOn, countOn, type RoutineOccurrence, type RoutineSpan } from '../HabitNode/types';
import { routineLanes } from './routineLanes';
import { dayOnlyPlans } from './dayOnly';
import { DueFlag } from './DueFlag';
import { TimeField } from '../../ui/TimeField';
import { applyPlanWhen, deletePlanOfTask, deleteRoutine, habitMotherCommand, planWhenOf, putPlanOnDay, toggleTaskDone } from '../../../store/scheduleActions';
import { WhenPopover } from '../../ui/WhenPopover';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';
import { NowLine } from './NowLine';
import { HabitSwapModal } from '../../ui/HabitSwapModal';
import { getHabitDrag, type HabitDragPayload } from '../../../dnd/habitDrag';
import { habitStreak } from '../HabitNode/commands';
import { toneVarForTask } from '../../../utils/taskColor';
import { boardTagLibrary, spanTone } from '../../../store/spanTags';
import { useEasyMode } from '../../../store/uiMode';
import { ContextMenu, type ContextMenuItem } from '../../ContextMenu';
import { segmentMenuItems, taskMenuItems } from '../../ContextMenu/scheduleMenus';
import { PagedView } from '../../ui/PagedView';
import { TaskPopup } from './TaskPopup';
import { useDismissOutside } from '../../ui/useDismissOutside';
import { TaskInfoPopup } from '../../ui/TaskInfoPopup';
import { showPlanGuide } from '../../PlanGuide';
import { hourWindow, stepHourWindow } from './hourWindow';
import { useLayoutEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { EVENT_TEXT, eventLines, eventTitleAndPlace } from './eventText';
import { parseQuickAdd } from '../../../../shared/quickAdd';
import { Z } from '../../ui/layers';
import { MenuIcon } from '../../ui/menuIcons';
import { HabitIcon, habitIconId } from '../HabitNode/HabitIcon';
import { RemindPicker } from '../../ui/RemindPicker';
import { EventCard, type EventDraft } from './EventCard';
import { screenScale } from './screenScale';
import { useLocalDay } from '../../../hooks/useLocalDay';

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
  anchorTaskId: string;         // the chain's anchor (itself when it has its own time)
  kind: TaskKind;               // Decision 28: 'focus' | 'event'
  breakdown: PomoBreakdown | null; // Decision 28: null iff kind === 'event'
  timeOpen: boolean;            // no duration set — drawn open-ended (fades out)
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

/** "YYYY-MM-DDTHH:MM" read as wall-clock time (no DST shifts). */
function wallClockMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return new Date(iso).getTime();
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
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
  /** Timed habits only — untimed ("Any time") habits and routines are not pills (Decision 39). */
  schedule: HabitSchedule & { timeOfDay: string };
  /** Days done ("YYYY-MM-DD") — the pill shows done / not done. */
  log: readonly string[];
  /** The habit mother, to tick the habit from the calendar. */
  motherId: string;
  /** "8 glasses a day": the pill shows the day's count (each click adds one). */
  amount?: { target: number; unit: string };
  counts?: Record<string, number>;
}

// ── Layers (calendar-visual-grammar) ─────────────────────────────────────────
// One rule per kind of thing, so nothing covers anything else:
//   plan      → the only real blocks (outlined, titled), side by side when they overlap
//   recorded  → a thin rail at the left edge of each day; a break is a gap in it
//   habits    → small pills at their time on the right edge, ticked from here
// Recorded and Habits can be switched off in the header (kept per install).
type CalLayers = CalendarLayers;

interface WeekViewProps {
  state: CalendarState;
  config: CalendarConfig;
  onCommand: (cmd: string, args: Record<string, unknown>) => void;
  /** #10 — when true, render a single day (anchorDate) instead of Mon–Sun. */
  singleDay?: boolean;
  /** window-frame.md — where the Calendar's menu button goes: a slot in the
   *  window's header (the header is drawn by the Calendar window itself). */
  headSlot?: HTMLElement | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Window event: scroll the hour window to this week's first routine (routines tour). */
export const SHOW_ROUTINES_EVENT = 'krnl:calendar-show-routines';
const GUTTER_WIDTH = 48; // px — time gutter: the hours on their lines, and the time now (owner, 2026-11-21: "06:13" touched the edge at 40)
// Room above 00:00 and below 24:00, so the first and last hour labels sit on
// their lines without touching the ANY TIME row or the footer.
const GRID_PAD = 10;
const MIN_ROW_HEIGHT = 28; // px — minimum row height
/** Decision 60 — the zoom at which the whole day fits the window. */
const ZOOM_FIT = 2;
// Grid lines (owner, 2026-11-21: they were too faint to read). Frame styles
// can still set --k-cal-grid; the half hour stays a quiet dashed line.
const CAL_HOUR_LINE = 'var(--k-cal-grid, color-mix(in srgb, var(--ink) 11%, transparent))';
const CAL_DAY_LINE = 'var(--k-cal-grid, color-mix(in srgb, var(--ink) 11%, transparent))';
const CAL_HOUR_BAND = 'color-mix(in srgb, var(--ink) 2.6%, transparent)';
const CAL_HALF_LINE = 'linear-gradient(to right, color-mix(in srgb, var(--ink) 10%, transparent) 50%, transparent 0)';
/** F31 — the wrapped name in a narrow block: 10 px mono, one letter about 5.5 px wide, 11 px a line. */
const WRAP_CH_PX = 5.5;
const WRAP_LINE_PX = 11;
const MIN_BLOCK_PX = 14; // px — a planned block is never thinner than one text line
/** Space between two blocks that touch in time. */
const BLOCK_GAP = 3;

const CAL_ICONS = {
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  replan: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  chevUp: 'M6 15l6-6 6 6',
  chevDown: 'M6 9l6 6 6-6',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  grid: 'M4 4h16v16H4zM4 9.5h16M4 15h16M9.5 4v16',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  clash: 'M4 4h10v10H4zM10 10h10v10H10z',
  stairs: 'M3 6h6v6h6v6h6M17 14l4 4-4 4',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  tray: 'M3 14h5l1.5 3h5l1.5-3h5M3 14l2.5-8h13l2.5 8v6H3zM12 2.5v7M9 7l3 3 3-3',
} as const;

function CalIcon({ name, size = 11 }: { name: keyof typeof CAL_ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CAL_ICONS[name]} />
    </svg>
  );
}

/**
 * F29 — the Clock rail: recorded time as a track that fills up, drawn with
 * the Clock's own parts — a track one shade LIGHTER than the day
 * (--paper-3, the Clock's ring track), round-capped fills riding on it at
 * the same width, and today's "now" as a knob on the track.
 *   A1 ring track · A2 + hour marks · A3 thin ring · A4 track only up to now
 */
type RailStyle = 'A1' | 'A2' | 'A3' | 'A4';
const RAIL_STYLE = 'A4' as RailStyle;
/** Gap from the day's own line to its track (Decision 59: tight, the owner
 *  found the old gaps around the line too wide). */
const TRACK_LEFT = (tiny = false): number => (tiny ? 2 : 3);
const TRACK_W = (singleDay: boolean, tiny = false): number => {
  if (RAIL_STYLE === 'A3') return tiny ? 3 : 4;
  if (RAIL_STYLE === 'A4') return singleDay ? 5 : tiny ? 3 : 4;
  return singleDay ? 8 : tiny ? 5 : 7;
};
/** Plans start 3 px after the track (2 px in a Station-width day). */
const RAIL_PX = (singleDay: boolean, tiny = false): number => TRACK_LEFT(tiny) + TRACK_W(singleDay, tiny) + (tiny ? 2 : 3);

type HabitScheduleKind = 'weekly' | 'daily';

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekView({ state, config, onCommand, singleDay = false, headSlot = null }: WeekViewProps) {
  // Width of the per-day reality rail (left edge of each column), as a CSS
  // length so it scales with the column: wide in the day view (carries a
  // minutes label), at most 12% of a narrow week column (station panels can
  // be ~25px per day).
  // A thin strip in every view: a wide labelled rail read as extra task
  // blocks next to the plan. Minutes live in the hover / click popup.
  // Pomo spans are background highlights now, so blocks need no rail gutter.
  // The recorded rail's lane: inset from the day line, then the plan blocks.
  // Layers live in the calendar's state (calendar.setLayers / `krnl cal layers`).
  const layers: CalLayers = calendarLayersOf(state);
  const toggleLayer = (k: keyof CalLayers): void => {
    onCommand('calendar.setLayers', { [k]: !layers[k] });
  };
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
      // Decision 61 — in the background: the layout is CSS; this only refines text.
      startTransition(() => setGridW((prev) => (prev === w ? prev : w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Decision 59 — the hours' scrollbar narrows only the grid, so the rows
  // above it (day names, ANY TIME) keep the same room at their right, or
  // their day lines drift off the grid's (owner, 2026-11-21).
  const [sbW, setSbW] = useState(0);
  // Decision 60 — the hours' own height: the day fills it (no empty band
  // under 23:00 in a tall or resized window).
  const [bodyH, setBodyH] = useState(0);
  // Whether the hours really scroll (zoomed in): then the wheel scrolls them.
  const [canScroll, setCanScroll] = useState(false);
  useEffect(() => {
    const el = gridBodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.max(0, el.offsetWidth - el.clientWidth);
      const h = el.clientHeight;
      const scrolls = el.scrollHeight > el.clientHeight + 1;
      startTransition(() => {
        setSbW((p) => (p === w ? p : w));
        setBodyH((p) => (Math.abs(p - h) < 1 ? p : h));
        setCanScroll(scrolls);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  // #10 — day view anchors on anchorDate and shows one column; week view anchors
  // on the Monday and shows seven. dayCount drives the column grid throughout.
  const dayCount = singleDay ? 1 : 7;
  const tinyDays = !singleDay && gridW > 0 && (gridW - GUTTER_WIDTH) / dayCount < 70;
  const mondayYMD = getMondayYMD(state.anchorDate);
  const baseYMD = singleDay ? state.anchorDate : mondayYMD;

  // Build the day columns (1 for day view, Mon–Sun for week view).
  const weekDays = useMemo<string[]>(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(baseYMD, i));
  }, [baseYMD, dayCount]);
  // #207 follow-up — app open / close markers for the shown days.
  const appMarkers = useAppMarkers(weekDays[0] ?? '', weekDays[weekDays.length - 1] ?? '');

  // useLocalDay re-renders at midnight, so today's column and every
  // todayYMD() below move with the clock.
  const today = useLocalDay();

  // Column index of today within the visible range, -1 if not shown.
  const todayColIndex = weekDays.indexOf(today);

  // #5 — ruler zoom. rowHeight scales with the persisted zoom multiplier so the
  // user can stretch the grid to clearly read where pomo sections start/end.
  // Default 2× (56px per hour): at 1× a 20-minute task is a ~10px sliver.
  // The whole day doesn't need to fit — the grid scrolls (see below).
  const zoom = Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, state.zoom ?? 2));
  // Decision 58 — zoom is a gesture, not a button: pinch on a trackpad,
  // Ctrl/⌘ + wheel, two fingers on a touch screen, or dragging the hour
  // gutter. While the gesture runs the zoom is live (no save per frame); it is
  // saved once it rests.
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const shownZoom = liveZoom ?? zoom;
  // Decision 60 — the day fits the window by default (no scroll, no empty
  // band under 23:00, at any size); zooming in makes the hours taller from
  // there. Zoom ZOOM_FIT (the old default, 2) is "fits"; more is taller.
  const fillRow = bodyH > 0 ? Math.max(0, (bodyH - 2 * GRID_PAD) / rowCount) : 0;
  const rowFor = (z: number): number => (fillRow > 0 ? fillRow * Math.max(1, z / ZOOM_FIT) : MIN_ROW_HEIGHT * z);
  const zoomFloor = fillRow > 0 ? ZOOM_FIT : CAL_ZOOM_MIN;
  const rowHeight = rowFor(shownZoom);
  // Decision 61 — the hours are sized by the browser from the hours box's own
  // height (container units): a window resize redraws them in the same frame,
  // smoothly, with no React work and no stale measure (a stale one left a gap
  // under 23:00). React only refines what text fits, in the background.
  // Without a measured box (tests), plain pixels.
  const cssRows = fillRow > 0;
  const zoomK = Math.max(1, shownZoom / ZOOM_FIT);
  const rh = (hours: number, addPx = 0): number | string => (cssRows ? `calc(var(--rh) * ${hours} + ${addPx}px)` : hours * rowHeight + addPx);
  const rhMax = (minPx: number, hours: number, addPx = 0): number | string => (cssRows ? `max(${minPx}px, calc(var(--rh) * ${hours} + ${addPx}px))` : Math.max(minPx, hours * rowHeight + addPx));
  // Decision 61 — on the Free canvas, a Calendar whose day fits has nothing to
  // scroll: the plain wheel over it zooms (mouse) or moves (trackpad) the
  // canvas, like anywhere else on it (owner, 2026-11-21). Once the hours are
  // zoomed in, the wheel scrolls them. Ctrl + wheel and a pinch always zoom
  // the hours. In My layout the Calendar is not on a canvas and keeps the wheel.
  const [onCanvas, setOnCanvas] = useState(false);
  useLayoutEffect(() => { setOnCanvas(!!gridBodyRef.current?.closest('.react-flow__node')); }, []);
  const wheelToCanvas = onCanvas && fillRow > 0 && !canScroll;
  // #11/#8 — one granularity drives gridlines, gutter labels, AND snapping.
  // Decision 60 — the marks follow the hours' drawn height, not the zoom
  // number: small hours (a fitted day in a small window) get no half-hour
  // dashes, which crowded into stripes (owner, 2026-11-21).
  const gridGran = granularityFor(rowHeight / MIN_ROW_HEIGHT);
  // Dropping and resizing still snap as finely as before.
  const gran = granularityFor(shownZoom);
  // Sub-hour marks at every granularity step inside the hour (skip :00).
  const subMarks: number[] = gridGran >= 60
    ? []
    : Array.from({ length: Math.floor(60 / gridGran) - 1 }, (_, i) => (i + 1) * gridGran);

  const setZoom = (z: number) => onCommand('calendar.setZoom', { zoom: z });
  const setToday = () => onCommand('calendar.setAnchor', { date: todayYMD() });

  // #8 — snap preview. While dragging over the grid we track the snapped slot
  // (day + minute-of-day) and paint a thin band there, so the user sees the
  // EXACT target slot instead of the whole hour cell lighting up.
  // Decision 60 — one preview for every drag onto the Calendar (Todo row,
  // task card, Calendar block, canvas card): the plan as a soft block with its
  // name and times at the slot it would land on.
  const previewOf = (ref: { taskId?: string; itemId?: string; durationMin?: number } | null): { name: string; len: number; tone: string } => {
    const nodes = useBoardStore.getState().board?.nodes ?? [];
    if (ref?.taskId) {
      const ts = nodes.find((n) => n.id === ref.taskId)?.state as { text?: string; plannedMin?: number; durationMin?: number } | undefined;
      return { name: ts?.text ?? 'Plan', len: ref.durationMin ?? ts?.plannedMin ?? ts?.durationMin ?? 30, tone: toneVarForTask(ref.taskId) };
    }
    if (ref?.itemId) {
      const items = (nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as { items?: Array<{ id: string; text: string }> } | undefined)?.items ?? [];
      return { name: items.find((i) => i.id === ref.itemId)?.text ?? 'Plan', len: ref.durationMin ?? 30, tone: 'var(--acid)' };
    }
    return { name: '', len: ref?.durationMin ?? 60, tone: 'var(--acid)' };
  };
  // Decision 61 — the plan's ghost at a slot (DropGhost.tsx: moved without
  // re-drawing the week, so it glides instead of stuttering).
  const showPlanGhost = (day: string, pointerMin: number, ref: { taskId?: string; itemId?: string; durationMin?: number; grabMin?: number } | null = taskDragInfo()) => {
    const minute = Math.max(0, pointerMin - (ref?.grabMin ?? 0));
    const cur = calendarGhost();
    if (cur && cur.testId === 'calendar-snap-band' && cur.day === day && cur.startMin === minute) return;
    const p = previewOf(ref);
    const len = Math.max(gran, Math.min(1440 - minute, p.len));
    setCalendarGhost({ day, startMin: minute, endMin: minute + len, name: p.name, times: ghostTimes(minute, minute + len), tone: p.tone, testId: 'calendar-snap-band' });
  };
  // The band must never outlive the drag: a drop on a task block stops
  // propagation before the cell can clear it, and a cancelled drag (Esc, drop
  // outside the grid) never reaches a cell at all.
  useEffect(() => {
    const clear = () => { if (calendarGhost()?.testId === 'calendar-snap-band') setCalendarGhost(null); };
    window.addEventListener('dragend', clear, true);
    window.addEventListener('drop', clear, true);
    return () => {
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('drop', clear, true);
    };
  }, []);

  // #7 — live resize draft. While dragging a task block's top/bottom edge we
  // hold a transient override (start-minute delta + duration) so the block
  // grows/shrinks under the cursor; commit on mouse-up, snapped to granularity.
  const [resizeDraft, setResizeDraft] = useState<
    // Decision 60 — `committing`: the edge was let go; the block keeps the new
    // start (`absStartMin`) and length until the board shows them, so it never
    // snaps back to the old size for a frame.
    { taskId: string; durationMin: number; startMinDelta: number; absStartMin?: number; committing?: boolean } | null
  >(null);
  // The click that ends a resize is not "open this plan".
  const resizeClickBlock = useRef(0);

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
    const scale = screenScale(e.currentTarget);
    const dayYMD = task.startISO.slice(0, 10);
    let last = { taskId: task.id, durationMin: origDurationMin, startMinDelta: 0 };
    let carried = false;
    document.body.classList.add('cal-resizing');
    const onMove = (ev: MouseEvent) => {
      const deltaMin = Math.round((((ev.clientY - originY) / scale / rowHeight) * 60) / gran) * gran;
      if (edge === 'bottom') {
        last = { taskId: task.id, durationMin: Math.max(gran, origDurationMin + deltaMin), startMinDelta: 0 };
      } else {
        // Top edge: don't let the start cross the end; clamp the delta.
        const clamped = Math.min(deltaMin, origDurationMin - gran);
        last = { taskId: task.id, durationMin: Math.max(gran, origDurationMin - clamped), startMinDelta: clamped };
      }
      // Decision 61 — like an event: the block steps back (once) and the ghost
      // shows the new length, moving on its own.
      if (!carried) { carried = true; setResizeDraft({ taskId: task.id, durationMin: origDurationMin, startMinDelta: 0 }); }
      const s0 = Math.max(0, sliceStartMin + last.startMinDelta);
      setCalendarGhost({ day: dayYMD, startMin: s0, endMin: s0 + last.durationMin, name: task.text, times: ghostTimes(s0, s0 + last.durationMin), tone: toneVarForTask(task.id), testId: 'calendar-resize-ghost', edge: edge === 'bottom' ? 'bottom' : 'top' });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('cal-resizing');
      // A press on the edge that did not move changes nothing.
      if (calendarGhost()?.testId === 'calendar-resize-ghost') setCalendarGhost(null);
      if (last.startMinDelta === 0 && last.durationMin === origDurationMin) { setResizeDraft(null); return; }
      resizeClickBlock.current = Date.now();
      const newStartMin = Math.max(0, sliceStartMin + last.startMinDelta);
      setResizeDraft({ taskId: task.id, durationMin: last.durationMin, startMinDelta: 0, absStartMin: newStartMin, committing: true });
      // Never stuck: whatever the board says after a moment is what shows.
      window.setTimeout(() => setResizeDraft((d) => (d && d.committing && d.taskId === task.id ? null : d)), 1500);
      const h = Math.floor(newStartMin / 60);
      const m = newStartMin % 60;
      const scheduledFor = `${dayYMD}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const durN = last.durationMin;
      // The length on the task, the time through the same path as a drag:
      // the Todo row follows, and a chained task lands where it was put.
      applyTaskState(task.id, (s) => taskSetPlannedMin(s, { minutes: durN }));
      scheduleTaskRef.current(task.id, scheduledFor, durN);
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
  // Set below (scheduleTask is declared after the resize handler).
  const scheduleTaskRef = useRef<(taskId: string, scheduledFor: string, durationMin: number) => void>(() => {});
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
  // Minutes into today: the gutter shows the time on the now-line.
  const nowMin = new Date(nowMs).getHours() * 60 + new Date(nowMs).getMinutes();
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
        id: string; kind: 'work' | 'break'; taskId: string | null; tag: string | null; label: string;
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
          arr.push({ id: seg.id, kind: seg.kind, taskId: seg.taskId, tag: seg.tag, label: seg.label, startMin, endMin, live: seg.live, startMs: seg.startMs, endMs: seg.endMs });
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
  // Easy mode: planned blocks show the plan only (no tracked / overrun badges).
  const easy = useEasyMode();
  const trackedByTask = useMemo(
    () => (easy ? new Map<string, number>() : trackedSecondsByTask(pomoOnlyBoard(pomoNodeForTracked), liveMs)),
    [easy, pomoNodeForTracked, liveMs],
  );

  // Root tasks a reality span can be retagged to: open first, then done
  // (#204 — the same list the Pomo offers, so a finished task stays taggable).
  const retagKeys = useBoardStore(useShallow((s) => encodeTargets(spanTaskTargets(s.board?.nodes))));
  const retagTargets = useMemo(() => decodeTargets(retagKeys), [retagKeys]);
  // #204 — the name of the task a span counts toward (falls back to the span's
  // own label when the task node is gone).
  const spanTaskName = (seg: { taskId: string | null; label: string }): string | null =>
    spanTaskNameOf(useBoardStore.getState().board?.nodes, seg);
  // Title of a span: Break, the task it counts toward, its own name, else
  // `fallback`. Easy mode never links spans to tasks.
  const spanTitle = (seg: { kind: 'work' | 'break'; taskId: string | null; label: string }, fallback: string): string => {
    if (seg.kind !== 'work') return 'Break';
    if (easy) return (!seg.taskId && seg.label) || fallback;
    return spanTaskName(seg) ?? (seg.label || fallback);
  };

  // #168/#172 — when a drop lands later than requested (the chain pushes a
  // task after its predecessor), say so instead of silently moving it.
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!pushNotice) return;
    const id = setTimeout(() => setPushNotice(null), 4500);
    return () => clearTimeout(id);
  }, [pushNotice]);
  const scheduleTask = (taskId: string, scheduledFor: string, scheduledDurationMin: number, parallelWith?: string) => {
    onCommand('calendar.schedule', { taskId, scheduledFor, scheduledDurationMin, ...(parallelWith ? { parallelWith } : {}) });
    const board = useBoardStore.getState().board;
    const placed = board ? selectSchedule(board).placements.get(taskId) : undefined;
    if (placed && placed.startISO.slice(0, 16) !== scheduledFor.slice(0, 16)) {
      const task = board?.nodes.find((n) => n.id === taskId);
      const name = task ? (task.state as TaskState).text : 'Task';
      setPushNotice(`“${name}” placed at ${placed.startISO.slice(11, 16)} — after the task before it in its chain`);
    }
  };
  scheduleTaskRef.current = scheduleTask;

  // Decision 60 — while a canvas card is dragged over the Calendar, a soft
  // block shows where it will land (it glides as you move); once let go, the
  // plan lands there with a short flash.
  const [landedTaskId, setLandedTaskId] = useState<string | null>(null);
  const pointToSlot = (x: number, y: number): { day: string; startMin: number } | null => {
    for (const col of Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-cal-day]') ?? [])) {
      const r = col.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const minute = ((y - r.top) / screenScale(col) / rowHeight) * 60;
      return { day: col.dataset['calDay']!, startMin: Math.max(0, Math.min(1440 - gran, Math.floor(minute / gran) * gran)) };
    }
    return null;
  };
  useEffect(() => {
    const over = (e: Event) => {
      const d = (e as CustomEvent<{ taskId?: string; x?: number; y?: number }>).detail;
      if (!d?.taskId || typeof d.x !== 'number' || typeof d.y !== 'number') return;
      const slot = pointToSlot(d.x, d.y);
      if (!slot) { if (calendarGhost()?.testId === 'calendar-snap-band') setCalendarGhost(null); return; }
      showPlanGhost(slot.day, slot.startMin, { taskId: d.taskId });
    };
    const end = () => { if (calendarGhost()?.testId === 'calendar-snap-band') setCalendarGhost(null); endTaskDragInfo(); };
    window.addEventListener('krnl:calendar:drag-over', over);
    window.addEventListener('krnl:calendar:drag-end', end);
    return () => { window.removeEventListener('krnl:calendar:drag-over', over); window.removeEventListener('krnl:calendar:drag-end', end); };
  });
  useEffect(() => {
    if (!landedTaskId) return;
    const t = window.setTimeout(() => setLandedTaskId(null), 700);
    return () => window.clearTimeout(t);
  }, [landedTaskId]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ taskId?: string; day?: string; clientY?: number; anyTime?: boolean }>).detail;
      if (!d?.taskId || !d.day || !weekDays.includes(d.day)) return;
      if (d.anyTime) { void putPlanOnDay({ taskId: d.taskId }, d.day); return; }
      const col = rootRef.current?.querySelector<HTMLElement>(`[data-cal-day="${d.day}"]`);
      if (!col || typeof d.clientY !== 'number') return;
      const rect = col.getBoundingClientRect();
      const minute = ((Math.max(0, d.clientY - rect.top) / screenScale(col)) / rowHeight) * 60;
      const snapped = Math.max(0, Math.min(1440 - gran, Math.floor(minute / gran) * gran));
      const task = useBoardStore.getState().board?.nodes.find((n) => n.id === d.taskId);
      const ts = task?.state as { plannedMin?: number; durationMin?: number } | undefined;
      const len = ts?.plannedMin ?? ts?.durationMin ?? 30;
      scheduleTask(d.taskId, `${d.day}T${String(Math.floor(snapped / 60)).padStart(2, '0')}:${String(snapped % 60).padStart(2, '0')}`, len);
      setCalendarGhost(null);
      setLandedTaskId(d.taskId);
    };
    window.addEventListener('krnl:calendar:drop-task', on);
    return () => window.removeEventListener('krnl:calendar:drop-task', on);
  });

  // Popup shown when a task block is clicked (PR #122).
  const [taskPopup, setTaskPopup] = useState<{
    task: ScheduledTask;
    x: number;
    y: number;
  } | null>(null);

  // #6/#7 — a tracked-reality segment with the day it was clipped to, used by
  // the reality info popup (when it started / ended / duration).
  type RealitySeg = {
    id: string; kind: 'work' | 'break'; taskId: string | null; tag: string | null; label: string;
    startMin: number; endMin: number; live: boolean; startMs: number; endMs: number;
  };
  // #7 — exact-time editor fields inside the task popup (seeded when it opens).
  const [exactTime, setExactTime] = useState('');
  const [exactDur, setExactDur] = useState('');
  useEffect(() => {
    if (!taskPopup) return;
    const d = new Date(taskPopup.task.startISO);
    setExactTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setExactDur(taskPopup.task.timeOpen ? '' : String(taskPopup.task.scheduledDurationMin));
  }, [taskPopup]);

  // #7 — apply the typed exact time + duration to the task (bypasses the grid
  // snap entirely → solves the "only 15-min grid" complaint). #4 — unschedule
  // pulls the task off the calendar. Both dispatch to the TASK node.
  const applyExactTime = (task: ScheduledTask, time: string = exactTime) => {
    const day = task.startISO.slice(0, 10);
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    const h = m ? Math.min(23, Math.max(0, parseInt(m[1]!, 10))) : new Date(task.startISO).getHours();
    const min = m ? Math.min(59, Math.max(0, parseInt(m[2]!, 10))) : 0;
    const durN = Math.max(1, Math.round(Number(exactDur) || task.scheduledDurationMin));
    const scheduledFor = `${day}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    // Same path as a drag (Todo row follows; a chained task lands where put).
    applyTaskState(task.id, (s) => taskSetPlannedMin(s, { minutes: durN }));
    scheduleTask(task.id, scheduledFor, durN);
  };

  // #6 — info popup for a clicked tracked-reality (pomo) segment.
  const [realityPopup, setRealityPopup] = useState<{ seg: RealitySeg; x: number; y: number } | null>(null);
  // Escape closes the span details popup (it used to close only on an outside click).
  useEffect(() => {
    if (!realityPopup) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setRealityPopup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [realityPopup]);
  // #7 — overlap disambiguation. A right-click enumerates EVERY layer under the
  // cursor (scheduled task blocks + tracked-reality segments) into one picker so
  // the user can choose which to act on even when they cover the same minute.
  type LayerItem =
    | { kind: 'task'; task: ScheduledTask }
    | { kind: 'reality'; seg: RealitySeg };
  // `open`: what picking a row does — its right-click menu, or (left click on
  // overlapping spans, #203) its details popup.
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; items: LayerItem[]; open?: 'menu' | 'details' } | null>(null);
  // A task row dragged out of the layer picker: the picker goes see-through so
  // the drop reaches the grid underneath, and closes when the drag ends.
  const [layerDragging, setLayerDragging] = useState(false);
  // A plan being dragged from this calendar: shows the unschedule drop zone.
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [unschedHot, setUnschedHot] = useState(false);
  const beginTaskDrag = (e: DragEvent<HTMLDivElement>, task: ScheduledTask) => {
    setTaskPopup(null);
    // The payload carries WORK time (plannedMin), not block height: the
    // selector adds breaks on top, so the block height would grow every nudge.
    // Decision 61 — the spot it was grabbed by stays under the pointer (as
    // when an event is moved): the landing start is the pointer's slot minus it.
    const r = e.currentTarget.getBoundingClientRect();
    const grabRaw = ((e.clientY - r.top) / screenScale(e.currentTarget) / rowHeight) * 60;
    const grabMin = Number.isFinite(grabRaw) ? Math.max(0, Math.min(Math.max(0, task.plannedMin - gran), Math.floor(grabRaw / gran) * gran)) : 0;
    e.dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId: task.id, durationMin: task.plannedMin, grabMin }));
    e.dataTransfer.effectAllowed = 'move';
    beginTaskDragInfo({ taskId: task.id, durationMin: task.plannedMin, grabMin });
    // Decision 61 — no browser picture: the block steps back and the ghost
    // shows where it lands; off the hours, the small box carries it.
    startCarry(e, toneVarForTask(task.id), 'offCalendar');
    // After the drag has begun: changing the DOM inside dragstart cancels it.
    window.setTimeout(() => setDragTaskId(task.id), 0);
  };
  const endTaskDrag = () => { setDragTaskId(null); setUnschedHot(false); setAnyHot(null); };
  // Decision 40 — the ANY TIME cell a plan is dragged over.
  const [anyHot, setAnyHot] = useState<string | null>(null);
  // A drop that moves the plan unmounts the element it was dragged from, and
  // then no dragend reaches it — so any drop or dragend in the window ends it.
  useEffect(() => {
    if (!dragTaskId) return;
    const end = () => { setDragTaskId(null); setUnschedHot(false); };
    window.addEventListener('drop', end, true);
    window.addEventListener('dragend', end, true);
    return () => {
      window.removeEventListener('drop', end, true);
      window.removeEventListener('dragend', end, true);
    };
  }, [dragTaskId]);
  // Right-click menu (shared with the Clock — ContextMenu/scheduleMenus.ts).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  // Decision 59 — a left click shows what it is (the info card, as on the
  // Clock and the month); changing it is "Details" (here or right-click).
  const [infoPopup, setInfoPopup] = useState<{ taskId: string; x: number; y: number; startMs?: number; endMs?: number; task?: ScheduledTask; routine?: { h: Habit; date: string; startMin: number; endMin: number } } | null>(null);
  const openTaskInfo = (task: ScheduledTask, x: number, y: number) => {
    // Decision 60 — one card or menu at a time: nothing stacks on another.
    setCtxMenu(null);
    setLayerMenu(null);
    setTaskPopup(null);
    const startMs = new Date(task.startISO).getTime();
    setInfoPopup({ taskId: task.id, x, y, startMs, endMs: startMs + task.scheduledDurationMin * 60_000, task });
  };
  const openItemMenu = (item: LayerItem, x: number, y: number) => {
    setInfoPopup(null);
    setTaskPopup(null);
    if (item.kind === 'task') {
      const t = item.task;
      const startMs = new Date(t.startISO).getTime();
      setCtxMenu({
        x, y,
        items: taskMenuItems(
          { id: t.id, text: t.text, done: t.done, startMs, endMs: startMs + t.scheduledDurationMin * 60_000 },
          { easy, onDetails: () => setTaskPopup({ task: t, x, y }) },
        ),
      });
    } else {
      // Recorded time: right-click opens the same popup as left-click — one
      // place with the task, the times (double-click to change) and delete.
      setRealityPopup({ seg: item.seg, x, y });
    }
  };
  // #203 — what a left click opens: a span's details popup, a task's popup.
  const openItemDetails = (item: LayerItem, x: number, y: number) => {
    if (item.kind === 'task') openTaskInfo(item.task, x, y);
    else setRealityPopup({ seg: item.seg, x, y });
  };

  // ADR 0003 §4 — read placements from the cascade selector, not raw
  // scheduledFor. The selector derives successor start times from the chain's
  // single anchor; WeekView no longer cares which task is the anchor for
  // rendering, only the resulting placements.
  const weekRangeFromISO = `${baseYMD}T00:00`;
  const weekRangeToISO = `${addDays(baseYMD, dayCount)}T00:00`;
  // Perf: subscribe to the board only (not hover / viewport) and derive in a
  // memo. The previous useShallow selectors built new objects on every store
  // change, so the whole calendar re-rendered on every hover and pan.
  const boardForCal = useBoardStore((s) => s.board);
  const tagLibrary = boardTagLibrary(boardForCal);
  const scheduledTasks = useMemo((): ScheduledTask[] => {
      const s = { board: boardForCal };
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
        // Wall-clock difference (local fields read as UTC), so a block that
        // crosses a DST change keeps its planned length on the grid.
        const startMs = wallClockMs(p.startISO);
        const endMs = wallClockMs(p.endISO);
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
          anchorTaskId: p.anchorTaskId,
          kind: p.kind,
          breakdown: p.breakdown,
          timeOpen: st.timeOpen === true,
        });
      }
      return out;
  }, [boardForCal, weekRangeFromISO, weekRangeToISO]);

  // calendar-clock-visuals F30 — a chained plan names the task it follows.
  const afterOf = useMemo(() => {
    const out = new Map<string, string>();
    const textOf = new Map((boardForCal?.nodes ?? []).filter((n) => n.kind === 'todo.task').map((n) => [n.id, String((n.state as { text?: string }).text ?? '')]));
    for (const e of boardForCal?.edges ?? []) {
      if (e.from.event !== 'task.next') continue;
      const t = textOf.get(e.from.nodeId);
      if (t !== undefined && textOf.has(e.to.nodeId) && !out.has(e.to.nodeId)) out.set(e.to.nodeId, t || 'Untitled');
    }
    return out;
  }, [boardForCal]);

  // Read scheduled habits from the board store (ADR 0002 §6).
  const scheduledHabits = useMemo((): ScheduledHabit[] => {
      const s = { board: boardForCal };
      if (!s.board) return [];
      const result: ScheduledHabit[] = [];
      for (const n of s.board.nodes) {
        if (n.kind !== 'habit') continue;
        const habitState = n.state as { habits?: Habit[] } | null;
        if (!habitState?.habits) continue;
        for (const h of habitState.habits) {
          // Pills are for timed habits; routines are bands (routinesForCal),
          // untimed habits live in the Habit grid (Decision 39).
          if (h.archived || isRoutine(h) || !hasTimeOfDay(h)) continue;
          result.push({
            id: h.id,
            name: h.name,
            color: h.color,
            icon: h.icon,
            schedule: h.schedule,
            log: h.log,
            motherId: n.id,
            ...(h.amount ? { amount: h.amount, ...(h.counts ? { counts: h.counts } : {}) } : {}),
          });
        }
      }
      return result;
  }, [boardForCal]);

  // The DAY line (draft D, "slim line"): a plan due a day with no time yet
  // (drag it onto the grid to give it a time), and the deadline of a plan
  // planned on another day (marked "due").
  const dueByDay = useMemo(
    () => dayOnlyPlans(boardForCal?.nodes ?? [], weekDays, new Map(scheduledTasks.map((t) => [t.id, t.startISO.slice(0, 10)])), todayYMD()),
    [boardForCal, scheduledTasks, weekDays],
  );

  // Decision 39 — routines: bands behind the plans (F6), never ticked.
  const [eventsOpen, setEventsOpen] = useState<{ x: number; y: number } | null>(null);
  // window-frame.md — the Calendar's one menu (header, last button): what it
  // shows besides your plans, the repeating events, the zoom.
  const [calMenu, setCalMenu] = useState<{ x: number; y: number } | null>(null);
  const listedEvents = useMemo((): Habit[] => {
    const today = todayYMD();
    const nodes = boardForCal?.nodes ?? [];
    const all: Habit[] = [];
    for (const n of nodes) if (n.kind === 'habit') for (const h of ((n.state as { habits?: Habit[] } | null)?.habits ?? [])) if (isRoutine(h) && !h.archived) all.push(h);
    const repeating = all.filter((h) => !isOneTimeEvent(h));
    const once = all.filter((h) => isOneTimeEvent(h) && h.startsOn! >= today).sort((a, b) => `${a.startsOn}${a.schedule?.timeOfDay ?? ''}`.localeCompare(`${b.startsOn}${b.schedule?.timeOfDay ?? ''}`));
    return [...repeating, ...once];
  }, [boardForCal]);
  const routinesForCal = useMemo((): Habit[] => {
    const out: Habit[] = [];
    for (const n of boardForCal?.nodes ?? []) {
      if (n.kind !== 'habit') continue;
      for (const h of ((n.state as { habits?: Habit[] } | null)?.habits ?? [])) if (isRoutine(h) && !h.archived) out.push(h);
    }
    return out;
  }, [boardForCal]);
  // A day's routines with their lanes: overlapping ones sit side by side.
  const routineHitsOn = (dayYMD: string): Array<{ h: Habit; occ: RoutineSpan }> => {
    const hits: Array<{ h: Habit; occ: RoutineSpan }> = [];
    // Its own time that day, and the after-midnight part of last night's (a night shift).
    if (layers.routines) for (const h of routinesForCal) for (const occ of routineSpansOn(h, dayYMD)) hits.push({ h, occ });
    return hits;
  };
  const routineKey = (r: { h: Habit; occ: RoutineSpan }) => `rt:${r.h.id}${r.occ.spill ? ':spill' : ''}`;
  /**
   * Decision 60 — ONE lane plan per day for plans and repeating events
   * (routineLanes.sharedLanes): a plan and an event at the same time sit side
   * by side, never on top of each other.
   */
  const dayLanes = (dayYMD: string) => {
    const minSpan = (MIN_BLOCK_PX / rowHeight) * 60;
    const items: KindSpan[] = [
      ...routineHitsOn(dayYMD).map((r) => ({ id: routineKey(r), startMin: r.occ.startMin, endMin: Math.max(r.occ.endMin, r.occ.startMin + minSpan), kind: 'event' as const })),
      ...(slicesByDay.get(dayYMD) ?? []).map((sl) => ({ id: sl.task.id, startMin: sl.sliceStartMin, endMin: Math.max(sl.sliceEndMin, sl.sliceStartMin + minSpan), kind: 'task' as const })),
    ];
    return sharedLanes(items);
  };
  const routinesOnDay = (dayYMD: string): Array<{ h: Habit; occ: RoutineSpan; lane: number; lanes: number }> => {
    const hits = routineHitsOn(dayYMD);
    const lanes = dayLanes(dayYMD);
    return hits.map((r) => {
      const l = lanes.get(routineKey(r));
      return { ...r, lane: l?.lane ?? 0, lanes: l?.lanes ?? 1 };
    });
  };
  /** The routine under a click: by time, then by lane (xFrac = 0..1 across the day). */
  const routineAt = (dayYMD: string, minute: number, xFrac = 0): { h: Habit; occ: RoutineOccurrence } | null => {
    if (!layers.routines) return null;
    const under = routinesOnDay(dayYMD).filter((r) => minute >= r.occ.startMin && minute < r.occ.endMin);
    const hit = under.find((r) => xFrac >= r.lane / r.lanes && xFrac < (r.lane + 1) / r.lanes) ?? under[0];
    return hit ? { h: hit.h, occ: hit.occ } : null;
  };
  const [routineMove, setRoutineMove] = useState<{ id: string; name: string; date: string; value: string; x: number; y: number } | null>(null);
  // ── Decision 59 — drag a repeating event like a plan ──────────────────────
  // Drag it to another time (or another weekday), or pull its bottom / top
  // edge: the event changes for every week, not just this one (owner,
  // 2026-11-21). The bands take no pointer events (drops on the hours under
  // them must still land), so the day column finds the event under the press.
  const [rtDrag, setRtDrag] = useState<{ id: string; name: string; color: string; fromDay: string; toDay: string; startMin: number; endMin: number; committing?: { timeOfDay: string; durationMin: number } } | null>(null);
  const rtSuppressClick = useRef(false);
  const RT_EDGE_PX = 6;
  const routineEdgeAt = (dayYMD: string, e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = screenScale(e.currentTarget);
    const relY = Math.max(0, e.clientY - rect.top) / scale;
    const minute = (relY / rowHeight) * 60;
    const r = routineAt(dayYMD, minute, (e.clientX - rect.left) / Math.max(1, rect.width));
    if (!r || r.occ.skipped || (r.occ as RoutineSpan).spill) return null;
    const topPx = (r.occ.startMin / 60) * rowHeight;
    const botPx = (r.occ.endMin / 60) * rowHeight;
    const mode: 'move' | 'top' | 'bottom' = relY >= botPx - RT_EDGE_PX ? 'bottom' : relY <= topPx + RT_EDGE_PX - 1 && botPx - topPx > 3 * RT_EDGE_PX ? 'top' : 'move';
    return { r, mode, rect, scale };
  };
  // Decision 60 — the event under the pointer lights up like a plan does.
  const [rtHover, setRtHover] = useState<string | null>(null);
  const onColumnPointerMove = (dayYMD: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 0 || rtDrag) return;
    const t = e.target as HTMLElement;
    if (t.closest?.('.cal-block, .cal-habit, button')) { if (e.currentTarget.style.cursor) e.currentTarget.style.cursor = ''; if (rtHover) setRtHover(null); return; }
    const hit = layers.routines ? routineEdgeAt(dayYMD, e) : null;
    const cur = !hit ? '' : hit.mode === 'move' ? 'grab' : 'ns-resize';
    if (e.currentTarget.style.cursor !== cur) e.currentTarget.style.cursor = cur;
    const key = hit ? `${hit.r.h.id}@${dayYMD}` : null;
    if (key !== rtHover) setRtHover(key);
  };
  const onColumnPointerDown = (dayYMD: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !layers.routines) return;
    if ((e.target as HTMLElement).closest?.('.cal-block, .cal-habit, button')) return;
    const hit = routineEdgeAt(dayYMD, e);
    if (!hit) return;
    const { r, mode, scale } = hit;
    const colW = e.currentTarget.getBoundingClientRect().width;
    const span = r.occ as RoutineSpan;
    const len = Math.max(15, span.fullEnd - span.fullStart);
    const origStart = span.fullStart;
    const origEnd = origStart + len;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const fromIdx = weekDays.indexOf(dayYMD);
    const kind = r.h.schedule?.kind ?? 'daily';
    let moved = false;
    let carried = false;
    let last: { toDay: string; startMin: number; endMin: number } | null = null;
    const snap = (m: number) => Math.round(m / 15) * 15;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const dMin = snap(((dy / scale) / rowHeight) * 60);
      let startMin = origStart;
      let endMin = origEnd;
      if (mode === 'move') { startMin = Math.max(0, Math.min(1440 - 15, origStart + dMin)); endMin = startMin + len; }
      else if (mode === 'bottom') endMin = Math.max(origStart + 15, Math.min(origStart + 24 * 60, origEnd + dMin));
      else startMin = Math.max(0, Math.min(origEnd - 15, origStart + dMin));
      // Only a weekly event changes its day (a daily one is on every day).
      const shift = mode === 'move' && kind === 'weekly' && !singleDay && colW > 0 ? Math.round(dx / colW) : 0;
      const toIdx = Math.max(0, Math.min(weekDays.length - 1, fromIdx + shift));
      last = { toDay: weekDays[toIdx] ?? dayYMD, startMin, endMin };
      // Decision 61 — the week is re-drawn once (the event steps back); the
      // ghost then moves on its own.
      if (!carried) { carried = true; setRtDrag({ id: r.h.id, name: r.h.name, color: r.h.color, fromDay: dayYMD, ...last }); }
      setCalendarGhost({ day: last.toDay, startMin, endMin, name: r.h.name, times: isOneTimeEvent(r.h) ? ghostTimes(startMin, endMin) : `${ghostTimes(startMin, endMin)} · every week`, tone: `var(--${r.h.color})`, testId: 'calendar-routine-ghost', edge: mode === 'bottom' ? 'bottom' : 'top' });
    };
    const clearRoutineGhost = () => { if (calendarGhost()?.testId === 'calendar-routine-ghost') setCalendarGhost(null); };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!moved || !last) { setRtDrag(null); clearRoutineGhost(); return; }
      rtSuppressClick.current = true;
      window.setTimeout(() => { rtSuppressClick.current = false; }, 400);
      const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const sched = r.h.schedule;
      if (!sched) { setRtDrag(null); clearRoutineGhost(); return; }
      const durationMin = Math.max(15, last.endMin - last.startMin);
      const timeOfDay = hm(last.startMin);
      let next = { ...sched, timeOfDay, durationMin } as typeof sched;
      if (sched.kind === 'weekly' && last.toDay !== dayYMD) {
        const fromDow = ymdToIsoDow(dayYMD);
        const toDow = ymdToIsoDow(last.toDay);
        const days = [...new Set([...sched.days.filter((d) => d !== fromDow), toDow])].sort((a, b) => a - b);
        next = { ...sched, days, timeOfDay, durationMin } as typeof sched;
      }
      if (sched.timeOfDay === timeOfDay && sched.durationMin === durationMin && last.toDay === dayYMD) { setRtDrag(null); clearRoutineGhost(); return; }
      const movedOnce = isOneTimeEvent(r.h) && last.toDay !== dayYMD ? last.toDay : null;
      // Decision 60 — the ghost stays until the event is drawn at its new time
      // (no flash back to the old place); never longer than a moment.
      const done = last;
      setRtDrag({ id: r.h.id, name: r.h.name, color: r.h.color, fromDay: dayYMD, ...done, committing: { timeOfDay, durationMin } });
      window.setTimeout(() => {
        setRtDrag((d) => (d && d.committing && d.id === r.h.id ? null : d));
        clearRoutineGhost();
      }, 1500);
      // A one-off moved occurrence follows the series again.
      if (r.occ.moved) void habitMotherCommand('routine.unskip', { id: r.h.id, date: r.occ.date });
      void habitMotherCommand('habit.setSchedule', { habitId: r.h.id, schedule: next });
      // Decision 62 — a one-time event carried to another day happens there.
      if (movedOnce) void habitMotherCommand('routine.setOn', { id: r.h.id, date: movedOnce });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.stopPropagation();
    e.preventDefault();
  };
  useEffect(() => {
    if (!rtDrag?.committing) return;
    const h = routinesForCal.find((x) => x.id === rtDrag.id);
    if (!h || (h.schedule?.timeOfDay === rtDrag.committing.timeOfDay && h.schedule?.durationMin === rtDrag.committing.durationMin)) {
      setRtDrag(null);
      if (calendarGhost()?.testId === 'calendar-routine-ghost') setCalendarGhost(null);
    }
  }, [routinesForCal, rtDrag]);
  useEffect(() => {
    if (!routineMove) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerOpen()) setRoutineMove(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [routineMove]);
  // Decision 40 — "New here…" / "Edit event…": the card that makes a plan or a repeating event.
  const [eventCard, setEventCard] = useState<{ x: number; y: number; day: string; initial: EventDraft; allowOnce: boolean; editId?: string } | null>(null);
  const [eventRemind, setEventRemind] = useState<{ id: string; x: number; y: number; value: number | null } | null>(null);
  const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const daysOf = (h: Habit): number[] => !h.schedule || h.schedule.kind === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : h.schedule.kind === 'weekdays' ? [1, 2, 3, 4, 5] : [...h.schedule.days];
  const [calAdding, setCalAdding] = useState(false);
  const [calAddText, setCalAddText] = useState('');
  // Decision 59 — one rule with Todo and Habits: while you type, the plan
  // card shows above the field, filled from the words; Enter adds.
  const [calOv, setCalOv] = useState<PlanOverrides>({});
  // Decision 60 — a click away hides the card (as in Todo); typing brings it back.
  const [calCardHidden, setCalCardHidden] = useState(false);
  const calDefaultDay = (): string => (weekDays.includes(todayYMD()) ? todayYMD() : weekDays[0]!);
  const calDraftOf = (raw: string): { text: string; hint: boolean; d: PlanDraft } => {
    const q = parseQuickAdd(raw);
    const fromWords: PlanDraft = { day: q.day ?? calDefaultDay(), time: q.time ?? null, lengthMin: q.durationMin ?? null, deadline: q.deadline ?? null };
    return { text: q.text || raw, hint: !!q.hint, d: effectiveDraft(fromWords, calOv) };
  };
  const calAddRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raw = calAdding ? calAddText.trim() : '';
    const { text, hint, d } = raw ? calDraftOf(raw) : { text: '', hint: false, d: { day: null, time: null, lengthMin: null, deadline: null } as PlanDraft };
    const day = d.day ?? calDefaultDay();
    if (!raw || hint || !d.time || !weekDays.includes(day)) {
      if (calendarGhost()?.testId === 'calendar-add-ghost') setCalendarGhost(null);
      return;
    }
    const startMin = Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3));
    const endMin = Math.min(1440, startMin + (d.lengthMin ?? 60));
    setCalendarGhost({ day, startMin, endMin, name: text, times: ghostTimes(startMin, endMin), tone: 'var(--acid)', testId: 'calendar-add-ghost' });
  }, [calAdding, calAddText, weekDays.join(',')]);
  useEffect(() => () => { if (calendarGhost()?.testId === 'calendar-add-ghost') setCalendarGhost(null); }, []);
  useDismissOutside(calAdding && calAddText.trim() !== '' && !calCardHidden, ['[data-testid="when-popover"]', calAddRowRef], () => setCalCardHidden(true));
  const calAddInputRef = useRef<HTMLInputElement>(null);
  const openNewAt = (dayYMD: string, minute: number, x: number, y: number) => {
    const snapMin = Math.max(0, Math.min(1425, Math.floor(minute / 15) * 15));
    const at = `${String(Math.floor(snapMin / 60)).padStart(2, '0')}:${String(snapMin % 60).padStart(2, '0')}`;
    const isoDow = ((new Date(`${dayYMD}T00:00:00`).getDay() + 6) % 7) + 1;
    setEventCard({ x, y, day: dayYMD, allowOnce: true, initial: { name: '', mode: 'once', days: [isoDow], time: at, lengthMin: 60 } });
  };
  // Decision 62 — the Calendar makes only events (once or repeating); tasks
  // come from the Todo node. "Once" is an event on that day, never a plan.
  const isoDowOfYMD = (ymd: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 => (((new Date(`${ymd}T00:00:00`).getDay() + 6) % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const addOneTimeEvent = (name: string, day: string, time: string, lengthMin: number) => {
    void habitMotherCommand('habit.add', { name, kind: 'routine', schedule: { kind: 'weekly', days: [isoDowOfYMD(day)], timeOfDay: time, durationMin: lengthMin }, on: day });
  };
  /** The event card for an event: Once or Repeats, as it is now. */
  const editEventCard = (h: Habit, day: string, x: number, y: number, fallbackTime: string) => {
    const once = isOneTimeEvent(h);
    setEventCard({
      x, y, day: once ? h.startsOn! : day, allowOnce: true, editId: h.id,
      initial: { name: h.name, mode: once ? 'once' : 'repeat', days: daysOf(h), time: h.schedule?.timeOfDay ?? fallbackTime, lengthMin: h.schedule?.durationMin ?? 60 },
    });
  };
  const submitEvent = (card: NonNullable<typeof eventCard>, d: EventDraft) => {
    setEventCard(null);
    if (d.mode === 'once') {
      if (!card.editId) { addOneTimeEvent(d.name, card.day, d.time, d.lengthMin); return; }
      void habitMotherCommand('habit.rename', { id: card.editId, name: d.name });
      void habitMotherCommand('habit.setSchedule', { habitId: card.editId, schedule: { kind: 'weekly', days: [isoDowOfYMD(card.day)], timeOfDay: d.time, durationMin: d.lengthMin } });
      void habitMotherCommand('routine.setOn', { id: card.editId, date: card.day });
      return;
    }
    const days = [...d.days].sort() as Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
    const schedule = days.length === 7
      ? { kind: 'daily' as const, timeOfDay: d.time, durationMin: d.lengthMin }
      : { kind: 'weekly' as const, days, timeOfDay: d.time, durationMin: d.lengthMin };
    if (card.editId) {
      void habitMotherCommand('habit.rename', { id: card.editId, name: d.name });
      void habitMotherCommand('habit.setSchedule', { habitId: card.editId, schedule });
      // A one-time event made to repeat: no first or last day any more.
      void habitMotherCommand('routine.setOn', { id: card.editId, date: null });
    } else {
      void habitMotherCommand('habit.add', { name: d.name, kind: 'routine', schedule });
    }
  };
  const routineMenuItems = (h: Habit, occ: RoutineOccurrence | RoutineSpan, x: number, y: number): ContextMenuItem[] => {
    const hmOf = (m: number) => { const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
    const s0 = 'fullStart' in occ ? occ.fullStart : occ.startMin;
    const s1 = 'fullEnd' in occ ? occ.fullEnd : occ.endMin;
    const dayHint = new Date(`${occ.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    const days = daysOf(h);
    if (isOneTimeEvent(h)) {
      return [
        { header: true, label: `${h.name} · ${hmOf(s0)}–${hmOf(s1)}${s1 > 1440 ? ' (next day)' : ''} · ${new Date(`${occ.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`, onSelect: () => {} },
        { label: 'Edit event…', icon: <MenuIcon name="rename" />, onSelect: () => editEventCard(h, occ.date, x, y, hmOf(s0)) },
        ...(easy && h.remindMin === undefined ? [] : [{ label: 'Remind me…', icon: <MenuIcon name="reminder" />, hint: h.remindMin === undefined ? 'Off' : h.remindMin === 0 ? 'at start' : `${h.remindMin} min`, onSelect: () => setEventRemind({ id: h.id, x, y, value: h.remindMin ?? null }) }]),
        { label: 'Delete event', icon: <MenuIcon name="delete" />, danger: true, divider: true, onSelect: () => { void deleteRoutine(h.id); } },
      ];
    }
    return [
      { header: true, label: `${h.name} · ${hmOf(s0)}–${hmOf(s1)}${s1 > 1440 ? ' (next day)' : ''} · ${days.length === 7 ? 'every day' : days.map((n) => DAY_LETTER[n - 1]).join(' ')}`, onSelect: () => {} },
      occ.skipped
        ? { label: 'Undo skip', icon: <MenuIcon name="undo" />, hint: dayHint, onSelect: () => { void habitMotherCommand('routine.unskip', { id: h.id, date: occ.date }); } }
        : { label: 'Skip this one', icon: <MenuIcon name="skip" />, hint: dayHint, onSelect: () => { void habitMotherCommand('routine.skip', { id: h.id, date: occ.date }); } },
      // menus.md — six rows at most: this one (skip, move or back), the event
      // (edit), More, then the two ways out. The reminder and the less likely
      // of move / back sit behind More.
      // Decision 59 — moving is a drag now (the whole series); a one-off moved
      // earlier can still go back.
      ...(occ.skipped || !occ.moved ? [] : [{ label: 'Back to its usual time', icon: <MenuIcon name="undo" />, onSelect: () => { void habitMotherCommand('routine.unskip', { id: h.id, date: occ.date }); } }]),
      {
        label: 'Edit event…', icon: <MenuIcon name="rename" />,
        onSelect: () => editEventCard(h, occ.date, x, y, hmOf(s0)),
      },
      // Reminders are Advanced (owner, 2026-11-09); a reminder set earlier still shows in Easy, to turn it off.
      ...((): ContextMenuItem[] => {
        const more: ContextMenuItem[] = [
          ...(easy && h.remindMin === undefined ? [] : [{ label: 'Remind me…', icon: <MenuIcon name="reminder" />, hint: h.remindMin === undefined ? 'Off' : h.remindMin === 0 ? 'at start' : `${h.remindMin} min`, onSelect: () => setEventRemind({ id: h.id, x, y, value: h.remindMin ?? null }) }]),
        ];
        return more.length > 0 ? [{ label: 'More', icon: <MenuIcon name="more" />, children: more, onSelect: () => {} }] : [];
      })(),
      { label: 'End after this day', icon: <MenuIcon name="end" />, hint: 'keeps past', divider: true, onSelect: () => { void habitMotherCommand('routine.end', { id: h.id, date: occ.date }); } },
      { label: 'Delete event', icon: <MenuIcon name="delete" />, danger: true, onSelect: () => { void deleteRoutine(h.id); } },
    ];
  };

  // Decision 60 — the committed resize gives way once the plan is drawn there.
  useEffect(() => {
    if (!resizeDraft?.committing) return;
    const t = scheduledTasks.find((x) => x.id === resizeDraft.taskId);
    if (!t) { setResizeDraft(null); return; }
    const startMin = Number(t.startISO.slice(11, 13)) * 60 + Number(t.startISO.slice(14, 16));
    if (startMin === resizeDraft.absStartMin && Math.abs(t.scheduledDurationMin - resizeDraft.durationMin) < 1) setResizeDraft(null);
  }, [scheduledTasks, resizeDraft]);

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
      const nowMin = now.getHours() * 60 + now.getMinutes();
      // Today: start a little before now (what's next matters most) — except
      // in the small hours with nothing planned near now: a new user opening
      // the app at 4 am saw an empty 02:00–03:30 strip, not their day.
      const nearNow = (slicesByDay.get(todayYmd) ?? []).some((sl) => sl.sliceEndMin > nowMin - 180 && sl.sliceStartMin < nowMin + 180);
      if (nowMin >= 6 * 60 || nearNow) target = Math.max(0, nowMin - 90);
    }
    // Open on a whole hour (the last page too — the browser would stop
    // mid-hour) and never on a block cut in half: step back to its start.
    const maxHour = Math.max(0, Math.floor((el.scrollHeight - el.clientHeight) / rowHeight));
    let hour = Math.min(maxHour, Math.max(0, Math.floor((target - 20) / 60)));
    for (let moved = true; moved && hour > 0;) {
      moved = false;
      for (const ymd of weekDays) {
        for (const sl of slicesByDay.get(ymd) ?? []) {
          if (sl.sliceStartMin < hour * 60 && sl.sliceEndMin > hour * 60) { hour = Math.floor(sl.sliceStartMin / 60); moved = true; }
        }
      }
    }
    el.scrollTop = hour * rowHeight;
    setGridTop(el.scrollTop);
  }, [baseYMD, dayCount, weekDays, slicesByDay, rowHeight]);

  // ── No scrolling: the hour grid shows whole-hour windows ───────────────────
  // The grid never shows a scrollbar. The wheel (and the ‹ › pager, and a
  // drag held at the top/bottom edge) flips to the previous / next window of
  // hours that fits the panel.
  const [gridTop, setGridTop] = useState(0);
  const [gridH, setGridH] = useState(0);
  useEffect(() => {
    const el = gridBodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setGridH(el.clientHeight));
    ro.observe(el);
    setGridH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  // Decision 58 — the hours scroll smoothly (the wheel, a trackpad, a finger);
  // the arrows glide by most of a screen.
  const flipHours = (dir: 1 | -1) => {
    const el = gridBodyRef.current;
    if (!el) return;
    const by = dir * Math.max(rowHeight, el.clientHeight * 0.8);
    if (typeof el.scrollBy === 'function') el.scrollBy({ top: by, behavior: 'smooth' });
    else { el.scrollTop += by; setGridTop(el.scrollTop); }
  };
  void stepHourWindow;

  // ── Zoom gestures (Decision 58) ─────────────────────────────────────────
  // The hour under the pointer stays under the pointer while the zoom changes.
  const zoomAnchor = useRef<{ min: number; offset: number } | null>(null);
  const zoomCommit = useRef<number | null>(null);
  const liveZoomRef = useRef<number | null>(null);
  const zoomTo = useCallback((next: number, clientY: number | null) => {
    const el = gridBodyRef.current;
    const z = Math.min(CAL_ZOOM_MAX, Math.max(zoomFloor, next));
    const cur = liveZoomRef.current ?? Math.min(CAL_ZOOM_MAX, Math.max(zoomFloor, state.zoom ?? 2));
    if (el) {
      const rect = el.getBoundingClientRect();
      const offset = clientY === null ? el.clientHeight / 2 : Math.max(0, Math.min(el.clientHeight, clientY - rect.top));
      const min = ((el.scrollTop + offset - GRID_PAD) / rowFor(cur)) * 60;
      zoomAnchor.current = { min, offset };
    }
    liveZoomRef.current = z;
    setLiveZoom(z);
    if (zoomCommit.current !== null) window.clearTimeout(zoomCommit.current);
    zoomCommit.current = window.setTimeout(() => {
      zoomCommit.current = null;
      onCommand('calendar.setZoom', { zoom: Math.round(z * 20) / 20 });
    }, 320);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCommand, state.zoom, fillRow, zoomFloor]);
  // Once the saved zoom has caught up, the live one steps aside.
  useEffect(() => {
    if (liveZoom !== null && zoomCommit.current === null && Math.abs((state.zoom ?? 2) - liveZoom) < 0.06) { liveZoomRef.current = null; setLiveZoom(null); }
  }, [state.zoom, liveZoom]);
  useLayoutEffect(() => {
    const el = gridBodyRef.current;
    const a = zoomAnchor.current;
    if (!el || !a) return;
    zoomAnchor.current = null;
    el.scrollTop = Math.max(0, (a.min / 60) * rowHeight + GRID_PAD - a.offset);
  }, [rowHeight]);
  useEffect(() => {
    const el = gridBodyRef.current;
    if (!el) return;
    // Pinch on a trackpad arrives as Ctrl + wheel; Ctrl/⌘ + a mouse wheel too.
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const base = liveZoomRef.current ?? Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, state.zoom ?? 2));
      zoomTo(base * Math.exp(-e.deltaY * 0.004), e.clientY);
    };
    // Two fingers on a touch screen.
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList): number => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: liveZoomRef.current ?? (state.zoom ?? 2) };
    };
    const onTouchMove = (e: TouchEvent): void => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(pinch.z * (dist(e.touches) / Math.max(1, pinch.d)), (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2);
    };
    const onTouchEnd = (e: TouchEvent): void => { if (e.touches.length < 2) pinch = null; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [zoomTo, state.zoom]);
  // Dragging the hour gutter up or down stretches the hours, like a ruler.
  const gutterDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const z0 = liveZoomRef.current ?? zoom;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent): void => zoomTo(z0 * Math.exp((ev.clientY - startY) / 180), startY);
    const up = (): void => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  const win = hourWindow(gridTop, gridH, rowHeight, rowCount);

  // Decision 39 — the routines tour: bring this week's earliest routine into
  // the hour window (a step says "your routine is now a band").
  useEffect(() => {
    const onShow = () => {
      const el = gridBodyRef.current;
      if (!el) return;
      let first: number | null = null;
      for (const ymd of weekDays) for (const h of routinesForCal) {
        const o = routineOccurrence(h, ymd);
        if (o && (first === null || o.startMin < first)) first = o.startMin;
      }
      if (first === null) return;
      el.scrollTop = Math.max(0, Math.floor((first - 30) / 60)) * rowHeight;
      setGridTop(el.scrollTop);
    };
    window.addEventListener(SHOW_ROUTINES_EVENT, onShow);
    return () => window.removeEventListener(SHOW_ROUTINES_EVENT, onShow);
  }, [weekDays, routinesForCal, rowHeight]);

  // "Show on calendar" (task right-click): scroll the hour window to the
  // task and pulse its block.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const det = (e as CustomEvent<{ taskId?: string; startISO?: string; itemId?: string }>).detail;
      const el = gridBodyRef.current;
      if (det?.itemId) {
        // An any-time plan: blink its chip in the ANY TIME strip.
        window.setTimeout(() => {
          const chip = document.querySelector<HTMLElement>(`[data-testid="calendar-day-only-${CSS.escape(det.itemId!)}"]`);
          if (chip) highlightElement(chip);
        }, 80);
        return;
      }
      if (!el) return;
      const start = det?.startISO ? new Date(det.startISO) : null;
      if (start && !Number.isNaN(start.getTime())) {
        el.scrollTop = Math.max(0, (start.getHours() - 1) * rowHeight);
        setGridTop(el.scrollTop);
      }
      // No task: just bring that hour into view (the tour opens today at now).
      if (!det?.taskId) return;
      window.setTimeout(() => {
        const block = el.querySelector<HTMLElement>(`[data-testid="task-block-${CSS.escape(det.taskId!)}"]`);
        if (!block) return;
        highlightElement(block);
      }, 80);
    };
    window.addEventListener(CALENDAR_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(CALENDAR_REVEAL_EVENT, onReveal);
  }, [rowHeight]);

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
        showPlanGhost(dayYMD, minute);
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        e.currentTarget.removeAttribute('data-drop-target');
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.removeAttribute('data-drop-target');
        setCalendarGhost(null);

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
          grabMin?: number;
        };
        if (!payload.taskId && !payload.itemId) return;
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
        // Where it was grabbed stays under the pointer (Decision 61).
        const startAbs = Math.max(0, hour * 60 + snappedMinute - (Number.isFinite(payload.grabMin) ? payload.grabMin! : 0));
        const scheduledFor = `${dayYMD}T${String(Math.floor(startAbs / 60)).padStart(2, '0')}:${String(startAbs % 60).padStart(2, '0')}`;
        if (payload.taskId) { scheduleTask(payload.taskId, scheduledFor, payload.durationMin); setLandedTaskId(payload.taskId); }
        // A Todo row with no task node yet: the dispatcher creates and links
        // one, then schedules it (so both Todo rows and canvas tasks drop here).
        else onCommand('calendar.schedule', { itemId: payload.itemId, scheduledFor, scheduledDurationMin: payload.durationMin });
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
  function layersAt(dayYMD: string, e: ReactMouseEvent<HTMLDivElement>): LayerItem[] {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = Math.max(0, e.clientY - rect.top) / screenScale(e.currentTarget);
    const minute = (relY / rowHeight) * 60;

    const items: LayerItem[] = [];
    // Task slices covering this minute — and, when they clash, every plan of
    // that clash (all that overlap them, directly or through another), so a
    // short plan beside the click (a "TS" chip) is listed too, in time order.
    const daySlices = slicesByDay.get(dayYMD) ?? [];
    const hit = new Set(daySlices.filter((sl) => minute >= sl.sliceStartMin && minute < sl.sliceEndMin));
    for (let grew = hit.size > 0; grew;) {
      grew = false;
      for (const sl of daySlices) {
        if (hit.has(sl)) continue;
        if ([...hit].some((h) => sl.sliceStartMin < h.sliceEndMin && h.sliceStartMin < sl.sliceEndMin)) { hit.add(sl); grew = true; }
      }
    }
    for (const slice of [...hit].sort((x, y) => x.sliceStartMin - y.sliceStartMin)) {
      items.push({ kind: 'task', task: slice.task });
    }
    // Tracked-reality segments covering this minute on this day — only when the
    // click is on the thin line itself (a few px of slack), never anywhere in
    // the day at that time (owner, 2026-11-09).
    const relX = (e.clientX - rect.left) / screenScale(e.currentTarget);
    const SLACK = 3;
    // Decision 59 — only the line itself (3 px either side) answers: a plan
    // beside it keeps its own click (it stops the click before it gets here).
    const onLine = layers.recorded && relX >= trackLeft - SLACK && relX <= trackLeft + trackW + SLACK;
    if (onLine) for (const seg of realityByDay.get(dayYMD) ?? []) {
      if (minute >= seg.startMin && minute < seg.endMin) {
        items.push({ kind: 'reality', seg });
      }
    }
    return items;
  }

  function handleColumnContextMenu(dayYMD: string, e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Decision 60 — a menu never opens over a card.
    setInfoPopup(null);
    setTaskPopup(null);
    const items = layersAt(dayYMD, e);
    // #207 F7b — empty time: offer to log time that wasn't recorded.
    if (items.length === 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const minute = ((Math.max(0, e.clientY - rect.top) / screenScale(e.currentTarget)) / rowHeight) * 60;
      const [yy, mm, dd] = dayYMD.split('-').map(Number) as [number, number, number];
      const clickMs = new Date(yy, mm - 1, dd, 0, Math.floor(minute)).getTime();
      const x = e.clientX;
      const y = e.clientY;
      const future = clickMs > Date.now();
      const r = routineAt(dayYMD, minute, (e.clientX - rect.left) / Math.max(1, rect.width));
      const snapMin = Math.max(0, Math.min(1425, Math.floor(minute / 15) * 15));
      const at = `${String(Math.floor(snapMin / 60)).padStart(2, '0')}:${String(snapMin % 60).padStart(2, '0')}`;
      const isoDow = ((new Date(yy, mm - 1, dd).getDay() + 6) % 7) + 1;
      setCtxMenu({
        x, y,
        items: [
          ...(r ? routineMenuItems(r.h, r.occ, x, y) : []),
          {
            label: 'New here…',
            icon: <MenuIcon name="plus" />,
            hint: at,
            divider: !!r,
            onSelect: () => setEventCard({ x, y, day: dayYMD, allowOnce: true, initial: { name: '', mode: 'once', days: [isoDow], time: at, lengthMin: 60 } }),
          },
          {
            label: future ? 'Log time here… (only past time)' : 'Log time here…',
            icon: <MenuIcon name="when" />,
            disabled: future,
            onSelect: () => openLogTime({ ...logTimeDefaults(clickMs), x, y }),
          },
        ],
      });
      return;
    }

    // Single hit → its right-click menu directly, no picker noise.
    if (items.length === 1) {
      openItemMenu(items[0]!, e.clientX, e.clientY);
      return;
    }
    setLayerMenu({ x: e.clientX, y: e.clientY, items, open: 'menu' });
  }

  // #203 — a LEFT click on a recorded (pomo) span opens its details popup.
  // The bands take no pointer events (F16), so the column hit-tests. A task
  // block stops its own click, so only reality spans are hit here; several
  // overlapping spans open the picker, which then opens the details.
  function handleColumnClick(dayYMD: string, e: ReactMouseEvent<HTMLDivElement>) {
    const items = layersAt(dayYMD, e).filter((it) => it.kind === 'reality');
    if (items.length === 0) {
      // Decision 39 — a click on a routine band: skip, move or end it.
      const rect = e.currentTarget.getBoundingClientRect();
      const minute = ((Math.max(0, e.clientY - rect.top) / screenScale(e.currentTarget)) / rowHeight) * 60;
      const r = routineAt(dayYMD, minute, (e.clientX - rect.left) / Math.max(1, rect.width));
      if (r) {
        const [yy, mo, dd] = r.occ.date.split('-').map(Number) as [number, number, number];
        const base = new Date(yy, mo - 1, dd).getTime();
        const span = r.occ as RoutineSpan;
        setInfoPopup({
          taskId: `habit-${r.h.id}`, x: e.clientX, y: e.clientY,
          startMs: base + span.fullStart * 60_000, endMs: base + span.fullEnd * 60_000,
          routine: { h: r.h, date: r.occ.date, startMin: span.fullStart, endMin: span.fullEnd },
        });
        return;
      }
      // A single click on empty hours does nothing: it got in the way of
      // moving and selecting. Adding is a double-click (or + / right-click).
      return;
    }
    if (items.length === 1) {
      openItemDetails(items[0]!, e.clientX, e.clientY);
      return;
    }
    setLayerMenu({ x: e.clientX, y: e.clientY, items, open: 'details' });
  }

  /** Double-click on empty hours: add a plan or a repeating event there. */
  function handleColumnDoubleClick(dayYMD: string, e: ReactMouseEvent<HTMLDivElement>) {
    // A double-click on anything drawn there (a habit, a plan, an event) is not "add here".
    if ((e.target as HTMLElement).closest?.('.cal-habit, .cal-block, button')) return;
    if (layersAt(dayYMD, e).length > 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = ((Math.max(0, e.clientY - rect.top) / screenScale(e.currentTarget)) / rowHeight) * 60;
    if (routineAt(dayYMD, minute, (e.clientX - rect.left) / Math.max(1, rect.width))) return;
    openNewAt(dayYMD, minute, e.clientX, e.clientY);
  }

  // ── Task block renderer ─────────────────────────────────────────────────────

  /** Room kept at a day's left for its recorded-time track — only on days
   *  that draw one (recorded time that day, or today with the Recorded layer
   *  on); elsewhere plans start 4 px from the day line, like the right side. */
  // Decision 59 — the recorded-time line is back (the owner disliked only its
  // moving stripes and the wide gaps), slimmer and closer to the plans.
  function railPxFor(dayYMD: string): number {
    const hasTrack = layers.recorded && ((realityByDay.get(dayYMD)?.length ?? 0) > 0 || dayYMD === toYMD(new Date()));
    return hasTrack ? RAIL_PX(singleDay, tinyDays) : 3;
  }

  function renderTaskBlocks(dayYMD: string) {
    const slices = slicesByDay.get(dayYMD);
    const dayRailPx = railPxFor(dayYMD);
    const rail = `${dayRailPx}px`;
    if (!slices || slices.length === 0) return null;

    const rawLayout = computeColumnLayout(slices, (MIN_BLOCK_PX / rowHeight) * 60);

    // Readable parallel tasks: names only where lanes are READABLE_LANE_PX wide.
    // A clash narrower than that is slim letter bars (F28) — every plan still
    // its own block at its own time, nothing hidden behind a count.
    const colPxAll = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
    const railNumAll = dayRailPx;
    const dayLayout = layoutDayBlocks(
      slices.map((sl) => ({ id: sl.task.id, startMin: sl.sliceStartMin, endMin: sl.sliceEndMin, slice: sl })),
      rawLayout,
      colPxAll - railNumAll,
      READABLE_LANE_PX,
      singleDay ? LANE_CAP.day : LANE_CAP.week,
      (MIN_BLOCK_PX / rowHeight) * 60,
    );
    const colLayout = dayLayout.placements;
    // Decision 60 — a plan that overlaps a repeating event takes its lane from
    // the day's one shared plan (no letter bar: the event is beside it).
    const shared = dayLanes(dayYMD);
    for (const sl of slices) {
      const l = shared.get(sl.task.id);
      if (!l?.mixed) continue;
      colLayout.set(sl.task.id, { colIndex: l.lane, colCount: l.lanes, span: 1 });
      dayLayout.lettered.delete(sl.task.id);
    }
    dayLayout.clashes = dayLayout.clashes.filter((cg) => !cg.slices.some((x) => shared.get(x.slice.task.id)?.mixed));
    // F28 — a clash too narrow for names: every plan stays its own slim bar at
    // its real time, named by a letter. A clash still ahead gets a Line up tab,
    // placed above it (or below) only where it covers nothing.
    const letterOf = new Map<string, string>();
    const lineUpTabs: ReactNode[] = [];
    const isoDowT = ymdToIsoDow(dayYMD);
    const habitMins = layers.habits
      ? scheduledHabits.filter((h) => habitScheduledOnDow(h.schedule, isoDowT)).map((h) => {
          const [hh, mm] = h.schedule.timeOfDay.split(':');
          return parseInt(hh ?? '0', 10) * 60 + parseInt(mm ?? '0', 10);
        })
      : [];
    for (const cg of dayLayout.clashes) {
      const g = cg.slices.map((x) => x.slice);
      const labels = clashLabels(g.map((x) => x.task.text));
      g.forEach((x, i) => letterOf.set(x.task.id, labels[i]!));
      // Decision 60 — no "Fix overlap" tab: plans that overlap stay as you put them (owner, 2026-11-21).
    }

    const blocks = slices.map((slice) => {
      const { task, sliceStartMin, sliceEndMin, isContinuation, hasContinuation } = slice;

      // #7 — apply a live resize draft (if this block is being dragged) so it
      // grows/shrinks under the cursor before the commit on mouse-up.
      const draft = resizeDraft && resizeDraft.taskId === task.id ? resizeDraft : null;
      // While the edge is held the block keeps its size (the ghost shows the
      // new one); once let go it takes the new size until the board has it.
      const held = draft && draft.committing ? draft : null;
      const effStartMin = held?.absStartMin ?? sliceStartMin;
      const effLenMin = held ? held.durationMin : Math.max(1, sliceEndMin - sliceStartMin);

      // Convert minutes-from-midnight to grid-row offsets (rowHeight per hour).
      const topPx = (effStartMin / 60) * rowHeight;
      const sliceLen = effLenMin;
      const heightPx = Math.max(MIN_BLOCK_PX, (sliceLen / 60) * rowHeight);
      // Resize handles only on a self-contained head block (no cross-midnight).
      const resizable = !isContinuation && !hasContinuation;
      // The edge zone: 7 screen px, never more than a third of a short block.
      const edgeAt = (e: ReactMouseEvent<HTMLDivElement>): 'top' | 'bottom' | null => {
        const r = e.currentTarget.getBoundingClientRect();
        const zone = Math.min(7, r.height / 3);
        if (r.bottom - e.clientY <= zone) return 'bottom';
        if (e.clientY - r.top <= zone && r.height >= 18) return 'top';
        return null;
      };

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
      // A done task shows its time neutrally ("took X"), never as an overrun (C11).
      const overrunMin = task.done ? 0 : Math.round(trackedMin - task.plannedMin);
      // Decision 39 — a plan on top of a routine says so (F6).
      const overlapRoutines = layers.routines
        ? routinesForCal.filter((r) => routineSpansOn(r, dayYMD).some((o) => !o.skipped && o.startMin < slice.sliceEndMin && slice.sliceStartMin < o.endMin)).map((r) => r.name)
        : [];
      // Labels show the task's real start/end, not this day's slice edges
      // (a 22:30–01:00 block must not read "22:30–00:00").
      const taskStartDate = new Date(task.startISO);
      const blockStartMin = draft
        ? effStartMin
        : taskStartDate.getHours() * 60 + taskStartDate.getMinutes();
      const blockEndMin = blockStartMin + (draft ? effLenMin : task.scheduledDurationMin);
      // #207 storyboard B — when real work on this task began vs the plan:
      // the first work span tagged with it that touches the planned window
      // (±3h) on the plan's day. |delta| < 5 min reads as on time.
      const planStartMs = taskStartDate.getTime();
      let firstWorkMs: number | null = null;
      for (const seg of realityByDay.get(dayYMD) ?? []) {
        if (seg.kind !== 'work' || seg.taskId !== task.id) continue;
        if (Math.abs(seg.startMs - planStartMs) > 3 * 3_600_000) continue;
        if (firstWorkMs === null || seg.startMs < firstWorkMs) firstWorkMs = seg.startMs;
      }
      const startDeltaMin = firstWorkMs === null ? null : Math.round((firstWorkMs - planStartMs) / 60_000);
      const startNote = startDeltaMin === null || task.timeOpen || Math.abs(startDeltaMin) < 5
        ? (startDeltaMin === null || task.timeOpen ? '' : ' · on time')
        : ` · started ${fmtDur(Math.abs(startDeltaMin))} ${startDeltaMin > 0 ? 'late' : 'early'}`;

      const handleBlockDragStart = (e: DragEvent<HTMLDivElement>) => {
        beginTaskDrag(e, task);
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
        // Band = the slot under the cursor, where the drop lands.
        const rect = e.currentTarget.getBoundingClientRect();
        const relY = Math.max(0, (Number.isFinite(e.clientY) ? e.clientY : 0) - (Number.isFinite(rect.top) ? rect.top : 0));
        const abs = sliceStartMin + (relY / screenScale(e.currentTarget) / rowHeight) * 60;
        const minute = Math.max(0, Math.min(1440 - gran, Math.floor(abs / gran) * gran));
        showPlanGhost(dayYMD, minute);
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
        const payload = JSON.parse(raw) as { taskId?: string; durationMin: number; grabMin?: number };
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
        const minutesIntoBlock = (relY / screenScale(e.currentTarget) / rowHeight) * 60;
        const absMinute = sliceStartMin + (Number.isFinite(minutesIntoBlock) ? minutesIntoBlock : 0);
        // Lands on the slot under the cursor. Another task dropped here also
        // leaves the chain that would push it behind this one (parallelWith),
        // so it stays exactly where it was dropped, overlapping this block.
        const grab = Number.isFinite(payload.grabMin) ? payload.grabMin! : 0;
        const snappedMin = Math.max(0, Math.min(1440 - gran, Math.floor(absMinute / gran) * gran - grab));
        const hour = Math.floor(snappedMin / 60);
        const minute = snappedMin % 60;
        scheduleTask(
          payload.taskId,
          `${dayYMD}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          payload.durationMin,
          payload.taskId !== task.id ? task.id : undefined,
        );
        setLandedTaskId(payload.taskId);
      };

      const handleBlockClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        // Decision 60 — letting go of a resize is not a click.
        if (Date.now() - resizeClickBlock.current < 400) return;
        openTaskInfo(task, e.clientX, e.clientY);
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
      const railNum = dayRailPx;
      const widthPx = ((colPx - railNum) * span) / colCount - 3;
      // Text is never rotated: a lane too narrow for a title is a plain bar
      // (its name is in the tooltip); short blocks show the title on one line.
      // F28 — a plan in a clash too narrow for names is a slim bar with its
      // letter (the name is in the tooltip and the popup).
      // A block alone but too narrow for a readable name (the Station week)
      // follows the same rule: its first character, not "O…".
      // F31 — a block alone in a column too narrow for a one-line name (the
      // Station week) wraps its name down the block in small type: whole
      // lines only, words first, a long word where it must. It falls back to
      // the first character only when not even three letters fit across.
      const blockH = Math.max(MIN_BLOCK_PX, heightPx - BLOCK_GAP);
      const wrapCols = Math.floor((widthPx - 4) / WRAP_CH_PX);
      const wrapLines = Math.floor((blockH - 3) / WRAP_LINE_PX);
      const wrap = !letterOf.has(task.id) && widthPx < MIN_LANE_PX && wrapCols >= 3 && wrapLines >= 1;
      const letter = letterOf.get(task.id) ?? (widthPx < MIN_LANE_PX && !wrap ? clashLabels([task.text])[0] : undefined);
      const detail: 'none' | 'wrap' | 'letter' | 'title' | 'full' =
        wrap ? 'wrap'
        : letter !== undefined ? 'letter'
        : heightPx < 14 || widthPx < 34 ? 'none'
        // Decision 60 — the same look at every width (the owner's pick): a tall
        // block shows its name and, small, its time; only a short one centres its name.
        : heightPx < 40 || widthPx < 44 ? 'title' : 'full';
      const textual = detail === 'title' || detail === 'full';
      // The letter shows when it fits the bar; the tick under it when there is room.
      // A name too wide for the bar stands its letters one above the other
      // (never rotated) when the bar is tall enough; 11px mono is ~6.6px a letter.
      const letterRow = letter !== undefined && blockH >= 12 && widthPx >= letter.length * 6.6 + 3;
      const letterStack = letter !== undefined && !letterRow && letter.length > 1 && widthPx >= 7 && blockH >= letter.length * 11 + 2;
      const letterFits = letterRow || letterStack;
      const tickFits = letterFits && blockH >= (letterStack ? letter.length * 11 + 18 : 34) && widthPx >= 12;
      // Whole lines the time row may use under the title (never a sliver of a
      // wrapped piece): the title's lines are over-estimated (7.2 px a letter,
      // room kept for the corner badge), so the row never claims space it lacks.
      const titleInner = widthPx - 2 * BLOCK_TEXT_INSET - 20;
      // Decision 55 — a tall block gives a long name all the lines it needs
      // (it used to stop at two), keeping one line for the time under it.
      const titleNeeded = Math.max(1, Math.ceil((task.text.length * 7.8) / Math.max(1, titleInner)));
      const titleLinesEst = blockH >= 48 ? Math.max(1, Math.min(titleNeeded, Math.floor((blockH - 6 - 14) / 15.6))) : 1;
      const timeRowLines = Math.max(1, Math.min(2, Math.floor((blockH - 6 - titleLinesEst * 15.6) / 14)));
      const titleClamp = detail === 'full' ? Math.max(2, titleLinesEst) : Math.max(2, Math.floor((blockH - 4) / 15));
      // A short bar centres its letter; a tall one keeps it at the top, tick below.
      const letterTop = blockH >= (letterStack ? letter.length * 11 + 14 : 30);

      return (
        <div
          key={`${task.id}-${isContinuation ? 'cont' : 'head'}`}
          data-testid={`task-block-${task.id}${isContinuation ? '-cont' : ''}`}
          data-lane={`${colIndex}/${colCount}`}
          draggable={!isContinuation}
          onDragStart={isContinuation ? undefined : handleBlockDragStart}
          onDragEnd={endTaskDrag}
          onDragOver={handleBlockDragOver}
          onDrop={handleDropOnBlock}
          onClick={handleBlockClick}
          // Decision 59 — the top and bottom edges are found in SCREEN pixels
          // on the block itself, so they sit exactly on its drawn edge at any
          // canvas zoom (the fixed 6 px strips shrank to 2 px zoomed out).
          onMouseMove={resizable ? (e) => {
            const edge = edgeAt(e);
            const cur = edge ? 'ns-resize' : '';
            if (e.currentTarget.style.cursor !== cur) e.currentTarget.style.cursor = cur;
          } : undefined}
          onMouseDown={resizable ? (e) => {
            if (e.button !== 0) return;
            const edge = edgeAt(e);
            if (edge) startResize(edge, task, sliceStartMin, Math.max(1, sliceEndMin - sliceStartMin), e);
          } : undefined}
          data-time-open={task.timeOpen ? 'true' : undefined}
          data-plan-state={isDone ? 'done' : isMissed ? 'missed' : 'planned'}
          title={
            `${task.text} · ${fmtMinOfDay(blockStartMin)}–${fmtMinOfDay(blockEndMin)} · plan ${fmtDur(task.plannedMin)}` +
            (trackedMin > 0 ? ` · tracked ${fmtDur(trackedMin)}` : '') +
            (overrunMin > 0 ? ` (${fmtDur(overrunMin)} over plan)` : '') +
            (overlapRoutines.length ? ` · overlaps ${overlapRoutines.join(', ')}` : '') +
            (isMissed ? ' · missed' : '') +
            (afterOf.has(task.id) ? ` · after ${afterOf.get(task.id)}` : '') +
            (isContinuation ? ' (continued from previous day)' : '')
          }
          className={`cal-block${landedTaskId === task.id ? ' is-landed' : ''}${dragTaskId === task.id || (draft && !draft.committing) ? ' is-carried' : ''}`}
          style={{
            position: 'absolute',
            // A fixed gap between stacked blocks so back-to-back tasks never
            // read as one slab.
            top: rh(effStartMin / 60, BLOCK_GAP / 2),
            // The tracked-time rail keeps the left edge; plans fill the rest.
            // Letter bars sit 1 px apart on each side (a 2 px gap) so narrow
            // lanes keep their width; named blocks keep the roomier inset.
            left: `calc(${rail} + (100% - ${rail}) * ${leftFrac} + ${detail === 'letter' ? 1 : 2}px)`,
            right: `calc((100% - ${rail}) * ${rightFrac} + ${detail === 'letter' ? 1 : 3}px)`,
            height: rhMax(MIN_BLOCK_PX, sliceLen / 60, -BLOCK_GAP),
            // Calm by default: a tinted card with a solid colour edge. Done
            // fades; missed is a lighter tint; overrun is a rust strip on the
            // right edge (drawn below) — states that survive any block size.
            // No set time: the block fades out at the bottom (open-ended).
            background: task.timeOpen
              ? `linear-gradient(to bottom, color-mix(in srgb, ${taskTone} 28%, var(--paper)) 0%, color-mix(in srgb, ${taskTone} 14%, transparent) 55%, transparent 100%)`
              : `color-mix(in srgb, ${taskTone} ${isMissed || isDone ? 11 : 24}%, var(--paper))`,
            // Soft full outline in the task colour (no left accent strip).
            border: `1px solid color-mix(in srgb, ${taskTone} ${task.timeOpen || isMissed || isDone ? 35 : 55}%, transparent)`,
            ...(task.timeOpen ? { borderBottomColor: 'transparent' } : {}),
            borderTopLeftRadius,
            borderTopRightRadius,
            borderBottomLeftRadius,
            borderBottomRightRadius,
            cursor: isContinuation ? 'pointer' : 'grab',
            overflow: 'hidden',
            zIndex: 2,
            padding: detail === 'full' ? `3px ${BLOCK_TEXT_INSET + 2}px` : detail === 'title' ? `0 ${BLOCK_TEXT_INSET}px` : detail === 'letter' ? (letterTop ? '3px 0 0' : 0) : detail === 'wrap' ? '2px 0 0 1px' : 0,
            // Decision 61 — moved or resized: it steps back while the ghost shows the new place.
            opacity: dragTaskId === task.id || (draft && !draft.committing) ? 0.35 : 1,
            // Decision 58 — a plan (a task) floats above the grid with a soft
            // shadow; a repeating event lies flat on it. A ring of the ground
            // keeps back-to-back plans apart.
            boxShadow: task.timeOpen ? 'none' : '0 0 0 1px var(--paper), 0 1px 2px rgba(0,0,0,0.28), 0 6px 14px -6px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            // A one-line title sits centred in short blocks instead of being
            // clipped at the top.
            justifyContent: detail === 'title' || (detail === 'letter' && !letterTop) ? 'center' : 'flex-start',
            alignItems: detail === 'letter' ? 'center' : undefined,
            gap: 1,
          }}
        >
          {/* Continuation arrows — ↑ on continuation slices, ↓ on slices that
              spill into the next day. */}
          {isContinuation && textual && (
            <span aria-hidden style={{ position: 'absolute', top: 3, left: 3, color: 'var(--ink-3)', lineHeight: 0, pointerEvents: 'none' }}>
              <CalIcon name="up" />
            </span>
          )}
          {hasContinuation && textual && (
            <span aria-hidden title="Continues tomorrow" style={{ position: 'absolute', bottom: 3, right: 3, color: 'var(--ink-3)', lineHeight: 0, pointerEvents: 'none' }}>
              <CalIcon name="down" />
            </span>
          )}
          {/* #171 — a done task shows a check, so it reads as finished.
              Decision 59 — any other task shows a small list mark in the same
              corner: it comes from your Todos (a repeating event shows ⟳). */}
          {isDone && !isContinuation && textual && (
            <span data-testid={`task-done-check-${task.id}`} aria-hidden style={{ position: 'absolute', top: blockH >= 22 ? 4 : '50%', transform: blockH >= 22 ? undefined : 'translateY(-50%)', right: 4, color: 'var(--acid-ink, var(--acid))', lineHeight: 0, pointerEvents: 'none' }}>
              <CalIcon name="check" />
            </span>
          )}
          {!isDone && !isContinuation && textual && (
            <span data-testid={`task-kind-mark-${task.id}`} aria-hidden title="A task from your Todos" style={{ position: 'absolute', top: blockH >= 22 ? 5 : '50%', transform: blockH >= 22 ? undefined : 'translateY(-50%)', right: 5, color: `color-mix(in srgb, ${taskTone} 40%, var(--ink-3))`, lineHeight: 0, pointerEvents: 'none' }}>
              <CalIcon name="list" size={10} />
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
                      // A planned break: the block's own tone, much lighter, under a
                      // dashed line — calm, no stripes. Long breaks get a deeper line.
                      background: `color-mix(in srgb, ${taskTone} ${stripeSize > 6 ? 4 : 7}%, transparent)`,
                      opacity: 0.9,
                    }}
                  />
                );
              })()}
            </>
          )}
          {/* Label — only what fits (see `detail`). Everything else is in the
              hover title and the click popup. */}
          {detail === 'wrap' && (
            <span data-testid={`task-wrap-${task.id}`} className="cal-wrap" style={{ maxHeight: wrapLines * WRAP_LINE_PX }}>{task.text}</span>
          )}
          {detail === 'wrap' && isDone && !isContinuation && blockH >= Math.min(wrapLines, Math.ceil(task.text.length / wrapCols) + 1) * WRAP_LINE_PX + 15 && (
            <span aria-hidden style={{ color: 'var(--acid-ink, var(--acid))', lineHeight: 0, position: 'relative', zIndex: 1, paddingLeft: 1 }}><CalIcon name="check" size={10} /></span>
          )}
          {detail === 'letter' && letterFits && (
            <span data-testid={`task-letter-${task.id}`} className={`cal-letter${letterStack ? ' cal-letter--stack' : ''}`} aria-hidden>{letter}</span>
          )}
          {detail === 'letter' && tickFits && isDone && !isContinuation && (
            <span aria-hidden style={{ color: 'var(--acid-ink, var(--acid))', lineHeight: 0, position: 'relative', zIndex: 1 }}><CalIcon name="check" size={10} /></span>
          )}
          {(detail === 'title' || detail === 'full') && (
            <span
              style={{
                // Decision 55 — names in the reading font, like the events beside them.
                fontFamily: 'var(--font-read, var(--font-sans))',
                // Decision 60 — a size up (the owner liked how the zoomed Free canvas read).
                fontSize: detail === 'full' ? 13 : 12.5,
                fontWeight: 600,
                color: isDone ? 'var(--ink-2)' : 'var(--ink)',
                textDecoration: 'none',
                // A tall block gives its title two lines (the time still fits
                // under it) instead of cutting it at the first.
                flexShrink: 0,
                ...((detail === 'full' && blockH >= 48) || (detail === 'title' && blockH >= 34)
                  ? { display: '-webkit-box', WebkitLineClamp: titleClamp, WebkitBoxOrient: 'vertical' as const, whiteSpace: 'normal', overflowWrap: 'break-word' as const, overflow: 'hidden', textAlign: detail === 'title' ? 'center' as const : undefined }
                  : { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                minWidth: 0,
                paddingLeft: isContinuation ? 12 : 0,
                paddingRight: isContinuation ? 0 : 15,
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
            // The time comes first and never cuts; "Missed" (and tracked or
            // over notes) wrap under it as whole pieces, so a short block
            // loses those pieces at its bottom edge, never half the time.
            // Decision 60 — the time small (10 px), wrapping at the dash in a narrow block.
            <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: '13px', color: 'var(--ink-3)', overflow: 'hidden', minHeight: 13, maxHeight: Math.max(timeRowLines, widthPx < 110 ? 2 : 1) * 13, flexShrink: 0, pointerEvents: 'none', position: 'relative', zIndex: 1, marginTop: 1 }}>
              <span>
                {task.timeOpen ? `${fmtMinOfDay(blockStartMin)} · no set time` : <>{fmtMinOfDay(blockStartMin)}–<wbr />{fmtMinOfDay(blockEndMin)}</>}
              </span>
              {startNote && <span data-testid={`task-start-delta-${task.id}`} style={{ whiteSpace: 'nowrap' }}>{startNote.replace(/^ · /, '')}</span>}
              {isMissed && !isContinuation && <span style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)', fontWeight: 600 }}>Missed</span>}
              {afterOf.has(task.id) && !isContinuation && (
                <span data-testid={`task-after-${task.id}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', color: 'var(--ink-3)' }}>
                  after {afterOf.get(task.id)}
                </span>
              )}
              {overrunMin > 0
                ? <span data-testid={`task-overrun-${task.id}`} style={{ whiteSpace: 'nowrap', color: 'var(--rust)', fontWeight: 700 }}>+{fmtDur(overrunMin)} over</span>
                : trackedMin > 0 ? <span style={{ whiteSpace: 'nowrap' }}>{task.done ? `took ${fmtDur(trackedMin)}` : `${fmtDur(trackedMin)} tracked`}</span> : null}
            </span>
          )}
          {/* engagement.md F19 — a missed block asks, it doesn't accuse: a
              REPLAN badge pinned to its corner at any size, and in a roomy
              block the question too. REPLAN shows how to drag it. */}
          {/* Only where it fits beside the title: in a small block the dashed
              outline says "missed" and the click popup offers the move. */}
          {isMissed && !isContinuation && textual && (
            <button
              type="button"
              className="nodrag cal-replan"
              data-testid={`task-replan-${task.id}`}
              title="Didn't happen? Replan it"
              aria-label={`Replan ${task.text}`}
              draggable={false}
              onClick={(e) => { e.stopPropagation(); showPlanGuide({ mode: 'replan', taskId: task.id, text: task.text }); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: blockH >= 24 ? 3 : '50%', transform: blockH >= 24 ? undefined : 'translateY(-50%)', right: 3, zIndex: 4,
                width: 18, height: 18, padding: 0, borderRadius: 5, cursor: 'pointer', display: 'grid', placeItems: 'center',
                border: 0, background: 'var(--paper)', color: 'var(--ink-2)',
              }}
            >
              <CalIcon name="replan" />
            </button>
          )}
          {/* Overrun is said in words ("+5m over" in the time line, and the
              tooltip) — no unexplained colour strip on the block's edge. */}
          {/* #7 — resize handles: drag the top edge to move the start, the
              bottom edge to change the duration. Snapped to granularity. */}
          {resizable && (
            <>
              <div
                data-testid={`task-resize-top-${task.id}`}
                onMouseDown={(e) => startResize('top', task, sliceStartMin, Math.max(1, sliceEndMin - sliceStartMin), e)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, cursor: 'ns-resize', zIndex: 3 }}
              />
              <div
                data-testid={`task-resize-bottom-${task.id}`}
                onMouseDown={(e) => startResize('bottom', task, sliceStartMin, Math.max(1, sliceEndMin - sliceStartMin), e)}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 3 }}
              />
            </>
          )}
        </div>
      );
    });
    return [...blocks, ...lineUpTabs];
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
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--rust)' }}>{fmtMinOfDay(nowMin)}</span>
        <span style={{ flex: 1, height: 2, background: 'var(--rust)', borderRadius: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--rust)', letterSpacing: '0.08em' }}>NOW</span>
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
            beginTaskDragInfo({ taskId: it.task.id, durationMin: it.task.plannedMin });
            startCarry(e, toneVarForTask(it.task.id), 'always');
          }}
          onDragOver={allowDrop}
          onDrop={dropAfter(it)}
          onClick={(e) => { if (it.task) openTaskInfo(it.task, e.clientX, e.clientY); }}
          style={{
            display: 'grid', gridTemplateColumns: '42px 1fr', gap: 8, alignItems: 'start',
            padding: '7px 8px 7px 0', borderRadius: 6, cursor: it.task ? 'pointer' : 'default',
            background: active ? `color-mix(in srgb, ${it.tone} 14%, transparent)` : 'transparent',
            opacity: it.done ? 0.5 : 1,
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--acid)' : 'var(--ink)' }}>{fmtMinOfDay(it.startMin)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{fmtMinOfDay(it.endLabelMin)}</div>
          </div>
          <div style={{ position: 'relative', paddingLeft: 14, minWidth: 0 }}>
            <span aria-hidden style={{ position: 'absolute', left: 2, top: 5, width: 7, height: 7, borderRadius: 999, background: it.tone }} />
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25, wordBreak: 'break-word' }}>
              {it.done && <span style={{ color: 'var(--acid-ink, var(--acid))', marginRight: 4, display: 'inline-block', verticalAlign: '-1px' }}><CalIcon name="check" size={10} /></span>}{it.title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
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
      <div data-testid="calendar-agenda" style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '8px 10px 4px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Day strip: plan line + reality line across the day */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
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
                  // A break is a gap with a faint outline, never stripes.
                  background: r.kind === 'work' ? spanTone(tagLibrary, r, easy) : 'transparent',
                  boxShadow: r.kind === 'work' ? undefined : 'inset 0 0 0 1px color-mix(in srgb, var(--ink-3) 40%, transparent)',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>
            <span>{fmtMinOfDay(stripStart)}</span>
            <span>{fmtMinOfDay(stripStart + stripLen / 2)}</span>
            <span>24:00</span>
          </div>
        </div>

        <div onDragOver={allowDrop} onDrop={dropAfter(null)} style={{ minHeight: 40, flex: '1 1 0', display: 'flex', flexDirection: 'column' }}>
          {items.length === 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', padding: '16px 4px' }}>
              Nothing planned. Drag a task here to plan it next.
            </div>
          )}
          {/* No scrolling: rows page (PagedView). */}
          <PagedView testId="calendar-agenda-pages" style={{ flex: '1 1 0' }} resetKey={baseYMD}>
            {rows}
          </PagedView>
        </div>

        <button
          type="button"
          data-testid="calendar-show-grid"
          onClick={() => setLayoutPref('grid')}
          style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalIcon name="grid" size={11} />Time grid</span>
        </button>
      </div>
    );
  }

  // ── Tracked reality as background highlights (plan vs reality) ────────────
  // What the pomo actually recorded is a soft band BEHIND the planned blocks,
  // across the plan area — not a component-like block. Focus = a faint wash in
  // the tagged task's tone (acid when untagged) with a thin edge; break = a
  // faint neutral hatch. A pause is a gap. The bands take no pointer events so
  // drops reach the hour cells; right-click is resolved by the column's
  // hit-test (handleColumnContextMenu) → retag / delete menu.
  // When KRNL0 was first opened / last closed that day: a thin dashed line
  // across the column, no words (the time is in the tooltip).
  function renderAppMarkers(dayYMD: string) {
    const list = appMarkers.filter((m) => toYMD(new Date(m.ms)) === dayYMD);
    if (list.length === 0) return null;
    return list.map((m) => {
      const d = new Date(m.ms);
      const min = d.getHours() * 60 + d.getMinutes();
      return (
        <div
          key={`${m.kind}-${m.ms}`}
          data-testid={`calendar-app-${m.kind}`}
          title={`KRNL0 ${m.kind === 'open' ? 'first opened' : 'last closed'} ${fmtMinOfDay(min)}`}
          style={{
            // A thin dashed line across the whole day, no words (time in the tooltip).
            position: 'absolute', left: 0, right: 0, top: rh(min / 60), height: 0,
            borderTop: `1px dashed ${m.kind === 'open' ? 'var(--cyan, var(--ink-3))' : 'var(--ink-3)'}`,
            opacity: 0.75, pointerEvents: 'none', zIndex: 2,
          }}
        />
      );
    });
  }

  // Decision 39 / routines.md F6 — a repeating event across its day, behind
  // the plans, every week; a skipped one is a dashed outline. No pointer
  // events (drops reach the hour cells); the column hit-tests clicks.
  // Decision 55 (owner, 2026-11-21) — readable: a calm tinted card (no
  // hatching), the whole name over as many lines as it has, then the time and
  // the place (eventText.ts). Only a lane too thin for words writes sideways.
  function renderRoutineBands(dayYMD: string) {
    if (!layers.routines) return null;
    const out: ReactNode[] = [];
    const colPxB = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
    const railPx = railPxFor(dayYMD);
    for (const { h, occ, lane, lanes } of routinesOnDay(dayYMD)) {
      const top = (occ.startMin / 60) * rowHeight;
      const height = Math.max(6, ((occ.endMin - occ.startMin) / 60) * rowHeight);
      const col = `var(--${h.color})`;
      const laneW = (colPxB - railPx) / lanes;
      const lead = 6;
      const blockH = Math.max(5, height - 2);
      const { title, place } = eventTitleAndPlace(h.name, h.note);
      const textW = laneW - 4 - lead - 6;
      const sideways = textW < 22 && blockH > 40;
      // Decision 62 — a one-time event: no repeat mark, just its time.
      const once = isOneTimeEvent(h);
      const showIcon = !once && textW >= 110;
      const time = occ.spill
        ? `until ${fmtMinOfDay(occ.endMin)} · from last night`
        : `${fmtMinOfDay(occ.fullStart)}–${fmtMinOfDay(occ.fullEnd)}`;
      // Decision 60 — how often, in words, beside the time (small).
      const every = occ.skipped ? 'skipped' : occ.moved ? 'moved' : !h.schedule || h.schedule.kind === 'daily' ? 'every day' : h.schedule.kind === 'weekdays' ? 'weekdays' : 'every week';
      const lines = sideways ? { titleLines: 0, showTime: false, metaLines: 0, showPlace: false } : eventLines(blockH, textW - (showIcon ? 15 : 0), title, !!place, once ? time : `${time} · ${every}`);
      out.push(
        <div
          key={`routine-${h.id}${occ.spill ? '-spill' : ''}`}
          data-testid={`calendar-routine-${h.id}${occ.spill ? '-spill' : ''}`}
          data-date={occ.date}
          data-lane={`${lane}/${lanes}`}
          data-skipped={occ.skipped ? 'true' : undefined}
          className={`cal-event${rtHover === `${h.id}@${dayYMD}` && !rtDrag ? ' is-hot' : ''}`}
          aria-label={`${h.name}, repeating event, ${time}${occ.skipped ? ', skipped this time' : ''}`}
          title={`${h.name} · ${time} · repeating event${occ.moved ? ' (moved this time)' : ''}${occ.skipped ? ' · skipped this time' : ''} · click for options`}
          style={{
            position: 'absolute', left: `calc(${railPx}px + (100% - ${railPx}px) * ${lane / lanes} + 2px)`, width: `calc((100% - ${railPx}px) / ${lanes} - 4px)`, top: rh(occ.startMin / 60, 1), height: rhMax(5, (occ.endMin - occ.startMin) / 60, -2),
            zIndex: 0, pointerEvents: 'none', boxSizing: 'border-box', borderRadius: 6, overflow: 'hidden',
            opacity: rtDrag && rtDrag.id === h.id ? 0.35 : 1,
            ...(occ.skipped
              ? { border: `1px dashed color-mix(in srgb, ${col} 55%, transparent)`, background: 'transparent' }
              : { border: `1px solid color-mix(in srgb, ${col} 30%, transparent)`, background: `color-mix(in srgb, ${col} 13%, var(--paper))` }),
          }}
        >
          {sideways && (
            <span style={{
              position: 'absolute', top: 4, left: lead - 3, writingMode: 'vertical-rl', maxHeight: blockH - 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 11, fontWeight: 600, lineHeight: '13px', color: `color-mix(in srgb, ${col} 22%, var(--ink))`,
            }}>{title}</span>
          )}
          {lines.titleLines > 0 && (
            <div style={{ position: 'absolute', inset: 0, padding: `${EVENT_TEXT.padY}px 6px ${EVENT_TEXT.padY}px ${lead}px`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
                <span
                  data-testid={`calendar-routine-title-${h.id}`}
                  style={{
                    flex: 1, minWidth: 0, fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 13, fontWeight: 600, lineHeight: `${EVENT_TEXT.titleLine}px`,
                    color: `color-mix(in srgb, ${col} 22%, var(--ink))`, overflowWrap: 'break-word',
                    display: '-webkit-box', WebkitLineClamp: lines.titleLines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    opacity: occ.skipped ? 0.75 : 1,
                  }}
                >
                  {title}
                </span>
                {showIcon && <span aria-hidden style={{ flexShrink: 0, display: 'inline-flex', marginTop: 2, color: `color-mix(in srgb, ${col} 45%, var(--ink-3))` }}><CalIcon name="repeat" size={11} /></span>}
              </div>
              {lines.showTime && (
                // Decision 60 — the time and how often, small, wrapping in a narrow block.
                <span data-testid={`calendar-routine-time-${h.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: `${EVENT_TEXT.metaLine}px`, color: 'var(--ink-3)', whiteSpace: 'normal', overflow: 'hidden', maxHeight: lines.metaLines * EVENT_TEXT.metaLine, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                  {occ.spill ? time : <>{fmtMinOfDay(occ.fullStart)}–<wbr />{fmtMinOfDay(occ.fullEnd)}</>}{!once && <span style={{ whiteSpace: 'nowrap' }}>{` · ${every}`}</span>}
                </span>
              )}
              {lines.showPlace && place && (
                <span data-testid={`calendar-routine-place-${h.id}`} style={{ fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 11.5, lineHeight: `${EVENT_TEXT.metaLine}px`, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {place}
                </span>
              )}
            </div>
          )}
        </div>,
      );
    }
    return out;
  }

  // What really happened (F16, F29): the Clock rail (see RAIL_STYLE). A
  // break is a gap in the fill; a running span is a calm solid fill that
  // grows to now (Decision 59: no moving stripes). The rail sits beside the
  // plans, never under them.
  const trackW = TRACK_W(singleDay, tinyDays);
  const trackLeft = TRACK_LEFT(tinyDays);
  function renderRealityBlocks(dayYMD: string) {
    if (!layers.recorded) return null;
    const segs = realityByDay.get(dayYMD) ?? [];
    const todayYMD = toYMD(new Date());
    const nowD = new Date();
    const nowPx = ((nowD.getHours() * 60 + nowD.getMinutes()) / 60) * rowHeight;
    const dayPx = rowCount * rowHeight;
    // A4: the track only covers time that has passed — the whole day before
    // today, up to now today, nothing on days still ahead.
    // A day with nothing recorded gets no empty track (a week of bare tracks
    // reads as scrollbars) — except today, whose track carries the knob.
    const trackEnd = segs.length === 0 && dayYMD !== todayYMD ? 0
      : RAIL_STYLE !== 'A4' || dayYMD < todayYMD ? dayPx - 3 : dayYMD === todayYMD ? nowPx : 0;
    const out: ReactNode[] = [];
    if (trackEnd > 3) {
      out.push(
        <div
          key="reality-track"
          data-testid="calendar-reality-track"
          className="cal-rail"
          aria-hidden
          style={{
            position: 'absolute', top: 3, height: dayYMD === todayYMD && RAIL_STYLE === 'A4' ? rh((nowD.getHours() * 60 + nowD.getMinutes()) / 60, -3) : rh(rowCount, -6), left: trackLeft, width: trackW,
            borderRadius: trackW / 2, pointerEvents: 'none', zIndex: 0,
          }}
        />,
      );
    }
    if (RAIL_STYLE === 'A2') {
      for (let h = 1; h < rowCount; h++) {
        if (h * rowHeight >= trackEnd) break;
        out.push(
          <div key={`reality-hour-${h}`} aria-hidden style={{
            position: 'absolute', top: rh(h, -0.5), height: 1, left: trackLeft, width: trackW,
            background: 'var(--node-bg, var(--paper))', pointerEvents: 'none', zIndex: 2,
          }} />,
        );
      }
    }
    segs.forEach((seg, i) => {
      const topPx = (seg.startMin / 60) * rowHeight;
      const heightPx = ((seg.endMin - seg.startMin) / 60) * rowHeight;
      const isWork = seg.kind === 'work';
      const raw = spanTone(tagLibrary, seg, easy);
      // Bright acid vanishes on light paper: the deeper mix there (dark mode
      // maps --acid-ink straight back to --acid).
      const tone = raw === 'var(--acid)' ? 'color-mix(in srgb, var(--acid) 55%, var(--acid-ink, var(--acid)))' : raw;
      const minutes = Math.max(1, Math.round((seg.endMs - seg.startMs) / 60_000));
      out.push(
        <div
          key={`reality-${seg.id}-${i}`}
          data-testid="calendar-reality-block"
          data-reality-kind={seg.kind}
          data-reality-live={seg.live ? 'true' : undefined}
          data-reality-task={isWork && !easy ? spanTaskName(seg) ?? undefined : undefined}
          aria-label={
            seg.live
              ? `${spanTitle(seg, 'Focus')} ${fmtHM(seg.startMs)} to now (recording)`
              : `${spanTitle(seg, 'Focus')} ${fmtHM(seg.startMs)}–${fmtHM(seg.endMs)}, ${minutes} minutes`
          }
          title={isWork ? `Recorded: ${spanTitle(seg, 'Focus')} · ${fmtHM(seg.startMs)}–${seg.live ? 'now' : fmtHM(seg.endMs)}` : `Break · ${minutes}m`}
          style={{
            position: 'absolute',
            // Decision 59 — spans touch (no 1 px gaps between back-to-back
            // sessions); only a real break leaves the track bare.
            top: rh(seg.startMin / 60),
            left: trackLeft,
            width: trackW,
            // Never shorter than its round caps.
            height: rhMax(trackW, (seg.endMin - seg.startMin) / 60),
            pointerEvents: 'none',
            zIndex: 1,
            borderRadius: trackW / 2,
            // A break draws nothing: it is the empty track (hover keeps its title).
            background: !isWork ? 'transparent' : tone,
          }}
        />,
      );
    });
    // Today's "now" is the now line's own dot, centred on this track (NowLine dotX).
    return out;
  }

  // ── Habit block renderer (ADR 0002 §6) ──────────────────────────────────────

  // Decision 60 — a habit's box can be carried to another time on the
  // Calendar (the same ghost as everything else); the habit moves for every day.
  const [habitDrag, setHabitDrag] = useState<{ id: string; day: string; startMin: number; len: number; name: string; tone: string } | null>(null);
  const habitClickBlock = useRef(0);
  const startHabitDrag = (e: ReactPointerEvent<HTMLButtonElement>, habit: ScheduledHabit, dayYMD: string, startMin: number, tone: string) => {
    if (e.button !== 0) return;
    const col = e.currentTarget.closest('[data-cal-day]') as HTMLElement | null;
    if (!col) return;
    const scale = screenScale(col);
    const y0 = e.clientY;
    const len = habit.schedule.durationMin && habit.schedule.durationMin > 0 ? habit.schedule.durationMin : 30;
    let moved = false;
    let carried = false;
    let last = startMin;
    const clearHabitGhost = () => { if (calendarGhost()?.testId === 'calendar-habit-ghost') setCalendarGhost(null); };
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      if (!moved && Math.abs(dy) < 4) return;
      moved = true;
      const dMin = Math.round(((dy / scale / rowHeight) * 60) / gran) * gran;
      last = Math.max(0, Math.min(1440 - gran, startMin + dMin));
      if (!carried) { carried = true; setHabitDrag({ id: habit.id, day: dayYMD, startMin: last, len, name: habit.name, tone }); }
      setCalendarGhost({ day: dayYMD, startMin: last, endMin: last + len, name: habit.name, times: `${fmtMinOfDay(last)} · habit, every day it is on`, tone, testId: 'calendar-habit-ghost' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) { setHabitDrag(null); clearHabitGhost(); return; }
      habitClickBlock.current = Date.now();
      if (last === startMin) { setHabitDrag(null); clearHabitGhost(); return; }
      const timeOfDay = `${String(Math.floor(last / 60)).padStart(2, '0')}:${String(last % 60).padStart(2, '0')}`;
      void habitMotherCommand('habit.setSchedule', { habitId: habit.id, schedule: { ...habit.schedule, timeOfDay } });
      // The ghost stays until the habit is drawn at its new time.
      window.setTimeout(() => { setHabitDrag((d) => (d && d.id === habit.id ? null : d)); clearHabitGhost(); }, 600);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  function renderHabitBlocks(dayYMD: string) {
    if (!layers.habits) return null;
    const isoDow = ymdToIsoDow(dayYMD);
    const blocks: ReactNode[] = [];
    const isFuture = dayYMD > toYMD(new Date());
    // A narrow day column shows each habit as a round icon (name in the tooltip).
    const colPxH = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
    const iconOnly = colPxH < 96;

    for (const habit of scheduledHabits) {
      if (!habitScheduledOnDow(habit.schedule, isoDow)) continue;

      const [hStr, mStr] = habit.schedule.timeOfDay.split(':');
      const habitHour = parseInt(hStr ?? '0', 10);
      const habitMin = parseInt(mStr ?? '0', 10);

      // Per ADR 0002 §6: if timeOfDay is outside hourRange, do not render.
      if (habitHour < hourRange.start || habitHour > hourRange.end) continue;

      const hoursFromStart = habitHour - hourRange.start + habitMin / 60;
      const topPx = Math.round(hoursFromStart * rowHeight);
      const done = habit.log.includes(dayYMD);
      const colour = `var(--${habit.color})`;
      const titleSuffix = habit.schedule.durationMin ? ` (${habit.schedule.durationMin} min)` : '';

      blocks.push(
        <button
          type="button"
          key={`habit-block-${habit.id}`}
          data-testid={`habit-block-${habit.id}-${dayYMD}`}
          data-habit-done={done ? 'true' : undefined}
          aria-disabled={isFuture || undefined}
          title={`${habit.name} · ${habit.schedule.timeOfDay}${titleSuffix} — ${isFuture ? 'not yet: tick it on the day' : done ? 'done · click to undo' : 'click to tick it'}`}
          aria-label={`${habit.name} at ${habit.schedule.timeOfDay}${isFuture ? ', not yet' : done ? ', done' : ''}`}
          // Decision 59 — a double-click on a habit is two ticks, never "add a plan here".
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => startHabitDrag(e, habit, dayYMD, habitHour * 60 + habitMin, colour)}
          onClick={(e) => {
            e.stopPropagation();
            // Letting go of a carried habit is not a tick.
            if (Date.now() - habitClickBlock.current < 400) return;
            if (isFuture) return;
            const st = useBoardStore.getState();
            const mother = st.board?.nodes.find((n) => n.id === habit.motherId);
            if (!mother) return;
            import('../../Canvas/commandDispatch').then(({ makeCommandHandler }) => {
              makeCommandHandler(mother.id)('habit.toggleDay', { id: habit.id, date: dayYMD });
            }).catch(() => { /* never break the calendar */ });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag cal-habit"
          data-icon-only={iconOnly ? 'true' : undefined}
          style={{
            // Decision 58 — a habit is a small tick box on its time line (centred
            // on it), at the right of the day: the box in the habit's colour,
            // filled with a check when done; its name beside it when there is
            // room. No ring with a dot inside.
            position: 'absolute',
            top: rh(hoursFromStart, -10),
            right: 4,
            left: 'auto',
            height: 20,
            maxWidth: singleDay ? 180 : 'calc(100% - 10px)',
            padding: iconOnly ? 2 : '0 7px 0 4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            borderRadius: 6,
            border: iconOnly ? '0' : '1px solid color-mix(in srgb, var(--ink) 12%, transparent)',
            background: iconOnly ? 'transparent' : 'var(--node-bg, var(--paper))',
            color: 'var(--ink)',
            boxShadow: iconOnly ? 'none' : '0 1px 2px rgba(0,0,0,0.22), 0 3px 8px -3px rgba(0,0,0,0.3)',
            zIndex: 3,
            cursor: isFuture ? 'default' : 'pointer',
            font: 'inherit',
            fontFamily: 'var(--font-read, var(--font-sans))',
            fontSize: 11.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            // A day still ahead can't be ticked yet: faded, with a dashed box.
            // While carried, it steps back (the ghost shows where it goes).
            opacity: habitDrag && habitDrag.id === habit.id ? 0.35 : isFuture ? 0.5 : 1,
          }}
        >
          {/* Decision 59 — a narrow day has no room for the name, so the box
              carries the habit's own icon (or its first letter) in its colour. */}
          <span aria-hidden className="cal-habit__box" style={{
            width: iconOnly ? 18 : 14, height: iconOnly ? 18 : 14, flexShrink: 0, boxSizing: 'border-box', borderRadius: iconOnly ? 5 : 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: done ? '0' : `1.5px ${isFuture ? 'dashed' : 'solid'} ${colour}`,
            background: done ? colour : (iconOnly ? 'var(--node-bg, var(--paper))' : 'transparent'),
            color: done ? 'var(--ink-on-bright)' : colour,
            boxShadow: iconOnly ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
            fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 10, fontWeight: 700, lineHeight: 1,
          }}>
            {done
              ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              : iconOnly ? (habitIconId(habit.icon) ? <HabitIcon icon={habit.icon} size={11} /> : (habit.name.trim()[0] ?? '').toUpperCase()) : null}
          </span>
          {!iconOnly && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, color: done ? 'var(--ink-3)' : 'var(--ink)' }}>{habit.name}</span>}
          {habit.amount && !done && !iconOnly && (
            <span data-testid={`calendar-habit-count-${habit.id}`} style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              {countOn({ amount: habit.amount, ...(habit.counts ? { counts: habit.counts } : {}), log: [...habit.log] }, dayYMD)}/{habit.amount.target}
            </span>
          )}
        </button>,
      );
    }

    return blocks;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const weekLabel = formatWeekLabel(baseYMD);

  // Narrow day view → agenda. A proportional hour grid can't show parallel
  // or short tasks readably in ~200px; a time-ordered list can.
  const [layoutPref, setLayoutPref] = useState<'auto' | 'list' | 'grid'>('auto');
  // A tour step that says "drag it onto a time" needs the hours, however narrow the window is.
  useEffect(() => {
    const on = (e: Event): void => {
      const pref = (e as CustomEvent<{ pref?: string }>).detail?.pref;
      if (pref === 'grid' || pref === 'auto' || pref === 'list') setLayoutPref(pref);
    };
    window.addEventListener(CALENDAR_LAYOUT_EVENT, on);
    return () => window.removeEventListener(CALENDAR_LAYOUT_EVENT, on);
  }, []);
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
      {/* Sub-header: [←] Week of {Month D} [→] — parts give way to its width (cal-subhead in CSS). */}
      {/* window-frame.md — the standard time row. */}
      <div className="cal-subhead kw-range">
        <button type="button" className="kw-btn" data-testid="week-prev" onClick={handlePrev} aria-label="Previous">
          <CalIcon name="prev" size={13} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <span
            data-testid="week-label"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-1)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {/* Narrow: "Nov 2", never a cut "Nove…" (new-user review 1.6). */}
            {singleDay ? weekLabel : <><span className="cal-weekof">Week of </span><span className="cal-wl-long">{weekLabel}</span><span className="cal-wl-short">{parseYMD(baseYMD).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
            {singleDay && layers.recorded && (() => {
              const day = weekDays[0]!;
              const min = Math.round((realityByDay.get(day) ?? []).filter((x) => x.kind === 'work').reduce((acc, x) => acc + (x.endMin - x.startMin), 0));
              return min > 0 ? <span data-testid={`week-col-tracked-${day}`} title="Recorded this day" style={{ marginLeft: 8, color: 'var(--ink-3)' }}>{fmtDur(min)}</span> : null;
            })()}
          </span>



          {/* #9 — jump to the current week (like the clock's "now"). */}
          <button
            type="button"
            data-testid="week-today"
            onClick={setToday}
            title="Jump to this week"
            className="kw-btn"
          >
            Today
          </button>

        </div>
        {singleDay && !useAgenda && win.pages > 1 && (
          <span data-testid="calendar-hour-pager" style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
            <button type="button" className="kw-btn nodrag" aria-label={`Earlier hours (now ${String(win.startHour).padStart(2, '0')}–${String(win.endHour).padStart(2, '0')})`}
              title="Earlier hours" disabled={win.startHour === 0}
              onClick={() => flipHours(-1)}><CalIcon name="chevUp" size={12} /></button>
            <button type="button" className="kw-btn nodrag" aria-label={`Later hours (now ${String(win.startHour).padStart(2, '0')}–${String(win.endHour).padStart(2, '0')})`}
              title="Later hours" disabled={win.endHour >= rowCount}
              onClick={() => flipHours(1)}><CalIcon name="chevDown" size={12} /></button>
          </span>
        )}
        <button type="button" className="kw-btn" data-testid="week-next" onClick={handleNext} aria-label="Next">
          <CalIcon name="next" size={13} />
        </button>
      </div>

      {/* Day names (Mon–Sun), with the hour pager in the corner above the time
          gutter. In the day view the time row already names the day, so this row
          is not drawn there (window-frame.md: no repeated rows). */}
      {!singleDay && <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid var(--paper-3)',
          paddingRight: sbW,
        }}
      >
        <div
          data-testid="calendar-hour-pager"
          style={{ width: GUTTER_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}
        >
          {!useAgenda && win.pages > 1 && (
            <>
              <button type="button" className="nodrag" aria-label={`Earlier hours (now ${String(win.startHour).padStart(2, '0')}–${String(win.endHour).padStart(2, '0')})`}
                title="Earlier hours" disabled={win.startHour === 0}
                onClick={() => flipHours(-1)} style={hourPagerBtn(win.startHour === 0)}><CalIcon name="chevUp" size={12} /></button>
              <button type="button" className="nodrag" aria-label={`Later hours (now ${String(win.startHour).padStart(2, '0')}–${String(win.endHour).padStart(2, '0')})`}
                title="Later hours" disabled={win.endHour >= rowCount}
                onClick={() => flipHours(1)} style={hourPagerBtn(win.endHour >= rowCount)}><CalIcon name="chevDown" size={12} /></button>
            </>
          )}
        </div>
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
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: tinyDays ? 3 : 6,
                padding: '5px 0',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: isToday ? 'var(--acid-ink, var(--acid))' : ymdToIsoDow(dayYMD) >= 6 ? 'var(--ink-4)' : 'var(--ink-3)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {/* The weekday small, the date large (owner, 2026-11-21: "MON 16" in
                  one small grey line was hard to read). Today's date sits in an
                  accent circle. A narrow day (the Station week) shows "S 7". */}
              <span>{tinyDays ? DAY_LABELS[ymdToIsoDow(dayYMD) - 1]!.slice(0, 1) : DAY_LABELS[ymdToIsoDow(dayYMD) - 1]}</span>
              <span
                data-testid={`week-col-date-${dayYMD}`}
                style={{
                  fontFamily: 'var(--font-read, var(--font-sans))',
                  fontSize: tinyDays ? 12 : 14,
                  fontWeight: 600,
                  letterSpacing: 0,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                  minWidth: tinyDays ? 18 : 24,
                  height: tinyDays ? 18 : 24,
                  padding: '0 4px',
                  boxSizing: 'border-box',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Days gone by step back a little; today is the accent circle.
                  color: isToday ? 'var(--ink-on-bright)' : dayYMD < today ? 'var(--ink-3)' : 'var(--ink)',
                  background: isToday ? 'var(--acid)' : 'transparent',
                }}
              >
                {dayNum}
              </span>
              {(() => {
                // The day's tracked total, beside its name (F29) — when it fits.
                if (!layers.recorded) return null;
                const colPxH = gridW > 0 ? (gridW - GUTTER_WIDTH) / dayCount : 220;
                if (colPxH < 110) return null;
                const min = Math.round((realityByDay.get(dayYMD) ?? []).filter((s) => s.kind === 'work').reduce((a, s) => a + (s.endMin - s.startMin), 0));
                // ^ this day's piece only: a span over midnight counts on each day for its own part
                if (min <= 0) return null;
                return <span data-testid={`week-col-tracked-${dayYMD}`} title="Tracked this day" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--ink-3)' }}>{fmtDur(min)}</span>;
              })()}
            </div>
          );
        })}
      </div>}

      {/* Decision 40 — the ANY TIME strip, always under the day names. A plan
          dropped here (a Todo row or a block from the hours) is on that day
          with no time; a chip dragged into the hours gets that time. Plans
          are solid chips, deadlines dashed flags. It grows with its content. */}
      {!useAgenda && (
        <div data-testid="calendar-day-only-row" style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--paper-3)', minHeight: 26, paddingRight: sbW }}>
          <div title="Any time that day: drop a plan here to put it on a day with no hour; drag it into the hours to give it a time" style={{ width: GUTTER_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: '11px', letterSpacing: '0.06em', color: 'var(--ink-4)' }}>ANY<br />TIME</div>
          {weekDays.map((dayYMD) => (
            <div
              key={dayYMD}
              data-testid={`calendar-anytime-${dayYMD}`}
              data-cal-anytime={dayYMD}
              className={`cal-anytime${anyHot === dayYMD ? ' is-hot' : ''}`}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types).includes('application/krnl-task')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (anyHot !== dayYMD) setAnyHot(dayYMD);
              }}
              onDragLeave={() => setAnyHot((h) => (h === dayYMD ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAnyHot(null);
                const raw = e.dataTransfer.getData('application/krnl-task');
                endTaskDrag();
                let payload: { taskId?: string; itemId?: string } = {};
                try { payload = raw ? (JSON.parse(raw) as { taskId?: string; itemId?: string }) : {}; } catch { return; }
                if (payload.taskId || payload.itemId) void putPlanOnDay(payload, dayYMD);
              }}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 3px', boxShadow: 'inset 1px 0 0 var(--paper-3)' }}
            >
              {(dueByDay.get(dayYMD) ?? []).map((d) => d.kind === 'deadline' ? (
                <div
                  key={`dl-${d.id}`}
                  data-testid={`calendar-deadline-${d.id}`}
                  className="nodrag"
                  lang="en"
                  title={`Deadline: ${d.text}${d.plannedOn ? ` · planned ${new Date(`${d.plannedOn}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}`}
                  style={{
                    minHeight: 18, lineHeight: '14px', padding: '1px 4px', borderRadius: 4, boxSizing: 'border-box', cursor: 'default',
                    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, whiteSpace: 'normal', overflowWrap: 'anywhere', hyphens: 'auto',
                    border: `1px dashed ${d.overdue ? 'var(--rust)' : dayYMD === todayYMD() ? 'var(--acid-ink, var(--acid))' : 'var(--ink-4)'}`,
                    background: 'transparent', color: d.overdue ? 'var(--rust)' : dayYMD === todayYMD() ? 'var(--acid-ink, var(--acid))' : 'var(--ink-2)',
                  }}
                >
                  <DueFlag />
                  {d.text}
                </div>
              ) : (
                <div
                  key={`p-${d.id}`}
                  data-testid={`calendar-day-only-${d.id}`}
                  className="nodrag"
                  lang="en"
                  draggable
                  title={`${d.text} — this day, any time. Drag it into the hours to give it a time, or to another day.`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/krnl-task', JSON.stringify(d.taskId ? { taskId: d.taskId, durationMin: d.plannedMin } : { itemId: d.id, durationMin: d.plannedMin }));
                    e.dataTransfer.effectAllowed = 'move';
                    beginTaskDragInfo(d.taskId ? { taskId: d.taskId, durationMin: d.plannedMin } : { itemId: d.id, durationMin: d.plannedMin });
                    startCarry(e, d.taskId ? toneVarForTask(d.taskId) : 'var(--acid)', 'offCalendar');
                  }}
                  style={{
                    minHeight: 18, lineHeight: '14px', padding: '1px 5px', borderRadius: 4, boxSizing: 'border-box', cursor: 'grab',
                    fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, whiteSpace: 'normal', overflowWrap: 'anywhere', hyphens: 'auto',
                    border: `1px solid ${d.overdue ? 'color-mix(in srgb, var(--rust) 60%, transparent)' : 'var(--paper-3)'}`,
                    background: 'var(--paper-2)', color: d.overdue ? 'var(--rust)' : 'var(--ink)',
                  }}
                >
                  {d.taskId && <span aria-hidden style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: toneVarForTask(d.taskId), marginRight: 4, verticalAlign: '1px' }} />}
                  {d.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {useAgenda && renderAgenda(weekDays[0]!)}
      {!useAgenda && singleDay && narrowDay && (
        <button
          type="button"
          data-testid="calendar-show-list"
          onClick={() => setLayoutPref('list')}
          style={{ position: 'absolute', right: 8, bottom: 40, zIndex: 5, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--paper-3)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          <CalIcon name="list" /> list
        </button>
      )}

      {/* Grid body: gutter + 7 columns — flex-fills the calendar card and
          scrolls smoothly (Decision 58). */}
      <div
        ref={gridBodyRef}
        className={`krnl-week-grid${wheelToCanvas ? '' : ' nowheel'}`}
        data-css-rows={cssRows ? 'true' : undefined}
        data-testid="calendar-grid-body"
        data-wheel={wheelToCanvas ? 'canvas' : 'calendar'}
        onWheel={(e) => { if (!wheelToCanvas && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
        onScroll={(e) => { const t = e.currentTarget.scrollTop; window.requestAnimationFrame(() => setGridTop(t)); }}
        onDragOver={(e) => {
          // Held near the top or bottom edge while dragging: the hours glide on.
          const rect = e.currentTarget.getBoundingClientRect();
          if (!Number.isFinite(e.clientY) || rect.height <= 0) return;
          if (e.clientY > rect.bottom - 28) e.currentTarget.scrollTop += 10;
          else if (e.clientY < rect.top + 28) e.currentTarget.scrollTop -= 10;
        }}
        style={{
          display: useAgenda ? 'none' : 'flex',
          flex: 1,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          position: 'relative',
          padding: `${GRID_PAD}px 0`,
          ...(cssRows ? { containerType: 'size', ['--rh' as string]: `calc(100cqh / ${rowCount} * ${zoomK})` } : {}),
        }}
      >
        {/* Time gutter — drag it up or down to zoom the hours (Decision 58). */}
        <div
          data-testid="calendar-gutter"
          onPointerDown={gutterDrag}
          title="Drag up or down to zoom the hours (or pinch, or Ctrl + scroll)"
          className="cal-gutter nodrag"
          style={{
            width: GUTTER_WIDTH,
            flexShrink: 0,
            position: 'relative',
            cursor: 'ns-resize',
            touchAction: 'none',
            alignSelf: 'flex-start',
            height: rh(rowCount),
          }}
        >
          {Array.from({ length: rowCount }, (_, i) => {
            const hour = hourRange.start + i;
            // Decision 61 — readable hours at any size: labels stay at least
            // 22 px apart (every 1, 2, 3, 4 or 6 hours, on whole steps from
            // midnight), each on its own hour's line; the time now hides only
            // a label it really covers (it hid four hours on small rows).
            const labelStep = [1, 2, 3, 4, 6].find((step) => step * rowHeight >= 22) ?? 6;
            const labelled = hour % labelStep === 0;
            const underNow = todayColIndex >= 0 && Math.abs(((hour * 60 - nowMin) / 60) * rowHeight) < 15;
            return (
              <div
                key={hour}
                style={{
                  height: rh(1),
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
              >
                {/* Top-of-hour label, e.g. "13". Only whole hours in the window
                    are labelled: the leftover slice under the last whole hour
                    keeps its lines but no half-cut label. */}
                <span
                  style={{
                    // On its hour's line (Decision 58), the right of the gutter.
                    position: 'absolute',
                    top: -6,
                    right: 8,
                    // The "now" time takes this label's place when it would sit on it.
                    visibility: underNow ? 'hidden' : undefined,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--ink-3)',
                    lineHeight: '12px',
                    pointerEvents: 'none',
                  }}
                >
                  {labelled ? String(hour).padStart(2, '0') : ''}
                </span>
                {/* Only the hours are labelled (owner, 2026-11-21: the ":30" under
                    every hour was clutter). Half hours are a faint line in the grid. */}
              </div>
            );
          })}
          {/* Decision 55 — the time now, in the gutter on the now-line. */}
          {todayColIndex >= 0 && (
            <span
              data-testid="calendar-now-time"
              aria-label={`Now ${fmtMinOfDay(nowMin)}`}
              style={{
                position: 'absolute', right: 5, top: rh(nowMin / 60, -8), height: 16, padding: '0 4px', boxSizing: 'border-box',
                display: 'inline-flex', alignItems: 'center', borderRadius: 4, zIndex: 2,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                color: '#fff', background: 'color-mix(in srgb, var(--k-now, #ef4444) 84%, #000)', pointerEvents: 'none',
              }}
            >
              {fmtMinOfDay(nowMin)}
            </span>
          )}
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
            // Plus the part of an hour the panel shows past the last whole
            // hour, so every page (the last too) starts on a whole hour.
            minHeight: rh(rowCount),
            height: rh(rowCount),
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
                  borderLeft: i > 0 ? `1px solid ${CAL_DAY_LINE}` : undefined,
                }}
              />
            ))}
          </div>
          {/* Decision 61 — the one ghost of this grid (every drag and resize). */}
          <CalendarGhostLayer rowHeight={rowHeight} rowCount={rowCount} planLeft={railPxFor} />
          {weekDays.map((dayYMD, _colIdx) => {
            const isToday = dayYMD === today;
            return (
              <div
                key={dayYMD}
                data-testid={`week-col-${dayYMD}`}
                data-cal-day={dayYMD}
                className="nodrag"
                onContextMenu={(e) => handleColumnContextMenu(dayYMD, e)}
                onPointerDown={(e) => onColumnPointerDown(dayYMD, e)}
                onPointerMove={(e) => onColumnPointerMove(dayYMD, e)}
                onPointerLeave={() => { if (rtHover) setRtHover(null); }}
                onClick={(e) => { if (rtSuppressClick.current) { rtSuppressClick.current = false; return; } handleColumnClick(dayYMD, e); }}
                onDoubleClick={(e) => handleColumnDoubleClick(dayYMD, e)}
                style={{
                  flex: 1,
                  position: 'relative',
                  // Today: a light wash (its name in the header is the marker).
                  background: isToday && !singleDay ? 'var(--k-cal-today, color-mix(in srgb, var(--ink) 3.5%, transparent))' : 'transparent',
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
                        height: rh(1),
                        boxSizing: 'border-box',
                        borderBottom: `1px solid ${CAL_HOUR_LINE}`,
                        // Decision 58 — every other hour a shade deeper, so an hour reads as a band.
                        backgroundColor: hour % 2 === 1 ? CAL_HOUR_BAND : undefined,
                        // #4 — a faint dashed half-hour line once the grid is
                        // tall enough to need it, so blocks read against a ruler.
                        backgroundImage: subMarks.length > 0 ? CAL_HALF_LINE : undefined,
                        backgroundSize: subMarks.length > 0 ? '6px 1px' : undefined,
                        backgroundPosition: subMarks.length > 0 ? '0 50%' : undefined,
                        backgroundRepeat: subMarks.length > 0 ? 'repeat-x' : undefined,
                      }}
                    />
                  );
                })}

                {/* Issue #166 — tracked reality as background highlights
                    (zIndex 0, no pointer events — behind habits and tasks) */}
                {renderRoutineBands(dayYMD)}
                {renderRealityBlocks(dayYMD)}

                {/* App open / close markers (thin dashed lines). */}
                {/* App open / close times are still recorded (time log), but no longer drawn: the user found the lines noisy. */}

                {/* Habit blocks (zIndex: 1 — behind tasks) */}
                {renderHabitBlocks(dayYMD)}

                {/* Task blocks rendered as absolute-positioned children */}
                {renderTaskBlocks(dayYMD)}

              </div>
            );
          })}

          {/* NowLine overlay */}
          {todayColIndex >= 0 && (
            <NowLine
              weekStartDate={baseYMD}
              days={dayCount}
              hourRange={hourRange}
              rowHeight={rowHeight}
              {...(cssRows ? { rowUnit: 'var(--rh)' } : {})}
              columnWidth={NOMINAL_COLUMN_WIDTH}
              gutterWidth={0}
              // Decision 59 — the dot sits on today's recorded-time line.
              showDot
              dotX={layers.recorded ? trackLeft + trackW / 2 : 0}
            />
          )}
        </div>
      </div>


      {headSlot && createPortal(
        <button
          type="button"
          className="kw-btn nodrag"
          data-testid="week-legend"
          aria-label="Calendar menu"
          aria-expanded={!!calMenu}
          title={easy ? 'Repeating events' : 'What the Calendar shows, repeating events, zoom'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCalMenu({ x: r.right - 200, y: r.bottom + 4 }); }}
        >
          <MenuIcon name="list" size={12} />
        </button>,
        headSlot,
      )}
      {calMenu && (
        <ContextMenu
          x={calMenu.x}
          y={calMenu.y}
          onDismiss={() => setCalMenu(null)}
          items={[
            // easy-mode D22 — the layer switches and zoom are Advanced.
            ...(easy ? [] : ([
              ['recorded', 'Recorded time'],
              ['habits', 'Habits'],
              ['routines', 'Repeating events'],
            ] as const).map(([k, label]): ContextMenuItem => ({
              label,
              icon: layers[k] ? <MenuIcon name="check" /> : <span />,
              hint: layers[k] ? 'shown' : 'hidden',
              onSelect: () => toggleLayer(k),
            }))),
            { label: 'Repeating events…', icon: <MenuIcon name="repeat" />, ...(easy ? {} : { divider: true }), onSelect: () => setEventsOpen({ x: calMenu.x, y: calMenu.y }) },
            // Decision 59 — zoom is a gesture (pinch, Ctrl + scroll, drag the
            // hours), and here too for anyone who doesn't know the gesture.
            { label: 'Bigger hours', icon: <MenuIcon name="plus" />, hint: 'Ctrl + scroll', divider: true, keepOpen: true, disabled: shownZoom >= CAL_ZOOM_MAX, onSelect: () => zoomTo(shownZoom + CAL_ZOOM_STEP, null) },
            { label: 'Smaller hours', icon: <MenuIcon name="minus" />, hint: 'or pinch', keepOpen: true, disabled: shownZoom <= zoomFloor, onSelect: () => zoomTo(shownZoom - CAL_ZOOM_STEP, null) },
            { label: 'Fit the day', icon: <MenuIcon name="list" />, hint: 'no scroll', disabled: shownZoom <= zoomFloor, onSelect: () => zoomTo(zoomFloor, null) },
          ]}
        />
      )}
      {/* Decision 62 — the Calendar adds only events (once or repeating); tasks
          come from the Todo node. You type at the bottom, as in Todo: a time in
          the words ("Dentist fri 15:00 1h") adds the event at once (its ghost
          shows where while you type); without one, the event card opens with
          the name in it; "every …" opens it on Repeats. */}
      <div className="kw-foot" ref={calAddRowRef}>
        {calAdding ? (
          <>
            <input
              ref={calAddInputRef}
              data-testid="calendar-add-input"
              aria-label="Add an event to the Calendar"
              autoFocus
              value={calAddText}
              placeholder="Add an event — try: Dentist fri 15:00 1h"
              onChange={(e) => { setCalAddText(e.target.value); setCalCardHidden(false); }}
              onFocus={() => setCalCardHidden(false)}
              onClick={() => setCalCardHidden(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { setCalAdding(false); setCalAddText(''); setCalOv({}); return; }
                if (e.key !== 'Enter') return;
                const raw = calAddText.trim();
                if (!raw) return;
                const { text, hint, d } = calDraftOf(raw);
                const day = d.day ?? calDefaultDay();
                const done = () => { setCalAddText(''); setCalOv({}); };
                if (hint || !d.time) {
                  // "every Monday…" (Repeats), or no time yet: the event card, the name in it.
                  const r = e.currentTarget.getBoundingClientRect();
                  setEventCard({ x: r.left, y: r.top - 340, day, allowOnce: true, initial: { name: hint ? raw : text, mode: hint ? 'repeat' : 'once', days: [isoDowOfYMD(day)], time: d.time ?? '09:00', lengthMin: d.lengthMin ?? 60 } });
                  done();
                  setCalAdding(false);
                  return;
                }
                addOneTimeEvent(text, day, d.time, d.lengthMin ?? 60);
                done();
              }}
              onBlur={() => { if (!calAddText.trim()) setCalAdding(false); }}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', caretColor: 'var(--acid)' }}
            />
            {calAddText.trim() !== '' && !calCardHidden && (() => {
              const raw = calAddText.trim();
              const { hint, d } = calDraftOf(raw);
              const r = calAddRowRef.current?.getBoundingClientRect();
              const day = d.day ?? calDefaultDay();
              const dayWords = new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              const len = d.lengthMin ?? 60;
              const startMin = d.time ? Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3)) : 0;
              const words = hint ? 'Repeats — press Enter to pick its days'
                : d.time ? `Event · ${dayWords} · ${ghostTimes(startMin, startMin + len)} — Enter adds it`
                : `Event · ${dayWords} — press Enter to pick its time`;
              return createPortal(
                <div data-testid="calendar-add-preview" className="kw-card" style={{ position: 'fixed', left: (r?.left ?? 8) + 8, top: (r?.top ?? window.innerHeight) - 44, zIndex: Z.popover, padding: '8px 12px', fontFamily: 'var(--font-read)', fontSize: 12.5, color: 'var(--ink-2)', background: 'var(--paper)', border: '1px solid var(--paper-3)', borderRadius: 10 }}>
                  {words}
                </div>,
                document.body,
              );
            })()}
          </>
        ) : (
          <button
            type="button"
            className="kw-add"
            data-testid="calendar-new"
            title="Add an event: type it here (or double-click empty hours). Tasks come from Todo."
            aria-label="Add an event to the Calendar"
            onClick={() => setCalAdding(true)}
          >
            add an event
          </button>
        )}
        <span className="kw-kbd" aria-hidden>↵</span>
      </div>

      {/* F28 — while a plan from this calendar is dragged: drop it here to
          take it off the calendar (it goes back to Todo). */}
      {/* Decision 60 — no "Drop here to unschedule" bar while dragging (the
          owner found it loud); a plan comes off the Calendar from its card
          (Unplan) or its right-click menu. */}

      {/* Decision 40 — a left-click on a plan opens the same plan card as its
          Todo row (When, Deadline, length, reminder, and what to do with it).
          A canvas-only task (no Todo row) keeps the small time popup. */}
      {taskPopup && (() => {
        const plan = planWhenOf({ taskId: taskPopup.task.id });
        if (!plan) return null;
        const observe = (useBoardStore.getState().board?.nodes.find((n) => n.kind === 'pomo')?.config as { mode?: string } | undefined)?.mode === 'observe';
        const close = () => setTaskPopup(null);
        return (
          <WhenPopover
            x={taskPopup.x}
            y={taskPopup.y}
            today={todayYMD()}
            value={plan.value}
            title={{ text: plan.text, tone: toneVarForTask(taskPopup.task.id), ...(afterOf.has(taskPopup.task.id) ? { sub: `after ${afterOf.get(taskPopup.task.id)}` } : {}) }}
            // Decision 60 — double-click the name to rename the plan (its Todo row and task follow).
            onRename={(text) => {
              const todo = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
              if (!todo) return;
              void import('../../Canvas/commandDispatch').then(({ makeCommandHandler }) => makeCommandHandler(todo.id)('todo.edit', { id: plan.itemId, text }));
            }}
            actions={[
              // Easy (D9/D10): no timer action on a plan, as on the Todo card.
              ...(easy ? [] : [{ key: 'timer', label: observe ? 'Track it now' : 'Focus on it', icon: (observe ? 'observe' : 'play') as 'observe' | 'play', onClick: () => { onCommand('calendar.activateTask', { taskId: taskPopup.task.id }); close(); } }]),
              // task-node F21 — a plan whose block is over counts on that day.
              { key: 'done', label: taskPopup.task.done ? 'Not done yet' : doneLabel(plannedEndMs(taskPopup.task.id)), icon: taskPopup.task.done ? 'undo' : 'check', onClick: () => { const t = taskPopup.task.id; if (taskPopup.task.done) void toggleTaskDone(t); else void markDoneAsPlanned(t); close(); } },
              ...(!taskPopup.task.done && todoRowOf(taskPopup.task.id) ? [{ key: 'wontdo', label: "Won't do", icon: 'drop' as const, onClick: () => { wontDoTask(taskPopup.task.id); close(); } }] : []),
              { key: 'show', label: 'Show', icon: 'show', onClick: () => { const t = taskPopup.task.id; close(); void showTask(t); } },
              { key: 'delete', label: 'Delete', icon: 'delete', danger: true, onClick: () => { void deletePlanOfTask(taskPopup.task.id); close(); } },
            ]}
            onApply={(next) => { void applyPlanWhen(plan, next); close(); }}
            onClose={close}
          />
        );
      })()}
      {infoPopup && (
        <TaskInfoPopup
          taskId={infoPopup.taskId}
          x={infoPopup.x}
          y={infoPopup.y}
          {...(infoPopup.startMs !== undefined ? { startMs: infoPopup.startMs } : {})}
          {...(infoPopup.endMs !== undefined ? { endMs: infoPopup.endMs } : {})}
          onClose={() => setInfoPopup(null)}
          onDetails={() => {
            const p = infoPopup;
            setInfoPopup(null);
            if (p.task) { setTaskPopup({ task: p.task, x: p.x, y: p.y }); return; }
            if (p.routine) {
              const { h } = p.routine;
              const hmOf = (m: number) => { const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
              editEventCard(h, p.routine.date, p.x, p.y, hmOf(p.routine.startMin));
            }
          }}
        />
      )}
      {/* Only while the task exists: an undo or a delete elsewhere closes it. */}
      {taskPopup && !planWhenOf({ taskId: taskPopup.task.id }) && useBoardStore.getState().board?.nodes.some((n) => n.id === taskPopup.task.id) && (
        <TaskPopup
          task={taskPopup.task}
          x={taskPopup.x}
          y={taskPopup.y}
          time={exactTime}
          duration={exactDur}
          onTime={setExactTime}
          onDuration={setExactDur}
          onApply={(t) => { applyExactTime(taskPopup.task, t); setTaskPopup(null); }}
          {...(easy ? {} : { onActivate: () => { onCommand('calendar.activateTask', { taskId: taskPopup.task.id }); setTaskPopup(null); } })}
          onJump={() => { jumpToTaskNode(taskPopup.task.id); setTaskPopup(null); }}
          onUnschedule={() => { void putPlanOnDay({ taskId: taskPopup.task.id }, taskPopup.task.startISO.slice(0, 10)); setTaskPopup(null); }}
          timerLabel={(useBoardStore.getState().board?.nodes.find((n) => n.kind === 'pomo')?.config as { mode?: string } | undefined)?.mode === 'observe' ? 'Track it now' : 'Focus on it'}
          onDelete={() => { void deletePlanOfTask(taskPopup.task.id); setTaskPopup(null); }}
          onClose={() => setTaskPopup(null)}
        />
      )}

      {eventsOpen && createPortal(
        <>
          <div onMouseDown={() => setEventsOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
          <div
            data-testid="calendar-events-popover"
            role="dialog"
            aria-label="Events"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: Math.max(8, Math.min(eventsOpen.x - 150, window.innerWidth - 308)), top: Math.min(eventsOpen.y + 12, window.innerHeight - 260),
              width: 300, zIndex: Z.popover, padding: '10px 12px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--paper-3)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>Events</span>
            {listedEvents.length === 0 && <span style={{ color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.5 }}>None yet. Type one at the bottom of the Calendar, or double-click empty hours.</span>}
            {listedEvents.map((h) => {
              // Decision 62 — a one-time event: its date and time, edit or delete.
              if (isOneTimeEvent(h)) {
                const t1 = h.schedule?.timeOfDay ?? '';
                const e1 = t1 ? Number(t1.slice(0, 2)) * 60 + Number(t1.slice(3)) + (h.schedule?.durationMin ?? 60) : 0;
                return (
                  <div key={h.id} data-testid={`calendar-event-row-${h.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: `var(--${h.color})`, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>{h.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                      {new Date(`${h.startsOn}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {t1}–{`${String(Math.floor(e1 / 60) % 24).padStart(2, '0')}:${String(e1 % 60).padStart(2, '0')}`}
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                      <button type="button" title="Edit" aria-label={`Edit ${h.name}`} onClick={(e) => { setEventsOpen(null); editEventCard(h, h.startsOn!, e.clientX - 140, e.clientY, t1 || '09:00'); }} style={iconBtn}><MenuIcon name="rename" size={13} /></button>
                      <button type="button" title="Delete" aria-label={`Delete ${h.name}`} onClick={() => { void deleteRoutine(h.id); }} style={{ ...iconBtn, color: 'var(--rust)' }}><MenuIcon name="delete" size={13} /></button>
                    </span>
                  </div>
                );
              }
              const ended = !!(h.endsOn && h.endsOn < todayYMD());
              // Ended from today on: it still happens today, so say so (the row
              // looked unchanged after End, as if the button did nothing).
              const ending = !ended && !!h.endsOn;
              const endWord = h.endsOn === todayYMD() ? 'today' : new Date(`${h.endsOn}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
              const days = daysOf(h);
              const t = h.schedule?.timeOfDay ?? '';
              const endMin = t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + (h.schedule?.durationMin ?? 60) : 0;
              const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
              return (
                <div key={h.id} data-testid={`calendar-event-row-${h.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26, opacity: ended ? 0.62 : 1 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: `var(--${h.color})`, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    {ended ? `ended ${new Date(`${h.endsOn}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ending ? `ends after ${endWord}` : `${days.length === 7 ? 'every day' : days.map((n) => DAY_LETTER[n - 1]).join(' ')} · ${t}–${end}`}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                    {ended
                      ? <button type="button" title="Restart" aria-label={`Restart ${h.name}`} onClick={() => { void habitMotherCommand('routine.restart', { id: h.id }); }} style={iconBtn}><MenuIcon name="restart" size={13} /></button>
                      : <button type="button" title="Edit" aria-label={`Edit ${h.name}`} onClick={(e) => { setEventsOpen(null); editEventCard(h, todayYMD(), e.clientX - 140, e.clientY, t || '09:00'); }} style={iconBtn}><MenuIcon name="rename" size={13} /></button>}
                    {ending
                      ? <button type="button" title="Keep it (don't end it)" aria-label={`Keep ${h.name}`} onClick={() => { void habitMotherCommand('routine.restart', { id: h.id }); }} style={iconBtn}><MenuIcon name="restart" size={13} /></button>
                      : !ended && <button type="button" title="End after today (keeps past)" aria-label={`End ${h.name}`} onClick={() => { void habitMotherCommand('routine.end', { id: h.id, date: todayYMD() }); }} style={iconBtn}><MenuIcon name="end" size={13} /></button>}
                    <button type="button" title="Delete" aria-label={`Delete ${h.name}`} onClick={() => { void deleteRoutine(h.id); }} style={{ ...iconBtn, color: 'var(--rust)' }}><MenuIcon name="delete" size={13} /></button>
                  </span>
                </div>
              );
            })}
            <button
              type="button"
              data-testid="calendar-event-new"
              onClick={(e) => {
                setEventsOpen(null);
                const day = todayYMD();
                const isoDow = ((new Date(`${day}T00:00:00`).getDay() + 6) % 7) + 1;
                setEventCard({ x: e.clientX - 140, y: e.clientY - 200, day, allowOnce: true, initial: { name: '', mode: 'once', days: [isoDow], time: '09:00', lengthMin: 60 } });
              }}
              style={{ marginTop: 4, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 6, border: '1px dashed var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}
            >
              <MenuIcon name="plus" size={12} />New event
            </button>
          </div>
        </>,
        document.body,
      )}
      {eventCard && (
        <EventCard
          x={eventCard.x}
          y={eventCard.y}
          dayLabel={new Date(`${eventCard.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
          initial={eventCard.initial}
          allowOnce={eventCard.allowOnce}
          {...(eventCard.editId ? { submitLabel: 'Save' } : {})}
          onSubmit={(d) => submitEvent(eventCard, d)}
          onClose={() => setEventCard(null)}
        />
      )}
      {eventRemind && (
        <RemindPicker
          x={eventRemind.x}
          y={eventRemind.y}
          value={eventRemind.value}
          onPick={(min) => { void habitMotherCommand('habit.setRemind', { id: eventRemind.id, min }); setEventRemind(null); }}
          onClose={() => setEventRemind(null)}
        />
      )}
      {routineMove && createPortal(
        <>
        {/* A click elsewhere closes it, like the other cards. */}
        <div onMouseDown={(e) => { e.stopPropagation(); setRoutineMove(null); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
        <div
          data-testid="routine-move"
          data-owns-keys="true"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', left: Math.min(routineMove.x, window.innerWidth - 240), top: Math.min(routineMove.y, window.innerHeight - 140),
            width: 220, zIndex: Z.popover, padding: 12, borderRadius: 10, background: 'var(--node-bg)', border: '1px solid var(--paper-3)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink)' }}>Move “{routineMove.name}” this time</span>
          <TimeField
            value={routineMove.value}
            onChange={(v) => setRoutineMove((m) => (m ? { ...m, value: v } : m))}
            testId="routine-move-time"
            onEnter={(v) => { void habitMotherCommand('routine.move', { id: routineMove.id, date: routineMove.date, at: v }); setRoutineMove(null); }}
            onEscape={() => setRoutineMove(null)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" onClick={() => setRoutineMove(null)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            <button type="button" data-testid="routine-move-save" onClick={() => { void habitMotherCommand('routine.move', { id: routineMove.id, date: routineMove.date, at: routineMove.value }); setRoutineMove(null); }}
              style={{ height: 28, padding: '0 12px', borderRadius: 7, border: 'none', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', cursor: 'pointer', fontSize: 12, fontWeight: 650 }}>Move</button>
          </div>
        </div>
        </>,
        document.body,
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onDismiss={() => setCtxMenu(null)} />
      )}

      {/* #7 — overlap layer picker. Right-click enumerates every block under the
          cursor; the user picks which to inspect. */}
      {layerMenu && createPortal(
        <>
          <div onClick={() => setLayerMenu(null)} onContextMenu={(e) => { e.preventDefault(); setLayerMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: Z.layerMenuBackdrop, pointerEvents: layerDragging ? 'none' : undefined }} />
          <div
            data-testid="calendar-layer-menu"
            style={{
              pointerEvents: layerDragging ? 'none' : undefined,
              opacity: layerDragging ? 0.35 : 1,
              position: 'fixed',
              left: Math.min(layerMenu.x + 4, window.innerWidth - 230),
              top: layerMenu.y + 4,
              zIndex: Z.layerMenu,
              background: 'var(--paper)',
              border: '1px solid var(--paper-3)',
              borderRadius: 8,
              padding: 5,
              minWidth: 200,
              boxShadow: 'var(--shadow-1)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 6px 5px' }}>
              {layerMenu.items.length} items here
            </div>
            {layerMenu.items.map((item, i) => {
              const isTask = item.kind === 'task';
              const tone = isTask ? toneVarForTask(item.task.id) : spanTone(tagLibrary, item.seg, easy);
              const label = isTask
                ? item.task.text || 'Untitled task'
                : `Tracked · ${item.seg.kind === 'work' ? spanTitle(item.seg, 'focus') : 'break'} ${fmtHM(item.seg.startMs)}–${fmtHM(item.seg.endMs)}`;
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`calendar-layer-item-${item.kind}`}
                  draggable={isTask}
                  onDragStart={isTask ? (e) => {
                    e.dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId: item.task.id, durationMin: item.task.plannedMin }));
                    e.dataTransfer.effectAllowed = 'move';
                    beginTaskDragInfo({ taskId: item.task.id, durationMin: item.task.plannedMin });
                    startCarry(e, toneVarForTask(item.task.id), 'offCalendar');
                    setLayerDragging(true);
                  } : undefined}
                  onDragEnd={isTask ? () => { setLayerDragging(false); setLayerMenu(null); } : undefined}
                  onClick={() => {
                    if (layerMenu.open === 'details') openItemDetails(item, layerMenu.x, layerMenu.y);
                    else openItemMenu(item, layerMenu.x, layerMenu.y);
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
                    fontSize: 11,
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
            position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: Z.notice,
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
          <div onClick={() => setRealityPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
          <div
            data-testid="calendar-reality-popup"
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
              minWidth: 220,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 10, height: 10, borderRadius: 999, flexShrink: 0,
                  background: spanTone(tagLibrary, realityPopup.seg, easy),
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                {spanTitle(realityPopup.seg, 'Focus session')}
              </span>
              {realityPopup.seg.live && (
                <span style={{ fontSize: 11, color: 'var(--acid-ink, var(--acid))', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: 3 }}><span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }} />LIVE</span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>recorded</span>
            </div>
            {/* #207 — click a time to change it (where I really stopped); a
                running session's "now" becomes "Stop at". */}
            <SpanTimeEditor
              testIdPrefix="calendar-reality-time"
              seg={realityPopup.seg}
              onSaved={(startMs, endMs) => {
                if (realityPopup.seg.live) setRealityPopup(null);
                else setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, startMs, endMs } });
              }}
            />
            <div style={{ color: 'var(--ink-3)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {realityPopup.seg.live ? 'So far · ' : 'Duration · '}
              {Math.max(1, Math.round((realityPopup.seg.endMs - realityPopup.seg.startMs) / 60_000))} min
            </div>
            {/* Plan vs reality — which task this time counts toward. Only work
                spans carry a tag; the live span is retagged from the Pomo. */}
            {!easy && realityPopup.seg.kind === 'work' && !realityPopup.seg.live && (
              <CountsToward
                testId="calendar-reality-retag"
                segId={realityPopup.seg.id}
                taskId={realityPopup.seg.taskId ?? null}
                taskName={spanTaskName(realityPopup.seg)}
                categoryTag={realityPopup.seg.tag ?? null}
                onChanged={(taskId) => setRealityPopup({ ...realityPopup, seg: { ...realityPopup.seg, taskId } })}
              />
            )}
            {/* #12 — delete a recorded segment (removes it from analytics too).
                The live in-flight span can't be deleted; stop it first. */}
            {!realityPopup.seg.live && (
              <button
                type="button"
                data-testid="calendar-reality-delete"
                onClick={() => { deleteRealitySegment(realityPopup.seg.id); setRealityPopup(null); }}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--rust)',
                  background: 'transparent',
                  border: '1px solid var(--rust)',
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
            streakDays={habitRecord && habitStreak(habitRecord, todayStr).unit === 'day' ? habitStreak(habitRecord, todayStr).current : 0}
            dropDayYMD={swapModal.dayYMD}
            isoDow={swapModal.isoDow}
            defaultTimeOfDay={defaultTimeOfDay}
            defaultDurationMin={25}
            initialKind={habitRecord && isRoutine(habitRecord) ? 'routine' : 'habit'}
            onConfirm={(schedule, kind) => {
              const snap = swapModal;
              setSwapModal(null);
              onCommand('calendar.scheduleHabit', {
                habitId: snap.habit.habitId,
                habitMotherId: snap.habit.habitMotherId,
                schedule,
              });
              // Decision 39 — the switch decides habit or routine (schedule first: a routine needs its time).
              if ((kind === 'routine') !== (!!habitRecord && isRoutine(habitRecord))) {
                void habitMotherCommand('habit.setKind', { id: snap.habit.habitId, kind });
              }
            }}
            onCancel={() => setSwapModal(null)}
          />
        );
      })()}
    </div>
  );
}

// Compact zoom button (− / +). Disabled state dims and blocks the cursor.
function hourPagerBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent', border: 'none', padding: 0, width: 18, height: 18, borderRadius: 4, lineHeight: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: disabled ? 'var(--ink-4)' : 'var(--ink-2)', opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--font-mono)',
  };
}

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

const iconBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
