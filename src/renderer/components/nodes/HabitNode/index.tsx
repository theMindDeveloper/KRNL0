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
import { RepeatEditor, fromSchedule, isRepeatValid, toSchedule, type RepeatValue } from '../../ui/RepeatEditor';
import { HabitAddAsk, type AddAnswer, type CardDraft } from './HabitAddAsk';
import { MenuIcon } from '../../ui/menuIcons';
import { FOCUS_NODE_EVENT } from '../../../store/scheduleActions';
import { RemindPicker } from '../../ui/RemindPicker';
import { AmountPopover, TargetPopover } from './HabitPopovers';
import { countOn, weeklyTarget } from './types';
import { RoutineShelf, routineStatus } from './RoutineShelf';
import { isRoutine } from './types';
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
import { habitStreak, milestoneReached, nextMilestone, repairableDay, ticksThisWeek } from './commands';

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

/** A day can be ticked when it is scheduled, or on any day once the habit
 *  has a weekly target ("3× a week: any days count"). */
export function tickableOn(h: Pick<Habit, 'schedule' | 'perWeek' | 'kind'>, day: string): boolean {
  return weeklyTarget(h) !== null || isDayScheduled(h.schedule, day);
}

export function HabitNode({
  node,
  onCommand,
  slotIndex = 3,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<HabitState, HabitConfig>) {
  const { state, config } = node;
  const [newName, setNewName] = useState('');
  // Enter asks first (HabitAddAsk): habit or routine, then when. Nothing is
  // added with settings the user did not choose. null = the card is closed.
  const [ask, setAsk] = useState<{ left: number; right: number; top: number } | null>(null);
  const addRowRef = useRef<HTMLDivElement>(null);
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
  // Decision 39 — two shelves: habits (ticked) above routines (just happen).
  const habitsOnly = useMemo(() => visibleHabits.filter((h) => !isRoutine(h)), [visibleHabits]);
  // Ended routines stay on the shelf, marked ended: the Calendar still shows
  // the days they happened, so they must be findable here (and deletable).
  const routines = useMemo(() => visibleHabits.filter((h) => isRoutine(h)), [visibleHabits]);
  const endedRoutines = useMemo(
    () => visibleHabits.filter((h) => isRoutine(h) && h.endsOn && h.endsOn < today).map((h) => ({ id: h.id, name: h.name, endsOn: h.endsOn! })),
    [visibleHabits, today],
  );
  const archivedList = useMemo(
    () => state.habits.filter((h) => h.archived).map((h) => ({ id: h.id, name: h.name, days: h.log.length })),
    [state.habits],
  );
  // A routine's reminder (menu → "Remind me…").
  const [routineRemind, setRoutineRemind] = useState<{ habitId: string; value: number | null; x: number; y: number } | null>(null);
  // A habit's daily amount (menu → "Amount a day…"): "8 glasses".
  const [amountEdit, setAmountEdit] = useState<{ habitId: string; target: number | null; unit: string; x: number; y: number } | null>(null);
  // A habit's weekly target (menu → "Times a week…"): 1–6, or none.
  const [targetEdit, setTargetEdit] = useState<{ habitId: string; value: number | null; x: number; y: number } | null>(null);
  // Edit how an existing habit / routine repeats (menu → "Edit repeat…").
  const [editRepeat, setEditRepeat] = useState<{ habitId: string; value: RepeatValue; x: number; y: number } | null>(null);

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
    if (ask) return; // the question card has the keys
    if (e.key === 'Escape') {
      // Same as the Todo add field: Escape abandons what was typed.
      setNewName('');
      return;
    }
    if (e.key === 'Enter') {
      if (!newName.trim()) return;
      const r = addRowRef.current?.getBoundingClientRect();
      setAsk(r ? { left: r.left, right: r.right, top: r.top } : { left: 8, right: 360, top: window.innerHeight - 60 });
    }
  };
  const takenNames = useMemo(() => new Set(state.habits.filter((h) => !h.archived).map((h) => h.name.trim().toLowerCase())), [state.habits]);
  const addAnswered = (a: AddAnswer) => {
    onCommand('habit.add', { name: newName.trim(), schedule: a.schedule, ...(a.kind === 'routine' ? { kind: 'routine' } : {}), ...(a.perWeek ? { perWeek: a.perWeek } : {}) });
    // An amount a day, when asked for (set right after the habit exists).
    if (a.amount) {
      const h = [...(useBoardStore.getState().board?.nodes.find((n) => n.id === node.id)?.state as HabitState | undefined)?.habits ?? []].reverse().find((x) => x.name === newName.trim());
      if (h) onCommand('habit.setAmount', { id: h.id, target: a.amount.target, unit: a.amount.unit });
    }
    setNewName('');
    setAsk(null);
  };

  const onToggleCell = useCallback(
    (habitId: string, date: string) => {
      onCommand('habit.toggleDay', { id: habitId, date });
    },
    [onCommand],
  );

  // "Did it yesterday? Yes" on an amount habit means the whole amount, not one more glass.
  const onFillDay = useCallback(
    (habitId: string, date: string, count: number) => onCommand('habit.setCount', { id: habitId, date, count }),
    [onCommand],
  );

  const onRestDay = useCallback(
    (habitId: string, date: string) => onCommand('habit.setRest', { id: habitId, date, rest: true }),
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
    week: `HABITS — WEEK ${weekNum} · HBT.WEEK`,
    month: `HABITS — ${MONTH_LABELS[now.getMonth()]} · HBT.MONTH`,
    year: `HABITS — ${now.getFullYear()} · HBT.YEAR`,
  };

  const menuHabit = menu ? visibleHabits.find((h) => h.id === menu.habitId) ?? null : null;

  // Decision 40 — the habit menu: Days & time… (the add card, one editor for
  // days, time, times a week and amount) and Rest today, above rename /
  // colour / icon / note, the canvas card, Archive and Delete.
  const draftOf = (h: (typeof visibleHabits)[number]): CardDraft => {
    const sch = h.schedule;
    const days = !sch || sch.kind === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : sch.kind === 'weekdays' ? [1, 2, 3, 4, 5] : [...sch.days];
    const tgt = weeklyTarget(h);
    return { mode: tgt ? 'week' : 'days', days: days as CardDraft['days'], perWeek: tgt ?? 3, time: sch?.timeOfDay ?? '', amount: h.amount ? { target: h.amount.target, unit: h.amount.unit ?? '' } : null };
  };
  const menuItemsFor = (h: (typeof visibleHabits)[number], at: { x: number; y: number }) => {
    if (isRoutine(h)) return [];
    const d = draftOf(h);
    const daysHint = d.mode === 'week' ? `${d.perWeek}× a week` : d.days.length === 7 ? 'every day' : d.days.map((x) => 'MTWTFSS'[x - 1]).join(' ');
    return [
      { label: 'Days & time…', icon: 'repeat' as const, hint: `${daysHint}${d.time ? ` ${d.time}` : ''}`, testId: 'habit-menu-days', onClick: () => setEditCard({ habitId: h.id, name: h.name, draft: d, anchor: { left: at.x, right: at.x + 330, top: at.y + 300 } }) },
      // A day already done needs no rest (the tick wins on screen anyway).
      ...((h.rest ?? []).includes(today)
        ? [{ label: 'Undo rest today', icon: 'undo' as const, onClick: () => onCommand('habit.setRest', { id: h.id, date: today, rest: false }) }]
        : h.log.includes(today) ? []
        : [{ label: 'Rest today', icon: 'rest' as const, hint: 'keeps streak', testId: 'habit-menu-rest', onClick: () => onCommand('habit.setRest', { id: h.id, date: today, rest: true }) }]),
    ];
  };
  const [editCard, setEditCard] = useState<{ habitId: string; name: string; draft: CardDraft; anchor: { left: number; right: number; top: number } } | null>(null);
  const saveEditCard = (a: AddAnswer) => {
    if (!editCard) return;
    onCommand('habit.setSchedule', { habitId: editCard.habitId, schedule: a.schedule });
    onCommand('habit.setTarget', { id: editCard.habitId, perWeek: a.perWeek ?? null });
    onCommand('habit.setAmount', a.amount ? { id: editCard.habitId, target: a.amount.target, unit: a.amount.unit } : { id: editCard.habitId, target: null });
    setEditCard(null);
  };
  const saveEditRepeat = () => {
    if (!editRepeat || !isRepeatValid(editRepeat.value)) return;
    const h = visibleHabits.find((x) => x.id === editRepeat.habitId);
    const wantRoutine = editRepeat.value.itemKind === 'routine';
    // Schedule first (a routine needs its time before the switch).
    onCommand('habit.setSchedule', { habitId: editRepeat.habitId, schedule: toSchedule(editRepeat.value) });
    if (h && wantRoutine !== isRoutine(h)) onCommand('habit.setKind', { id: editRepeat.habitId, kind: wantRoutine ? 'routine' : 'habit' });
    setEditRepeat(null);
  };

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
              habits={habitsOnly}
              today={today}
              weekDays={weekDays}
              habitMotherId={node.id}
              onToggle={onToggleCell}
              onRest={onRestDay}
              onFill={onFillDay}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'month' && (
            <MonthView
              habits={habitsOnly}
              today={today}
              monthDays={monthDays}
              habitMotherId={node.id}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}
          {view === 'year' && (
            <YearView
              habits={habitsOnly}
              today={today}
              yearGrid={yearGrid}
              habitMotherId={node.id}
              onToggle={onToggleCell}
              onContextMenu={onContextMenu}
            />
          )}

          {/* Decision 40 — repeating events live on the Calendar (its Events list). */}
          {habitsOnly.length === 0 && (
            <div
              style={{
                color: 'var(--ink-3)',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                padding: '4px 0',
                lineHeight: 1.5,
              }}
            >
              Something you do again and tick off: a run, 20 pages, 8 glasses.
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
                const h = state.habits.find((x) => x.id === menu.habitId);
                undoable(`Deleted habit "${h?.name ?? ''}"`, () => onCommand('habit.remove', { id: menu.habitId }));
              }}
              onArchive={() => {
                // Archived rows leave the list (Restore is in the habit menu's Archived list).
                const h = state.habits.find((x) => x.id === menu.habitId);
                undoable(`Archived "${h?.name ?? ''}"`, () => onCommand('habit.archive', { id: menu.habitId }));
              }}
              {...(isRoutine(menuHabit) ? {} : { onPinAsLane: () => onCommand('habit.spawnLane', { habitId: menu.habitId }) })}
              laneExists={pinnedHabitIds.has(menu.habitId)}
              extraItems={menuItemsFor(menuHabit, menu.anchor)}
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
            <div ref={addRowRef} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input
              type="text"
              placeholder="add a habit"
              aria-label="Add a habit"
              data-habit-add
              data-testid="habit-add-input"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                // Decision 40 — the card opens as you type, with its defaults: Enter adds.
                if (!e.target.value.trim()) { setAsk(null); return; }
                if (!ask) {
                  const r = addRowRef.current?.getBoundingClientRect();
                  setAsk(r ? { left: r.left, right: r.right, top: r.top } : { left: 8, right: 360, top: window.innerHeight - 60 });
                }
              }}
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
            {ask && newName.trim() && (
              <HabitAddAsk name={newName.trim()} anchor={ask} onAdd={addAnswered} onCancel={() => { setAsk(null); setNewName(''); }} taken={takenNames}
                archivedMatch={(() => { const h = state.habits.find((x) => x.archived && x.name.trim().toLowerCase() === newName.trim().toLowerCase()); return h ? { id: h.id, name: h.name } : null; })()}
                onRestore={(id) => { onCommand('habit.unarchive', { id }); setNewName(''); setAsk(null); }}
                onCalendar={() => {
                  setAsk(null);
                  const cal = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'calendar' && n.isMother);
                  if (cal) window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: { nodeId: cal.id } }));
                }} />
            )}
            {editCard && (
              <HabitAddAsk name={editCard.name} anchor={editCard.anchor} initial={editCard.draft} saveLabel="Save"
                onAdd={saveEditCard} onCancel={() => setEditCard(null)} />
            )}
          </div>


        {settingsOpen && (
          <HabitPopover
            view={view}
            onSetView={(v) => onCommand('habit.setView', { view: v })}
            onClose={() => setSettingsOpen(false)}
            ended={endedRoutines}
            onRestart={(id) => onCommand('routine.restart', { id })}
            archived={archivedList}
            onUnarchive={(id) => onCommand('habit.unarchive', { id })}
            onDeleteForever={(id) => {
              const h = state.habits.find((x) => x.id === id);
              undoable(`Deleted ${h?.kind === 'routine' ? 'routine' : 'habit'} "${h?.name ?? ''}"`, () => onCommand('habit.remove', { id }));
            }}
          />
        )}
      </div>
      {routineRemind && (
        <RemindPicker
          x={routineRemind.x}
          y={routineRemind.y}
          value={routineRemind.value}
          onPick={(min) => { onCommand('habit.setRemind', { id: routineRemind.habitId, min }); setRoutineRemind(null); }}
          onClose={() => setRoutineRemind(null)}
        />
      )}
      {amountEdit && (
        <AmountPopover
          x={amountEdit.x}
          y={amountEdit.y}
          target={amountEdit.target}
          unit={amountEdit.unit}
          onSave={(a) => { onCommand('habit.setAmount', a ? { id: amountEdit.habitId, target: a.target, unit: a.unit } : { id: amountEdit.habitId, target: null }); setAmountEdit(null); }}
          onClose={() => setAmountEdit(null)}
        />
      )}
      {targetEdit && (
        <TargetPopover
          x={targetEdit.x}
          y={targetEdit.y}
          value={targetEdit.value}
          onPick={(n) => { onCommand('habit.setTarget', { id: targetEdit.habitId, perWeek: n }); setTargetEdit(null); }}
          onClose={() => setTargetEdit(null)}
        />
      )}
      {editRepeat && createPortal(
        <div
          data-testid="habit-edit-repeat"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', left: Math.min(editRepeat.x, window.innerWidth - 340), top: Math.min(editRepeat.y, window.innerHeight - 460),
            width: 320, zIndex: Z.popover, padding: 14, borderRadius: 12, background: 'var(--node-bg)',
            border: '1px solid var(--paper-3)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          <RepeatEditor value={editRepeat.value} onChange={(v) => setEditRepeat((cur) => (cur ? { ...cur, value: v } : cur))} testIdPrefix="habit-edit" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" onClick={() => setEditRepeat(null)}
              style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12.5 }}>Cancel</button>
            <button type="button" data-testid="habit-edit-save" disabled={!isRepeatValid(editRepeat.value)} onClick={saveEditRepeat}
              style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, opacity: isRepeatValid(editRepeat.value) ? 1 : 0.4 }}>Save</button>
          </div>
        </div>,
        document.body,
      )}
    </MotherFrame>
  );
}

