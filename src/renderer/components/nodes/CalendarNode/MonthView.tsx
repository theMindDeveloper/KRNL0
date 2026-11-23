// ADR 0001 — MonthView (Slice 2).
// Renders a 7×6 Monday-start month grid with task chips and a today ring.
// Reads tasks from the board store via a shallow-equal selector so only
// the minimal task-schedule data is subscribed; unrelated store changes
// (node positions, pomo state, etc.) do not re-render this component.

import { useEffect, useMemo, useRef, useState } from 'react';
import { beginCalendarDrag, registerCalendarSurface, type CalendarSurface } from './calendarDrag';
import { useBoardStore } from '../../../store/boardStore';
import { dayOnlyPlans } from './dayOnly';
import { DueFlag } from './DueFlag';
import { putPlanOnDay } from '../../../store/scheduleActions';
import { toneVarForTask } from '../../../utils/taskColor';
import { TaskInfoPopup } from '../../ui/TaskInfoPopup';
import { useShallow } from 'zustand/react/shallow';
import { selectSchedule, selectScheduledTasksForRange } from '../../../store/scheduleSelector';
import type { CalendarConfig, CalendarState } from './types';
import { calendarLayersOf } from './types';
import { getMonthDays, getMondayOf, toYMD, isRoutine } from '../HabitNode/types';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { selectPomoReality } from '../../../store/pomoReality';
import { fmtMinutes } from '../ClockNode/dayModel';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';
import { LineGlyph } from '../../ui/LineGlyph';
import { allDayOn, linksOf, partOnDay, type CalendarLink, type LinkedEvent } from '../../../../shared/calsync/types';
import { LinkedEmptyHint, LinkedInfoCard, linkedLook } from './OtherCalendars';

interface ScheduledTask {
  id: string;
  text: string;
  startISO: string; // ADR 0003: cascade-derived placement start
  isAnchor: boolean; // ADR 0003: passed through for future visual treatment
}

interface ScheduledHabit {
  id: string;
  color: string; // habit color token name
  schedule: HabitSchedule;
  /** Local day the habit was created — no dots before it. */
  createdYMD: string;
}

// Convert JS getDay() (0=Sun..6=Sat) to ISO-8601 day-of-week (1=Mon..7=Sun).
function jsGetDayToIsoDow(jsDay: number): IsoDow {
  return (jsDay === 0 ? 7 : jsDay) as IsoDow;
}

// Check if a habit is scheduled on a given ISO day-of-week.
function habitScheduledOnDow(schedule: HabitSchedule, isoDow: IsoDow): boolean {
  switch (schedule.kind) {
    case 'daily': return true;
    case 'weekly': return schedule.days.includes(isoDow);
    case 'weekdays': return isoDow >= 1 && isoDow <= 5;
  }
}

// Max visible habit dots before "+N" overflow (ADR 0002 §6).
const MAX_DOTS = 6;

interface MonthViewProps {
  state: CalendarState;
  config: CalendarConfig;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
}

// Week day header labels (Monday-start).
const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// Max task chips shown per cell before "+N more" overflow label.
const MAX_CHIPS = 3;
// Chip row height as drawn (11 px text at line-height 1.3, 2 px padding, 1 px
// gap) and the cell chrome above / below the chips (day number, the habit-dot
// row, padding). Measured: with less, the "+N more" line ran into the dots.
const CHIP_ROW_PX = 18;
const CELL_CHROME_PX = 34;

/**
 * How many chips a cell can show without squashing: whole rows only, and one
 * row is kept for "+N" when tasks overflow. Exported for tests.
 */
export function chipsThatFit(cellHeight: number, taskCount: number): { shown: number; overflow: number } {
  if (cellHeight <= 0) {
    const shown = Math.min(MAX_CHIPS, taskCount);
    return { shown, overflow: taskCount - shown };
  }
  const rows = Math.max(0, Math.floor((cellHeight - CELL_CHROME_PX) / CHIP_ROW_PX));
  if (taskCount <= rows) return { shown: taskCount, overflow: 0 };
  const shown = Math.max(0, Math.min(MAX_CHIPS, rows - 1));
  return { shown, overflow: taskCount - shown };
}

