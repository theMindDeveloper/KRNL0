import { useState, useRef, useEffect, useMemo } from 'react';
import { LineGlyph } from '../../ui/LineGlyph';
import { SettingsIcon } from '../../ui/SettingsIcons';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TodoConfig, TodoItem, TodoState } from './types';
import { todoBuckets, todoReclassify, todoTagLibrary, visibleItems } from './commands';
import { tagDisplay } from '../../../../shared/tags/classify';
import { useEasyMode } from '../../../store/uiMode';
import { TagPicker } from './TagPicker';
import { showPlanGuide } from '../../PlanGuide';

import { defaultTodoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { ContextMenu } from '../../ContextMenu';
import { PagedView } from '../../ui/PagedView';
import type { ContextMenuItem } from '../../ContextMenu';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { PomoConfig } from '../PomoNode/types';
import { defaultPomoConfig } from '../PomoNode/types';
import { breakdownPomoTime } from '../../../store/pomoSchedule';
import { trackedSecondsByTask, selectPomoNode, pomoOnlyBoard } from '../../../store/trackedTime';
import { toneVarForTask } from '../../../utils/taskColor';
import { revertible, undoable } from '../../../store/undoNotice';
import { DuePicker } from '../../ui/DuePicker';
import { RemindPicker } from '../../ui/RemindPicker';
import { TaskRepeatPicker } from '../../ui/TaskRepeatPicker';
import { describeTaskRepeat, isoDowOfYMD, parseRepeat, repeatsBehind } from '../../../../shared/repeatTask';
import { dueLabel } from '../../../../shared/due';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { scheduleTaskAt, setTaskReminder, spawnNextRepeat, unscheduleTask } from '../../../store/scheduleActions';
import { describeQuickAdd, parseQuickAdd, type QuickAdd } from '../../../../shared/quickAdd';


/** Repeats being brought forward right now (effects can run twice). */
const catchingUp = new Set<string>();
export function TodoNode({ node, onCommand, slotIndex = 2, slotTotal = MOTHER_TOTAL }: NodeProps<TodoState, TodoConfig>) {
  const { state, config: rawConfig } = node;
  const config = rawConfig ?? defaultTodoConfig();

  // Add-task input — two-phase FSM (phase 'name' → 'duration' → dispatch)
  const [inputPhase, setInputPhase] = useState<'name' | 'duration'>('name');
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationInvalid, setDurationInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // F5: inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Inline time-edit state (item.taskNodeId-backed plannedMin).
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState('');
  const [timeInvalid, setTimeInvalid] = useState(false);

  // Row context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    itemId: string;
    hasTaskNode: boolean;
  } | null>(null);

  // ADR 0016 — Done / Archive dropdowns (collapsed by default) + tag picker.
  const [doneOpen, setDoneOpen] = useState(false);
  const [tagPicker, setTagPicker] = useState<{ x: number; y: number; itemId: string } | null>(null);
  // Review 2.1 — the due-day picker (row menu → "Due date…", or click the chip).
  const [duePick, setDuePick] = useState<{ x: number; y: number; itemId: string } | null>(null);
  // Review 5.3 — repeat a plan (row menu → "Repeat…").
  const [repeatPick, setRepeatPick] = useState<{ x: number; y: number; itemId: string; weekday: number } | null>(null);
  // Review 4.1 — reminder lead time per plan (row menu → "Remind me…").
  const [remindPick, setRemindPick] = useState<{ x: number; y: number; taskId: string; value: number | null } | null>(null);
  const remindByTask = useBoardStore(useShallow((s) => {
    const out: Record<string, number> = {};
    for (const n of s.board?.nodes ?? []) {
      const r = (n.state as { remindMin?: unknown } | null)?.remindMin;
      if (n.kind === 'todo.task' && typeof r === 'number') out[n.id] = r;
    }
    return out;
  }));
  const todayYMD = useLocalDay();

  // 60-second tick for past-item graying — also rolls yesterday's Done into
  // the Archive at midnight, since the buckets are derived from the clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Backfill: items created before tagging existed (or while a tag was
  // missing from the library) get classified once on mount. Pure check first,
  // so a list that's already settled dispatches nothing.
  useEffect(() => {
    if (todoReclassify(state) !== state) onCommand('todo.reclassify');
    // Mount-only by design: later adds/edits classify themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A repeating plan whose day passed unticked brings its next one (on open
  // and at midnight), so one missed day doesn't end the series.
  useEffect(() => {
    const behind = repeatsBehind(state.items, (id) => taskScheduledInfo.get(id)?.scheduledFor.slice(0, 10), todayYMD);
    for (const id of behind) {
      if (catchingUp.has(id)) continue;
      catchingUp.add(id);
      void spawnNextRepeat(id).finally(() => catchingUp.delete(id));
    }
    // Day changes and new repeats only; the scheduled map is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayYMD, state.items]);

  const buckets = todoBuckets(state, nowMs);
  // One-click deletes say what went and offer UNDO (cascade included).
  const removeItem = (id: string) => {
    const text = state.items.find((i) => i.id === id)?.text ?? 'item';
    undoable(`Deleted "${text}"`, () => onCommand('todo.remove', { id }));
  };
  const tagLibrary = todoTagLibrary(state);
  // Easy mode: no tags and no pomo linking — just add, schedule, done.
  const easy = useEasyMode();
  const rawItems = visibleItems({ ...state, items: [...buckets.active, ...buckets.done] }, config);

  // Build a map from taskNodeId → plannedMin so drag payloads can include duration.
  const taskPlannedMin = useBoardStore(
    useShallow((s): Map<string, number> => {
      if (!s.board) return new Map();
      const map = new Map<string, number>();
      for (const n of s.board.nodes) {
        if (n.kind !== 'todo.task') continue;
        const st = n.state as { plannedMin?: number; durationMin?: number };
        map.set(n.id, st.plannedMin ?? st.durationMin ?? 25);
      }
      return map;
    }),
  );

  // #207 / time-log F12 — tracked work per task (sum of tagged spans).
  const pomoForTracked = useBoardStore(selectPomoNode);
  const trackedSecByTask = useMemo(
    () => trackedSecondsByTask(pomoOnlyBoard(pomoForTracked), Date.now()),
    [pomoForTracked],
  );

  // #207 — tasks with no set time (estimate 0): the row reads "open".
  const taskOpenKeys = useBoardStore(
    useShallow((s): string[] => (s.board?.nodes ?? [])
      .filter((n) => n.kind === 'todo.task' && (n.state as { timeOpen?: boolean }).timeOpen === true)
      .map((n) => n.id)),
  );

  // Build a map from taskNodeId → kind for the three-numbers display.
  const taskKindMap = useBoardStore(
    useShallow((s): Map<string, 'focus' | 'event'> => {
      if (!s.board) return new Map();
      const map = new Map<string, 'focus' | 'event'>();
      for (const n of s.board.nodes) {
        if (n.kind !== 'todo.task') continue;
        const st = n.state as { kind?: 'focus' | 'event' };
        map.set(n.id, st.kind ?? 'focus');
      }
      return map;
    }),
  );

  // Read PomoConfig for live breakdown calculations.
  const pomoConfig = useBoardStore(
    useShallow((s) => {
      const pomo = s.board?.nodes.find((n) => n.kind === 'pomo');
      return (pomo?.config as PomoConfig | null) ?? defaultPomoConfig();
    }),
  );

  // Map taskNodeId → { scheduledFor, scheduledDurationMin } for past-graying.
  const taskScheduledInfo = useBoardStore(
    useShallow((s): Map<string, { scheduledFor: string; durationMin: number }> => {
      if (!s.board) return new Map();
      const map = new Map<string, { scheduledFor: string; durationMin: number }>();
      for (const n of s.board.nodes) {
        if (n.kind !== 'todo.task') continue;
        const st = n.state as {
          scheduledFor?: string;
          scheduledDurationMin?: number;
          plannedMin?: number;
          durationMin?: number;
        };
        if (!st.scheduledFor) continue;
        map.set(n.id, {
          scheduledFor: st.scheduledFor,
          durationMin: st.scheduledDurationMin ?? st.plannedMin ?? st.durationMin ?? 25,
        });
      }
      return map;
    }),
  );

  // Bug 5: Sort items by chain order. Items are grouped into undone/done buckets
  // first, then within each bucket sorted by their position in the task.next chain.
  // Orphan items (no taskNodeId) go at the end of each bucket in insertion order.
  const chainIndex = useBoardStore(useShallow((s) => s.selectTaskChain()));

  const sortByChain = (bucket: TodoItem[]): TodoItem[] => {
    // Build a task-nodeId → chain-position map by walking the chain index.
    // A root is a task with no predecessor in the chain index.
    const taskIds = bucket.map((i) => i.taskNodeId).filter((id): id is string => id !== null);
    const taskIdSet = new Set(taskIds);

    // Find roots: task nodes in our bucket that have no prev in the chain index,
    // or whose prev is not also in our bucket.
    const roots = taskIds.filter((id) => {
      const entry = chainIndex.get(id);
      return !entry || !entry.prev || !taskIdSet.has(entry.prev);
    });

    const visited = new Set<string>();
    const ordered: TodoItem[] = [];

    const emit = (taskNodeId: string) => {
      if (visited.has(taskNodeId)) return;
      visited.add(taskNodeId);
      const item = bucket.find((i) => i.taskNodeId === taskNodeId);
      if (item) ordered.push(item);
      // Follow the next pointer within the same bucket
      const entry = chainIndex.get(taskNodeId);
      if (entry?.next && taskIdSet.has(entry.next)) {
        emit(entry.next);
      }
    };

    // Sort roots by their original bucket index for deterministic ordering
    const rootsSorted = roots.slice().sort((a, b) => {
      const ai = bucket.findIndex((i) => i.taskNodeId === a);
      const bi = bucket.findIndex((i) => i.taskNodeId === b);
      return ai - bi;
    });

    for (const root of rootsSorted) {
      emit(root);
    }

    // Any remaining items not yet visited (orphans without taskNodeId, or disconnected)
    for (const item of bucket) {
      if (!item.taskNodeId || !visited.has(item.taskNodeId)) {
        ordered.push(item);
      }
    }

    return ordered;
  };

  const undoneBucket = rawItems.filter((i) => !i.done);
  const doneBucket = rawItems.filter((i) => i.done);
  const items = sortByChain(undoneBucket);
  const doneItems = sortByChain(doneBucket);

  // PR8 — count items whose scheduled-end has passed and are still undone.
  // Same isPast rule as the per-row graying below, lifted into a reduce so
  // we can show an overdue badge in the header. Recomputed on every render
  // (cheap — items <= ~50 typical) so it updates with the 60s nowMs tick.
  const overdueCount = items.reduce<number>((acc, item) => {
    if (item.done) return acc;
    const sched = item.taskNodeId !== null
      ? taskScheduledInfo.get(item.taskNodeId)
      : item.scheduledFor
        ? { scheduledFor: item.scheduledFor, durationMin: 25 }
        : undefined;
    const isPast = sched !== undefined
      && new Date(sched.scheduledFor).getTime() + sched.durationMin * 60_000 <= nowMs;
    return isPast ? acc + 1 : acc;
  }, 0);

  const undoneCount = buckets.active.length;

  const submitTask = (name: string, durationMin: number | null) => {
    // Time is optional — no duration → an open-ended task.
    onCommand('todo.add', durationMin === null ? { text: name } : { text: name, durationMin });
    setPendingName('');
    setDurationValue('');
    setDurationInvalid(false);
    setInputPhase('name');
    // NF3: re-focus after submit so successive entries require no click
    setInputFocused(true);
  };

  // Quick add: "Call mom tomorrow at 5pm" → the day, time and length are read
  // from the words, shown under the field, and applied on Enter.
  const quickSubmit = (q: QuickAdd) => {
    onCommand('todo.add', q.durationMin ? { text: q.text, durationMin: q.durationMin } : { text: q.text });
    const st = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as TodoState | undefined;
    const item = [...(st?.items ?? [])].filter((i) => i.text === q.text && !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (item) {
      if (q.time && q.day && item.taskNodeId) void scheduleTaskAt(item.taskNodeId, `${q.day}T${q.time}`);
      else if (q.day && !q.time) onCommand('todo.setDue', { id: item.id, dueOn: q.day });
      if (q.repeat) onCommand('todo.setRepeat', { id: item.id, repeat: q.repeat });
    }
    setPendingName('');
    setInputPhase('name');
    setInputFocused(true);
  };

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (inputPhase === 'name') {
      if (e.key === 'Enter') {
        const name = pendingName.trim();
        const q = name ? parseQuickAdd(name) : null;
        if (q && (q.time || q.day || q.durationMin || q.repeat)) { quickSubmit(q); return; }
        if (name) {
          setInputPhase('duration');
          setDurationValue('');
          setDurationInvalid(false);
          // focus is preserved on the same element since type changes
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      } else if (e.key === 'Escape') {
        setPendingName('');
        setInputFocused(false);
        setInputPhase('name');
      }
    } else {
      // duration phase
      if (e.key === 'Enter') {
        if (durationValue.trim() === '') {
          submitTask(pendingName, null);
          return;
        }
        const parsed = parseInt(durationValue, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 480) {
          setDurationInvalid(false);
          submitTask(pendingName, parsed);
        } else {
          setDurationInvalid(true);
        }
      } else if (e.key === 'Escape') {
        // go back to name phase, restoring pendingName
        setInputPhase('name');
        setDurationValue('');
        setDurationInvalid(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  // Escape unmounts an edit input, and its blur would commit what was typed.
  const editCancelledRef = useRef(false);

  const startEdit = (id: string, text: string) => {
    editCancelledRef.current = false;
    setEditingId(id);
    setEditValue(text);
  };

  const commitEdit = () => {
    if (editingId !== null && !editCancelledRef.current) {
      const trimmed = editValue.trim();
      if (trimmed) {
        onCommand('todo.edit', { id: editingId, text: trimmed });
      }
      setEditingId(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    editCancelledRef.current = true;
    setEditingId(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const startTimeEdit = (itemId: string, taskNodeId: string) => {
    const current = taskPlannedMin.get(taskNodeId) ?? 25;
    editCancelledRef.current = false;
    setEditingTimeId(itemId);
    setTimeValue(String(current));
    setTimeInvalid(false);
  };

  /** False when the value is invalid (the field stays open, marked red). */
  const commitTimeEdit = (): boolean => {
    if (editingTimeId === null || editCancelledRef.current) return true;
    // Whole minutes only: "2.5" is rejected, not silently read as 2.
    const parsed = Number(timeValue.trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 480) {
      setTimeInvalid(true);
      return false;
    }
    onCommand('todo.setItemPlannedMin', { itemId: editingTimeId, minutes: parsed });
    setEditingTimeId(null);
    setTimeValue('');
    setTimeInvalid(false);
    return true;
  };

  const cancelTimeEdit = () => {
    editCancelledRef.current = true;
    setEditingTimeId(null);
    setTimeValue('');
    setTimeInvalid(false);
  };

  const handleTimeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitTimeEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelTimeEdit();
    }
  };

  const handleRowContextMenu = (
    e: MouseEvent,
    itemId: string,
    hasTaskNode: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, itemId, hasTaskNode });
  };

  const buildRowMenuItems = (itemId: string, hasTaskNode: boolean): ContextMenuItem[] => {
    const item = state.items.find((i) => i.id === itemId);
    return [
      {
        label: 'Edit text',
        onSelect: () => {
          if (item) startEdit(itemId, item.text);
        },
      },
      {
        label: 'Edit time',
        // Time lives on the linked task node — no task node, nothing to edit.
        disabled: !hasTaskNode || (item?.done ?? false),
        onSelect: () => {
          if (item?.taskNodeId) startTimeEdit(itemId, item.taskNodeId);
        },
      },
      ...(easy ? [] : [
        {
          label: 'Set tag…',
          onSelect: () => {
            if (ctxMenu) setTagPicker({ x: ctxMenu.x, y: ctxMenu.y, itemId });
          },
        },
        {
          label: 'Start pomo',
          disabled: !hasTaskNode,
          onSelect: () => {
            onCommand('todo.startPomoForItem', { itemId });
          },
        },
      ]),
      ...(item?.taskNodeId && !item.done ? [{
        label: remindByTask[item.taskNodeId] !== undefined ? 'Reminder…' : 'Remind me…',
        onSelect: () => {
          if (ctxMenu && item.taskNodeId) setRemindPick({ x: ctxMenu.x, y: ctxMenu.y, taskId: item.taskNodeId, value: remindByTask[item.taskNodeId] ?? null });
        },
      }] : []),
      ...(item && !item.done && item.droppedAt === undefined ? [{
        label: item.repeat ? `Repeats ${describeTaskRepeat(item.repeat)}…` : 'Repeat…',
        onSelect: () => {
          // "Every <weekday>" offers the plan's own day: its Calendar day, its due day, or today.
          const sched = item.taskNodeId ? taskScheduledInfo.get(item.taskNodeId)?.scheduledFor : item.scheduledFor;
          const day = sched?.slice(0, 10) ?? item.dueOn ?? todayYMD;
          if (ctxMenu) setRepeatPick({ x: ctxMenu.x, y: ctxMenu.y, itemId, weekday: isoDowOfYMD(day) });
        },
      }] : []),
      ...(item && !item.done && item.droppedAt === undefined ? [{
        // A repeating plan is skipped, not ended: the next one is made first
        // (ending the series is "Repeat… → Off").
        label: item.repeat ? 'Skip this time' : 'Drop (not doing it)',
        onSelect: () => {
          // Off the Calendar too: a dropped plan is not "missed". Dropped
          // plans leave the list, so the notice offers UNDO (time put back).
          const taskId = item.taskNodeId;
          const was = taskId ? taskScheduledInfo.get(taskId)?.scheduledFor ?? null : null;
          const repeat = item.repeat;
          const before = new Set(state.items.map((i) => i.id));
          if (repeat) void spawnNextRepeat(itemId); // reads this plan's time before it is unscheduled
          if (taskId) void unscheduleTask(taskId);
          onCommand('todo.drop', { id: itemId });
          revertible(repeat ? `Skipped "${item.text}" this time` : `Dropped "${item.text}"`, () => {
            if (repeat) {
              // Take back the next one that the skip made, and give this one its repeat again.
              const now = (useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as TodoState | undefined)?.items ?? [];
              for (const it of now) if (!before.has(it.id) && it.text === item.text && !it.done) onCommand('todo.remove', { id: it.id });
              onCommand('todo.setRepeat', { id: itemId, repeat });
            }
            onCommand('todo.undrop', { id: itemId });
            if (taskId && was) void scheduleTaskAt(taskId, was);
          });
        },
      }] : []),
      {
        label: item?.dueOn ? 'Change due date…' : 'Due date…',
        disabled: item?.done ?? false,
        onSelect: () => {
          if (ctxMenu) setDuePick({ x: ctxMenu.x, y: ctxMenu.y, itemId });
        },
      },
      {
        label: 'Delete',
        danger: true,
        onSelect: () => removeItem(itemId),
      },
    ];
  };

  // One Todo row — shared by the open list, the Done dropdown and the Archive.
  const renderRow = (item: TodoItem, archived = false) => {
    // Only done rows fade. A task whose planned time passed is missed — it
    // stays fully readable (the overdue dot marks it), as on the Calendar.
    const sched = item.taskNodeId !== null
      ? taskScheduledInfo.get(item.taskNodeId)
      : item.scheduledFor
        ? { scheduledFor: item.scheduledFor, durationMin: 25 }
        : undefined;
    const isPast = sched !== undefined &&
      new Date(sched.scheduledFor).getTime() + sched.durationMin * 60_000 <= nowMs;
    const isGrayed = item.done;
    void isPast;
    return (
    <div
      key={item.id}
      className={`todo-item${item.done ? ' done' : ''}`}
      draggable={true}
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        if (item.done) { e.preventDefault(); return; }
        const durationMin = item.taskNodeId !== null
          ? (taskPlannedMin.get(item.taskNodeId) ?? 25)
          : 25;
        const payload = item.taskNodeId !== null
          ? { taskId: item.taskNodeId, durationMin }
          : { itemId: item.id, durationMin };
        e.dataTransfer.setData('application/krnl-task', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(e.currentTarget, 0, 12);
      }}
      onContextMenu={(e) =>
        handleRowContextMenu(e, item.id, item.taskNodeId !== null)
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 14px',
        opacity: isGrayed ? 0.5 : 1,
        cursor: 'grab',
      }}
    >
      {/* PR8 — rust overdue dot. Only on items whose scheduled end
          has passed and that are still undone. Sits at the start
          of the row so the eye catches it before content. */}
      {/* The slot is kept on every row so the checkboxes line up. */}
      <span
        {...(isPast && !item.done ? { 'aria-label': 'overdue', 'data-testid': `todo-overdue-dot-${item.id}` } : { 'aria-hidden': true })}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isPast && !item.done ? 'var(--rust)' : 'transparent',
          flexShrink: 0,
        }}
      />
      {/* Shared per-task color dot — links this todo row to its
          Calendar block and Clock arc. Only shown when the item
          is bound to an actual task node. */}
      {item.taskNodeId !== null && (
        <span
          data-testid={`todo-color-dot-${item.id}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: toneVarForTask(item.taskNodeId),
            flexShrink: 0,
            opacity: item.done ? 0.4 : 0.95,
          }}
        />
      )}
      {/* F3: checkbox — dispatches todo.toggle.
          Uses a theme-locked dark hex for the done bg + acid border
          + acid checkmark, so the "checked" state reads as a small
          dark chip with a green tick in BOTH light and dark themes.
          Previously `background: var(--ink)` flipped to light/cream
          in dark mode, producing "green-on-white" mis-contrast. */}
      <button
        type="button"
        // Same checkbox as the task card (.task-check in tokens.css), which
        // switches colours per mode — a fixed black fill hid the mark in
        // every light theme.
        className={`todo-check task-check${item.done ? ' todo-check--done task-check--done' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onCommand(item.droppedAt !== undefined ? 'todo.undrop' : 'todo.toggle', { id: item.id });
        }}
        style={{ marginTop: 0 }}
        aria-label={archived ? 'Restore to list' : item.done ? 'Mark undone' : 'Mark done'}
        title={archived ? 'Restore to list' : undefined}
      >
        {item.done && (
          <span className="task-check__mark"><LineGlyph name="check" size={12} weight={3} /></span>
        )}
      </button>

      {/* F3/F5: text — strikethrough when done, double-click enters edit mode */}
      {editingId === item.id ? (
        <input
          type="text"
          value={editValue}
          autoFocus
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--ink-3)',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--ink)',
            caretColor: 'var(--acid)',
            padding: '1px 0',
          }}
        />
      ) : (
        <span
          className="todo-text"
          onDoubleClick={() => !item.done && startEdit(item.id, item.text)}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            // A long title shrinks (ellipsis) so the buttons after it stay in
            // the window — but never below a readable start (see todo-item CSS).
            minWidth: 72,
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: item.done ? 'var(--ink-4)' : 'var(--ink)',
            textDecorationLine: item.done ? 'line-through' : 'none',
            textDecorationColor: 'var(--ink-4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            // Text cursor: double-click edits. A single click does nothing (it
            // would fire on every double-click); "Start pomo" is in the row menu.
            cursor: item.done ? 'default' : 'text',
          }}
        >
          {item.text}
          {item.droppedAt !== undefined && (
            <span data-testid={`todo-dropped-${item.id}`} style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', textDecoration: 'none', display: 'inline-block' }}>dropped</span>
          )}
        </span>
      )}

      {/* Review 5.3 / 4.1 — repeats and a reminder: one tight group of small marks. */}
      {!item.done && (item.repeat || (item.taskNodeId !== null && remindByTask[item.taskNodeId] !== undefined)) && (
        <span style={{ display: 'inline-flex', gap: 2, color: 'var(--ink-3)', flexShrink: 0 }}>
          {item.repeat && (
            <span data-testid={`todo-repeat-${item.id}`} title={`Repeats ${describeTaskRepeat(item.repeat)} — tick it off and the next one appears`} style={{ display: 'inline-flex' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" /></svg>
            </span>
          )}
          {item.taskNodeId !== null && remindByTask[item.taskNodeId] !== undefined && (
            <span data-testid={`todo-remind-${item.id}`} title={`Reminder ${remindByTask[item.taskNodeId] === 0 ? 'at the start' : `${remindByTask[item.taskNodeId]} min before`}`} style={{ display: 'inline-flex' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></svg>
            </span>
          )}
        </span>
      )}
      {/* Review 2.1 — the deadline, apart from when it is planned. */}
      {item.dueOn && !item.done && (() => {
        const d = dueLabel(item.dueOn, todayYMD);
        const col = d.tone === 'over' ? 'var(--rust)' : d.tone === 'today' ? 'var(--acid-ink, var(--acid))' : d.tone === 'soon' ? 'var(--ink-2)' : 'var(--ink-3)';
        return (
          <button
            type="button"
            data-testid={`todo-due-${item.id}`}
            title={`Due ${new Date(`${item.dueOn}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · click to change`}
            onClick={(e) => { e.stopPropagation(); setDuePick({ x: e.clientX, y: e.clientY, itemId: item.id }); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0, height: 18, padding: '0 6px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: d.tone === 'over' || d.tone === 'today' ? 650 : 500,
              border: `1px solid color-mix(in srgb, ${col} 55%, transparent)`, background: 'transparent', color: col,
            }}
          >
            {d.text.startsWith('due ') ? <><span className="todo-due-word">due </span>{d.text.slice(4)}</> : d.text}
          </button>
        );
      })()}

      {/* Three-numbers display: work / break / total (mono, right-aligned).
          Only shown when item is wired to a task node (has taskNodeId).
          Replaced by a numeric input when this row's time is being edited. */}
      {item.taskNodeId !== null && (
        editingTimeId === item.id ? (
          <input
            type="number"
            min={0}
            max={480}
            title={timeInvalid ? 'Whole minutes from 0 to 480 (0 = no set time)' : 'Minutes (0 = no set time)'}
            aria-invalid={timeInvalid}
            value={timeValue}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setTimeValue(e.target.value);
              setTimeInvalid(false);
            }}
            onKeyDown={handleTimeKeyDown}
            // Leaving an invalid value abandons the edit instead of leaving a
            // red field open with nothing focused.
            onBlur={() => { if (!commitTimeEdit()) cancelTimeEdit(); }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              width: 56,
              background: 'var(--paper-2)',
              border: `1px solid ${timeInvalid ? 'var(--rust)' : 'var(--ink-3)'}`,
              borderRadius: 3,
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-3)',
              textAlign: 'right',
              padding: '1px 4px',
            }}
          />
        ) : (() => {
          const planned = taskPlannedMin.get(item.taskNodeId) ?? 25;
          const trackedMin = Math.round((trackedSecByTask.get(item.taskNodeId) ?? 0) / 60);
          const openTime = taskOpenKeys.includes(item.taskNodeId);
          const kind = taskKindMap.get(item.taskNodeId) ?? 'focus';
          const bd = kind === 'event'
            ? { workMin: planned, breakMin: 0, effectiveMin: planned }
            : breakdownPomoTime(planned, 0, pomoConfig);
          return (
            <span
              data-testid="todo-item-breakdown"
              title={`${trackedMin > 0 ? `tracked ${fmtTodoMin(trackedMin)} · ` : ''}planned: work ${bd.workMin}m · break ${bd.breakMin}m · total ${bd.effectiveMin}m${item.done ? '' : ' · click to change the estimate'}`}
              onClick={item.done || item.taskNodeId === null ? undefined : (e) => { e.stopPropagation(); startTimeEdit(item.id, item.taskNodeId as string); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                cursor: item.done ? 'default' : 'pointer',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--ink-3)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              {/* #207 — one readable figure: tracked / planned once anything is tracked. */}
              {trackedMin > 0 && (
                <span data-testid="todo-item-tracked" style={{ color: !openTime && trackedMin > bd.effectiveMin ? 'color-mix(in srgb, var(--rust) 72%, var(--ink))' : 'var(--ink-2)' }}>
                  <SettingsIcon name="clock" size={11} /> {fmtTodoMin(trackedMin)}{!openTime && <span style={{ color: 'var(--ink-3)' }}> / </span>}
                </span>
              )}
              {openTime
                ? (trackedMin > 0 ? null : <span style={{ color: 'var(--ink-3)' }}>open</span>)
                : <span style={{ color: 'var(--ink-3)' }}>{fmtTodoMin(bd.effectiveMin)}</span>}
            </span>
          );
        })()
      )}

      {/* F2 / ADR 0016: tag pill — click to re-tag. A dashed border marks
          a tag the classifier guessed; solid means the user chose it.
          Untagged rows get a faint "+" so there's always a way in. */}
      {!easy && (() => {
        const disp = item.tag !== undefined ? tagDisplay(tagLibrary, item.tag) : null;
        const isAuto = item.tagSource === 'auto';
        return (
          <button
            type="button"
            className="todo-tag"
            data-testid={`todo-tag-${item.id}`}
            title={disp ? `${disp.label}${isAuto ? ' (auto — click to change)' : ''}` : 'Add a tag'}
            onClick={(e) => {
              e.stopPropagation();
              setTagPicker({ x: e.clientX, y: e.clientY, itemId: item.id });
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              // Same chip as the task card: the tag's colour, tinted; text mixed toward ink.
              color: disp ? `color-mix(in srgb, ${disp.color} 45%, var(--ink))` : 'var(--ink-3)',
              background: disp ? `color-mix(in srgb, ${disp.color} 16%, transparent)` : 'transparent',
              border: `1px ${isAuto ? 'dashed' : 'solid'} ${disp ? (isAuto ? `color-mix(in srgb, ${disp.color} 55%, transparent)` : 'transparent') : 'transparent'}`,
              padding: '1px 8px',
              borderRadius: 999,
              letterSpacing: '0.01em',
              maxWidth: 96,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              lineHeight: '15px',
            }}
          >
            {disp ? (
              <>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: disp.color, flexShrink: 0 }} />
                <span className="todo-tag__label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{disp.label}</span>
              </>
            ) : '+'}
          </button>
        );
      })()}

      {/* engagement.md F14 — PLAN shows how to drag the row onto the Calendar. */}
      {!item.done && !archived && !sched && (
        <button
          type="button"
          className="todo-plan"
          data-testid={`todo-plan-${item.id}`}
          title="Plan it: drag it onto the Calendar"
          aria-label={`Plan: ${item.text}`}
          onClick={(e) => {
            e.stopPropagation();
            showPlanGuide({ mode: 'plan', itemId: item.id, taskId: item.taskNodeId, text: item.text });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, height: 19, padding: '0 7px',
            borderRadius: 999, border: '1px solid var(--paper-3)', background: 'transparent', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink-3)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
          <span className="todo-plan__label">PLAN</span>
        </button>
      )}

      {/* Delete — hover-revealed */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          removeItem(item.id);
        }}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-4)',
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          opacity: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--rust)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-4)';
        }}
        aria-label={`Delete: ${item.text}`}
      >
        <LineGlyph name="close" size={11} />
      </button>
    </div>
    );
  };

  return (
    <MotherFrame nodeId={node.id} slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} position={node.position}>
      <div style={{ overflow: 'hidden', borderRadius: 6, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Header — F7: shows "Todos (N)" with reactive undone count */}
        <div className="krnl-node-header"
          style={{
            padding: '7px 10px 6px',
            borderBottom: '1px solid var(--paper-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span data-testid="todo-header">
            <span style={{ color: 'var(--cyan)' }}><LineGlyph name="dot" size={10} /></span>
            {` Todos (${undoneCount})`}
            {/* PR8 — overdue count badge in rust. Only visible when at least
                one undone item's scheduled-end has passed. */}
            {overdueCount > 0 && (
              <span
                data-testid="todo-overdue-badge"
                style={{
                  // Mixed toward the ink: darker on paper, lighter on dark — 4.5:1 in both themes.
                  color: 'color-mix(in srgb, var(--rust) 78%, var(--ink))',
                  marginLeft: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.02em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  textTransform: 'none',
                }}
              >
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }} />
                {overdueCount} overdue
              </span>
            )}
          </span>
          {/* One Done list (engagement.md F7): no "archive" step in the UI.
              Today's done items sit in "Done today"; earlier days fold below.
              `todo.archiveDone` stays for the CLI. */}
        </div>

        {/* Item list */}
        {/* No scrolling: rows that don't fit go to the next page (PagedView). */}
        {/* Opening "Done today" shows the page it is on, so its rows never land
            unseen on the next page (the header with empty space under it). */}
        <PagedView testId="todo-pages" itemSelector=".todo-body > *" revealSelector={doneOpen ? '.todo-item.done' : null} style={{ flex: '1 1 0', minHeight: 0 }} contentStyle={{ padding: '6px 0' }}>
          <div className="todo-body" style={{ display: 'contents' }}>
          {items.length === 0 ? (
            <div
              style={{
                padding: '10px 14px',
                color: 'var(--ink-4)',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {doneItems.length > 0 || buckets.archived.length > 0 ? 'All clear' : (
                <span data-testid="todo-empty-hint" style={{ lineHeight: 1.5 }}>
                  Nothing planned yet. Type something you want to get done below and press Enter. Say when as you type ("Gym tomorrow 18:00 1h") and it goes straight onto the Calendar; or drag it there later.
                </span>
              )}
            </div>
          ) : (
            items.map((item) => renderRow(item))
          )}

          {/* ADR 0016 — Done dropdown: today's completed items. */}
          {doneItems.length > 0 && (
            <>
              <SectionToggle
                testId="todo-done-toggle"
                label="Done today"
                count={doneItems.length}
                open={doneOpen}
                onToggle={() => setDoneOpen((o) => !o)}
              />
              {doneOpen && doneItems.map((item) => renderRow(item))}
            </>
          )}

          {/* engagement.md F7 — only today's Done shows here. Done items from
              earlier days stay in the data (Analytics, \`todo list --archived\`). */}
          </div>
        </PagedView>

        {/* Quick add: what Enter will do with the words typed so far. */}
        {inputFocused && inputPhase === 'name' && (() => {
          const q = pendingName.trim() ? parseQuickAdd(pendingName.trim()) : null;
          const said = q ? describeQuickAdd(q) : null;
          if (!q || !said) return null;
          return (
            <div data-testid="todo-quick-preview" style={{ padding: '6px 14px 0', borderTop: '1px dashed var(--paper-3)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
              <span style={{ color: 'var(--ink)' }}>{q.text}</span> → <span style={{ color: 'var(--acid-ink, var(--acid))' }}>{said}</span>
              {q.rolledToTomorrow ? <span> (that time has passed today)</span> : null}
              {q.day && !q.time ? <span> · shows on that day in the Calendar; drag it into the hours for a time</span> : null}
            </div>
          );
        })()}

        {/* engagement.md F13 — one-tap guesses while asking "how long?".
            mousedown keeps the input focused (its blur would cancel the add). */}
        {inputFocused && inputPhase === 'duration' && (
          <div
            data-testid="todo-estimate-chips"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 14px 0', borderTop: '1px dashed var(--paper-3)' }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginRight: 2 }}>
              how long? (your guess)
            </span>
            {([15, 30, 60, 120] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`todo-estimate-${m}`}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); submitTask(pendingName.trim(), m); }}
                style={{
                  height: 24, padding: '0 10px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                }}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        )}

        {/* F4: add-task row — "add task" placeholder swaps to input on click, ↵ always visible */}
        <div
          className="todo-add"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--ink-4)',
            fontFamily: 'var(--font-mono)',
            borderTop: '1px dashed var(--paper-3)',
          }}
        >
          {inputFocused ? (
            <input
              ref={inputRef}
              type={inputPhase === 'duration' ? 'number' : 'text'}
              min={inputPhase === 'duration' ? 1 : undefined}
              max={inputPhase === 'duration' ? 480 : undefined}
              value={inputPhase === 'name' ? pendingName : durationValue}
              onChange={(e) => {
                if (inputPhase === 'name') {
                  setPendingName(e.target.value);
                } else {
                  setDurationValue(e.target.value);
                  setDurationInvalid(false);
                }
              }}
              onKeyDown={handleAddKeyDown}
              onBlur={() => {
                if (inputPhase === 'duration') {
                  // defensive: revert to name phase without submitting
                  setInputPhase('name');
                  setDurationValue('');
                  setDurationInvalid(false);
                } else {
                  // name phase: collapse if empty
                  if (!pendingName.trim()) {
                    setInputFocused(false);
                  }
                }
              }}
              autoFocus
              placeholder={inputPhase === 'name' ? 'What do you want to get done? (e.g. Gym tomorrow 18:00 1h)' : 'or type minutes — Enter to skip'}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--ink)',
                caretColor: 'var(--acid)',
                ...(durationInvalid ? { borderBottom: '1px solid var(--rust)' } : {}),
              }}
            />
          ) : (
            <span
              data-testid="add-task-placeholder"
              onClick={() => setInputFocused(true)}
              style={{ flex: 1, cursor: 'text' }}
            >
              add task
            </span>
          )}
          {/* F4b: ↵ hint always visible */}
          <span
            data-testid="enter-hint"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-4)',
              background: 'var(--paper-2)',
              border: '1px solid var(--paper-3)',
              padding: '1px 4px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            ↵
          </span>
        </div>
      </div>

      {/* Row context menu — rendered outside item list so it escapes overflow:hidden */}
      {ctxMenu !== null && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildRowMenuItems(ctxMenu.itemId, ctxMenu.hasTaskNode)}
          onDismiss={() => setCtxMenu(null)}
        />
      )}

      {/* ADR 0016 — tag picker (portal, like the context menu). */}
      {repeatPick !== null && (
        <TaskRepeatPicker
          x={repeatPick.x}
          y={repeatPick.y}
          weekday={repeatPick.weekday}
          value={parseRepeat(state.items.find((i) => i.id === repeatPick.itemId)?.repeat)}
          onPick={(r) => { onCommand('todo.setRepeat', { id: repeatPick.itemId, repeat: r }); setRepeatPick(null); }}
          onClose={() => setRepeatPick(null)}
        />
      )}
      {remindPick !== null && (
        <RemindPicker
          x={remindPick.x}
          y={remindPick.y}
          value={remindPick.value}
          onPick={(min) => { void setTaskReminder(remindPick.taskId, min); setRemindPick(null); }}
          onClose={() => setRemindPick(null)}
        />
      )}
      {duePick !== null && (
        <DuePicker
          x={duePick.x}
          y={duePick.y}
          today={todayYMD}
          value={state.items.find((i) => i.id === duePick.itemId)?.dueOn ?? null}
          onPick={(dueOn) => { onCommand('todo.setDue', { id: duePick.itemId, dueOn }); setDuePick(null); }}
          onClose={() => setDuePick(null)}
        />
      )}
      {tagPicker !== null && (() => {
        const item = state.items.find((i) => i.id === tagPicker.itemId);
        if (!item) return null;
        return (
          <TagPicker
            x={tagPicker.x}
            y={tagPicker.y}
            item={item}
            state={state}
            onPick={(tag) => onCommand('todo.setItemTag', { id: item.id, tag })}
            onDismiss={() => setTagPicker(null)}
          />
        );
      })()}
    </MotherFrame>
  );
}

/** Collapsible section header for the Done / Archive dropdowns. */
function SectionToggle({
  label,
  count,
  open,
  onToggle,
  testId,
  action,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  testId: string;
  action?: { label: string; testId: string; onSelect: () => void } | undefined;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 14px 3px',
        marginTop: 4,
        borderTop: '1px solid var(--paper-3)',
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}><LineGlyph name="chevron" size={9} /></span>
        {label} ({count})
      </button>
      {action && (
        <button
          type="button"
          data-testid={action.testId}
          onClick={(e) => { e.stopPropagation(); action.onSelect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Delete earlier days' done items for good (analytics keeps their history)"
          style={{
            background: 'transparent',
            border: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-4)',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            padding: '0 2px',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** "45m" / "1h20" — compact for the Todo row. */
function fmtTodoMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
