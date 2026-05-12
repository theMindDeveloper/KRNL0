// Decision #11 + Decision #14 — HabitNode component (v2).
// Week / month / year views; gear-popover settings; per-habit color;
// past-day backfill within [createdAt, today]; future cells inert.

import { useMemo, useState } from 'react';
import type { NodeProps } from '../types';
import type { HabitConfig, HabitState, HabitColor, HabitView } from './types';
import {
  HABIT_COLORS,
  getMonthDays,
  getWeekDays,
  getYearGridCells,
  isoToLocalYMD,
  todayLocal,
} from './types';
import { calcStreak } from './commands';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HabitPopover } from './HabitPopover';

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

  const view: HabitView = config.view ?? 'week';
  const today = todayLocal();
  const now = new Date();
  const weekDays = getWeekDays(now);
  const monthDays = useMemo(() => getMonthDays(now), [now.getMonth(), now.getFullYear()]);
  const yearGrid = useMemo(() => getYearGridCells(now), [today]);
  const weekNum = getISOWeek(now);

  const visibleHabits = state.habits.filter((h) => !h.archived);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = newName.trim();
      if (!trimmed) return;
      onCommand('habit.add', { name: trimmed });
      setNewName('');
    }
  };

  const titleByView: Record<HabitView, string> = {
    week: `HABITS — WEEK ${weekNum} · HBT.WEEK`,
    month: `HABITS — ${MONTH_LABELS[now.getMonth()]} · HBT.MONTH`,
    year: `HABITS — ${now.getFullYear()} · HBT.YEAR`,
  };

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
            aria-label="habit settings"
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
        <div style={{ padding: '14px 16px' }}>
          {view === 'week' && (
            <WeekView
              habits={visibleHabits}
              today={today}
              weekDays={weekDays}
              onToggle={(id, date) => onCommand('habit.toggleDay', { id, date })}
            />
          )}
          {view === 'month' && (
            <MonthView
              habits={visibleHabits}
              today={today}
              monthDays={monthDays}
              onToggle={(id, date) => onCommand('habit.toggleDay', { id, date })}
            />
          )}
          {view === 'year' && (
            <YearView
              habits={visibleHabits}
              today={today}
              yearGrid={yearGrid}
              onToggle={(id, date) => onCommand('habit.toggleDay', { id, date })}
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
        </div>

        {settingsOpen && (
          <HabitPopover
            view={view}
            habits={visibleHabits}
            onSetView={(v) => onCommand('habit.setView', { view: v })}
            onSetColor={(id, color) => onCommand('habit.setColor', { id, color })}
            onDelete={(id) => onCommand('habit.remove', { id })}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </MotherFrame>
  );
}

// ── Week view ──────────────────────────────────────────────────────────

interface WeekViewProps {
  habits: HabitState['habits'];
  today: string;
  weekDays: string[];
  onToggle: (id: string, date: string) => void;
}

function WeekView({ habits, today, weekDays, onToggle }: WeekViewProps) {
  const gridWidth = WEEK_CELL_SIZE * 7 + WEEK_CELL_GAP * 6;
  return (
    <div data-view-week>
      {/* Day labels */}
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

      {habits.map((habit, habitIdx) => {
        const color = habitColor(habit.color);
        const streak = calcStreak(habit.log, today);
        const glyph = GLYPHS[habitIdx % GLYPHS.length] ?? '●';
        const isLast = habitIdx === habits.length - 1;
        const createdYMD = isoToLocalYMD(habit.createdAt);

        return (
          <div
            key={habit.id}
            data-habit-row={habit.id}
            style={{
              paddingBottom: 8,
              paddingTop: habitIdx === 0 ? 0 : 8,
              borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
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
                {weekDays.map((dayStr) =>
                  renderCell({
                    key: dayStr,
                    dayStr,
                    today,
                    createdYMD,
                    done: habit.log.includes(dayStr),
                    color,
                    size: WEEK_CELL_SIZE,
                    onToggle: () => onToggle(habit.id, dayStr),
                    title: `${habit.name} ${dayStr}`,
                  }),
                )}
              </div>
            </div>

            <div
              data-habit-streak
              style={{
                marginTop: 3,
                paddingLeft: 20,
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
      })}
    </div>
  );
}

// ── Month view ──────────────────────────────────────────────────────────

interface MonthViewProps {
  habits: HabitState['habits'];
  today: string;
  monthDays: string[];
  onToggle: (id: string, date: string) => void;
}

function MonthView({ habits, today, monthDays, onToggle }: MonthViewProps) {
  return (
    <div data-view-month>
      {habits.map((habit, habitIdx) => {
        const color = habitColor(habit.color);
        const streak = calcStreak(habit.log, today);
        const glyph = GLYPHS[habitIdx % GLYPHS.length] ?? '●';
        const isLast = habitIdx === habits.length - 1;
        const createdYMD = isoToLocalYMD(habit.createdAt);

        return (
          <div
            key={habit.id}
            data-habit-row={habit.id}
            style={{
              paddingBottom: 10,
              paddingTop: habitIdx === 0 ? 0 : 10,
              borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  width: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
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
                data-habit-streak
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
              style={{
                display: 'flex',
                gap: MONTH_CELL_GAP,
                flexWrap: 'nowrap',
              }}
            >
              {monthDays.map((dayStr) =>
                renderCell({
                  key: dayStr,
                  dayStr,
                  today,
                  createdYMD,
                  done: habit.log.includes(dayStr),
                  color,
                  size: MONTH_CELL_SIZE,
                  onToggle: () => onToggle(habit.id, dayStr),
                  title: `${habit.name} ${dayStr}`,
                }),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Year view ──────────────────────────────────────────────────────────

interface YearViewProps {
  habits: HabitState['habits'];
  today: string;
  yearGrid: (string | null)[][];
  onToggle: (id: string, date: string) => void;
}

function YearView({ habits, today, yearGrid, onToggle }: YearViewProps) {
  return (
    <div data-view-year>
      {habits.map((habit, habitIdx) => {
        const color = habitColor(habit.color);
        const streak = calcStreak(habit.log, today);
        const glyph = GLYPHS[habitIdx % GLYPHS.length] ?? '●';
        const isLast = habitIdx === habits.length - 1;
        const createdYMD = isoToLocalYMD(habit.createdAt);
        const logSet = new Set(habit.log);

        return (
          <div
            key={habit.id}
            data-habit-row={habit.id}
            style={{
              paddingBottom: 10,
              paddingTop: habitIdx === 0 ? 0 : 10,
              borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  width: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
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
                data-habit-streak
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
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          style={{
                            width: YEAR_CELL_SIZE,
                            height: YEAR_CELL_SIZE,
                          }}
                        />
                      );
                    }
                    return renderCell({
                      key: `${rIdx}-${cIdx}`,
                      dayStr,
                      today,
                      createdYMD,
                      done: logSet.has(dayStr),
                      color,
                      size: YEAR_CELL_SIZE,
                      onToggle: () => onToggle(habit.id, dayStr),
                      title: `${habit.name} ${dayStr}`,
                      cellRadius: 1,
                    });
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared cell renderer ────────────────────────────────────────────────

interface CellArgs {
  key: string;
  dayStr: string;
  today: string;
  createdYMD: string;
  done: boolean;
  color: HabitColor;
  size: number;
  onToggle: () => void;
  title: string;
  cellRadius?: number;
}

function renderCell({
  key,
  dayStr,
  today,
  createdYMD,
  done,
  color,
  size,
  onToggle,
  title,
  cellRadius = 3,
}: CellArgs) {
  const isToday = dayStr === today;
  const isFuture = dayStr > today;
  const beforeCreated = dayStr < createdYMD;
  // Past dates are always interactive (user can back-fill any past day),
  // even those before the habit's createdAt. Future dates are inert.
  const isInteractive = !isFuture;
  const isPast = !isToday && !isFuture;

  let cellBg: string;
  let cellOpacity: number | undefined;
  let cellBorder: string;
  let cellOutline: string | undefined;
  let cellOutlineOffset: string | undefined;

  if (done && isToday) {
    cellBg = `var(--${color})`;
    cellBorder = '1px solid transparent';
    cellOutline = `1px solid var(--${color})`;
    cellOutlineOffset = '1px';
  } else if (done && isPast) {
    cellBg = `var(--${color})`;
    cellOpacity = 0.85;
    cellBorder = '1px solid transparent';
  } else if (isToday) {
    cellBg = 'transparent';
    cellBorder = '1px solid var(--ink-3)';
    cellOutline = `1px solid var(--${color})`;
    cellOutlineOffset = '1px';
  } else if (beforeCreated) {
    cellBg = 'var(--paper-3)';
    cellOpacity = 0.2;
    cellBorder = '1px solid transparent';
  } else if (isPast) {
    cellBg = 'var(--paper-3)';
    cellOpacity = 0.4;
    cellBorder = '1px solid transparent';
  } else {
    // future
    cellBg = 'var(--paper-3)';
    cellBorder = '1px solid transparent';
  }

  const cellStyle: React.CSSProperties = {
    width: size,
    height: size,
    border: cellBorder,
    borderRadius: cellRadius,
    background: cellBg,
    flexShrink: 0,
    boxSizing: 'border-box',
    padding: 0,
    ...(cellOpacity !== undefined ? { opacity: cellOpacity } : {}),
    ...(cellOutline ? { outline: cellOutline } : {}),
    ...(cellOutlineOffset ? { outlineOffset: cellOutlineOffset } : {}),
  };

  const state = done && isToday
    ? 'done-today'
    : done && isPast
      ? 'done-past'
      : isToday
        ? 'today'
        : beforeCreated
          ? 'before-created'
          : isPast
            ? 'past'
            : 'future';

  if (isInteractive) {
    return (
      <button
        key={key}
        type="button"
        data-cell-state={state}
        title={`${title} — click to toggle`}
        onClick={onToggle}
        style={{ ...cellStyle, cursor: 'pointer' }}
        aria-label={`${title} ${done ? 'done' : 'not done'}`}
        aria-pressed={done}
      />
    );
  }

  return (
    <div
      key={key}
      data-cell-state={state}
      title={title}
      style={{ ...cellStyle, cursor: 'default' }}
    />
  );
}