// Truncate task text to ~14 chars + ellipsis.
function truncateLabel(text: string): string {
  return text.length > 14 ? text.slice(0, 14) + '…' : text;
}

// Parse anchor YYYY-MM-DD into a Date at local midnight.
function parseAnchorDate(ymd: string): Date {
  return new Date(ymd + 'T00:00:00');
}

// Return YYYY-MM-DD of the first day of the month.
function firstOfMonth(d: Date): string {
  return toYMD(new Date(d.getFullYear(), d.getMonth(), 1));
}

// Return YYYY-MM-DD of the first day of the previous month.
function prevMonthFirst(d: Date): string {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return toYMD(prev);
}

// Return YYYY-MM-DD of the first day of the next month.
function nextMonthFirst(d: Date): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return toYMD(next);
}

// Build a 6-week (42-cell) Monday-start grid for the month containing `anchor`.
// Cells before/after the calendar month are padded with days from adjacent months.
function buildMonthGrid(anchor: Date): string[] {
  const monthDays = getMonthDays(anchor);
  const firstDay = parseAnchorDate(monthDays[0]!);
  // getMondayOf returns the Monday of the week containing `firstDay`
  const gridStart = getMondayOf(firstDay);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(toYMD(d));
  }
  return cells;
}

// Format the anchor date as "May 2026", "April 2026", etc.
function formatMonthLabel(anchor: Date): string {
  return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function MonthView({ state, config, onCommand }: MonthViewProps) {
  const anchor = parseAnchorDate(state.anchorDate);
  // Re-renders at midnight, so the today cell moves with the clock.
  const todayYMD = useLocalDay();
  // #207 / time-log F10 — recorded work minutes per local day (split at midnight).
  const pomoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'pomo'));
  const focusByDay = useMemo(() => {
    const out = new Map<string, number>();
    const board = useBoardStore.getState().board;
    for (const seg of selectPomoReality(board, Date.now())) {
      if (seg.kind !== 'work') continue;
      let cursor = seg.startMs;
      for (let guard = 0; guard < 14 && cursor < seg.endMs; guard++) {
        const d = new Date(cursor);
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const end = Math.min(seg.endMs, dayEnd);
        const key = toYMD(d);
        out.set(key, (out.get(key) ?? 0) + (end - cursor) / 60_000);
        cursor = end;
      }
    }
    return out;
  }, [pomoNode, todayYMD]);
  // The Calendar's Habits layer (its menu) hides the dots here too.
  const showHabits = config?.showHabits !== false && calendarLayersOf(state).habits;
  const cells = useMemo(() => buildMonthGrid(anchor), [state.anchorDate]);
  const monthLabel = formatMonthLabel(anchor);
  // Determine which month's days belong to this calendar page.
  const currentMonth = anchor.getMonth();
  const currentYear = anchor.getFullYear();

  // ADR 0003 §4 — read placements from the cascade selector, not raw
  // scheduledFor. The grid spans 42 cells (6 weeks) starting at cells[0].
  const monthRangeFromISO = `${cells[0]}T00:00`;
  const lastCellYMD = cells[cells.length - 1] ?? cells[0]!;
  // Range upper bound: last cell + 1 day (exclusive).
  const lastDate = new Date(lastCellYMD + 'T00:00:00');
  lastDate.setDate(lastDate.getDate() + 1);
  const monthRangeToISO = `${toYMD(lastDate)}T00:00`;
  // One cell's height (6 equal rows) — decides how many chips fit.
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(0);
  // Left-click a task chip → what it is (the cell click still opens the day).
  const [taskPopup, setTaskPopup] = useState<{ taskId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setCellH(Math.max(0, (el.clientHeight - 6 - 2 * 5) / 6));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const scheduledTasks = useBoardStore(
    useShallow((s): ScheduledTask[] => {
      if (!s.board) return [];
      const placements = selectScheduledTasksForRange(
        s.board,
        monthRangeFromISO,
        monthRangeToISO,
      );
      const out: ScheduledTask[] = [];
      for (const p of placements) {
        const node = s.board.nodes.find((n) => n.id === p.taskId);
        if (!node || node.kind !== 'todo.task') continue;
        const st = node.state as { text?: string };
        out.push({
          id: p.taskId,
          text: typeof st.text === 'string' ? st.text : '',
          startISO: p.startISO,
          isAnchor: p.isAnchor,
        });
      }
      return out;
    }),
  );

  // Read scheduled habits from the board store (ADR 0002 §6).
  // Sorted by habit.id ascending for stable dot ordering.
  const scheduledHabits = useBoardStore(
    useShallow((s): ScheduledHabit[] => {
      if (!s.board) return [];
      const result: ScheduledHabit[] = [];
      for (const n of s.board.nodes) {
        if (n.kind !== 'habit') continue;
        const habitState = n.state as { habits?: Habit[] } | null;
        if (!habitState?.habits) continue;
        for (const h of habitState.habits) {
          if (h.archived || !h.schedule || isRoutine(h)) continue; // routines are never ticked (Decision 39)
          const created = h.createdAt ? new Date(h.createdAt) : null;
          const createdYMD = created && !Number.isNaN(created.getTime()) ? toYMD(created) : '';
          result.push({ id: h.id, color: h.color, schedule: h.schedule, createdYMD });
        }
      }
      result.sort((a, b) => a.id.localeCompare(b.id));
      return result;
    }),
  );

  // Build a map from YYYY-MM-DD → ScheduledTask[] for O(1) cell lookup.
  // Plans with a day but no time yet (due that day, not on the grid): shown
  // in their day like the Week view's DAY line, dashed.
  const boardNodes = useBoardStore((st) => st.board?.nodes);
  const dayOnly = useMemo(
    () => dayOnlyPlans(boardNodes ?? [], cells, new Map(scheduledTasks.map((t) => [t.id, t.startISO.slice(0, 10)])), todayYMD),
    [boardNodes, cells, scheduledTasks, todayYMD],
  );

  // Decision 64: events from other calendars (Look A), each on its days.
  const calendarLinksRaw = useBoardStore((st) => (st.board as { calendarLinks?: unknown } | null)?.calendarLinks);
  const linkedLayerOn = calendarLayersOf(state).linked;
  const linkedByDay = useMemo(() => {
    const map = new Map<string, Array<{ link: CalendarLink; ev: LinkedEvent }>>();
    if (!linkedLayerOn || !cells.length) return map;
    const first = cells[0]!;
    const last = cells[cells.length - 1]!;
    for (const link of linksOf({ calendarLinks: calendarLinksRaw }).filter((l) => l.on)) {
      for (const ev of link.events) {
        if (ev.start.slice(0, 10) > last) break;
        if (ev.end.slice(0, 10) < first) continue;
        for (const d of cells) {
          if (ev.allDay ? allDayOn(ev, d) : partOnDay(ev, d)) (map.get(d) ?? map.set(d, []).get(d)!).push({ link, ev });
        }
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.ev.allDay ? -1 : 0) - (b.ev.allDay ? -1 : 0) || a.ev.start.localeCompare(b.ev.start));
    return map;
  }, [calendarLinksRaw, linkedLayerOn, cells]);
  const [linkedInfo, setLinkedInfo] = useState<{ link: CalendarLink; ev: LinkedEvent; x: number; y: number } | null>(null);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, ScheduledTask[]>();
    for (const task of scheduledTasks) {
      // startISO is ISO local datetime; extract the date part.
      const dayYMD = task.startISO.slice(0, 10);
      const existing = map.get(dayYMD);
      if (existing) {
        existing.push(task);
      } else {
        map.set(dayYMD, [task]);
      }
    }
    // Earliest first, so "+N" hides the latest of the day, never the first.
    for (const list of map.values()) list.sort((a, b) => a.startISO.localeCompare(b.startISO));
    return map;
  }, [scheduledTasks]);

  // A click picks the day: the week and day views open on it too (they
  // follow the anchor). A double-click opens that day, as in the year view.
  const handleCellClick = (ymd: string) => {
    onCommand('calendar.selectDate', { date: ymd });
    onCommand('calendar.setAnchor', { date: ymd });
  };
  // ADR 0001 §9 — a month day cell takes task drops (Todo rows, canvas tasks,
  // other month chips). There is no hour here: a task that already has a time
  // keeps its time of day on the new date; a new one starts at 09:00.
  const dropOnDay = (payload: { taskId?: string; itemId?: string; durationMin?: number }, ymd: string) => {
    const board = useBoardStore.getState().board;
    const task = payload.taskId ? board?.nodes.find((n) => n.id === payload.taskId) : undefined;
    // Its time as drawn: a chained plan has none of its own (it follows the
    // one before), so read its placement.
    const own = (task?.state as { scheduledFor?: string | null } | undefined)?.scheduledFor;
    const current = own ?? (payload.taskId ? selectSchedule(board ?? null).placements.get(payload.taskId)?.startISO : undefined);
    // Decision 40 — a plan with a time keeps it on the new day; one without
    // goes on that day at any time (it is not given a made-up 09:00).
    if (!(typeof current === 'string' && /T\d{2}:\d{2}/.test(current))) {
      void putPlanOnDay(payload, ymd);
      return;
    }
    const scheduledFor = `${ymd}T${current.slice(11, 16)}`;
    if (payload.taskId) onCommand('calendar.schedule', { taskId: payload.taskId, scheduledFor });
    else if (payload.itemId) {
      onCommand('calendar.schedule', {
        itemId: payload.itemId,
        scheduledFor,
        ...(typeof payload.durationMin === 'number' ? { scheduledDurationMin: payload.durationMin } : {}),
      });
    }
  };

  // Decision 63 — the one drag engine: a day of this month takes a plan.
  const rootRef = useRef<HTMLDivElement>(null);
  const [hotDay, setHotDay] = useState<string | null>(null);
  const monthImpl = useRef<CalendarSurface | null>(null);
  // The days' boxes, measured once per drag (no layout read per move).
  const cellBoxes = useRef<Array<{ l: number; t: number; r: number; b: number; day: string }> | null>(null);
  const readCells = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-month-day]') ?? []).map((cell) => {
    const r = cell.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, day: cell.dataset['monthDay']! };
  });
  monthImpl.current = {
    el: rootRef.current,
    slotAt: (x, y) => {
      for (const c of cellBoxes.current ?? readCells()) {
        if (x >= c.l && x <= c.r && y >= c.t && y <= c.b) return { monthDay: c.day };
      }
      return null;
    },
    gran: () => 15,
    hover: (slot) => setHotDay(slot && 'monthDay' in slot ? slot.monthDay : null),
    commit: (item, result) => {
      if (item.kind !== 'task' || !('monthDay' in result)) return null;
      const durationMin = item.plannedMin ?? item.lenMin;
      dropOnDay(item.itemOnly ? { itemId: item.id, durationMin } : { taskId: item.id, durationMin }, result.monthDay);
      return null;
    },
  };
  const monthSurface = useMemo<CalendarSurface>(() => ({
    get el() { return rootRef.current; },
    slotAt: (x, y) => monthImpl.current?.slotAt(x, y) ?? null,
    gran: () => 15,
    hover: (slot) => monthImpl.current?.hover?.(slot),
    commit: (item, result, origin, mode) => monthImpl.current?.commit(item, result, origin, mode) ?? null,
    measure: () => { cellBoxes.current = readCells(); },
    release: () => { cellBoxes.current = null; },
  }), []);
  useEffect(() => registerCalendarSurface(monthSurface), [monthSurface]);

  const handleCellDoubleClick = (ymd: string) => {
    onCommand('calendar.setAnchor', { date: ymd });
    onCommand('calendar.setView', { view: 'day' });
  };

  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: prevMonthFirst(anchor) });
  };

  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: nextMonthFirst(anchor) });
  };

  return (
    <div
      ref={rootRef}
      data-cal-surface="month"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* window-frame.md — the standard time row. */}
      <div className="kw-range" style={{ justifyContent: 'center' }}>
        <button type="button" className="kw-btn" onClick={handlePrev} data-testid="month-prev" aria-label="Previous month">
          <LineGlyph name="chevronLeft" size={13} />
        </button>
        <span data-testid="month-label" className="kw-range__label" style={{ minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
        <button type="button" className="kw-btn" onClick={handleNext} data-testid="month-next" aria-label="Next month">
          <LineGlyph name="chevron" size={13} />
        </button>
      </div>

      {/* PR7 — Today's tasks strip. Sits between the month header and the
          weekday row so today's agenda is visible without hunting the grid
          for the green cell. Only renders if there is at least one task
          scheduled today. */}
      {(() => {
        const todaysTasks = tasksByDay.get(todayYMD) ?? [];
        if (todaysTasks.length === 0) return null;
        return (
          <div
            data-testid="month-today-strip"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px 6px',
              borderBottom: '1px dashed var(--paper-3)',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--ink-3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              today ·
            </span>
            <div
              style={{
                display: 'flex',
                gap: 4,
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none',
                // Decision 60 — no fade (it read as a blur); the strip just scrolls.
                paddingRight: 4,
                flex: 1,
                minWidth: 0,
              }}
            >
              {/* Every plan of today, scrolling sideways — none hidden behind "+N". */}
              {todaysTasks.map((t) => (
                <span
                  key={t.id}
                  title={t.text}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--ink-2)',
                    background: 'var(--paper-2)',
                    borderRadius: 2,
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flexShrink: 0,
                    maxWidth: 90,
                  }}
                >
                  {truncateLabel(t.text)}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Weekday header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          padding: '4px 6px 2px',
          gap: 2,
        }}
      >
        {WEEKDAY_LABELS.map((day) => (
          <div
            key={day}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textAlign: 'center',
              textTransform: 'uppercase',
              padding: '2px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Decision 64 — the month has nothing from the other calendars: say where the next is. */}
      {linkedLayerOn && (() => {
        const mFirst = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
        const mLast = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
        return <LinkedEmptyHint links={linksOf({ calendarLinks: calendarLinksRaw })} fromYMD={mFirst} toYMD={mLast} period="this month" onJump={(d) => onCommand('calendar.setAnchor', { date: d })} />;
      })()}

      {/* Day cell grid — 6 rows × 7 cols = 42 cells */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: 'repeat(6, 1fr)',
          flex: 1,
          gap: 2,
          padding: '0 6px 6px',
          overflow: 'hidden',
        }}
      >
        {cells.map((ymd) => {
          const isToday = ymd === todayYMD;
          const isSelected = ymd === state.selectedDate;
          const inCurrentMonth =
            (() => {
              const d = parseAnchorDate(ymd);
              return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })();
          const dayNum = parseInt(ymd.slice(8, 10), 10);
          const tasks = tasksByDay.get(ymd) ?? [];
          // Every plan keeps its own chip (readable, clickable, draggable);
          // a full day scrolls inside its cell instead of hiding plans as "+N".
          const visible = tasks;
          // More than fits: the list fades at its foot, saying "scroll for more".
          const scrolls = chipsThatFit(cellH, tasks.length).overflow > 0;

          // Compute habit dots for this cell.
          const cellDate = parseAnchorDate(ymd);
          const cellIsoDow = jsGetDayToIsoDow(cellDate.getDay());
          const cellHabits = showHabits
            ? scheduledHabits.filter((h) => ymd >= h.createdYMD && habitScheduledOnDow(h.schedule, cellIsoDow))
            : [];
          // Every habit keeps its dot; they wrap onto a second row.
          const visibleDots = cellHabits;

          // PR7 — out-of-month cells render empty (no day number, no chips,
          // no hover/click). Today cell uses the `krnl-month-cell--today`
          // class for the solid green fill + readable dark text.
          return (
            <div
              key={ymd}
              data-testid={`month-cell-${ymd}`}
              data-date={ymd}
              data-today={isToday ? 'true' : undefined}
              className={isToday ? 'krnl-month-cell krnl-month-cell--today' : 'krnl-month-cell'}
              onClick={inCurrentMonth ? () => handleCellClick(ymd) : undefined}
              onDoubleClick={inCurrentMonth ? () => handleCellDoubleClick(ymd) : undefined}
              data-month-day={inCurrentMonth ? ymd : undefined}
              data-drop-target={inCurrentMonth && hotDay === ymd ? 'true' : undefined}
              style={{
                position: 'relative',
                // A faint fill marks each day of this month as its own cell, so
                // its dots and chips read as belonging to it.
                background: isSelected && !isToday ? 'var(--paper-2)' : inCurrentMonth ? 'color-mix(in srgb, var(--paper-2) 45%, transparent)' : 'transparent',
                border: isSelected
                  ? '1px solid var(--acid)'
                  : '1px solid transparent',
                borderRadius: 3,
                padding: '2px 3px',
                cursor: inCurrentMonth ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
              }}
              onMouseEnter={
                inCurrentMonth
                  ? (e) => {
                      if (!isSelected && !isToday) {
                        e.currentTarget.style.background = 'var(--paper-2)';
                      }
                    }
                  : undefined
              }
              onMouseLeave={
                inCurrentMonth
                  ? (e) => {
                      if (!isSelected && !isToday) {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--paper-2) 45%, transparent)';
                      }
                    }
                  : undefined
              }
            >
              {/* Today ring — pulses around today's cell, on top of the
                  solid green fill. */}
              {isToday && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 3,
                    border: '1.5px solid var(--ink)',
                    animation: 'krnl-today-pulse 2s ease-in-out infinite',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              {/* #207 / time-log F10 — recorded hours that day (top-left). */}
              {inCurrentMonth && (focusByDay.get(ymd) ?? 0) > 0 && (
                <span
                  data-testid={`month-hours-${ymd}`}
                  title="Recorded work this day"
                  style={{ position: 'absolute', top: 3, left: 4, zIndex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}
                >
                  {fmtMinutes(focusByDay.get(ymd) ?? 0)}
                </span>
              )}
              {/* PR7.1 — Day number ALWAYS shows (faded for out-of-month,
                  per the LifeOS reference). Chips and habit dots only
                  render for current-month cells. */}
              <div
                className={isToday ? 'krnl-month-cell__day' : undefined}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: isToday
                    ? '#1a1814'
                    : inCurrentMonth
                      ? 'var(--ink-1)'
                      : 'var(--ink-3)',
                  // Other months: quieter ink, still readable (was ink-4 at 35 %).
                  opacity: inCurrentMonth ? 1 : 0.7,
                  textAlign: 'right',
                  lineHeight: 1,
                  marginBottom: 2,
                  position: 'relative',
                  zIndex: 1,
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {dayNum}
              </div>

              {/* Task chips — current month only */}
              {inCurrentMonth && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    scrollbarWidth: 'thin',
                    // Decision 60 — no fade at the bottom (it read as a blur): the list scrolls, crisp.
                    ...(scrolls ? { paddingBottom: 4 } : {}),
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {visible.map((task) => (
                    <div
                      key={task.id}
                      data-testid="month-task-chip"
                      title={`${task.text} · click for details, drag to another day`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const ts = useBoardStore.getState().board?.nodes.find((n) => n.id === task.id)?.state as { plannedMin?: number } | undefined;
                        const len = ts?.plannedMin && ts.plannedMin > 0 ? ts.plannedMin : 60;
                        beginCalendarDrag(e, { item: { kind: 'task', id: task.id, name: task.text, tone: toneVarForTask(task.id), lenMin: len, plannedMin: len }, home: monthSurface });
                      }}
                      onClick={(e) => { e.stopPropagation(); setTaskPopup({ taskId: task.id, x: e.clientX, y: e.clientY }); }}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--ink-1)',
                        background: 'var(--paper-3)',
                        flexShrink: 0,
                        borderRadius: 2,
                        padding: '1px 3px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        lineHeight: '1.3',
                        cursor: 'pointer',
                      }}
                    >
                      <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: toneVarForTask(task.id), marginRight: 4, verticalAlign: '1px' }} />
                      {truncateLabel(task.text)}
                    </div>
                  ))}
                  {(dayOnly.get(ymd) ?? []).map((d) => (
                    <div
                      key={`day-${d.id}`}
                      data-testid={d.kind === 'deadline' ? 'month-deadline-chip' : 'month-day-only-chip'}
                      title={d.kind === 'deadline' ? `Deadline: ${d.text}` : `${d.text} — this day, any time. Drag it to another day, or into the hours of the week view.`}
                      onPointerDown={d.kind === 'plan' ? (e) => {
                        e.stopPropagation();
                        const len = d.plannedMin ?? 30;
                        beginCalendarDrag(e, {
                          item: d.taskId
                            ? { kind: 'task', id: d.taskId, name: d.text, tone: toneVarForTask(d.taskId), lenMin: len, plannedMin: len }
                            : { kind: 'task', id: d.id, itemOnly: true, name: d.text, tone: 'var(--acid)', lenMin: len, plannedMin: len },
                          home: monthSurface,
                        });
                      } : undefined}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0, borderRadius: 2, padding: '0 3px', lineHeight: '1.3',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: d.kind === 'plan' ? 'grab' : 'default',
                        // Decision 40 — a plan any time that day is a solid chip; a deadline a dashed flag.
                        border: d.kind === 'deadline'
                          ? `1px dashed ${d.overdue ? 'color-mix(in srgb, var(--rust) 70%, transparent)' : 'var(--ink-4)'}`
                          : `1px solid ${d.overdue ? 'color-mix(in srgb, var(--rust) 60%, transparent)' : 'var(--paper-3)'}`,
                        color: d.overdue ? 'var(--rust)' : d.kind === 'deadline' ? 'var(--ink-2)' : 'var(--ink)',
                        background: d.kind === 'deadline' ? 'transparent' : 'var(--paper-2)',
                      }}
                    >
                      {d.kind === 'deadline' && <DueFlag />}{truncateLabel(d.text)}
                    </div>
                  ))}
                  {(linkedByDay.get(ymd) ?? []).map(({ link, ev }) => {
                    const look = linkedLook(link.color);
                    const at = !ev.allDay && ev.start.slice(0, 10) === ymd ? `${ev.start.slice(11, 16)} ` : '';
                    return (
                      <button
                        key={`ln-${link.id}-${ev.id}`}
                        type="button"
                        data-testid="month-linked-chip"
                        title={`${ev.title} · from ${link.name}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setLinkedInfo({ link, ev, x: e.clientX, y: e.clientY }); }}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0, borderRadius: 2, padding: '0 3px', lineHeight: '1.3', textAlign: 'left',
                          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer',
                          border: `1px solid ${look.border}`, background: look.bg, color: look.text,
                        }}
                      >
                        {at}{truncateLabel(ev.title)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Habit dots — current month only (ADR 0002 §6) */}
              {inCurrentMonth && cellHabits.length > 0 && (
                <div
                  data-testid={`month-habit-dots-${ymd}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 2,
                    alignItems: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                    marginTop: 1,
                    pointerEvents: 'none',
                  }}
                >
                  {visibleDots.map((h) => (
                    <div
                      key={h.id}
                      data-testid={`month-habit-dot-${h.id}-${ymd}`}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: `var(--${h.color})`,
                        opacity: 0.85,
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {taskPopup && <TaskInfoPopup {...taskPopup} onClose={() => setTaskPopup(null)} />}
      {linkedInfo && <LinkedInfoCard link={linkedInfo.link} ev={linkedInfo.ev} x={linkedInfo.x} y={linkedInfo.y} onClose={() => setLinkedInfo(null)} />}
    </div>
  );
}

// Shared style for prev/next nav buttons — mirrors Habit's view toggle style.
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

// Re-export the month grid builder for tests.
export { buildMonthGrid, prevMonthFirst, nextMonthFirst, firstOfMonth };
