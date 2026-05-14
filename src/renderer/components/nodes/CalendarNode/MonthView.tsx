// ADR 0001 — MonthView (Slice 2).
// Renders a 7×6 Monday-start month grid with task chips and a today ring.
// Reads tasks from the board store via a shallow-equal selector so only
// the minimal task-schedule data is subscribed; unrelated store changes
// (node positions, pomo state, etc.) do not re-render this component.

import { useMemo } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { CalendarConfig, CalendarState } from './types';
import { getMonthDays, getMondayOf, toYMD, todayLocal } from '../HabitNode/types';

interface ScheduledTask {
  id: string;
  text: string;
  scheduledFor: string; // ISO local datetime
}

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

  // Stable shallow selector: return only the minimal { id, text, scheduledFor }
  // for todo.task nodes that have a scheduledFor field. This avoids re-rendering
  // on pomo/habit/position changes.
  const scheduledTasks = useBoardStore(
    useShallow((s): ScheduledTask[] => {
      if (!s.board) return [];
      const result: ScheduledTask[] = [];
      for (const n of s.board.nodes) {
        if (n.kind !== 'todo.task') continue;
        const st = n.state as { text?: string; scheduledFor?: string };
        if (!st.scheduledFor) continue;
        result.push({
          id: n.id,
          text: typeof st.text === 'string' ? st.text : '',
          scheduledFor: st.scheduledFor,
        });
      }
      return result;
    }),
  );

  // Build a map from YYYY-MM-DD → ScheduledTask[] for O(1) cell lookup.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, ScheduledTask[]>();
    for (const task of scheduledTasks) {
      // scheduledFor is ISO local datetime; extract the date part.
      const dayYMD = task.scheduledFor.slice(0, 10);
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

          return (
            <div
              key={ymd}
              data-testid={`month-cell-${ymd}`}
              data-date={ymd}
              data-today={isToday ? 'true' : undefined}
              onClick={() => handleCellClick(ymd)}
              style={{
                position: 'relative',
                background: isSelected ? 'var(--paper-2)' : 'transparent',
                border: isSelected
                  ? '1px solid var(--acid)'
                  : '1px solid transparent',
                borderRadius: 3,
                padding: '2px 3px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'var(--paper-2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {/* Today ring */}
              {isToday && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 3,
                    border: '1.5px solid var(--acid)',
                    animation: 'krnl-today-pulse 2s ease-in-out infinite',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Date number — top-right */}
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: inCurrentMonth
                    ? isToday
                      ? 'var(--acid)'
                      : 'var(--ink-1)'
                    : 'var(--ink-faint)',
                  textAlign: 'right',
                  lineHeight: 1,
                  marginBottom: 2,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {dayNum}
              </div>

              {/* Task chips */}
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
                      color: 'var(--ink-1)',
                      background: 'var(--paper-3)',
                      borderRadius: 2,
                      padding: '1px 3px',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      lineHeight: '1.3',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--paper-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--paper-3)';
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
                      color: 'var(--ink-3)',
                      lineHeight: '1.3',
                    }}
                  >
                    +{overflow} more
                  </div>
                )}
              </div>

              {/* Habit dot row stub — reserved for Slice 5 */}
              <div
                style={{
                  height: 1,
                  position: 'relative',
                  zIndex: 1,
                }}
              />
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
