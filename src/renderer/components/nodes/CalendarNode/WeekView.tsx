// ADR 0001 Decision 24 — WeekView (Slice 3).
// ADR 0002 — Habit drag-to-schedule integration + habit block visualisation.
// Renders a 7-column × N-row hour grid. Supports drag-to-schedule from TodoNode
// rows and TaskNode blocks. Supports drag-to-schedule from HabitNode rows via
// RadialChooser. NowLine is rendered as an overlay.

import { useMemo, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { selectScheduledTasksForRange } from '../../../store/scheduleSelector';
import type { CalendarConfig, CalendarState } from './types';
import { getMondayOf, toYMD } from '../HabitNode/types';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';
import { NowLine } from './NowLine';
import { useRadialChooser } from '../../ui/RadialChooser';
import type { RadialOption } from '../../ui/RadialChooser';
import { getHabitDrag, type HabitDragPayload } from '../../../dnd/habitDrag';

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
  scheduledDurationMin: number; // calendar block duration (fallback: plannedMin or durationMin)
  plannedMin: number;           // for drag payload
  isAnchor: boolean;            // ADR 0003: true iff the user explicitly anchored this task
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

// Radial chooser options for habit scheduling (ADR 0002 A1 + A2 binding).
// Weekly: purple (#a78bfa via --purple), Daily: cyan (#22d3ee via --cyan).
type HabitScheduleKind = 'weekly' | 'daily';

function makeHabitChooserOptions(): RadialOption<HabitScheduleKind>[] {
  return [
    {
      id: 'weekly',
      label: 'EVERY WEEK',
      icon: '↺',
      color: 'var(--purple)',
      value: 'weekly',
    },
    {
      id: 'daily',
      label: 'EVERY DAY',
      icon: '◉',
      color: 'var(--cyan)',
      value: 'daily',
    },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekView({ state, config, onCommand }: WeekViewProps) {
  const { hourRange } = config;
  const rowCount = hourRange.end - hourRange.start + 1;
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

  const rowHeight = MIN_ROW_HEIGHT;

  // Sub-header nav handlers.
  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, -7) });
  };
  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, 7) });
  };

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
        const st = node.state as {
          text?: string;
          scheduledDurationMin?: number;
          plannedMin?: number;
          durationMin?: number;
        };
        const plannedMin = st.plannedMin ?? st.durationMin ?? 25;
        // Successors get their plannedMin as their block height; only the
        // anchor honours scheduledDurationMin (ADR 0003 §3.7).
        const blockDurationMin = p.isAnchor
          ? (st.scheduledDurationMin ?? plannedMin)
          : plannedMin;
        out.push({
          id: p.taskId,
          text: typeof st.text === 'string' ? st.text : '',
          startISO: p.startISO,
          scheduledDurationMin: blockDurationMin,
          plannedMin,
          isAnchor: p.isAnchor,
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

  // Build a map from YYYY-MM-DD → ScheduledTask[] for the rendered week.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, ScheduledTask[]>();
    const weekSet = new Set(weekDays);
    for (const task of scheduledTasks) {
      const dayYMD = task.startISO.slice(0, 10);
      if (!weekSet.has(dayYMD)) continue;
      const existing = map.get(dayYMD);
      if (existing) {
        existing.push(task);
      } else {
        map.set(dayYMD, [task]);
      }
    }
    return map;
  }, [scheduledTasks, weekDays]);

  // Whether any task is scheduled this week (controls empty-state hint).
  const hasTasksThisWeek = tasksByDay.size > 0;

  // Column width fallback for NowLine.
  const NOMINAL_COLUMN_WIDTH = 40;

  // ── RadialChooser for habit drops (ADR 0002 A1) ─────────────────────────────

  // dropCellRef captures the exact cell (dayYMD + hour) where the user released
  // the drag, AND the habit payload at drop time. Both are set ONLY in onDrop.
  // We snapshot the habit here (not in onPick) because the HTML5 drag sequence
  // fires `drop` → `dragend`, and `dragend` clears the habitDrag singleton —
  // so by the time the user clicks a wedge to confirm, getHabitDrag() returns
  // null. Snapshotting at drop time keeps the payload alive for onPick.
  const dropCellRef = useRef<{
    dayYMD: string;
    hour: number;
    habit: HabitDragPayload;
  } | null>(null);

  // After the user picks weekly/daily, we hold a prompt for the duration (in
  // minutes). The prompt is rendered inline at the drop coordinates. On Enter
  // we dispatch calendar.scheduleHabit; on Escape we cancel.
  const [durationPrompt, setDurationPrompt] = useState<{
    kind: HabitScheduleKind;
    cell: { dayYMD: string; hour: number };
    habit: HabitDragPayload;
    origin: { x: number; y: number };
  } | null>(null);

  const dispatchSchedule = useCallback(
    (
      kind: HabitScheduleKind,
      cell: { dayYMD: string; hour: number },
      habit: HabitDragPayload,
      durationMin: number,
    ) => {
      const timeOfDay = `${String(cell.hour).padStart(2, '0')}:00`;
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

  const chooser = useRadialChooser<HabitScheduleKind>({
    radius: 88,
    innerRadius: 24,
    onPick: useCallback(
      (kind: HabitScheduleKind) => {
        const cell = dropCellRef.current;
        // Clear the cell ref immediately so stale data doesn't leak.
        dropCellRef.current = null;
        if (!cell) return;
        // Compute the chooser origin for the duration prompt — same drop point.
        // Hand off to the duration prompt instead of dispatching directly.
        setDurationPrompt({
          kind,
          cell: { dayYMD: cell.dayYMD, hour: cell.hour },
          habit: cell.habit,
          origin: lastDropOriginRef.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        });
      },
      [],
    ),
    onCancel: useCallback(() => {
      dropCellRef.current = null;
    }, []),
  });

  // Tracks the most recent drop coordinates so the chooser onPick callback can
  // position the follow-up duration prompt without re-reading the event.
  const lastDropOriginRef = useRef<{ x: number; y: number } | null>(null);

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
        // then open chooser. We snapshot the habit here because `dragend` (which
        // clears the habitDrag singleton) fires AFTER drop but BEFORE the user
        // can click a wedge to confirm.
        if (e.dataTransfer.types.includes('application/krnl-habit')) {
          const habit = getHabitDrag();
          if (!habit) return;
          dropCellRef.current = { dayYMD, hour, habit };
          // Remember drop point for the follow-up duration prompt.
          lastDropOriginRef.current = { x: e.clientX, y: e.clientY };
          // Open chooser at drop coordinates. onPick reads dropCellRef.
          chooser.open(
            { x: e.clientX, y: e.clientY },
            makeHabitChooserOptions(),
          );
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
        const scheduledFor = `${dayYMD}T${String(hour).padStart(2, '0')}:00`;
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

  // ── Task block renderer ─────────────────────────────────────────────────────

  function renderTaskBlocks(dayYMD: string) {
    const tasks = tasksByDay.get(dayYMD);
    if (!tasks || tasks.length === 0) return null;

    return tasks.map((task) => {
      // Parse the hour/minute from the placement's startISO.
      const timePart = task.startISO.slice(11, 16); // "HH:MM"
      const [hStr, mStr] = timePart.split(':');
      const taskHour = parseInt(hStr ?? '0', 10);
      const taskMin = parseInt(mStr ?? '0', 10);

      const isBeforeRange = taskHour < hourRange.start;
      const isAfterRange = taskHour > hourRange.end;

      // Clamp the block position.
      const hoursFromStart = isBeforeRange
        ? 0
        : isAfterRange
          ? rowCount - 1
          : taskHour - hourRange.start + taskMin / 60;

      const topPx = hoursFromStart * rowHeight;
      const heightPx = Math.max(
        18,
        (task.scheduledDurationMin / 60) * rowHeight,
      );

      const handleBlockDragStart = (e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData(
          'application/krnl-task',
          JSON.stringify({ taskId: task.id, durationMin: task.scheduledDurationMin }),
        );
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(e.currentTarget, 0, 12);
      };

      const handleBlockClick = () => {
        onCommand('calendar.activateTask', { taskId: task.id });
      };

      return (
        <div
          key={task.id}
          data-testid={`task-block-${task.id}`}
          draggable
          onDragStart={handleBlockDragStart}
          onClick={handleBlockClick}
          title={task.text}
          style={{
            position: 'absolute',
            top: topPx,
            left: 2,
            right: 2,
            height: heightPx,
            background: 'var(--acid-faint)',
            border: '1px solid var(--acid)',
            borderRadius: 4,
            cursor: 'grab',
            overflow: 'hidden',
            zIndex: 2,
            padding: '1px 3px',
          }}
        >
          {/* Out-of-range badge */}
          {isBeforeRange && (
            <span
              style={{
                position: 'absolute',
                top: 1,
                left: 2,
                fontSize: 9,
                color: 'var(--acid)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
              }}
            >
              ↑
            </span>
          )}
          {isAfterRange && (
            <span
              style={{
                position: 'absolute',
                top: 1,
                left: 2,
                fontSize: 9,
                color: 'var(--acid)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
              }}
            >
              ↓
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              paddingLeft: isBeforeRange || isAfterRange ? 10 : 0,
            }}
          >
            {task.text}
          </span>
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
            left: 2,
            right: 2,
            height: blockHeight,
            background: `var(--${habit.color})`,
            opacity: 0.7,
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
                color: 'var(--paper)',
              }}
            >
              {habit.icon}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: 'var(--paper)',
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
        overflow: 'hidden',
        userSelect: 'none',
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

      {/* Grid body: gutter + 7 columns */}
      <div
        ref={gridBodyRef}
        style={{
          flex: 1,
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
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  paddingRight: 4,
                  paddingTop: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--ink-3)',
                  boxSizing: 'border-box',
                }}
              >
                {String(hour).padStart(2, '0')}
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
          }}
        >
          {weekDays.map((dayYMD, colIdx) => {
            const isToday = dayYMD === today;
            return (
              <div
                key={dayYMD}
                data-testid={`week-col-${dayYMD}`}
                style={{
                  flex: 1,
                  position: 'relative',
                  background: isToday ? 'rgba(201, 241, 88, 0.08)' : 'transparent',
                  borderLeft: colIdx > 0 ? '1px solid var(--paper-3)' : undefined,
                }}
              >
                {/* Hour rows — drop targets */}
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
                        borderBottom: '1px solid var(--paper-3)',
                      }}
                    />
                  );
                })}

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
              weekStartDate={mondayYMD}
              hourRange={hourRange}
              rowHeight={rowHeight}
              columnWidth={NOMINAL_COLUMN_WIDTH}
              gutterWidth={0}
            />
          )}
        </div>

        {/* Empty-state hint — shown when no tasks scheduled this week */}
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
              color: 'var(--ink-3)',
              letterSpacing: '0.08em',
              pointerEvents: 'none',
            }}
          >
            DRAG A TASK ONTO THE GRID
          </div>
        )}
      </div>

      {/* Duration prompt (ADR 0002 §A3) — appears after the user picks
          weekly/daily, asking for the habit's duration in minutes. */}
      {durationPrompt && (
        <HabitDurationPrompt
          origin={durationPrompt.origin}
          accent={durationPrompt.kind === 'daily' ? 'var(--cyan)' : 'var(--purple)'}
          kindLabel={durationPrompt.kind === 'daily' ? 'EVERY DAY' : 'EVERY WEEK'}
          onConfirm={(durationMin) => {
            dispatchSchedule(
              durationPrompt.kind,
              durationPrompt.cell,
              durationPrompt.habit,
              durationMin,
            );
            setDurationPrompt(null);
          }}
          onCancel={() => setDurationPrompt(null)}
        />
      )}
    </div>
  );
}

