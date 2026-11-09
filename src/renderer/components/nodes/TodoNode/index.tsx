import { useState, useRef, useEffect, useMemo } from 'react';
import { useDismissOutside } from '../../ui/useDismissOutside';
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
import { WhenPopover, dayWord, fmtLength, type WhenValue } from '../../ui/WhenPopover';
import { MenuIcon } from '../../ui/menuIcons';
import { dueLabel } from '../../../../shared/due';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { scheduleTaskAt, setTaskReminder, showTask, unscheduleTask } from '../../../store/scheduleActions';
import { parseQuickAdd, type QuickAdd } from '../../../../shared/quickAdd';
import { effectiveDraft, type PlanDraft, type PlanOverrides } from './PlanAddCard';


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
  // Decision 40 — the When popover (When tab or Deadline tab), from the row,
  // its menu or its When / Deadline text.
  const [whenPick, setWhenPick] = useState<{ x: number; y: number; itemId: string; tab: 'when' | 'deadline' } | null>(null);
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

  // The timer item in the row menu follows the timer: mode, and what it runs on.
  const pomoRun = useBoardStore(useShallow((s) => {
    const st = s.board?.nodes.find((n) => n.kind === 'pomo')?.state as { status?: string; activeTaskId?: string | null } | undefined;
    return { running: !!st && st.status !== 'idle' && st.status !== 'done', taskId: st?.activeTaskId ?? null };
  }));

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
  // Decision 40 — the add card: what the card set wins over the words.
  const [planOv, setPlanOv] = useState<PlanOverrides>({});
  const addRowRef = useRef<HTMLDivElement>(null);
  // A click elsewhere hides the add card; the typed name stays in the field,
  // and the card comes back when you click it or type again.
  const [addCardHidden, setAddCardHidden] = useState(false);
  useDismissOutside(inputFocused && pendingName.trim() !== '' && !addCardHidden, ['[data-testid="when-popover"]', addRowRef], () => setAddCardHidden(true));
  // Easy: "by fri" sets no deadline (easy-mode D19).
  const fromWords = (q: QuickAdd): PlanDraft => ({ day: q.day ?? null, time: q.time ?? null, lengthMin: q.durationMin ?? null, deadline: easy ? null : q.deadline ?? null });
  const addPlan = (text: string, d: PlanDraft) => {
    onCommand('todo.add', d.lengthMin ? { text, durationMin: d.lengthMin } : { text });
    const st = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as TodoState | undefined;
    const item = [...(st?.items ?? [])].filter((i) => i.text === text && !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (item) {
      if (d.day && d.time && item.taskNodeId) {
        const taskId = item.taskNodeId;
        const remind = d.remindMin ?? null;
        void scheduleTaskAt(taskId, `${d.day}T${d.time}`).then(() => { if (remind !== null) void setTaskReminder(taskId, remind); });
      } else if (d.day) onCommand('todo.setOnDay', { id: item.id, onDay: d.day });
      if (d.deadline) onCommand('todo.setDue', { id: item.id, dueOn: d.deadline });
    }
    setPendingName('');
    setPlanOv({});
    setInputPhase('name');
    setInputFocused(true);
  };
  const addTyped = () => {
    const name = pendingName.trim();
    if (!name) return;
    const q = parseQuickAdd(name);
    const d = effectiveDraft(q.hint ? { day: null, time: null, lengthMin: null, deadline: null } : fromWords(q), planOv);
    if (!d.day && !d.lengthMin && !d.deadline) { submitTask(q.hint ? name : q.text, null); setPlanOv({}); return; }
    addPlan(q.hint ? name : q.text, d);
  };

  const quickSubmit = (q: QuickAdd) => {
    onCommand('todo.add', q.durationMin ? { text: q.text, durationMin: q.durationMin } : { text: q.text });
    const st = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as TodoState | undefined;
    const item = [...(st?.items ?? [])].filter((i) => i.text === q.text && !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (item) {
      if (q.time && q.day && item.taskNodeId) void scheduleTaskAt(item.taskNodeId, `${q.day}T${q.time}`);
      else if (q.day && !q.time) onCommand('todo.setOnDay', { id: item.id, onDay: q.day });
      if (q.deadline) onCommand('todo.setDue', { id: item.id, dueOn: q.deadline });
    }
    setPendingName('');
    setInputPhase('name');
    setInputFocused(true);
  };

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (inputPhase === 'name') {
      if (e.key === 'Enter') {
        // Decision 40 — one step: Enter always adds; what the words said is
        // shown as chips above the field first.
        addTyped();
      } else if (e.key === 'Escape') {
        setPendingName('');
        setPlanOv({});
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

  // Decision 40 — a plan's When and Deadline, read from the board.
  const whenOf = (item: TodoItem): WhenValue => {
    const at = item.taskNodeId ? taskScheduledInfo.get(item.taskNodeId)?.scheduledFor : undefined;
    const open = item.taskNodeId ? taskOpenKeys.includes(item.taskNodeId) : true;
    const planned = item.taskNodeId ? taskPlannedMin.get(item.taskNodeId) : undefined;
    return {
      day: at ? at.slice(0, 10) : item.onDay ?? null,
      time: at ? at.slice(11, 16) : null,
      lengthMin: open || !planned ? null : planned,
      remindMin: item.taskNodeId ? remindByTask[item.taskNodeId] ?? null : null,
      deadline: item.dueOn ?? null,
    };
  };
  /** "16:05" today, "Tue 16:00", "Fri" (any time), or null. */
  const whenText = (w: WhenValue): string | null => {
    if (!w.day) return null;
    if (w.time) return w.day === todayYMD ? w.time : `${dayWord(w.day, todayYMD)} ${w.time}`;
    return dayWord(w.day, todayYMD);
  };
  const applyWhen = (item: TodoItem, prev: WhenValue, next: WhenValue) => {
    if (next.deadline !== prev.deadline) onCommand('todo.setDue', { id: item.id, dueOn: next.deadline });
    if (next.lengthMin !== prev.lengthMin && item.taskNodeId) onCommand('todo.setItemPlannedMin', { itemId: item.id, minutes: next.lengthMin ?? 0 });
    if (next.day !== prev.day || next.time !== prev.time) {
      if (next.day && next.time && item.taskNodeId) void scheduleTaskAt(item.taskNodeId, `${next.day}T${next.time}`);
      else {
        if (prev.time && item.taskNodeId) void unscheduleTask(item.taskNodeId);
        onCommand('todo.setOnDay', { id: item.id, onDay: next.day });
      }
    }
    if (item.taskNodeId && next.remindMin !== prev.remindMin) void setTaskReminder(item.taskNodeId, next.time ? next.remindMin : null);
  };
  const openWhen = (e: { clientX: number; clientY: number }, itemId: string, tab: 'when' | 'deadline' = 'when') =>
    setWhenPick({ x: e.clientX, y: e.clientY, itemId, tab });

  const buildRowMenuItems = (itemId: string, hasTaskNode: boolean): ContextMenuItem[] => {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return [];
    const at = ctxMenu ?? { x: 0, y: 0 };
    const rename: ContextMenuItem = { label: 'Rename', icon: <MenuIcon name="rename" />, onSelect: () => startEdit(itemId, item.text) };
    const del: ContextMenuItem = { label: 'Delete', icon: <MenuIcon name="delete" />, danger: true, onSelect: () => removeItem(itemId) };
    if (item.droppedAt !== undefined) {
      return [{ label: 'Bring back', icon: <MenuIcon name="undo" />, onSelect: () => onCommand('todo.undrop', { id: itemId }) }, { ...del, divider: true }];
    }
    if (item.done) {
      return [{ label: 'Not done yet', icon: <MenuIcon name="undo" />, onSelect: () => onCommand('todo.toggle', { id: itemId }) }, rename, { ...del, divider: true }];
    }
    const w = whenOf(item);
    // The timer item follows the timer (Pomo or Observe) and what it runs on.
    const observe = pomoConfig.mode === 'observe';
    const onThis = pomoRun.running && item.taskNodeId !== null && pomoRun.taskId === item.taskNodeId;
    const timer: ContextMenuItem = onThis
      ? { label: 'On the timer now', icon: <MenuIcon name={observe ? 'observe' : 'play'} />, disabled: true, onSelect: () => {} }
      : pomoRun.running
        ? { label: 'Switch timer to it', icon: <MenuIcon name="convert" />, onSelect: () => onCommand('todo.startPomoForItem', { itemId }) }
        : observe
          ? { label: 'Track it now', icon: <MenuIcon name="observe" />, onSelect: () => onCommand('todo.startPomoForItem', { itemId }) }
          : { label: 'Focus on it', icon: <MenuIcon name="play" />, hint: `${pomoConfig.sessionMin} min`, onSelect: () => onCommand('todo.startPomoForItem', { itemId }) };
    const tagLabel = item.tag !== undefined ? tagDisplay(tagLibrary, item.tag).label : undefined;
    // The eye: its card on the canvas and its place on the Calendar, at once.
    const taskId = item.taskNodeId;
    const show: ContextMenuItem[] = taskId ? [
      { label: 'Show', icon: <MenuIcon name="show" />, hint: w.day ? 'card + Calendar' : 'card', divider: true, onSelect: () => { void showTask(taskId); } },
    ] : [];
    return [
      { label: 'When…', icon: <MenuIcon name="when" />, ...(whenText(w) ? { hint: whenText(w)! } : {}), onSelect: () => openWhen({ clientX: at.x, clientY: at.y }, itemId) },
      // easy-mode D19 — Deadline is Advanced (one date per plan in Easy).
      ...(easy ? [] : [{ label: 'Deadline…', icon: <MenuIcon name="deadline" />, ...(w.deadline ? { hint: dayWord(w.deadline, todayYMD) } : {}), onSelect: () => openWhen({ clientX: at.x, clientY: at.y }, itemId, 'deadline') }]),
      ...show,
      ...(easy ? [] : [
        ...(hasTaskNode ? [{ ...timer, divider: true }] : []),
        { label: 'Tag…', icon: <MenuIcon name="tag" />, ...(tagLabel ? { hint: tagLabel } : {}), ...(hasTaskNode ? {} : { divider: true }), onSelect: () => setTagPicker({ x: at.x, y: at.y, itemId }) },
      ]),
      { ...rename, ...(easy ? { divider: true } : {}) },
      {
        label: "Won't do",
        icon: <MenuIcon name="drop" />,
        divider: true,
        onSelect: () => {
          // Off the Calendar too: a dropped plan is not "missed". Dropped
          // plans leave the list, so the notice offers UNDO (time put back).
          const taskId = item.taskNodeId;
          const was = taskId ? taskScheduledInfo.get(taskId)?.scheduledFor ?? null : null;
          if (taskId) void unscheduleTask(taskId);
          onCommand('todo.drop', { id: itemId });
          revertible(`Won't do "${item.text}"`, () => {
            onCommand('todo.undrop', { id: itemId });
            if (taskId && was) void scheduleTaskAt(taskId, was);
          });
        },
      },
      del,
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
      data-item-id={item.id}
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
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '2px 8px',
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
            // Decision 40 — a long name wraps at word breaks; the meta moves
            // under it as one group. Nothing is cut off.
            flex: '1 1 120px',
            minWidth: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: item.done ? 'var(--ink-4)' : 'var(--ink)',
            textDecorationLine: item.done ? 'line-through' : 'none',
            textDecorationColor: 'var(--ink-4)',
            overflowWrap: 'anywhere',
            // The row moves, so the name shows grab like the rest of it (a text
            // cursor here made the cursor flip as you slid across the row, #226).
            // Double-click renames; the tooltip says so.
            cursor: 'inherit',
          }}
          title={item.done ? undefined : 'Double-click to rename'}
        >
          {item.text}
          {item.droppedAt !== undefined && (
            <span data-testid={`todo-dropped-${item.id}`} style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', textDecoration: 'none', display: 'inline-block' }}>won't do</span>
          )}
        </span>
      )}

      {/* The meta and the tag travel together: one group that moves under the name when narrow. */}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: '100%' }}>
      {/* Decision 40 — one meta group: When · Deadline · length · reminder.
          It wraps under the name as a whole when the row is narrow; nothing is cut. */}
      {!item.done && (() => {
        const w = whenOf(item);
        const wt = whenText(w);
        const overdue = (isPast && !!w.time) || (!w.time && !!w.day && w.day < todayYMD);
        const dl = w.deadline ? dueLabel(w.deadline, todayYMD) : null;
        const lateForDeadline = !!(w.deadline && w.day && w.day > w.deadline);
        const dlCol = !dl ? '' : dl.tone === 'over' || lateForDeadline ? 'var(--rust)' : dl.tone === 'today' ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)';
        const planned = item.taskNodeId !== null ? taskPlannedMin.get(item.taskNodeId) ?? 25 : 25;
        const trackedMin = item.taskNodeId !== null ? Math.round((trackedSecByTask.get(item.taskNodeId) ?? 0) / 60) : 0;
        const openTime = item.taskNodeId === null || taskOpenKeys.includes(item.taskNodeId);
        const kind = item.taskNodeId !== null ? taskKindMap.get(item.taskNodeId) ?? 'focus' : 'focus';
        const bd = kind === 'event' ? { workMin: planned, breakMin: 0, effectiveMin: planned } : breakdownPomoTime(planned, 0, pomoConfig);
        const parts: Array<{ key: string; el: JSX.Element }> = [];
        if (wt) parts.push({ key: 'when', el: (
          <button type="button" data-testid={`todo-when-${item.id}`} title={w.time ? 'When · click to change' : 'Any time that day · click to change'}
            onClick={(e) => { e.stopPropagation(); openWhen(e, item.id); }} onMouseDown={(e) => e.stopPropagation()}
            style={{ ...metaBtn, color: overdue ? 'var(--rust)' : w.time && w.day === todayYMD ? 'var(--ink)' : 'var(--ink-2)', fontWeight: overdue ? 650 : 500 }}>{wt}</button>
        ) });
        if (dl && w.deadline) parts.push({ key: 'dl', el: (
          <button type="button" data-testid={`todo-due-${item.id}`}
            title={`Deadline ${new Date(`${w.deadline}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${lateForDeadline ? ' · planned after its deadline' : ''} · click to change`}
            onClick={(e) => { e.stopPropagation(); openWhen(e, item.id, 'deadline'); }} onMouseDown={(e) => e.stopPropagation()}
            style={{ ...metaBtn, color: dlCol, fontWeight: dl.tone === 'over' || dl.tone === 'today' ? 650 : 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MenuIcon name="deadline" size={10} />{dayWord(w.deadline, todayYMD)}
          </button>
        ) });
        if (trackedMin > 0 || !openTime) parts.push({ key: 'len', el: (
          <span data-testid="todo-item-breakdown"
            title={`${trackedMin > 0 ? `tracked ${fmtTodoMin(trackedMin)} · ` : ''}${openTime ? 'no length set' : `planned: work ${bd.workMin}m · break ${bd.breakMin}m · total ${bd.effectiveMin}m`}`}
            onClick={(e) => { e.stopPropagation(); openWhen(e, item.id); }} onMouseDown={(e) => e.stopPropagation()}
            style={{ ...metaBtn, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {trackedMin > 0 && (
              <span data-testid="todo-item-tracked" style={{ color: !openTime && trackedMin > bd.effectiveMin ? 'color-mix(in srgb, var(--rust) 72%, var(--ink))' : 'var(--ink-2)' }}>
                <SettingsIcon name="clock" size={11} /> {fmtTodoMin(trackedMin)}{!openTime && <span style={{ color: 'var(--ink-3)' }}> / </span>}
              </span>
            )}
            {!openTime && <span>{fmtTodoMin(bd.effectiveMin)}</span>}
          </span>
        ) });
        if (item.taskNodeId !== null && remindByTask[item.taskNodeId] !== undefined) parts.push({ key: 'rem', el: (
          <span data-testid={`todo-remind-${item.id}`} title={`Reminder ${remindByTask[item.taskNodeId] === 0 ? 'at the start' : `${remindByTask[item.taskNodeId]} min before`}`} style={{ display: 'inline-flex', color: 'var(--ink-3)' }}>
            <MenuIcon name="reminder" size={11} />
          </span>
        ) });
        return (
          <span data-testid={`todo-meta-${item.id}`} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>
            {parts.map((p, i) => (
              <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {i > 0 && <span aria-hidden style={{ color: 'var(--ink-4)' }}>·</span>}
                {p.el}
              </span>
            ))}
            {!wt && !archived && (
              <button type="button" className="todo-when-add" data-testid={`todo-plan-${item.id}`} title="When… (or drag it onto the Calendar)" aria-label={`When: ${item.text}`}
                onClick={(e) => { e.stopPropagation(); openWhen(e, item.id); }} onMouseDown={(e) => e.stopPropagation()}
                style={{ ...metaBtn, color: 'var(--ink-4)', display: 'inline-flex', alignItems: 'center' }}>
                <MenuIcon name="when" size={13} />
              </button>
            )}
          </span>
        );
      })()}

      {/* F2 / ADR 0016: tag pill — click to re-tag. A dashed border marks
          a tag the classifier guessed; solid means the user chose it.
          Untagged rows get a faint "+" so there's always a way in. */}
      {!easy && !item.done && (() => {
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
              color: disp ? `color-mix(in srgb, ${disp.color} 45%, var(--ink))` : 'var(--ink-3)',
              background: disp ? `color-mix(in srgb, ${disp.color} 16%, transparent)` : 'transparent',
              border: `1px ${isAuto ? 'dashed' : 'solid'} ${disp ? (isAuto ? `color-mix(in srgb, ${disp.color} 55%, transparent)` : 'transparent') : 'transparent'}`,
              padding: '1px 8px',
              borderRadius: 999,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              lineHeight: '15px',
            }}
          >
            {disp ? (
              <>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: disp.color, flexShrink: 0 }} />
                <span className="todo-tag__label">{disp.label}</span>
              </>
            ) : '+'}
          </button>
        );
      })()}
      </span>
      {item.done && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
          {item.completedAt ? `done ${new Date(item.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'done'}
        </span>
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
                  Nothing planned. Type a plan below; add a day or a time as you type.
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

        {/* Decision 40 — the add card: while typing, the plan's day, time, length and
            deadline, filled from the words; change any of them, or just press Enter. */}
        {inputFocused && pendingName.trim() !== '' && !addCardHidden && (() => {
          const q = parseQuickAdd(pendingName.trim());
          if (q.hint) {
            return (
              <div data-testid="todo-quick-preview" style={previewLine}>
                <span style={{ color: 'var(--ink-3)' }}>Repeats? Add it in Habits, or on the Calendar (+).</span>
              </div>
            );
          }
          // Decision 40 — the same plan card as a row's When… and a Calendar
          // block, following the words while you type; Add adds.
          const r = addRowRef.current?.getBoundingClientRect();
          const d = effectiveDraft(fromWords(q), planOv);
          const value = { day: d.day, time: d.time, lengthMin: d.lengthMin, deadline: d.deadline, remindMin: d.remindMin ?? null };
          return (
            <WhenPopover
              x={0}
              y={0}
              today={todayYMD}
              value={value}
              title={{ text: q.text }}
              onChange={(next) => {
                const patch: PlanOverrides = {};
                (['day', 'time', 'lengthMin', 'deadline', 'remindMin'] as const).forEach((k) => { if (next[k] !== value[k]) (patch as Record<string, unknown>)[k] = next[k]; });
                setPlanOv((cur) => ({ ...cur, ...patch }));
              }}
              onApply={(next) => addPlan(q.text, { day: next.day, time: next.time, lengthMin: next.lengthMin, deadline: next.deadline, remindMin: next.remindMin })}
              onClose={() => { setPendingName(''); setPlanOv({}); setInputFocused(false); }}
              anchorAbove={r ? { left: r.left + 8, top: r.top } : { left: 8, top: window.innerHeight - 60 }}
              // The card shows the values; the button just says what it does.
              primaryLabel="Add ↵"
            />
          );
        })()}

        {/* F4: add-task row — "add task" placeholder swaps to input on click, ↵ always visible */}
        <div
          className="todo-add"
          ref={addRowRef}
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
              type="text"
              value={pendingName}
              onChange={(e) => {
                if (inputPhase === 'name') {
                  setPendingName(e.target.value);
                  setAddCardHidden(false);
                } else {
                  setDurationValue(e.target.value);
                  setDurationInvalid(false);
                }
              }}
              onKeyDown={handleAddKeyDown}
              onFocus={() => setAddCardHidden(false)}
              onClick={() => setAddCardHidden(false)}
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
              placeholder="Add a plan — try: Gym fri 18:00 1h"
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
              add a plan
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
      {whenPick !== null && (() => {
        const it = state.items.find((i) => i.id === whenPick.itemId);
        if (!it) return null;
        const prev = whenOf(it);
        return (
          <WhenPopover
            x={whenPick.x}
            y={whenPick.y}
            today={todayYMD}
            value={prev}
            tab={whenPick.tab}
            // Decision 40 — the same plan card as a block on the Calendar.
            title={{ text: it.text, ...(it.taskNodeId ? { tone: toneVarForTask(it.taskNodeId) } : {}) }}
            actions={[
              ...(!easy && it.taskNodeId ? [{ key: 'timer', label: pomoConfig.mode === 'observe' ? 'Track it now' : 'Focus on it', icon: (pomoConfig.mode === 'observe' ? 'observe' : 'play') as 'observe' | 'play', onClick: () => { onCommand('todo.startPomoForItem', { itemId: it.id }); setWhenPick(null); } }] : []),
              { key: 'done', label: it.done ? 'Not done yet' : 'Mark done', icon: (it.done ? 'undo' : 'check') as 'undo' | 'check', onClick: () => { onCommand('todo.toggle', { id: it.id }); setWhenPick(null); } },
              ...(it.taskNodeId ? [{ key: 'show', label: 'Show', icon: 'show' as const, onClick: () => { const t = it.taskNodeId!; setWhenPick(null); void showTask(t); } }] : []),
              { key: 'delete', label: 'Delete', icon: 'delete' as const, danger: true, onClick: () => { removeItem(it.id); setWhenPick(null); } },
            ]}
            onApply={(next) => { applyWhen(it, prev, next); setWhenPick(null); }}
            onClose={() => setWhenPick(null)}
          />
        );
      })()}
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

const metaBtn: React.CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap',
};
const previewLine: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '6px 14px 0', borderTop: '1px dashed var(--paper-3)',
  fontFamily: 'var(--font-mono)', fontSize: 11,
};
const previewChip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 10, whiteSpace: 'nowrap',
  background: 'var(--paper-2)', border: '1px solid var(--paper-3)', color: 'var(--ink)', fontSize: 11,
};