/** Decision 39 — a quiet label above a shelf (only when both shelves show). */
function ShelfLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 8px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
      <span>{text}</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--paper-3)' }} />
    </div>
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
  onRest?: (id: string, date: string) => void;
  onFill?: (id: string, date: string, count: number) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function WeekView({ habits, today, weekDays, habitMotherId, onToggle, onRest, onFill, onContextMenu }: WeekViewProps) {
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
          {...(onRest ? { onRest } : {})}
          {...(onFill ? { onFill } : {})}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

interface WeekRowProps extends RowCommonProps {
  weekDays: string[];
  onRest?: (id: string, date: string) => void;
  onFill?: (id: string, date: string, count: number) => void;
}

const WeekRow = memo(function WeekRow({
  habit,
  habitIdx,
  today,
  isLast,
  weekDays,
  habitMotherId,
  onToggle,
  onRest = () => undefined,
  onFill = () => undefined,
  onContextMenu,
}: WeekRowProps) {
  const color = habitColor(habit.color);
  // "3 times a week": the streak counts weeks that reached the target.
  const target = weeklyTarget(habit);
  // One streak for every screen (habitStreak): weeks for a target, rest days stepped over.
  const { current: streak, best } = useMemo(() => habitStreak(habit, today), [habit, today]);
  // Today one of its days? If not, the next one ("Next: Mon").
  const onToday = tickableOn(habit, today);
  const nextDay = useMemo(() => {
    for (let k = 1; k <= 7; k++) {
      const d = addDaysLocal(today, k);
      if (tickableOn(habit, d)) return k === 1 ? 'tomorrow' : new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
    }
    return 'later';
  }, [habit, today]);
  const restSet = useMemo(() => new Set(habit.rest ?? []), [habit.rest]);
  const weekTicks = target ? ticksThisWeek(habit.log, today) : 0;
  const unit = target ? 'week' : 'day';
  const milestone = target ? null : milestoneReached(streak);
  const nextMs = target ? null : nextMilestone(streak);
  const toNext = nextMs !== null ? nextMs - streak : null;
  // The day the user said "no" to (not a plain flag): a new missed day the
  // next morning — app left open overnight — asks again.
  const [repairHiddenDay, setRepairHiddenDay] = useState<string | null>(null);
  // A weekly target has no missed days: nothing to repair.
  const repairCandidate = useMemo(() => (target ? null : repairableDay(habit.log, today, habit.schedule, habit.rest)), [habit.log, today, habit.schedule, target, habit.rest]);
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
            const scheduled = tickableOn(habit, dayStr);
            const resting = !done && restSet.has(dayStr);
            const cls = cellClass(dayStr, today, done, 'week', scheduled) + (resting ? ' habit-cell--rest' : '');
            const size = { width: WEEK_CELL_SIZE, height: WEEK_CELL_SIZE };
            // An amount ("8 glasses"): the cell fills from the bottom as the day's count grows.
            const cnt = habit.amount ? countOn(habit, dayStr) : 0;
            const partial = habit.amount && !done && cnt > 0 ? Math.min(1, cnt / habit.amount.target) : 0;
            const tip = !scheduled
              ? `${habit.name} ${dayStr} — not scheduled`
              : resting ? `${habit.name} ${dayStr} — rest day (the streak carries on)`
              : habit.amount ? `${habit.name} ${dayStr} — ${cnt} of ${habit.amount.target}${habit.amount.unit ? ` ${habit.amount.unit}` : ''}`
              : `${habit.name} ${dayStr}`;
            // Part-way to the day's amount: a soft fill rising with the count and
            // the count itself, so "1 of 8" reads as progress, not as a stray line.
            const cellStyle = partial > 0
              ? {
                ...size,
                // Painted from the border box and never repeated: a repeating fill
                // showed again as a thin bar along the top border.
                backgroundImage: `linear-gradient(to top, color-mix(in srgb, var(--habit-color, var(--acid)) 38%, transparent) ${Math.max(18, Math.round(partial * 100))}%, transparent ${Math.max(18, Math.round(partial * 100))}%)`,
                backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box',
                display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, lineHeight: 1, color: 'var(--ink)',
              }
              : size;
            return isFuture || !scheduled ? (
              <div key={dayStr} className={cls} style={size} title={tip} />
            ) : (
              <button
                key={dayStr}
                type="button"
                className={cls}
                style={cellStyle}
                title={`${tip} — click to ${habit.amount ? 'add one' : 'toggle'}`}
                onClick={(e) => { e.stopPropagation(); onToggle(habit.id, dayStr); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                aria-pressed={done}
              >
                {partial > 0 ? cnt : null}
              </button>
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
              {`${streak} ${unit}${streak === 1 ? '' : 's'}`}
            </span>
          )
          : target ? null : <span>{!onToday ? `Next: ${nextDay}` : best > 0 ? 'Start again today' : 'Tick today to start'}</span>}
        {habit.amount && (() => {
          const c = countOn(habit, today);
          const t = habit.amount.target;
          const u = habit.amount.unit ? ` ${habit.amount.unit}` : '';
          // Not a habit day today: say the goal, not "0 of 2 today".
          if (!onToday) return <span data-testid={`habit-amount-${habit.id}`}>{'· '}{t}{u} a day</span>;
          return (
            <span data-testid={`habit-amount-${habit.id}`} style={{ color: c >= t ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
              {'· '}{Math.min(c, t)} of {t}{u} today{c >= t ? ' ✓' : ''}
            </span>
          );
        })()}
        {target !== null && (
          <span data-testid={`habit-week-${habit.id}`} style={{ color: weekTicks >= target ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
            {streak > 0 ? '· ' : ''}{Math.min(weekTicks, target)} of {target} this week{weekTicks >= target ? ' ✓' : ''}
          </span>
        )}
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
            onClick={(e) => { e.stopPropagation(); if (habit.amount) onFill(habit.id, repairDay, habit.amount.target); else onToggle(habit.id, repairDay); }}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Tick ${repairLabel} — your streak carries on`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px', borderRadius: 6, cursor: 'pointer', border: 0, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Yes
          </button>
          <button
            type="button"
            data-testid={`habit-repair-rest-${habit.id}`}
            onClick={(e) => { e.stopPropagation(); onRest(habit.id, repairDay); }}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Sick, away or a planned break: mark ${repairLabel} as a rest day and keep the streak`}
            style={{ height: 22, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}
          >
            Rest day
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
  const { current: streak, unit: streakUnit } = useMemo(() => habitStreak(habit, today), [habit, today]);
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
      if (!tickableOn(habit, date)) return;
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
        <StreakBadge streak={streak} unit={streakUnit} />
      </div>

      <div
        onClick={onRowClick}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ display: 'flex', gap: MONTH_CELL_GAP, flexWrap: 'nowrap' }}
      >
        {monthDays.map((dayStr) => {
          const done = logSet.has(dayStr);
          const scheduled = tickableOn(habit, dayStr);
          const resting = !done && (habit.rest ?? []).includes(dayStr);
          const cls = cellClass(dayStr, today, done, 'month', scheduled) + (resting ? ' habit-cell--rest' : '');
          // Amounts and rest days read the same as in the week view.
          const cnt = habit.amount ? countOn(habit, dayStr) : 0;
          const part = habit.amount && !done && cnt > 0 ? Math.min(1, cnt / habit.amount.target) : 0;
          const tip = !scheduled
            ? `${habit.name} ${dayStr} — not scheduled`
            : resting ? `${habit.name} ${dayStr} — rest day`
            : habit.amount ? `${habit.name} ${dayStr} — ${cnt} of ${habit.amount.target}${habit.amount.unit ? ` ${habit.amount.unit}` : ''}`
            : `${habit.name} ${dayStr}`;
          return (
            <div
              key={dayStr}
              data-date={scheduled ? dayStr : undefined}
              className={cls}
              style={part > 0 ? { ...cellStyle, background: `linear-gradient(to top, color-mix(in srgb, var(--habit-color, var(--acid)) 75%, transparent) ${Math.round(part * 100)}%, transparent ${Math.round(part * 100)}%)` } : cellStyle}
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
  const { current: streak, unit: streakUnit } = useMemo(() => habitStreak(habit, today), [habit, today]);
  const glyph = habit.icon ?? fallbackGlyph(habitIdx);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        const scheduled = tickableOn(habit, day);
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
  }, [habit, color, today, yearGrid]);

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
        <StreakBadge streak={streak} unit={streakUnit} />
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
function StreakBadge({ streak, unit = 'day' }: { streak: number; unit?: 'day' | 'week' }) {
  return (
    <div
      title={streak > 0 ? `${streak} ${unit}${streak === 1 ? '' : 's'} in a row` : 'No streak yet'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        color: streak > 0 ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" /></svg>
      {streak}{unit === 'week' ? 'w' : ''}
    </div>
  );
}
