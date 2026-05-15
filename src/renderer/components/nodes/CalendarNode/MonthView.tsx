// ADR 0001 — MonthView (Slice 2).
// Renders a 7×6 Monday-start month grid with task chips and a today ring.
// Reads tasks from the board store via a shallow-equal selector so only
// the minimal task-schedule data is subscribed; unrelated store changes
// (node positions, pomo state, etc.) do not re-render this component.

import { useMemo } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { selectScheduledTasksForRange } from '../../../store/scheduleSelector';
import type { CalendarConfig, CalendarState } from './types';
import { getMonthDays, getMondayOf, toYMD, todayLocal } from '../HabitNode/types';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';

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

export function MonthView({ state, config: _config, onCommand }: MonthViewProps) {
  const anchor = parseAnchorDate(state.anchorDate);
  const todayYMD = todayLocal();
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
          if (h.archived || !h.schedule) continue;
          result.push({ id: h.id, color: h.color, schedule: h.schedule });
        }
      }
      result.sort((a, b) => a.id.localeCompare(b.id));
      return result;
    }),
  );

  // Build a map from YYYY-MM-DD → ScheduledTask[] for O(1) cell lookup.
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
    return map;
  }, [scheduledTasks]);

  const handleCellClick = (ymd: string) => {
    onCommand('calendar.selectDate', { date: ymd });
  };

  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: prevMonthFirst(anchor) });
  };

  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: nextMonthFirst(anchor) });
  };

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
      {/* Month navigation header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <button
          type="button"
          onClick={handlePrev}
          data-testid="month-prev"
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          ←
        </button>
        <span
          data-testid="month-label"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-1)',
            letterSpacing: '0.08em',
          }}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={handleNext}
          data-testid="month-next"
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          →
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
                fontSize: 9,
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
                overflow: 'hidden',
                flex: 1,
                minWidth: 0,
              }}
            >
              {todaysTasks.slice(0, 3).map((t) => (
                <span
                  key={t.id}
                  title={t.text}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
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
              {todaysTasks.length > 3 && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--ink-3)',
                    flexShrink: 0,
                  }}
                >
                  +{todaysTasks.length - 3}
                </span>
              )}
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
              fontSize: 9,
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

      {/* Day cell grid — 6 rows × 7 cols = 42 cells */}
      <div
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
          const visible = tasks.slice(0, MAX_CHIPS);
          const overflow = tasks.length - MAX_CHIPS;

          // Compute habit dots for this cell.
          const cellDate = parseAnchorDate(ymd);
          const cellIsoDow = jsGetDayToIsoDow(cellDate.getDay());
          const cellHabits = scheduledHabits.filter((h) =>
            habitScheduledOnDow(h.schedule, cellIsoDow),
          );
          const visibleDots = cellHabits.slice(0, MAX_DOTS - 1);
          const dotOverflow = cellHabits.length - visibleDots.length;

          // PR7 — out-of-month cells render empty (no day number, no chips,
          // no hover/click). Today cell uses the `krnl-month-cell--today`
          // class for the solid green fill + readable dark text.
          return (
            <div
              key={ymd}
              data-testid={`month-cell-${ymd}`}
              data-date={ymd}
              data-today={isToday ? 'true' : undefined}
              className={isToday ? 'krnl-month-cell--today' : undefined}
              onClick={inCurrentMonth ? () => handleCellClick(ymd) : undefined}
              style={{
                position: 'relative',
                background: isSelected && !isToday ? 'var(--paper-2)' : 'transparent',
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
                        e.currentTarget.style.background = 'transparent';
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
                      : 'var(--ink-4)',
                  opacity: inCurrentMonth ? 1 : 0.35,
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
                    overflow: 'hidden',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {visible.map((task) => (
                    <div
                      key={task.id}
                      title={task.text}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: isToday ? '#1a1814' : 'var(--ink-1)',
                        background: isToday
                          ? 'rgba(26, 24, 20, 0.12)'
                          : 'var(--paper-3)',
                        borderRadius: 2,
                        padding: '1px 3px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        lineHeight: '1.3',
                        cursor: 'pointer',
                      }}
                    >
                      {truncateLabel(task.text)}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: isToday ? '#1a1814' : 'var(--ink-3)',
                        lineHeight: '1.3',
                      }}
                    >
                      +{overflow} more
                    </div>
                  )}
                </div>
              )}

              {/* Habit dots — current month only (ADR 0002 §6) */}
              {inCurrentMonth && cellHabits.length > 0 && (
                <div
                  data-testid={`month-habit-dots-${ymd}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 2,
                    alignItems: 'center',
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
                  {dotOverflow > 0 && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        color: isToday ? '#1a1814' : 'var(--ink-3)',
                        lineHeight: 1,
                      }}
                    >
                      +{dotOverflow + 1}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
