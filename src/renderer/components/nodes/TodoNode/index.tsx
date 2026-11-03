import { useState, useRef, useEffect } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TodoConfig, TodoItem, TodoState } from './types';
import { todoBuckets, todoReclassify, todoTagLibrary, visibleItems } from './commands';
import { tagDisplay } from '../../../../shared/tags/classify';
import { useEasyMode } from '../../../store/uiMode';
import { TagPicker } from './TagPicker';
import { isoToYMD, todayLocal, addDays } from '../../../analytics/dateRange';
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
import { toneVarForTask } from '../../../utils/taskColor';
import { undoable } from '../../../store/undoNotice';

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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [tagPicker, setTagPicker] = useState<{ x: number; y: number; itemId: string } | null>(null);

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
  const hasDone = buckets.done.length > 0;

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

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (inputPhase === 'name') {
      if (e.key === 'Enter') {
        const name = pendingName.trim();
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
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 480) {
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
      {
        label: 'Delete',
        danger: true,
        onSelect: () => removeItem(itemId),
      },
    ];
  };

  // One Todo row — shared by the open list, the Done dropdown and the Archive.
  const renderRow = (item: TodoItem, archived = false) => {
    // Gray out if done OR if the scheduled end has passed.
    const sched = item.taskNodeId !== null
      ? taskScheduledInfo.get(item.taskNodeId)
      : item.scheduledFor
        ? { scheduledFor: item.scheduledFor, durationMin: 25 }
        : undefined;
    const isPast = sched !== undefined &&
      new Date(sched.scheduledFor).getTime() + sched.durationMin * 60_000 <= nowMs;
    const isGrayed = item.done || isPast;
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
      {isPast && !item.done && (
        <span
          aria-label="overdue"
          data-testid={`todo-overdue-dot-${item.id}`}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--rust)',
            flexShrink: 0,
            boxShadow: '0 0 6px rgba(200, 85, 61, 0.45)',
          }}
        />
      )}
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
          onCommand('todo.toggle', { id: item.id });
        }}
        style={{ marginTop: 0 }}
        aria-label={archived ? 'Restore to list' : item.done ? 'Mark undone' : 'Mark done'}
        title={archived ? 'Restore to list' : undefined}
      >
        {item.done && (
          <span className="task-check__mark">✓</span>
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
        </span>
      )}

      {/* Three-numbers display: work / break / total (mono, right-aligned).
          Only shown when item is wired to a task node (has taskNodeId).
          Replaced by a numeric input when this row's time is being edited. */}
      {item.taskNodeId !== null && (
        editingTimeId === item.id ? (
          <input
            type="number"
            min={1}
            max={480}
            title={timeInvalid ? 'Whole minutes from 1 to 480' : 'Minutes (1–480)'}
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
              fontSize: 9.5,
              color: 'var(--ink-3)',
              textAlign: 'right',
              padding: '1px 4px',
            }}
          />
        ) : (() => {
          const planned = taskPlannedMin.get(item.taskNodeId) ?? 25;
          const kind = taskKindMap.get(item.taskNodeId) ?? 'focus';
          const bd = kind === 'event'
            ? { workMin: planned, breakMin: 0, effectiveMin: planned }
            : breakdownPomoTime(planned, 0, pomoConfig);
          return (
            <span
              data-testid="todo-item-breakdown"
              title={`work ${bd.workMin}m · break ${bd.breakMin}m · total ${bd.effectiveMin}m`}
              style={{
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-4)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{bd.workMin}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: 'var(--ink-3)' }}>{bd.breakMin}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: 'var(--acid-ink, var(--acid))' }}>{bd.effectiveMin}m</span>
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
              fontSize: 9,
              color: disp ? 'var(--ink-3)' : 'var(--ink-4)',
              background: disp ? 'var(--paper-2)' : 'transparent',
              border: `1px ${isAuto ? 'dashed' : 'solid'} ${disp ? 'var(--paper-3)' : 'transparent'}`,
              padding: '0 5px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              maxWidth: 84,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              opacity: disp ? 1 : 0.6,
              lineHeight: '14px',
            }}
          >
            {disp ? (
              <>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: disp.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{disp.label}</span>
              </>
            ) : '+'}
          </button>
        );
      })()}

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
          fontSize: 10,
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
        ✕
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
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span data-testid="todo-header">
            <span style={{ color: 'var(--cyan)' }}>●</span>
            {` Todos (${undoneCount})`}
            {/* PR8 — overdue count badge in rust. Only visible when at least
                one undone item's scheduled-end has passed. */}
            {overdueCount > 0 && (
              <span
                data-testid="todo-overdue-badge"
                style={{
                  color: 'var(--rust)',
                  marginLeft: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.06em',
                }}
              >
                ● {overdueCount} OVERDUE
              </span>
            )}
          </span>
          {/* F6 / ADR 0016: archive-now button — visible when ≥1 item is in
              Done. Done items archive on their own when the day ends; this
              just does it early. Nothing is deleted. */}
          {hasDone && (
            <button
              type="button"
              data-testid="clear-done-btn"
              title="Move today's done items to the archive"
              onClick={() => onCommand('todo.archiveDone')}
              style={{
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-4)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '0 2px',
              }}
            >
              ARCHIVE DONE
            </button>
          )}
        </div>

        {/* Item list */}
        {/* No scrolling: rows that don't fit go to the next page (PagedView). */}
        <PagedView testId="todo-pages" itemSelector=".todo-body > *" style={{ flex: '1 1 0', minHeight: 0 }} contentStyle={{ padding: '6px 0' }}>
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
              {doneItems.length > 0 || buckets.archived.length > 0 ? 'All clear' : 'No todos yet'}
            </div>
          ) : (
            items.map((item) => renderRow(item))
          )}

          {/* ADR 0016 — Done dropdown: today's completed items. */}
          {doneItems.length > 0 && (
            <>
              <SectionToggle
                testId="todo-done-toggle"
                label="Done"
                count={doneItems.length}
                open={doneOpen}
                onToggle={() => setDoneOpen((o) => !o)}
              />
              {doneOpen && doneItems.map((item) => renderRow(item))}
            </>
          )}

          {/* ADR 0016 — Archive dropdown: done items from earlier days,
              newest first, with a day label whenever the day changes. */}
          {buckets.archived.length > 0 && (
            <>
              <SectionToggle
                testId="todo-archive-toggle"
                label="Archive"
                count={buckets.archived.length}
                open={archiveOpen}
                onToggle={() => setArchiveOpen((o) => !o)}
                action={archiveOpen ? { label: 'CLEAR', testId: 'todo-clear-archive-btn', onSelect: () => undoable(`Cleared ${buckets.archived.length} archived`, () => onCommand('todo.clearArchived')) } : undefined}
              />
              {archiveOpen && buckets.archived.map((item, idx) => {
                const day = item.completedAt ? isoToYMD(item.completedAt) : '';
                const prevDay = idx > 0 ? isoToYMD(buckets.archived[idx - 1]!.completedAt ?? '') : null;
                return (
                  <div key={item.id}>
                    {day !== prevDay && (
                      <div
                        style={{
                          padding: '4px 14px 2px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--ink-4)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {dayLabel(day)}
                      </div>
                    )}
                    {renderRow(item, true)}
                  </div>
                );
              })}
            </>
          )}
          </div>
        </PagedView>

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
              placeholder={inputPhase === 'name' ? 'task → spawns a node…' : 'how long? (min, optional — Enter to skip)'}
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
              fontSize: 10,
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

/** "Today" / "Yesterday" / "Mon 3 Nov" for an archive day header. */
function dayLabel(ymd: string): string {
  if (!ymd) return '';
  const today = todayLocal();
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, -1)) return 'Yesterday';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
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
          fontSize: 9.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>▸</span>
        {label} ({count})
      </button>
      {action && (
        <button
          type="button"
          data-testid={action.testId}
          onClick={(e) => { e.stopPropagation(); action.onSelect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Delete archived items for good (analytics keeps their history)"
          style={{
            background: 'transparent',
            border: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
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
