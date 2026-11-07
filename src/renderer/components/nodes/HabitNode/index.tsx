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

import { LineGlyph } from '../../ui/LineGlyph';
import { SettingsIcon } from '../../ui/SettingsIcons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { RepeatEditor, describeRepeat, isRepeatValid, toSchedule, type RepeatValue } from '../../ui/RepeatEditor';
import { IconRepeat } from '../../ui/repeatIcons';
import { setHabitDrag, clearHabitDrag } from '../../../dnd/habitDrag';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
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
  isDayScheduled,
} from './types';
import { bestStreak, calcStreak, milestoneReached, nextMilestone, repairableDay } from './commands';

/** YYYY-MM-DD plus `n` days (local). */
function addDaysLocal(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
import { useLocalDay } from '../../../hooks/useLocalDay';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HabitPopover } from './HabitPopover';
import { HabitContextMenu } from './HabitContextMenu';
import { HabitIcon } from './HabitIcon';
import { Z } from '../../ui/layers';
import { undoable } from '../../../store/undoNotice';
import { openShare } from '../../../launch/launchStore';

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
}: NodeProps<HabitState, HabitConfig>) {
  const { state, config } = node;
  const [newName, setNewName] = useState('');
  // Optional repeat for the habit being added (null = no schedule).
  const [newRepeat, setNewRepeat] = useState<RepeatValue | null>(null);
  const [repeatAt, setRepeatAt] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const view: HabitView = config.view ?? 'week';
  // useLocalDay re-renders at midnight so `today` and the grids roll over.
  const today = useLocalDay();
  // Re-derive the grid anchor when the local day changes. Memoizing on [] froze
  // the week/month/year grids at the day the node mounted, so an app left open
  // overnight showed last week and hid today's cell.
  const now = useMemo(() => new Date(), [today]);
  const weekDays = useMemo(() => getWeekDays(now), [now]);
  const monthDays = useMemo(() => getMonthDays(now), [now]);
  const yearGrid = useMemo(() => getYearGridCells(now), [now]);
  const weekNum = getISOWeek(now);

  const visibleHabits = useMemo(
    () => state.habits.filter((h) => !h.archived),
    [state.habits],
  );

  // Which habits already have a pinned lane? Used to disable the menu item.
  // Return a sorted array via useShallow so identity is stable when contents
  // don't change → no re-renders on unrelated boardStore mutations.
  const pinnedHabitIdsArray = useBoardStore(
    useShallow((s) => {
      const board = s.board;
      if (!board) return [] as string[];
      const ids: string[] = [];
      for (const n of board.nodes) {
        if (n.kind === 'habit.lane') {
          const id = (n.state as { habitId?: string } | null)?.habitId;
          if (id) ids.push(id);
        }
      }
      ids.sort();
      return ids;
    }),
  );
  const pinnedHabitIds = useMemo(
    () => new Set(pinnedHabitIdsArray),
    [pinnedHabitIdsArray],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Same as the Todo add field: Escape abandons what was typed.
      setNewName('');
      setNewRepeat(null);
      return;
    }
    if (e.key === 'Enter') {
      const trimmed = newName.trim();
      if (!trimmed) return;
      // A half-set repeat (weekly, no days) is never dropped silently: the
      // hint below says what is missing and Enter waits for it.
      if (newRepeat && !isRepeatValid(newRepeat)) return;
      onCommand('habit.add', {
        name: trimmed,
        ...(newRepeat ? { schedule: toSchedule(newRepeat) } : {}),
      });
      setNewName('');
      setNewRepeat(null);
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
      // v2.3 — viewport coords; menu portals to body so RF transform does
      // not propagate fractional positioning into the menu.
      setMenu({ habitId, anchor: { x: e.clientX, y: e.clientY } });
    },
    [],
  );

  const titleByView: Record<HabitView, string> = {
    week: `HABITS & ROUTINES — WEEK ${weekNum} · HBT.WEEK`,
    month: `HABITS & ROUTINES — ${MONTH_LABELS[now.getMonth()]} · HBT.MONTH`,
    year: `HABITS & ROUTINES — ${now.getFullYear()} · HBT.YEAR`,
  };

  const menuHabit = menu ? visibleHabits.find((h) => h.id === menu.habitId) ?? null : null;

  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      position={node.position}
    >
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Header */}
        <div className="krnl-node-header"
          style={{
            padding: '7px 10px 6px 16px',
            borderBottom: '1px solid var(--paper-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--rust)', display: 'inline-flex' }}><LineGlyph name="dot" size={10} /></span>
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
            <SettingsIcon name="settings" size={12} />
          </button>
        </div>

        {/* Body */}
        {/* nowheel: the wheel scrolls a long habit list instead of zooming the
            canvas — without it the habits below the fold were out of reach. */}
        <div ref={bodyRef} className="nowheel" style={{ padding: '14px 16px', position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {view === 'week' && (
            <WeekView
              habits={visibleHabits}
              today={today}
              weekDays={weekDays}
              habitMotherId={node.id}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'month' && (
            <MonthView
              habits={visibleHabits}
              today={today}
              monthDays={monthDays}
              habitMotherId={node.id}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'year' && (
            <YearView
              habits={visibleHabits}
              today={today}
              yearGrid={yearGrid}
              habitMotherId={node.id}
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

          {menu && menuHabit && (
            <HabitContextMenu
              habit={menuHabit}
              anchor={menu.anchor}
              onRename={(name) => onCommand('habit.rename', { id: menu.habitId, name })}
              onSetColor={(color) => onCommand('habit.setColor', { id: menu.habitId, color })}
              onSetIcon={(icon) => onCommand('habit.setIcon', { id: menu.habitId, icon })}
              onSetNote={(note) => onCommand('habit.setNote', { id: menu.habitId, note })}
              onDelete={() => {
                const name = state.habits.find((h) => h.id === menu.habitId)?.name ?? 'habit';
                undoable(`Deleted habit "${name}"`, () => onCommand('habit.remove', { id: menu.habitId }));
              }}
              onPinAsLane={() => onCommand('habit.spawnLane', { habitId: menu.habitId })}
              laneExists={pinnedHabitIds.has(menu.habitId)}
              onClose={() => setMenu(null)}
            />
          )}
        </div>

        {/* Add row — pinned to the bottom of the window, same look as the
            Todo's "add task" row (UI rule: the add row of a list is always its
            last row, dashed top rule, mono text, ↵ hint). */}
        <div
          className="habit-add"
          style={{
            flexShrink: 0,
            padding: '8px 14px',
            borderTop: '1px dashed var(--paper-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--ink-4)',
          }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input
              type="text"
              placeholder="add habit"
              aria-label="Add a habit or recurring event"
              data-habit-add
              data-testid="habit-add-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              // Stop click/pointer events at the input so they don't bubble
              // to RF's onNodeClick → selecting the habit mother → acid
              // selection ring flash. The input still receives focus and
              // typing works because React's stopPropagation is for SYNTHETIC
              // event bubbling, not DOM focus.
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                padding: 0,
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--ink)',
                caretColor: 'var(--acid)',
                outline: 'none',
                minWidth: 0,
              }}
            />
            <button
              type="button"
              data-testid="habit-add-repeat"
              title={newRepeat ? describeRepeat(newRepeat) : 'Repeat: make it a recurring event on the calendar (optional)'}
              aria-pressed={!!newRepeat}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setRepeatAt({ x: r.right, y: r.bottom });
                setNewRepeat((v) => v ?? { kind: 'daily', days: [], timeOfDay: '07:00', durationMin: 25 });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                height: 24, padding: '0 8px', borderRadius: 7, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 11,
                border: `1px solid ${newRepeat ? 'var(--acid)' : 'var(--paper-3)'}`,
                background: newRepeat ? 'color-mix(in srgb, var(--acid) 14%, transparent)' : 'transparent',
                color: newRepeat ? 'var(--ink)' : 'var(--ink-3)',
              }}
            >
              <IconRepeat />{newRepeat ? 'Repeats' : 'Repeat'}
            </button>
            <span
              aria-hidden
              style={{
                fontSize: 11, color: 'var(--ink-4)', background: 'var(--paper-2)',
                border: '1px solid var(--paper-3)', padding: '1px 4px', borderRadius: 3, flexShrink: 0,
              }}
            >
              ↵
            </span>
            </div>
            {newRepeat && !repeatAt && (
              isRepeatValid(newRepeat) ? (
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                  {describeRepeat(newRepeat)} · press Enter to add
                </div>
              ) : (
                <div data-testid="habit-add-repeat-invalid" style={{ marginTop: 5, fontSize: 11, color: 'var(--rust)', fontFamily: 'var(--font-sans)' }}>
                  Repeat isn't finished (days, time or minutes) — open it to fix, or Esc to clear
                </div>
              )
            )}
            {repeatAt && newRepeat && createPortal(
              <>
                <div onClick={() => setRepeatAt(null)} onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
                <div
                  data-testid="habit-add-repeat-pop"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed', zIndex: Z.popup, width: 380, boxSizing: 'border-box',
                    left: Math.max(8, Math.min(repeatAt.x - 380, window.innerWidth - 388)),
                    top: Math.max(8, Math.min(repeatAt.y + 6, window.innerHeight - 330)),
                    padding: 16, borderRadius: 14, background: 'var(--paper)', color: 'var(--ink)',
                    border: '1px solid var(--paper-3)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-sans)',
                  }}
                >
                  <RepeatEditor value={newRepeat} onChange={setNewRepeat} testIdPrefix="habit-add" />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button type="button" onClick={() => { setNewRepeat(null); setRepeatAt(null); }}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12.5 }}>
                      No repeat
                    </button>
                    <button type="button" disabled={!isRepeatValid(newRepeat)} onClick={() => setRepeatAt(null)}
                      style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, opacity: isRepeatValid(newRepeat) ? 1 : 0.4 }}>
                      Done
                    </button>
                  </div>
                </div>
              </>,
              document.body,
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
  scheduled: boolean = true,
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
  if (!scheduled) classes.push('habit-cell--unscheduled');
  if (!isFuture && scheduled) classes.push('habit-cell--interactive');
  return classes.join(' ');
}

