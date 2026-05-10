import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
export function TaskNode({ node, onCommand }: NodeProps<TaskState, TaskConfig>) {
  const { state, config: rawConfig } = node;
  const config = rawConfig ?? defaultTaskConfig();

  // Derive task number from id suffix if numeric, else use a default label.
  // The id format is "task-<uuid>". We rely on the board rendering order for
  // display numbering, so we extract nothing — the store index is not visible
  // here. Instead we use a stable ordinal embedded in the parent's item list.
  // Because TaskNode is stateless about its ordinal, we render a simple badge.
  // Callers may embed the ordinal in state if needed in future.
  const taskNumber = '01'; // placeholder; ordinal not yet in state

  return (
    <div
      style={{
        width: 220,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          padding: '6px 10px 5px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: 'var(--rust)' }}>●</span>
          {' '}TASK · #{taskNumber}
        </span>

        {/* Acid + POMO badge */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8.5,
            color: 'var(--acid)',
            border: '1px solid var(--acid)',
            borderRadius: 3,
            padding: '2px 5px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            opacity: 0.85,
            cursor: 'pointer',
          }}
        >
          + POMO
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px' }}>
        {/* Row 1: checkbox + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button
            type="button"
            onClick={() => onCommand('task.toggle')}
            style={{
              flexShrink: 0,
              width: 13,
              height: 13,
              border: `1px solid ${state.done ? 'var(--ink-4)' : 'var(--ink-3)'}`,
              borderRadius: 3,
              background: state.done ? 'var(--paper-3)' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            aria-label={state.done ? 'Mark undone' : 'Mark done'}
          >
            {state.done && (
              <span style={{ fontSize: 8, color: 'var(--ink-3)', lineHeight: 1 }}>✓</span>
            )}
          </button>

          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: state.done ? 'var(--ink-4)' : 'var(--ink)',
              textDecoration: state.done ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {state.text}
          </span>
        </div>

        {/* Row 2: tag + duration */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 5,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            }}
          >
            {state.tag ?? ''}
          </span>

          {config.showDuration && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: 'var(--ink-4)',
              }}
            >
              {state.durationMin}M
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
