// ADR 0001 Decision 24 — WeekView (Slice 3).
// Renders a 7-column × N-row hour grid. Supports drag-to-schedule from TodoNode
// rows and TaskNode blocks. NowLine is rendered as an overlay.

import { useMemo, useRef } from 'react';
import type { DragEvent } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { CalendarConfig, CalendarState } from './types';
import { getMondayOf, toYMD } from '../HabitNode/types';
import { NowLine } from './NowLine';

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduledTask {
  id: string;
  text: string;
  scheduledFor: string;         // ISO local datetime "YYYY-MM-DDTHH:MM"
  scheduledDurationMin: number; // calendar block duration (fallback: plannedMin or durationMin)
  plannedMin: number;           // for drag payload
}

interface WeekViewProps {
  state: CalendarState;
  config: CalendarConfig;
  onCommand: (cmd: string, args: Record<string, unknown>) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GUTTER_WIDTH = 36; // px — time gutter width
const MIN_ROW_HEIGHT = 28; // px — minimum row height

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

  // Determine row height: fill available height or fall back to min.
  // We use a fixed row height of MIN_ROW_HEIGHT since we don't know the
  // container height at render time; the grid overflows if needed.
  const rowHeight = MIN_ROW_HEIGHT;

  // Sub-header nav handlers.
  const handlePrev = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, -7) });
  };
  const handleNext = () => {
    onCommand('calendar.setAnchor', { date: addDays(mondayYMD, 7) });
  };

  // Read scheduled tasks from the board store.
  const scheduledTasks = useBoardStore(
    useShallow((s): ScheduledTask[] => {
      if (!s.board) return [];
      const result: ScheduledTask[] = [];
      for (const n of s.board.nodes) {
        if (n.kind !== 'todo.task') continue;
        const st = n.state as {
          text?: string;
          scheduledFor?: string;
          scheduledDurationMin?: number;
          plannedMin?: number;
          durationMin?: number;
        };
        if (!st.scheduledFor) continue;
        result.push({
          id: n.id,
          text: typeof st.text === 'string' ? st.text : '',
          scheduledFor: st.scheduledFor,
          scheduledDurationMin:
            st.scheduledDurationMin ?? st.plannedMin ?? st.durationMin ?? 25,
          plannedMin: st.plannedMin ?? st.durationMin ?? 25,
        });
      }
      return result;
    }),
  );

  // Build a map from YYYY-MM-DD → ScheduledTask[] for the rendered week.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, ScheduledTask[]>();
    const weekSet = new Set(weekDays);
    for (const task of scheduledTasks) {
      const dayYMD = task.scheduledFor.slice(0, 10);
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

  // Column width: total minus gutter, divided by 7.
  // Use a percentage-based approach in the render; for NowLine we need px,
  // so we compute based on a nominal 280px column area (can be refined).
  // WeekView fills its container via flex; actual columnWidth is computed dynamically.
  // NowLine receives a computed value from the grid ref in a real layout pass.
  // For simplicity, use a stable calculation assuming the MotherFrame width.
  // MOTHER_WIDTH from MotherFrame is ~320. Gutter=36. (320-36)/7 ≈ 40.6.
  // These are fallback values; layout is CSS-driven.
  const NOMINAL_COLUMN_WIDTH = 40;

  // ── Drop target handler factory ─────────────────────────────────────────────

  function makeCellHandlers(dayYMD: string, hour: number) {
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes('application/krnl-task')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.setAttribute('data-drop-target', 'true');
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        e.currentTarget.removeAttribute('data-drop-target');
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/krnl-task');
        if (!raw) return;
        const payload = JSON.parse(raw) as {
          taskId?: string;
          itemId?: string;
          durationMin: number;
        };
        // v1: only allow drops from tasks that already have a TaskNode.
        if (!payload.taskId) return;
        const scheduledFor = `${dayYMD}T${String(hour).padStart(2, '0')}:00`;
        onCommand('task.setSchedule', {
          taskId: payload.taskId,
          scheduledFor,
          scheduledDurationMin: payload.durationMin,
        });
        e.currentTarget.removeAttribute('data-drop-target');
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
      // Parse the hour/minute from scheduledFor.
      const timePart = task.scheduledFor.slice(11, 16); // "HH:MM"
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
        onCommand('task.activate', { taskId: task.id });
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
    </div>
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