// ── HabitDurationPrompt ────────────────────────────────────────────────────────
// Small inline numeric input rendered at the drop point. Auto-focuses on mount.
// Enter confirms; Escape or click-outside cancels.

interface HabitDurationPromptProps {
  origin: { x: number; y: number };
  accent: string;          // CSS color for ring + button (purple/cyan)
  kindLabel: string;       // "EVERY DAY" or "EVERY WEEK"
  onConfirm: (durationMin: number) => void;
  onCancel: () => void;
}

function HabitDurationPrompt({ origin, accent, kindLabel, onConfirm, onCancel }: HabitDurationPromptProps) {
  const [value, setValue] = useState('25');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Cancel on click outside.
  useEffect(() => {
    const onDocPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      onCancel();
    };
    // Defer one tick so the click that opened the prompt doesn't immediately close it.
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDocPointer, true);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDocPointer, true);
    };
  }, [onCancel]);

  function confirm() {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 480) {
      onConfirm(n);
    } else {
      onCancel();
    }
  }

  // Width ~150px, height ~56px. Centre on origin.
  const W = 150;
  const H = 56;
  const ox = Number.isFinite(origin.x) ? origin.x : window.innerWidth / 2;
  const oy = Number.isFinite(origin.y) ? origin.y : window.innerHeight / 2;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, ox - W / 2));
  const top = Math.max(8, Math.min(window.innerHeight - H - 8, oy - H / 2));

  return createPortal(
    <div
      ref={rootRef}
      data-testid="habit-duration-prompt"
      style={{
        position: 'fixed',
        left,
        top,
        width: W,
        height: H,
        zIndex: 10010,
        background: 'rgba(20, 18, 16, 0.92)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: `1.5px solid ${accent}`,
        borderRadius: 10,
        boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 12px ${accent}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '6px 10px',
        gap: 2,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        style={{
          fontSize: 8,
          letterSpacing: '0.10em',
          color: accent,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {kindLabel} · DURATION
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={inputRef}
          data-testid="habit-duration-input"
          type="number"
          min={1}
          max={480}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 18,
            fontWeight: 700,
            padding: 0,
            width: 0, // let flex take over
            minWidth: 0,
          }}
        />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em' }}>
          MIN
        </span>
        <button
          type="button"
          data-testid="habit-duration-confirm"
          onClick={confirm}
          style={{
            background: accent,
            border: 'none',
            color: '#0e0d0b',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
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