interface RowCommonProps {
  habit: Habit;
  habitIdx: number;
  today: string;
  isLast: boolean;
  habitMotherId: string;
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

// ── Week view ──────────────────────────────────────────────────────────

interface WeekViewProps {
  habits: Habit[];
  today: string;
  weekDays: string[];
  habitMotherId: string;
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function WeekView({ habits, today, weekDays, habitMotherId, onToggle, onContextMenu }: WeekViewProps) {
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
                fontSize: 11,
                color: 'var(--ink-3)',
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
          habitMotherId={habitMotherId}
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
  habitMotherId,
  onToggle,
  onContextMenu,
}: WeekRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(
    () => calcStreak(habit.log, today, habit.schedule),
    [habit.log, today, habit.schedule],
  );
  const best = useMemo(() => bestStreak(habit.log, habit.schedule), [habit.log, habit.schedule]);
  const milestone = milestoneReached(streak);
  const nextMs = nextMilestone(streak);
  const toNext = nextMs !== null ? nextMs - streak : null;
  // The day the user said "no" to (not a plain flag): a new missed day the
  // next morning — app left open overnight — asks again.
  const [repairHiddenDay, setRepairHiddenDay] = useState<string | null>(null);
  const repairCandidate = useMemo(() => repairableDay(habit.log, today, habit.schedule), [habit.log, today, habit.schedule]);
  const repairDay = repairCandidate !== null && repairCandidate !== repairHiddenDay && !repairDismissed(habit.id, repairCandidate) ? repairCandidate : null;
  const repairLabel = repairDay === null ? '' : repairDay === addDaysLocal(today, -1) ? 'yesterday' : new Date(`${repairDay}T00:00:00`).toLocaleDateString('en', { weekday: 'long' });
  const logSet = useMemo(() => new Set(habit.log), [habit.log]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const payload = {
        habitId: habit.id,
        habitMotherId,
        color: habit.color,
        name: habit.name,
      };
      e.dataTransfer.setData('application/krnl-habit', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
      setHabitDrag(payload);
      const rowEl = rowRef.current;
      if (rowEl) {
        e.dataTransfer.setDragImage(rowEl, 0, rowEl.offsetHeight / 2);
      }
    },
    [habit.id, habit.color, habit.name, habitMotherId],
  );

