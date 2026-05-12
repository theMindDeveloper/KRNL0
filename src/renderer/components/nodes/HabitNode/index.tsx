// Decision #11 + Decision #14 — HabitNode component (v2.1).
// Week / month / year views; gear-popover view selection;
// per-habit color + icon + rename via right-click context menu;
// past-day backfill unbounded; future cells inert at FSM + UI.
//
// Perf notes:
// - Cell visuals use CSS classes (.habit-cell--*) defined in tokens.css.
//   No per-cell style allocation. The habit color is passed via a
//   `--habit-color` CSS variable on the row.
// - Year-view grids are React.memo'd per habit so changes to one row do
//   not re-render the others.
// - Click handling on year cells is event-delegated at the row level: a
//   single onClick reads `data-date` from the target. 371 cells per
//   habit → 1 listener.

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { NodeProps } from '../types';
import type {
  HabitColor,
  HabitConfig,
  HabitState,
  HabitView,
  Habit,
} from './types';
import {
  HABIT_COLORS,
  getMonthDays,
  getWeekDays,
  getYearGridCells,
  todayLocal,
} from './types';
import { calcStreak } from './commands';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HabitPopover } from './HabitPopover';
import { HabitContextMenu } from './HabitContextMenu';

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GLYPHS = ['✎', '↗', '◍', '⌬', '◆', '▷', '○'];

const WEEK_CELL_SIZE = 18;
const WEEK_CELL_GAP = 3;
const MONTH_CELL_SIZE = 10;
const MONTH_CELL_GAP = 1;
const YEAR_CELL_SIZE = 5;
const YEAR_CELL_GAP = 1;

function isValidColor(c: unknown): c is HabitColor {
  return typeof c === 'string' && (HABIT_COLORS as readonly string[]).includes(c);
}

function habitColor(c: unknown): HabitColor {
  return isValidColor(c) ? c : 'acid';
}

function fallbackGlyph(habitIdx: number): string {
  return GLYPHS[habitIdx % GLYPHS.length] ?? '●';
}

interface MenuState {
  habitId: string;
  anchor: { x: number; y: number };
}

