import { useState, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';
import { ContextMenu } from '../../ContextMenu';

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
// Handles are added by the rfAdapters HOC — DO NOT import Handle here.
export function TaskNode({ node, onCommand }: NodeProps<TaskState, TaskConfig>) {
  const { state } = node;
  const _config = (node.config as TaskConfig | null) ?? defaultTaskConfig();
  void _config;

  const seqNum = String(state.sequenceNumber ?? 1).padStart(2, '0');
  const layer = state.layer ?? 0;
  const eta = state.eta ?? `~${state.durationMin}M`;
  const tag = state.tag ?? '';

  // ── inline edit ────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  // ── ETA / duration inline edit ─────────────────────────────────────────────
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationEditValue, setDurationEditValue] = useState('');

  const startEdit = () => {
    setEditValue(state.text);
    setIsEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== state.text) {
      onCommand('task.edit', { text: trimmed });
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEdit();
    }
  };

  // ── ETA / duration edit handlers ───────────────────────────────────────────
  const startDurationEdit = () => {
    if (state.pomoStartedAt !== null) return; // blocked while pomo running
    setDurationEditValue(String(state.durationMin));
    setIsEditingDuration(true);
  };

  const commitDurationEdit = () => {
    const parsed = parseInt(durationEditValue, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 480) {
      onCommand('task.setDuration', { durationMin: parsed });
    }
    setIsEditingDuration(false);
  };

  const cancelDurationEdit = () => {
    setIsEditingDuration(false);
  };

  const handleDurationEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitDurationEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelDurationEdit();
    }
  };

  // ── add-subtask row ────────────────────────────────────────────────────────
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [subtaskValue, setSubtaskValue] = useState('');

  const commitSubtask = () => {
    const trimmed = subtaskValue.trim();
    if (trimmed) {
      onCommand('task.addSubtask', { text: trimmed });
    }
    setSubtaskValue('');
    setIsAddingSubtask(false);
  };

  const handleSubtaskKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitSubtask();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setSubtaskValue('');
      setIsAddingSubtask(false);
    }
  };

  // ── context menu ───────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const ctxItems = [
    {
      label: 'Edit text',
      onSelect: startEdit,
    },
    {
      label: 'Add subtask',
      onSelect: () => setIsAddingSubtask(true),
      disabled: state.done,
    },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => onCommand('task.delete'),
    },
  ];

  // ── body click → start pomo (drag-safe) ───────────────────────────────────
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleBodyMouseDown = (e: MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleBodyClick = (e: MouseEvent) => {
    if (!mouseDownPos.current) return;
    const dx = e.clientX - mouseDownPos.current.x;
    const dy = e.clientY - mouseDownPos.current.y;
    mouseDownPos.current = null;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return; // drag, not click
    if (!state.done) {
      onCommand('task.startPomo');
    }
  };

  return (
    <div
      data-testid="task-node-root"
      data-done={state.done ? 'true' : undefined}
      className={state.done ? 'done' : ''}
      onContextMenu={handleContextMenu}
      style={{
        width: 220,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        opacity: state.done ? 0.4 : 1,
        transition: 'opacity 0.15s',
        cursor: state.done ? 'default' : 'pointer',
      }}
      onMouseDown={handleBodyMouseDown}
      onClick={handleBodyClick}
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
        {/* F1: "task · #NN L{layer}" */}
        <span
          data-testid="task-header"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: 'var(--cyan)' }}>●</span>
          {` task · #${seqNum} L${layer}`}
        </span>

        {/* F2/NF3: + pomo button — hidden when done */}
        {!state.done && (
          <button
            type="button"
            className="task-pomo-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCommand('task.spawnPomo');
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              color: 'var(--cyan)',
              border: '1px solid var(--cyan)',
              borderRadius: 3,
              padding: '2px 5px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              opacity: 0.85,
              cursor: 'pointer',
              background: 'transparent',
            }}
          >
            + pomo
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* F3: checkbox + title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <button
            type="button"
            className="task-check"
            onClick={(e) => {
              e.stopPropagation();
              onCommand('task.toggle');
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              width: 15,
              height: 15,
              border: `1.5px solid ${state.done ? 'var(--ink)' : 'var(--ink-4)'}`,
              borderRadius: 3,
              background: state.done ? 'var(--ink)' : 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              marginTop: 2,
              transition: 'all 0.12s',
            }}
            aria-label={state.done ? 'Mark undone' : 'Mark done'}
          >
            {state.done && (
              <span style={{ fontSize: 11, color: 'var(--acid)', fontWeight: 700, lineHeight: 1 }}>✓</span>
            )}
          </button>

          {/* F4: done text styling; double-click enters inline edit */}
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              autoFocus
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--ink-3)',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: 'var(--ink)',
                caretColor: 'var(--acid)',
                padding: '1px 0',
              }}
            />
          ) : (
            <span
              className="task-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!state.done) startEdit();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: state.done ? 'var(--ink-4)' : 'var(--ink)',
                textDecoration: state.done ? 'line-through' : 'none',
                textDecorationColor: 'var(--ink-4)',
                flex: 1,
              }}
            >
              {state.text}
            </span>
          )}
        </div>

        {/* F5: footer — tag + ETA */}
        <div
          className="task-foot"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            paddingTop: 4,
            borderTop: '1px dashed var(--paper-3)',
          }}
        >
          <span className="task-tag">{tag}</span>
          {isEditingDuration ? (
            <input
              type="number"
              min={1}
              max={480}
              value={durationEditValue}
              autoFocus
              onChange={(e) => setDurationEditValue(e.target.value)}
              onKeyDown={handleDurationEditKeyDown}
              onBlur={commitDurationEdit}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: 52,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--ink-3)',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: 'var(--ink)',
                caretColor: 'var(--acid)',
                textAlign: 'right',
                padding: '0 2px',
              }}
            />
          ) : (
            <span
              className="task-eta"
              onClick={(e) => {
                e.stopPropagation();
                startDurationEdit();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                cursor: state.pomoStartedAt !== null || state.done ? 'default' : 'pointer',
              }}
            >
              {eta}
            </span>
          )}
        </div>

        {/* Add-subtask inline input */}
        {isAddingSubtask && (
          <input
            type="text"
            value={subtaskValue}
            autoFocus
            placeholder="subtask…"
            onChange={(e) => setSubtaskValue(e.target.value)}
            onKeyDown={handleSubtaskKeyDown}
            onBlur={commitSubtask}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--ink-4)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--ink)',
              caretColor: 'var(--acid)',
              padding: '2px 0',
              width: '100%',
            }}
          />
        )}
      </div>

      {/* Context menu */}
      {ctxMenu !== null && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
