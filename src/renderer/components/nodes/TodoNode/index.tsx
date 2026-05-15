import { useState, useRef, useEffect } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TodoConfig, TodoItem, TodoState } from './types';
import { visibleItems } from './commands';
import { defaultTodoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { ContextMenu } from '../../ContextMenu';
import type { ContextMenuItem } from '../../ContextMenu';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';

export function TodoNode({ node, onCommand, slotIndex = 2, slotTotal = MOTHER_TOTAL, onReorderDrop, onReorderHover, slotCentersX }: NodeProps<TodoState, TodoConfig>) {
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

  // Row context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    itemId: string;
    hasTaskNode: boolean;
  } | null>(null);

  const rawItems = visibleItems(state, config);

  // 60-second tick for past-item graying.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
  const items = [...sortByChain(undoneBucket), ...sortByChain(doneBucket)];

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

  const undoneCount = state.items.filter((i) => !i.done).length;
  const hasDone = state.items.some((i) => i.done);

  const submitTask = (name: string, durationMin: number) => {
    onCommand('todo.add', { text: name, durationMin });
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

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditValue(text);
  };

  const commitEdit = () => {
    if (editingId !== null) {
      const trimmed = editValue.trim();
      if (trimmed) {
        onCommand('todo.edit', { id: editingId, text: trimmed });
      }
      setEditingId(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
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
        label: 'Start pomo',
        disabled: !hasTaskNode,
        onSelect: () => {
          onCommand('todo.startPomoForItem', { itemId });
        },
      },
      {
        label: 'Delete',
        danger: true,
        onSelect: () => {
          onCommand('todo.remove', { id: itemId });
        },
      },
    ];
  };

  return (
    <MotherFrame nodeId={node.id} slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} onReorderDrop={onReorderDrop} onReorderHover={onReorderHover} slotCentersX={slotCentersX}>
      <div style={{ overflow: 'hidden', borderRadius: 6 }}>
        {/* Header — F7: shows "Todos (N)" with reactive undone count */}
        <div
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
          {/* F6: clear done button — visible when ≥1 done item */}
          {hasDone && (
            <button
              type="button"
              data-testid="clear-done-btn"
              onClick={() => onCommand('todo.clearDone')}
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
              CLEAR DONE
            </button>
          )}
        </div>

        {/* Item list */}
        <div className="todo-body" style={{ padding: '6px 0', maxHeight: 320, overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div
              style={{
                padding: '10px 14px',
                color: 'var(--ink-4)',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
              }}
            >
              No todos yet
            </div>
          ) : (
            items.map((item) => {
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
                {/* F3: checkbox — dispatches todo.toggle */}
                <button
                  type="button"
                  className="todo-check"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommand('todo.toggle', { id: item.id });
                  }}
                  style={{
                    flexShrink: 0,
                    width: 14,
                    height: 14,
                    border: `1px solid ${item.done ? 'var(--ink)' : 'var(--ink-4)'}`,
                    borderRadius: 3,
                    background: item.done ? 'var(--ink)' : 'transparent',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    transition: 'all 0.12s',
                  }}
                  aria-label={item.done ? 'Mark undone' : 'Mark done'}
                >
                  {item.done && (
                    <span style={{ fontSize: 9, color: 'var(--acid)', fontWeight: 700, lineHeight: 1 }}>
                      ✓
                    </span>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.taskNodeId !== null && !item.done) {
                        onCommand('todo.loadTaskForItem', { itemId: item.id });
                      }
                    }}
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
                      cursor: item.done ? 'default' : item.taskNodeId !== null ? 'pointer' : 'text',
                    }}
                  >
                    {item.text}
                  </span>
                )}

                {/* F2: tag pill — 4-char max, mono uppercase */}
                {item.tag !== undefined && (
                  <span
                    className="todo-tag"
                    style={{
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--ink-3)',
                      background: 'var(--paper-2)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      overflow: 'hidden',
                      maxWidth: '4ch',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.tag.slice(0, 4)}
                  </span>
                )}

                {/* Delete — hover-revealed */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommand('todo.remove', { id: item.id });
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
            })
          )}
        </div>

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
              placeholder={inputPhase === 'name' ? 'task → spawns a node…' : 'how long? (min)'}
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
    </MotherFrame>
  );
}