export function HabitNode({
  node,
  onCommand,
  slotIndex = 3,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<HabitState, HabitConfig>) {
  const { state, config } = node;
  const [newName, setNewName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const view: HabitView = config.view ?? 'week';
  const today = todayLocal();
  // now is intentionally derived once per render — the grid is rebuilt only
  // when state/config changes; views don't tick at sub-day cadence.
  const now = useMemo(() => new Date(), []);
  const weekDays = useMemo(() => getWeekDays(now), [now]);
  const monthDays = useMemo(() => getMonthDays(now), [now]);
  const yearGrid = useMemo(() => getYearGridCells(now), [now]);
  const weekNum = getISOWeek(now);

  const visibleHabits = useMemo(
    () => state.habits.filter((h) => !h.archived),
    [state.habits],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = newName.trim();
      if (!trimmed) return;
      onCommand('habit.add', { name: trimmed });
      setNewName('');
    }
  };

  const onToggleCell = useCallback(
    (habitId: string, date: string) => {
      onCommand('habit.toggleDay', { id: habitId, date });
    },
    [onCommand],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent, habitId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const body = bodyRef.current;
      const rect = body?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : e.clientX;
      const y = rect ? e.clientY - rect.top : e.clientY;
      setMenu({ habitId, anchor: { x, y } });
    },
    [],
  );

  const titleByView: Record<HabitView, string> = {
    week: `HABITS — WEEK ${weekNum} · HBT.WEEK`,
    month: `HABITS — ${MONTH_LABELS[now.getMonth()]} · HBT.MONTH`,
    year: `HABITS — ${now.getFullYear()} · HBT.YEAR`,
  };

  const menuHabit = menu ? visibleHabits.find((h) => h.id === menu.habitId) ?? null : null;

  return (
    <MotherFrame
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
    >
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: 1 }}>
        {/* Header */}
        <div
          style={{
            padding: '7px 10px 6px 16px',
            borderBottom: '1px solid var(--paper-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--rust)' }}>●</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleByView[view]}
          </span>
          <button
            type="button"
            aria-label="habit panel settings"
            aria-expanded={settingsOpen}
            data-habit-gear
            onClick={() => setSettingsOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: settingsOpen ? 'var(--ink-2)' : 'var(--ink-3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: 3,
            }}
          >
            ⚙
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} style={{ padding: '14px 16px', position: 'relative' }}>
          {view === 'week' && (
            <WeekView
              habits={visibleHabits}
              today={today}
              weekDays={weekDays}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'month' && (
            <MonthView
              habits={visibleHabits}
              today={today}
              monthDays={monthDays}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'year' && (
            <YearView
              habits={visibleHabits}
              today={today}
              yearGrid={yearGrid}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}

          {visibleHabits.length === 0 && (
            <div
              style={{
                color: 'var(--ink-3)',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                padding: '4px 0',
              }}
            >
              No habits yet.
            </div>
          )}

          {/* Add habit input */}
          <div
            style={{
              marginTop: 10,
              borderTop: '1px solid var(--paper-3)',
              paddingTop: 10,
            }}
          >
            <input
              type="text"
              placeholder="+ add habit"
              data-habit-add
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '4px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--paper-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--ink-3)',
                outline: 'none',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {menu && menuHabit && (
            <HabitContextMenu
              habit={menuHabit}
              anchor={menu.anchor}
              bodyWidth={bodyRef.current?.clientWidth ?? 320}
              bodyHeight={bodyRef.current?.clientHeight ?? 400}
              onRename={(name) => onCommand('habit.rename', { id: menu.habitId, name })}
              onSetColor={(color) => onCommand('habit.setColor', { id: menu.habitId, color })}
              onSetIcon={(icon) => onCommand('habit.setIcon', { id: menu.habitId, icon })}
              onDelete={() => onCommand('habit.remove', { id: menu.habitId })}
              onClose={() => setMenu(null)}
            />
          )}
        </div>

        {settingsOpen && (
          <HabitPopover
            view={view}
            onSetView={(v) => onCommand('habit.setView', { view: v })}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </MotherFrame>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────

function cellClass(
  dayStr: string,
  today: string,
  done: boolean,
  viewMod: 'week' | 'month' | 'year',
): string {
  const isToday = dayStr === today;
  const isFuture = dayStr > today;
  const isPast = !isToday && !isFuture;
  const classes = ['habit-cell'];
  if (viewMod === 'year') classes.push('habit-cell--year');
  if (done) classes.push('habit-cell--done');
  if (isToday) classes.push('habit-cell--today');
  if (isPast) classes.push('habit-cell--past');
  if (isFuture) classes.push('habit-cell--future');
  if (!isFuture) classes.push('habit-cell--interactive');
  return classes.join(' ');
}

interface RowCommonProps {
  habit: Habit;
  habitIdx: number;
  today: string;
  isLast: boolean;
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

// ── Week view ──────────────────────────────────────────────────────────

interface WeekViewProps {
  habits: Habit[];
  today: string;
  weekDays: string[];
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function WeekView({ habits, today, weekDays, onToggle, onContextMenu }: WeekViewProps) {
  const gridWidth = WEEK_CELL_SIZE * 7 + WEEK_CELL_GAP * 6;
  return (
    <div data-view-week>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: WEEK_CELL_GAP, width: gridWidth }}>
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              style={{
                width: WEEK_CELL_SIZE,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                color: 'var(--ink-4)',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {habits.map((habit, habitIdx) => (
        <WeekRow
          key={habit.id}
          habit={habit}
          habitIdx={habitIdx}
          today={today}
          isLast={habitIdx === habits.length - 1}
          weekDays={weekDays}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

interface WeekRowProps extends RowCommonProps {
  weekDays: string[];
}

const WeekRow = memo(function WeekRow({
  habit,
  habitIdx,
  today,
  isLast,
  weekDays,
  onToggle,
  onContextMenu,
}: WeekRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(() => calcStreak(habit.log, today), [habit.log, today]);
  const logSet = useMemo(() => new Set(habit.log), [habit.log]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);

  return (
    <div
      data-habit-row={habit.id}
      onContextMenu={(e) => onContextMenu(e, habit.id)}
      style={{
        paddingBottom: 8,
        paddingTop: habitIdx === 0 ? 0 : 8,
        borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
        // expose habit color to CSS classes
        ['--habit-color' as string]: `var(--${color})`,
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 16,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: `var(--${color})`,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {glyph}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={habit.name}
        >
          {habit.name}
        </div>

        <div style={{ display: 'flex', gap: WEEK_CELL_GAP, flexShrink: 0 }}>
          {weekDays.map((dayStr) => {
            const done = logSet.has(dayStr);
            const isFuture = dayStr > today;
            const cls = cellClass(dayStr, today, done, 'week');
            const size = { width: WEEK_CELL_SIZE, height: WEEK_CELL_SIZE };
            return isFuture ? (
              <div key={dayStr} className={cls} style={size} title={`${habit.name} ${dayStr}`} />
            ) : (
              <button
                key={dayStr}
                type="button"
                className={cls}
                style={size}
                title={`${habit.name} ${dayStr} — click to toggle`}
                onClick={() => onToggle(habit.id, dayStr)}
                aria-pressed={done}
              />
            );
          })}
        </div>
      </div>

      <div
        data-habit-streak
        style={{
          marginTop: 3,
          paddingLeft: 22,
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: streak > 0 ? 'var(--acid)' : 'var(--rust)',
          letterSpacing: '0.04em',
        }}
      >
        {`▲ ${streak} day streak`}
      </div>
    </div>
  );
});

// ── Month view ──────────────────────────────────────────────────────────

interface MonthViewProps {
  habits: Habit[];
  today: string;
  monthDays: string[];
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function MonthView({ habits, today, monthDays, onToggle, onContextMenu }: MonthViewProps) {
  return (
    <div data-view-month>
      {habits.map((habit, habitIdx) => (
        <MonthRow
          key={habit.id}
          habit={habit}
          habitIdx={habitIdx}
          today={today}
          isLast={habitIdx === habits.length - 1}
          monthDays={monthDays}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

interface MonthRowProps extends RowCommonProps {
  monthDays: string[];
}

const MonthRow = memo(function MonthRow({
  habit,
  habitIdx,
  today,
  isLast,
  monthDays,
  onToggle,
  onContextMenu,
}: MonthRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(() => calcStreak(habit.log, today), [habit.log, today]);
  const logSet = useMemo(() => new Set(habit.log), [habit.log]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);

  const onRowClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement;
      const date = t.getAttribute('data-date');
      if (!date) return;
      if (date > today) return;
      onToggle(habit.id, date);
    },
    [habit.id, today, onToggle],
  );

  const cellStyle = { width: MONTH_CELL_SIZE, height: MONTH_CELL_SIZE };

  return (
    <div
      data-habit-row={habit.id}
      onContextMenu={(e) => onContextMenu(e, habit.id)}
      style={{
        paddingBottom: 10,
        paddingTop: habitIdx === 0 ? 0 : 10,
        borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
        ['--habit-color' as string]: `var(--${color})`,
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          style={{
            width: 16,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: `var(--${color})`,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {glyph}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={habit.name}
        >
          {habit.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: streak > 0 ? 'var(--acid)' : 'var(--rust)',
            letterSpacing: '0.04em',
          }}
        >
          {`▲ ${streak}`}
        </div>
      </div>

      <div
        onClick={onRowClick}
        style={{ display: 'flex', gap: MONTH_CELL_GAP, flexWrap: 'nowrap' }}
      >
        {monthDays.map((dayStr) => {
          const done = logSet.has(dayStr);
          const cls = cellClass(dayStr, today, done, 'month');
          return (
            <div
              key={dayStr}
              data-date={dayStr}
              className={cls}
              style={cellStyle}
              title={`${habit.name} ${dayStr}`}
            />
          );
        })}
      </div>
    </div>
  );
});

// ── Year view ──────────────────────────────────────────────────────────

interface YearViewProps {
  habits: Habit[];
  today: string;
  yearGrid: (string | null)[][];
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function YearView({ habits, today, yearGrid, onToggle, onContextMenu }: YearViewProps) {
  return (
    <div data-view-year>
      {habits.map((habit, habitIdx) => (
        <YearRow
          key={habit.id}
          habit={habit}
          habitIdx={habitIdx}
          today={today}
          isLast={habitIdx === habits.length - 1}
          yearGrid={yearGrid}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

interface YearRowProps extends RowCommonProps {
  yearGrid: (string | null)[][];
}

const YearRow = memo(function YearRow({
  habit,
  habitIdx,
  today,
  isLast,
  yearGrid,
  onToggle,
  onContextMenu,
}: YearRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(() => calcStreak(habit.log, today), [habit.log, today]);
  const logSet = useMemo(() => new Set(habit.log), [habit.log]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);

  // Single delegated click handler on the grid. data-date on each cell.
  const onGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement;
      const date = t.getAttribute('data-date');
      if (!date) return;
      if (date > today) return;
      onToggle(habit.id, date);
    },
    [habit.id, today, onToggle],
  );

  const cellStyle = { width: YEAR_CELL_SIZE, height: YEAR_CELL_SIZE };
  const emptyCellStyle = { width: YEAR_CELL_SIZE, height: YEAR_CELL_SIZE };

  return (
    <div
      data-habit-row={habit.id}
      onContextMenu={(e) => onContextMenu(e, habit.id)}
      style={{
        paddingBottom: 10,
        paddingTop: habitIdx === 0 ? 0 : 10,
        borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
        ['--habit-color' as string]: `var(--${color})`,
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          style={{
            width: 16,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: `var(--${color})`,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {glyph}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={habit.name}
        >
          {habit.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: streak > 0 ? 'var(--acid)' : 'var(--rust)',
            letterSpacing: '0.04em',
          }}
        >
          {`▲ ${streak}`}
        </div>
      </div>

      <div
        onClick={onGridClick}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: YEAR_CELL_GAP,
        }}
      >
        {yearGrid.map((row, rIdx) => (
          <div key={rIdx} style={{ display: 'flex', gap: YEAR_CELL_GAP }}>
            {row.map((dayStr, cIdx) => {
              if (dayStr === null) {
                return <div key={cIdx} style={emptyCellStyle} />;
              }
              const done = logSet.has(dayStr);
              const cls = cellClass(dayStr, today, done, 'year');
              return (
                <div
                  key={cIdx}
                  data-date={dayStr}
                  className={cls}
                  style={cellStyle}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