  const handleDragEnd = useCallback(() => {
    clearHabitDrag();
  }, []);

  return (
    <div
      ref={rowRef}
      data-habit-row={habit.id}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={(e) => onContextMenu(e, habit.id)}
      style={{
        paddingBottom: 8,
        paddingTop: habitIdx === 0 ? 0 : 8,
        borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
        // expose habit color to CSS classes
        ['--habit-color' as string]: `var(--${color})`,
        cursor: 'grab',
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
          <HabitIcon icon={glyph} size={13} />
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
            const scheduled = isDayScheduled(habit.schedule, dayStr);
            const cls = cellClass(dayStr, today, done, 'week', scheduled);
            const size = { width: WEEK_CELL_SIZE, height: WEEK_CELL_SIZE };
            const tip = scheduled
              ? `${habit.name} ${dayStr}`
              : `${habit.name} ${dayStr} — not scheduled`;
            return isFuture || !scheduled ? (
              <div key={dayStr} className={cls} style={size} title={tip} />
            ) : (
              <button
                key={dayStr}
                type="button"
                className={cls}
                style={size}
                title={`${tip} — click to toggle`}
                onClick={(e) => { e.stopPropagation(); onToggle(habit.id, dayStr); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                aria-pressed={done}
              />
            );
          })}
        </div>
      </div>

      {habit.note && habit.note.length > 0 && (
        <div
          data-testid={`habit-note-${habit.id}`}
          style={{
            marginLeft: 22,
            marginTop: 4,
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            lineHeight: 1.4,
            color: 'var(--ink-3)',
            fontStyle: 'italic',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
          title={habit.note}
        >
          {habit.note}
        </div>
      )}

      <div
        data-habit-streak
        style={{
          marginTop: 3,
          paddingLeft: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          letterSpacing: '0.02em',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {streak > 0
          ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--acid-ink, var(--acid))', fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" /></svg>
              {`${streak} day${streak === 1 ? '' : 's'}`}
            </span>
          )
          : <span>{best > 0 ? 'Start again today' : 'Tick today to start'}</span>}
        {milestone !== null && (
          <button
            type="button"
            data-testid={`habit-milestone-${habit.id}`}
            title="Open the card to save or share"
            className="nodrag"
            onClick={(e) => {
              e.stopPropagation();
              openShare({ id: `share:${habit.id}`, kind: 'streak', value: streak, habit: habit.name, best: streak >= best, log: habit.log, total: new Set(habit.log).size });
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 16, padding: '0 7px', border: 0, borderRadius: 999, background: 'var(--acid)', color: 'var(--ink-on-bright)', fontWeight: 700, font: 'inherit', fontSize: 'inherit', cursor: 'pointer' }}
          >
            {milestone}-day card
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 16 16 8M9 8h7v7" /></svg>
          </button>
        )}
        {toNext !== null && streak > 0 && milestone === null && (
          <span>· {toNext} to {nextMs}</span>
        )}
        {best > streak && <span data-testid={`habit-best-${habit.id}`}>· best {best}</span>}
      </div>

      {/* engagement.md F17 — a missed day can be repaired, not a silent reset. */}
      {repairDay !== null && (
        <div
          data-testid={`habit-repair-${habit.id}`}
          className="nodrag"
          style={{
            marginTop: 6, marginLeft: 22, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 5px 5px 10px', borderRadius: 8,
            background: 'var(--paper-2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', minWidth: 0,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Missed ${repairLabel}? Tick it if you did it.`}>
            Did it {repairLabel}?
          </span>
          <button
            type="button"
            data-testid={`habit-repair-yes-${habit.id}`}
            onClick={(e) => { e.stopPropagation(); onToggle(habit.id, repairDay); }}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Tick ${repairLabel} — your streak carries on`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px', borderRadius: 6, cursor: 'pointer', border: 0, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Yes
          </button>
          <button
            type="button"
            data-testid={`habit-repair-no-${habit.id}`}
            onClick={(e) => { e.stopPropagation(); dismissRepair(habit.id, repairDay); setRepairHiddenDay(repairDay); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="No — start fresh"
            aria-label="No, start fresh"
            style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--ink-3)', flexShrink: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
    </div>
  );
});

const REPAIR_KEY = 'krnl0-habit-repair-dismissed';
function repairDismissed(habitId: string, day: string): boolean {
  try { return (JSON.parse(localStorage.getItem(REPAIR_KEY) ?? '{}') as Record<string, string>)[habitId] === day; } catch { return false; }
}
function dismissRepair(habitId: string, day: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(REPAIR_KEY) ?? '{}') as Record<string, string>;
    localStorage.setItem(REPAIR_KEY, JSON.stringify({ ...all, [habitId]: day }));
  } catch { /* no storage */ }
}

// ── Month view ──────────────────────────────────────────────────────────

interface MonthViewProps {
  habits: Habit[];
  today: string;
  monthDays: string[];
  habitMotherId: string;
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function MonthView({ habits, today, monthDays, habitMotherId, onToggle, onContextMenu }: MonthViewProps) {
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
          habitMotherId={habitMotherId}
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
  habitMotherId,
  onToggle,
  onContextMenu,
}: MonthRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(
    () => calcStreak(habit.log, today, habit.schedule),
    [habit.log, today, habit.schedule],
  );
  const logSet = useMemo(() => new Set(habit.log), [habit.log]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);
  const monthRowRef = useRef<HTMLDivElement>(null);

  const handleMonthDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const payload = {
        habitId: habit.id,
        habitMotherId,
        color: habit.color,
        name: habit.name,
      };
      e.dataTransfer.setData('application/krnl-habit', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
      setHabitDrag(payload);
      const rowEl = monthRowRef.current;
      if (rowEl) {
        e.dataTransfer.setDragImage(rowEl, 0, rowEl.offsetHeight / 2);
      }
    },
    [habit.id, habit.color, habit.name, habitMotherId],
  );

  const handleMonthDragEnd = useCallback(() => {
    clearHabitDrag();
  }, []);

  const onRowClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const t = e.target as HTMLElement;
      const date = t.getAttribute('data-date');
      if (!date) return;
      if (date > today) return;
      if (!isDayScheduled(habit.schedule, date)) return;
      onToggle(habit.id, date);
    },
    [habit.id, today, onToggle, habit.schedule],
  );

  const cellStyle = { width: MONTH_CELL_SIZE, height: MONTH_CELL_SIZE };

  return (
    <div
      ref={monthRowRef}
      data-habit-row={habit.id}
      draggable
      onDragStart={handleMonthDragStart}
      onDragEnd={handleMonthDragEnd}
      onContextMenu={(e) => onContextMenu(e, habit.id)}
      style={{
        paddingBottom: 10,
        paddingTop: habitIdx === 0 ? 0 : 10,
        borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
        ['--habit-color' as string]: `var(--${color})`,
        cursor: 'grab',
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
          <HabitIcon icon={glyph} size={13} />
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
        <StreakBadge streak={streak} />
      </div>

      <div
        onClick={onRowClick}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ display: 'flex', gap: MONTH_CELL_GAP, flexWrap: 'nowrap' }}
      >
        {monthDays.map((dayStr) => {
          const done = logSet.has(dayStr);
          const scheduled = isDayScheduled(habit.schedule, dayStr);
          const cls = cellClass(dayStr, today, done, 'month', scheduled);
          const tip = scheduled
            ? `${habit.name} ${dayStr}`
            : `${habit.name} ${dayStr} — not scheduled`;
          return (
            <div
              key={dayStr}
              data-date={scheduled ? dayStr : undefined}
              className={cls}
              style={cellStyle}
              title={tip}
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
  habitMotherId: string;
  onToggle: (id: string, date: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function YearView({ habits, today, yearGrid, habitMotherId, onToggle, onContextMenu }: YearViewProps) {
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
          habitMotherId={habitMotherId}
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

// Year-grid dimensions, derived once. 53 cols × 7 rows of 5×5 px cells with
// 1 px gap = total width 317 px, height 41 px. Module-level so the canvas
// draw fn doesn't recompute.
const YEAR_COLS = 53;
const YEAR_ROWS = 7;
const YEAR_GRID_W = YEAR_COLS * (YEAR_CELL_SIZE + YEAR_CELL_GAP) - YEAR_CELL_GAP;
const YEAR_GRID_H = YEAR_ROWS * (YEAR_CELL_SIZE + YEAR_CELL_GAP) - YEAR_CELL_GAP;

const YearRow = memo(function YearRow({
  habit,
  habitIdx,
  today,
  isLast,
  yearGrid,
  habitMotherId: _habitMotherId,
  onToggle,
  onContextMenu,
}: YearRowProps) {
  const color = habitColor(habit.color);
  const streak = useMemo(
    () => calcStreak(habit.log, today, habit.schedule),
    [habit.log, today, habit.schedule],
  );
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const schedule = habit.schedule;

  // Canvas redraw — 371 cells in one DOM node instead of 371 divs. Re-runs
  // only when log / color / today / yearGrid changes. Resolves CSS-var colors
  // via getComputedStyle so theme swaps still take effect (a fresh draw fires
  // when the parent re-renders after theme toggle).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cs = getComputedStyle(canvas);
    const doneColor = cs.getPropertyValue(`--${color}`).trim() || '#c9f158';
    const restColor = cs.getPropertyValue('--paper-3').trim() || '#3a3527';
    const todayBorder = cs.getPropertyValue('--ink-3').trim() || '#5a5244';

    const dpr = window.devicePixelRatio || 1;
    const W = YEAR_GRID_W;
    const H = YEAR_GRID_H;
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const logSet = new Set(habit.log);
    const step = YEAR_CELL_SIZE + YEAR_CELL_GAP;
    for (let r = 0; r < YEAR_ROWS; r++) {
      const rowArr = yearGrid[r];
      if (!rowArr) continue;
      for (let c = 0; c < YEAR_COLS; c++) {
        const day = rowArr[c];
        if (day === null || day === undefined) continue;
        if (day > today) continue;             // future suppressed
        const x = c * step;
        const y = r * step;
        const done = logSet.has(day);
        const scheduled = isDayScheduled(schedule, day);
        if (done) {
          ctx.fillStyle = doneColor;
          if (!scheduled) ctx.globalAlpha = 0.35;
          ctx.fillRect(x, y, YEAR_CELL_SIZE, YEAR_CELL_SIZE);
          ctx.globalAlpha = 1;
        } else {
          // Past undone — faded rest color; non-scheduled extra-faded.
          ctx.globalAlpha = scheduled ? 0.4 : 0.15;
          ctx.fillStyle = restColor;
          ctx.fillRect(x, y, YEAR_CELL_SIZE, YEAR_CELL_SIZE);
          ctx.globalAlpha = 1;
        }
        if (day === today) {
          ctx.strokeStyle = done ? doneColor : todayBorder;
          ctx.lineWidth = 1;
          // 0.5 offset → crisp 1 px stroke aligned to pixel grid.
          ctx.strokeRect(x + 0.5, y + 0.5, YEAR_CELL_SIZE - 1, YEAR_CELL_SIZE - 1);
        }
      }
    }
  }, [habit.log, color, today, yearGrid, schedule]);

  // Year view is intentionally read-only (2026-05-15 product call). No
  // click/toggle from year view — feels noisy at 5 px cells; use the week or
  // month view to toggle. _suppress the unused warning by referencing the prop.
  void onToggle;

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
          <HabitIcon icon={glyph} size={13} />
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
        <StreakBadge streak={streak} />
      </div>

      {/* Canvas-based year grid — replaces 371 cell divs with one canvas.
          ~6× faster mount + repaint at 6+ habits, and a habit-log toggle
          repaints only one canvas (this row's), not the whole grid tree.
          pointer-events:none — year view is read-only; toggles happen from
          the week/month views. */}
      <canvas
        ref={canvasRef}
        data-testid={`habit-year-canvas-${habit.id}`}
        style={{
          display: 'block',
          cursor: 'default',
          pointerEvents: 'none',
          width: YEAR_GRID_W,
          height: YEAR_GRID_H,
        }}
      />
    </div>
  );
});


/** The streak in Month and Year views: the week view's flame and count. */
function StreakBadge({ streak }: { streak: number }) {
  return (
    <div
      title={streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} in a row` : 'No streak yet'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        color: streak > 0 ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" /></svg>
      {streak}
    </div>
  );
}
