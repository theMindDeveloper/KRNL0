import { useState, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { NodeProps } from '../types';
import type { TodoConfig, TodoState } from './types';
import { visibleItems } from './commands';
import { defaultTodoConfig } from './types';

export function TodoNode({ node, onCommand }: NodeProps<TodoState, TodoConfig>) {
  const { state, config: rawConfig } = node;
  const config = rawConfig ?? defaultTodoConfig();

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const items = visibleItems(state, config);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const text = inputValue.trim();
      if (text) {
        onCommand('todo.add', { text });
        setInputValue('');
      }
    }
  };

  return (
    <div
      style={{
        width: 300,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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
        <span>▙ TODOS</span>
        {state.items.some((i) => i.done) && (
          <button
            type="button"
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

      {/* Input */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a todo…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--ink)',
            caretColor: 'var(--rust)',
          }}
        />
      </div>

      {/* List */}
      <div style={{ padding: '6px 0', maxHeight: 320, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '10px 14px',
              color: 'var(--ink-4)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
            }}
          >
            No todos yet
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 14px',
              }}
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => onCommand('todo.toggle', { id: item.id })}
                style={{
                  flexShrink: 0,
                  width: 14,
                  height: 14,
                  border: `1px solid ${item.done ? 'var(--ink-4)' : 'var(--ink-3)'}`,
                  borderRadius: 3,
                  background: item.done ? 'var(--paper-3)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                aria-label={item.done ? 'Mark undone' : 'Mark done'}
              >
                {item.done && (
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--ink-3)',
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>

              {/* Text */}
              <span
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12.5,
                  color: item.done ? 'var(--ink-4)' : 'var(--ink)',
                  textDecoration: item.done ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.text}
              </span>

              {/* Delete */}
              <button
                type="button"
                onClick={() => onCommand('todo.remove', { id: item.id })}
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
    </div>
  );
}
