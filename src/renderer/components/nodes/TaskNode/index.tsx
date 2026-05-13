import { useEffect, useState, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';
import { ContextMenu } from '../../ContextMenu';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { PomoState } from '../PomoNode/types';

/**
 * Decision 22 F16 — format seconds as `H:MM:SS` (≥1h) or `MM:SS` (<1h).
 */
export function formatElapsed(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
// Handles are added by the rfAdapters HOC — DO NOT import Handle here.
export function TaskNode({ node, selected, onCommand }: NodeProps<TaskState, TaskConfig>) {
  const { state } = node;
  const _config = (node.config as TaskConfig | null) ?? defaultTaskConfig();
  void _config;

  const seqNum = String(state.sequenceNumber ?? 1).padStart(2, '0');
  const layer = state.layer ?? 0;
  const tag = state.tag ?? '';
  const taskId = node.id;

  // B.2 — live ETA display: use plannedMin (writable) rather than the stale eta string
  const etaDisplay = `~${state.plannedMin ?? state.durationMin} min`;

  // Decision 22 F15 — subscribe to the pomo mother's runtime state. The
  // selector returns a fresh object every call, so we use `useShallow` to
  // gate re-renders on the actual field values (status / activeTaskId /
  // startedAt) — without it every unrelated store mutation would trigger a
  // full re-render for every TaskNode on the board (the dock/perf regression).
  // B.4 — selector also includes status so ring colour reacts to 'paused'.
  const pomoRuntime = useBoardStore(
    useShallow((s) => {
      const pomo = s.board?.nodes.find((n) => n.kind === 'pomo');
      if (!pomo) return { status: null, activeTaskId: null, startedAt: null };
      const ps = pomo.state as PomoState;
      return {
        status: ps.status,
        activeTaskId: ps.activeTaskId,
        startedAt: ps.startedAt,
      };
    }),
  );

  const isActive = pomoRuntime?.activeTaskId === taskId;
  const isActiveRunning = isActive && pomoRuntime?.status === 'running' && pomoRuntime?.startedAt !== null;
  const isActivePaused = isActive && pomoRuntime?.status === 'paused';

  // When this task transitions from unselected → selected (RF click selection),
  // refresh the pomo with this task's saved state. React Flow swallows the
  // mousedown sequence for drag detection in the real browser, so the body
  // onClick handler is unreliable; piggy-backing on RF's selection signal is
  // the robust path. Idempotent in the dispatcher when already active.
  const prevSelectedRef = useRef(false);
  useEffect(() => {
    if (selected && !prevSelectedRef.current && !state.done) {
      onCommand('task.loadIntoPomo');
    }
    prevSelectedRef.current = selected;
  }, [selected, state.done, onCommand]);

  // Local tick — only mount the interval when this task is actively running.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isActiveRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [isActiveRunning]);

  // B.3 — corner timer formula: include currentSessionElapsedSec checkpoint
  const checkpointSec = state.currentSessionElapsedSec ?? 0;
  let elapsedSec: number;
  if (isActiveRunning && pomoRuntime?.startedAt) {
    // Running: liveDelta already includes the checkpoint via offset startedAt
    // (loadTaskIntoPomo sets startedAt = now - checkpointMs when autoStart=true).
    const liveDelta = Math.max(0, (Date.now() - Date.parse(pomoRuntime.startedAt)) / 1000);
    elapsedSec = (state.secondsAccumulated ?? 0) + liveDelta;
  } else if (isActive) {
    // Paused/loaded: show secondsAccumulated + checkpoint (frozen).
    elapsedSec = (state.secondsAccumulated ?? 0) + checkpointSec;
  } else {
    // Inactive: show secondsAccumulated + checkpoint (if any, from a prior session).
    elapsedSec = (state.secondsAccumulated ?? 0) + checkpointSec;
  }
  const showTimer = elapsedSec > 0 || isActive;

  // ── Task chain prev/next display ───────────────────────────────────────────
  const { prevText, nextText } = useBoardStore(
    useShallow((s) => {
      const idx = s.selectTaskChain();
      const entry = idx.get(node.id) ?? { prev: null, next: null };
      const resolveText = (id: string | null): string | null => {
        if (!id) return null;
        const n = s.board?.nodes.find((nd) => nd.id === id);
        const txt = (n?.state as { text?: string } | undefined)?.text ?? '';
        return txt.length > 16 ? txt.slice(0, 14) + '…' : txt;
      };
      return {
        prevText: resolveText(entry.prev),
        nextText: resolveText(entry.next),
      };
    }),
  );

  // ── inline edit ────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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

  // ── inline ETA edit (B.2) ──────────────────────────────────────────────────
  const [isEditingEta, setIsEditingEta] = useState(false);
  const [etaValue, setEtaValue] = useState('');

  const startEtaEdit = () => {
    setEtaValue(String(state.plannedMin ?? state.durationMin));
    setIsEditingEta(true);
  };

  const commitEtaEdit = () => {
    const parsed = parseInt(etaValue, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(1, parsed) : (state.plannedMin ?? state.durationMin);
    onCommand('task.setPlannedMin', { minutes: clamped });
    setIsEditingEta(false);
  };

  const cancelEtaEdit = () => {
    setIsEditingEta(false);
  };

  const handleEtaKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitEtaEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEtaEdit();
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
      label: 'Add sibling task',
      onSelect: () => {
        useBoardStore.getState().insertSiblingTaskAfter(node.id);
      },
      disabled: state.done,
    },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => onCommand('task.delete'),
    },
  ];

  // ── body click → load task into pomo, no auto-start (B.1 / Bug #2 fix) ────
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
      onCommand('task.loadIntoPomo');
    }
  };

  // B.4 — ring colour reacts to paused status (solid acid, no glow)
  const borderColor = isActiveRunning
    ? 'var(--acid)'
    : isActivePaused
      ? 'var(--acid)'
      : 'var(--paper-3)';
  const boxShadow = isActiveRunning
    ? '0 0 0 2px var(--acid), 0 0 24px rgba(201,241,88,0.45)'
    : isActivePaused
      ? '0 0 0 2px var(--acid)'
      : 'var(--shadow-1)';

  return (
    <div
      data-testid="task-node-root"
      data-done={state.done ? 'true' : undefined}
      data-active={isActive ? 'true' : undefined}
      className={`${state.done ? 'done' : ''}${isActive ? ' active' : ''}`.trim()}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        width: 220,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow,
        overflow: 'visible',
        opacity: state.done ? 0.4 : 1,
        transition: 'opacity 0.15s, box-shadow 0.2s, border-color 0.2s',
        cursor: state.done ? 'default' : 'pointer',
      }}
      onMouseDown={handleBodyMouseDown}
      onClick={handleBodyClick}
    >
      {/* Decision 22 F16 — corner timer (top-left) */}
      {showTimer && (
        <span
          data-testid="task-corner-timer"
          data-running={isActiveRunning ? 'true' : 'false'}
          style={{
            position: 'absolute',
            top: -8,
            left: -2,
            padding: '1px 6px',
            background: 'var(--paper)',
            border: `1px solid ${isActiveRunning ? 'var(--acid)' : 'var(--paper-3)'}`,
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 9.5,
            color: isActiveRunning ? 'var(--acid)' : 'var(--ink-3)',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            boxShadow: isActiveRunning
              ? '0 0 6px rgba(201,241,88,0.4)'
              : '0 0 0 1px var(--paper-2)',
            zIndex: 1,
          }}
        >
          {formatElapsed(elapsedSec)}
        </span>
      )}

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

        {/* Header right slot: START (when not done + not running) or PAUSE
            (only when the timer is actually running). PAUSE suspends but keeps
            the task loaded — pressing START resumes from the checkpoint. To
            fully abandon a session, press RESET on the parent PomoNode. */}
        <div style={{ display: 'flex', gap: 4 }}>
          {!state.done && !isActiveRunning && (
            <button
              type="button"
              data-testid="task-start-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCommand('task.startPomo');
              }}
              onMouseDown={(e) => e.stopPropagation()}
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
                background: 'transparent',
              }}
            >
              START
            </button>
          )}
          {isActiveRunning && (
            <button
              type="button"
              data-testid="task-pause-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCommand('task.pausePomo');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                color: 'var(--rust)',
                border: '1px solid var(--rust)',
                borderRadius: 3,
                padding: '2px 5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: 0.85,
                cursor: 'pointer',
                background: 'transparent',
              }}
            >
              PAUSE
            </button>
          )}
        </div>
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
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: state.done ? 'var(--ink-4)' : 'var(--ink)',
                textDecorationLine: state.done ? 'line-through' : 'none',
                textDecorationColor: 'var(--ink-4)',
                flex: 1,
              }}
            >
              {state.text}
            </span>
          )}
        </div>

        {/* F5: footer — tag + ETA (B.2: ETA is double-click editable) */}
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
          {isEditingEta ? (
            <input
              type="number"
              min={1}
              value={etaValue}
              autoFocus
              onChange={(e) => setEtaValue(e.target.value)}
              onKeyDown={handleEtaKeyDown}
              onBlur={commitEtaEdit}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: 60,
                background: 'var(--paper-2)',
                border: '1px solid var(--ink-3)',
                borderRadius: 3,
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: 'var(--ink-3)',
                textAlign: 'right',
                padding: '1px 4px',
              }}
            />
          ) : (
            <span
              className="task-eta"
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEtaEdit();
              }}
              style={{ cursor: 'text' }}
            >
              {etaDisplay}
            </span>
          )}
        </div>

        {/* F5b: chain hint — prev/next task labels */}
        {(prevText !== null || nextText !== null) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              color: 'var(--ink-4)',
              paddingTop: 3,
              letterSpacing: '0.03em',
            }}
          >
            <span>{prevText !== null ? `← ${prevText}` : ''}</span>
            <span>{nextText !== null ? `${nextText} →` : ''}</span>
          </div>
        )}

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
