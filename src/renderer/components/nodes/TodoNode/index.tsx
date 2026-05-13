import { useState, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TodoConfig, TodoState } from './types';
import { visibleItems } from './commands';
import { defaultTodoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { ContextMenu } from '../../ContextMenu';
import type { ContextMenuItem } from '../../ContextMenu';

export function TodoNode({ node, onCommand, slotIndex = 2, slotTotal = MOTHER_TOTAL, onMoveLeft, onMoveRight }: NodeProps<TodoState, TodoConfig>) {
  const { state, config: rawConfig } = node;
  const config = rawConfig ?? defaultTodoConfig();

  // Add-task input local UI state (NF4: no item state held in component)
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  // Decision 22 F15 — minutes input next to task text. Empty string = use default
  // (parsed from text or from pomoConfig.sessionMin in the dispatcher).
  const [minutesValue, setMinutesValue] = useState('');
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

  const items = visibleItems(state, config);
  const undoneCount = state.items.filter((i) => !i.done).length;
  const hasDone = state.items.some((i) => i.done);

  const commitAdd = () => {
    const text = inputValue.trim();
    if (text) {
      const minutes = Number.parseInt(minutesValue, 10);
      const plannedMin = Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
      onCommand('todo.add', plannedMin !== undefined ? { text, plannedMin } : { text });
      setInputValue('');
      setMinutesValue('');
      // NF3: re-focus after submit so successive entries require no click
      setInputFocused(true);
    }
  };

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitAdd();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setInputFocused(false);
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
    <MotherFrame slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} onMoveLeft={onMoveLeft} onMoveRight={onMoveRight}>
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
            <span style={{ color: 'var(--rust)' }}>●</span>
            {` Todos (${undoneCount})`}
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
            items.map((item) => (
              <div
                key={item.id}
                className={`todo-item${item.done ? ' done' : ''}`}
                onContextMenu={(e) =>
                  handleRowContextMenu(e, item.id, item.taskNodeId !== null)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 14px',
                  opacity: item.done ? 0.5 : 1,
                }}
              >
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
                      // body click → start pomo for the linked task (if any)
                      e.stopPropagation();
                      if (item.taskNodeId !== null && !item.done) {
                        onCommand('todo.startPomoForItem', { itemId: item.id });
                      }
                    }}
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-sans)',
                      fontSize: 12.5,
                      color: item.done ? 'var(--ink-4)' : 'var(--ink)',
                      textDecoration: item.done ? 'line-through' : 'none',
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
            ))
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
            <>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleAddKeyDown}
                onBlur={(e) => {
                  // Don't collapse if focus moved to the minutes input
                  const next = e.relatedTarget as HTMLElement | null;
                  if (next?.dataset?.['testid'] === 'add-task-minutes') return;
                  if (inputValue.trim()) {
                    commitAdd();
                  } else {
                    setInputFocused(false);
                  }
                }}
                autoFocus
                placeholder="task → spawns a node…"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--ink)',
                  caretColor: 'var(--acid)',
                }}
              />
              <input
                type="number"
                min={1}
                placeholder="min"
                data-testid="add-task-minutes"
                value={minutesValue}
                onChange={(e) => setMinutesValue(e.target.value)}
                onKeyDown={handleAddKeyDown}
                onBlur={(e) => {
                  const next = e.relatedTarget as HTMLElement | null;
                  if (next === inputRef.current) return;
                  if (inputValue.trim()) {
                    commitAdd();
                  } else {
                    setInputFocused(false);
                  }
                }}
                style={{
                  width: 36,
                  background: 'transparent',
                  border: '1px solid var(--paper-3)',
                  borderRadius: 3,
                  outline: 'none',
                  padding: '1px 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--ink-2)',
                  caretColor: 'var(--acid)',
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              />
            </>
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
