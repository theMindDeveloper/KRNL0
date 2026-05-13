import { useEffect, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';
import { ContextMenu } from '../../ContextMenu';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { useTick } from '../../../hooks/useTick';
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

/**
 * TaskPomoBar — progress bar at the bottom of a task card.
 *
 * Shown when the task has at least one completed pomo session.
 * Only this subcomponent subscribes to useTick(), so inactive tasks never
 * mount a tick subscription.
 *
 * Progress = pomoSessionsCompleted / plannedSessions where
 * plannedSessions is derived from durationMin / 25 (default session length).
 * When no PomoState is available we fall back to a single-session denominator.
 */
function TaskPomoBar({ state, taskId }: { state: TaskState; taskId: string }) {
  // Subscribe to the pomo node's runtime so we can detect the active task.
  const pomoRuntime = useBoardStore(
    useShallow((s) => {
      const pomo = s.board?.nodes.find((n) => n.kind === 'pomo');
      if (!pomo) return { status: null as PomoState['status'] | null, startedAt: null };
      const ps = pomo.state as PomoState;
      return { status: ps.status, startedAt: ps.startedAt };
    }),
  );

  // Tick drives live re-renders while the pomo is running.
  const _tick = useTick();
  void _tick;

  const completedSessions = state.pomoSessionsCompleted;

  // Estimate planned sessions from durationMin rounded up to 25-min blocks.
  const sessionMin = 25;
  const plannedSessions = Math.max(1, Math.ceil((state.durationMin ?? sessionMin) / sessionMin));
  const progress = Math.min(1, completedSessions / plannedSessions);

  if (completedSessions === 0) return null;

  void taskId;
  const isRunning = pomoRuntime.status === 'running';

  return (
    <div
      data-testid="task-pomo-bar"
      style={{
        height: 4,
        background: 'var(--paper-3)',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: isRunning ? 'var(--acid)' : 'var(--ink-4)',
          transition: isRunning ? 'none' : undefined,
        }}
      />
    </div>
  );
}

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
// Handles are added by the rfAdapters HOC — DO NOT import Handle here.
export function TaskNode({ node, onCommand }: NodeProps<TaskState, TaskConfig>) {
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

  // NOTE: removed the previous selection→loadIntoPomo effect. Selection (RF's
  // internal state) must stay decoupled from pomo loading. Tying them together
  // broke marquee multi-select — every freshly-selected task would re-load the
  // pomo, which mutates board state, which triggers the derivedNodes effect,
  // which wipes RF's per-node `selected: true` flags. Loading happens
  // exclusively through `handleBodyClick` (drag-safe) and the TodoNode row
  // click. Marquee → pure selection; click → selection + pomo load.

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
  // Shows ALL adjacent task.next neighbours; forks are highlighted in cyan.
  const { prevTexts, nextTexts } = useBoardStore(
    useShallow((s) => {
      const idx = s.selectTaskChain();
      const entry = idx.get(node.id);
      const resolve = (ids: readonly string[]): string[] =>
        ids
          .map((id) => {
            const n = s.board?.nodes.find((nd) => nd.id === id);
            const txt = (n?.state as { text?: string } | undefined)?.text ?? '';
            return txt.length > 14 ? txt.slice(0, 12) + '…' : txt;
          })
          .filter((t) => t.length > 0);
      return {
        prevTexts: resolve(entry?.prevs ?? []),
        nextTexts: resolve(entry?.nexts ?? []),
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

  // ── two-phase inline input (subtask or sibling) ───────────────────────────
  // mode: null = hidden, 'subtask' = adding subtask, 'sibling' = adding sibling
  type InlineMode = 'subtask' | 'sibling';
  const [inlineMode, setInlineMode] = useState<InlineMode | null>(null);
  const [inlineName, setInlineName] = useState('');
  const [inlineDuration, setInlineDuration] = useState('');
  const [inlinePhase, setInlinePhase] = useState<'name' | 'duration'>('name');
  const [inlineDurationInvalid, setInlineDurationInvalid] = useState(false);

  // legacy alias so we don't break the context menu open
  const isAddingSubtask = inlineMode === 'subtask';

  const cancelInline = () => {
    setInlineMode(null);
    setInlineName('');
    setInlineDuration('');
    setInlinePhase('name');
    setInlineDurationInvalid(false);
  };

  const submitInline = (name: string, durationMin: number) => {
    if (inlineMode === 'subtask') {
      onCommand('task.addSubtask', { text: name, durationMin });
    } else if (inlineMode === 'sibling') {
      useBoardStore.getState().insertSiblingTaskAfter(node.id, { text: name, durationMin });
    }
    cancelInline();
  };

  const handleInlineKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (inlinePhase === 'name') {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const name = inlineName.trim();
        if (name) {
          setInlinePhase('duration');
          setInlineDuration('');
          setInlineDurationInvalid(false);
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        cancelInline();
      }
    } else {
      // duration phase
      if (e.key === 'Enter') {
        e.stopPropagation();
        const parsed = parseInt(inlineDuration, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 480) {
          setInlineDurationInvalid(false);
          submitInline(inlineName.trim(), parsed);
        } else {
          setInlineDurationInvalid(true);
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        // Go back to name phase, keep name
        setInlinePhase('name');
        setInlineDuration('');
        setInlineDurationInvalid(false);
      }
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
      onSelect: () => {
        setInlineMode('subtask');
        setInlineName('');
        setInlineDuration('');
        setInlinePhase('name');
        setInlineDurationInvalid(false);
      },
      disabled: state.done,
    },
    {
      label: 'Add sibling task',
      onSelect: () => {
        setInlineMode('sibling');
        setInlineName('');
        setInlineDuration('');
        setInlinePhase('name');
        setInlineDurationInvalid(false);
      },
      disabled: state.done,
    },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => onCommand('task.delete'),
    },
  ];

  // ── body double-click → refresh pomo with this task's info (no auto-start).
  // Single click is reserved for RF selection (so users can move/connect/marquee
  // freely). Double-click is the explicit "show me this task in the pomo" gesture.
  const handleBodyDoubleClick = (e: MouseEvent) => {
    // Children that handle their own dblclick (the editable task text) stop
    // propagation, so this handler only fires on the surrounding card surface.
    if (state.done) return;
    e.stopPropagation();
    onCommand('task.loadIntoPomo');
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
      onDoubleClick={handleBodyDoubleClick}
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

        {/* F5b: chain hint — prev/next task labels. Forks (>1) get cyan accent. */}
        {(prevTexts.length > 0 || nextTexts.length > 0) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              color: 'var(--ink-4)',
              paddingTop: 3,
              letterSpacing: '0.03em',
            }}
          >
            <span style={{ color: prevTexts.length > 1 ? 'var(--cyan)' : 'var(--ink-4)' }}>
              {prevTexts.length > 0 ? `← ${prevTexts.join(', ')}` : ''}
            </span>
            <span style={{ color: nextTexts.length > 1 ? 'var(--cyan)' : 'var(--ink-4)', textAlign: 'right' }}>
              {nextTexts.length > 0 ? `${nextTexts.join(', ')} →` : ''}
            </span>
          </div>
        )}

        {/* Two-phase inline input for subtask / sibling */}
        {inlineMode !== null && (
          <input
            type={inlinePhase === 'duration' ? 'number' : 'text'}
            min={inlinePhase === 'duration' ? 1 : undefined}
            max={inlinePhase === 'duration' ? 480 : undefined}
            value={inlinePhase === 'name' ? inlineName : inlineDuration}
            autoFocus
            placeholder={
              inlinePhase === 'name'
                ? inlineMode === 'subtask' ? 'subtask name…' : 'sibling task name…'
                : 'how long? (min)'
            }
            onChange={(e) => {
              if (inlinePhase === 'name') {
                setInlineName(e.target.value);
              } else {
                setInlineDuration(e.target.value);
                setInlineDurationInvalid(false);
              }
            }}
            onKeyDown={handleInlineKeyDown}
            onBlur={() => {
              // On blur during duration phase: revert to name phase without submitting.
              // On blur during name phase with empty input: cancel entirely.
              if (inlinePhase === 'duration') {
                setInlinePhase('name');
                setInlineDuration('');
                setInlineDurationInvalid(false);
              } else if (!inlineName.trim()) {
                cancelInline();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `1px solid ${inlineDurationInvalid ? 'var(--rust)' : 'var(--ink-4)'}`,
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

      {/* Pomo progress bar — only rendered when at least one session is done */}
      {state.pomoSessionsCompleted > 0 && (
        <TaskPomoBar state={state} taskId={node.id} />
      )}
    </div>
  );
}
