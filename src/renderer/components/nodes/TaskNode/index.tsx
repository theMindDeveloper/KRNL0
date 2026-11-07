import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';
import { ContextMenu } from '../../ContextMenu';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import { useShallow } from 'zustand/react/shallow';
import type { PomoState } from '../PomoNode/types';
import { trackedSecondsForTask, selectPomoNode, pomoOnlyBoard } from '../../../store/trackedTime';
import { DoneCard } from './DoneCard';
import { CardIcon, CardMetaRow, CardMeter, cardFrameStyle, fmtDur, fmtWhen } from './CardParts';
import { saveBoard } from '../../../store/eventLog';
import { undoable } from '../../../store/undoNotice';
import { toneVarForTask } from '../../../utils/taskColor';

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
// Handles are added by the rfAdapters HOC — DO NOT import Handle here.
export function TaskNode({ node, onCommand }: NodeProps<TaskState, TaskConfig>) {
  const { state } = node;
  const _config = (node.config as TaskConfig | null) ?? defaultTaskConfig();
  void _config;

  const tag = state.tag ?? '';
  const taskId = node.id;


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

  // 60s tick for past-scheduled graying — only active when scheduledFor is set.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!state.scheduledFor) return;
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [state.scheduledFor]);

  const scheduledEndMs = state.scheduledFor
    ? new Date(state.scheduledFor).getTime() +
      (state.scheduledDurationMin ?? state.plannedMin ?? state.durationMin ?? 25) * 60_000
    : null;
  const isPastScheduled = scheduledEndMs !== null && scheduledEndMs <= nowMs;

  // engagement.md F1–F2 — the done moment: ticking turns the card into the
  // done card and plays its one-shot reward. Reopening restores the full card.
  const wasDone = useRef(state.done);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    const justTicked = state.done && !wasDone.current;
    wasDone.current = state.done;
    if (!justTicked) return;
    setPopping(true);
    const t = setTimeout(() => setPopping(false), 900);
    return () => clearTimeout(t);
  }, [state.done]);

  // Corner timer: tracked time on this task, derived from the pomo spans
  // tagged with it (live while the pomo is running on it).
  const pomoNode = useBoardStore(selectPomoNode);
  // Recomputed when the pomo changes, or every render of the live card (its
  // local 500 ms tick); idle cards don't rescan the history on each render.
  const liveKey = isActiveRunning ? Date.now() : 0;
  const elapsedSec = useMemo(
    () => trackedSecondsForTask(pomoOnlyBoard(pomoNode), taskId, Date.now()),
    [pomoNode, taskId, liveKey],
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
    setEtaValue(state.timeOpen ? '' : String(state.plannedMin ?? state.durationMin));
    setIsEditingEta(true);
  };

  const commitEtaEdit = () => {
    const parsed = parseInt(etaValue, 10);
    const current = state.plannedMin ?? state.durationMin;
    // Opening the field and leaving it unchanged (or empty) changes nothing —
    // above all it must not turn an open-ended task into a fixed one.
    if (Number.isFinite(parsed) && !(parsed === current && !state.timeOpen)) {
      onCommand('task.setPlannedMin', { minutes: Math.max(1, parsed) });
    }
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

  // ── two-phase inline input (subtask, sibling, or next) ────────────────────
  // mode: null = hidden, 'subtask' = adding subtask, 'sibling' = adding parallel
  // task (ADR 0004 §2 — UI-label-only rename; internal name retained for stability),
  // 'next' = adding next (sequential successor — ADR 0004 §2).
  type InlineMode = 'subtask' | 'sibling' | 'next';
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

  const submitInline = (name: string, durationMin: number | null) => {
    // Time is optional: no duration → an open-ended task.
    const dur = durationMin === null ? {} : { durationMin };
    if (inlineMode === 'subtask') {
      onCommand('task.addSubtask', { text: name, ...dur });
    } else if (inlineMode === 'sibling') {
      // ADR 0004 §2 — internal mode 'sibling' / UI label "Add parallel task".
      useBoardStore.getState().insertSiblingTaskAfter(node.id, { text: name, ...dur });
      // The store action doesn't persist; without this the new task vanished
      // on the next CLI write (board reload) or on quit.
      const board = useBoardStore.getState().board;
      if (board) void saveBoard(board);
    } else if (inlineMode === 'next') {
      // ADR 0004 §2 — sequential successor at the same chain level.
      onCommand('task.addNext', { text: name, ...dur });
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
        if (inlineDuration.trim() === '') { submitInline(inlineName.trim(), null); return; }
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

  // ── inline note edit ──────────────────────────────────────────────────────
  // window.prompt() throws in Electron renderer; use inline textarea instead.
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState('');

  const startNoteEdit = () => {
    setNoteValue(state.note ?? '');
    setIsEditingNote(true);
  };

  const commitNoteEdit = () => {
    const trimmed = noteValue.trim();
    // Send trimmed value (empty string drops the field in the dispatch handler).
    onCommand('task.setNote', { note: trimmed });
    setIsEditingNote(false);
  };

  const cancelNoteEdit = () => {
    setIsEditingNote(false);
    setNoteValue('');
  };

  const handleNoteKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelNoteEdit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      commitNoteEdit();
    }
  };

  // ── context menu ───────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const { getNodes } = useReactFlow();

  const handleContextMenu = (e: MouseEvent) => {
    // When this task is part of a multi-selection, defer to the canvas-level
    // batch menu (shows only actions that apply to the whole set — Delete).
    // Per-task actions like Edit text / Add subtask / Add sibling don't make
    // sense on a batch, so we don't stop the event in that case.
    const selectedCount = getNodes().filter((n) => n.selected).length;
    if (selectedCount > 1) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  // Read when the menu is open only (a chain successor has no scheduledFor of
  // its own but is on the calendar too).
  const onCalendar = ctxMenu !== null
    && (!!state.scheduledFor || selectSchedule(useBoardStore.getState().board).placements.has(taskId));

  const ctxItems = [
    {
      label: 'Edit text',
      onSelect: startEdit,
    },
    {
      label: 'Edit time',
      onSelect: startEtaEdit,
      disabled: state.done,
    },
    {
      // ADR 0004 §2 — sequential successor: same chain level as source,
      // single task.next edge.
      label: 'Add next task',
      onSelect: () => {
        setInlineMode('next');
        setInlineName('');
        setInlineDuration('');
        setInlinePhase('name');
        setInlineDurationInvalid(false);
      },
      disabled: state.done,
    },
    {
      // ADR 0004 §2 — UI label only; internal mode 'sibling' retained.
      label: 'Add parallel task',
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
      label: state.note && state.note.length > 0 ? 'Edit note' : 'Add note',
      onSelect: startNoteEdit,
    },
    // Only for tasks that are on the calendar (anchors and chain successors).
    ...(onCalendar
      ? [{ label: 'Show on calendar', onSelect: () => { void import('../../../store/scheduleActions').then((m) => m.showTaskOnCalendar(taskId)); } }]
      : []),
    {
      label: 'Delete',
      danger: true,
      onSelect: () => undoable(`Deleted "${state.text || 'task'}"`, () => onCommand('task.delete')),
    },
  ];

  // #180 — Tasks are events; they never touch the Pomodoro timer. The old
  // double-click-to-load-into-pomo gesture is removed entirely. The Pomo
  // observes time on its own and has no concept of an active task.
  const handleBodyDoubleClick = (_e: MouseEvent) => {
    /* no-op: events are not timer-controlled (#180) */
  };

  // B.4 — ring colour reacts to paused status (solid acid, no glow)

  // engagement.md F2 — a done task shows the done card (design 9B): the
  // result, the plan, the time, today's progress. Just ticked → the reward.
  if (state.done) {
    return (
      <DoneCard
        taskId={taskId}
        state={state}
        trackedSec={elapsedSec}
        celebrate={popping}
        onReopen={() => onCommand('task.toggle')}
        onContextMenu={handleContextMenu}
      >
        {ctxMenu !== null && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onDismiss={() => setCtxMenu(null)} />
        )}
      </DoneCard>
    );
  }

  // One card shape for every state (CardParts.tsx): nothing moves on tick.
  const cardTone = isActiveRunning ? 'running' : isActivePaused ? 'paused' : isPastScheduled ? 'missed' : 'open';
  const tagTone = toneVarForTask(taskId);
  const when = fmtWhen(state.scheduledFor, nowMs);
  const plannedMin = state.plannedMin ?? state.durationMin ?? 25;
  const trackedMin = elapsedSec / 60;
  const over = !state.timeOpen && trackedMin > plannedMin + 0.5;

  return (
    <div
      data-testid="task-node-root"
      data-done={undefined}
      data-active={isActive ? 'true' : undefined}
      data-card-tone={cardTone}
      className={isActive ? 'active' : undefined}
      onContextMenu={handleContextMenu}
      style={{ ...cardFrameStyle(cardTone), opacity: 1, cursor: 'pointer', overflow: 'visible' }}
      onDoubleClick={handleBodyDoubleClick}
    >
      {/* Row 1: check · title · the one action (drag onto the Calendar) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <button
            type="button"
            className={`task-check${popping ? ' task-check--pop' : ''}`}
            style={{ marginTop: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              onCommand('task.toggle');
            }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Mark done"
          />

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
                flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: '1px solid var(--ink-3)', outline: 'none',
                fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--ink)', caretColor: 'var(--acid)', padding: '1px 0',
              }}
            />
          ) : (
            <span
              className="task-text"
              title={state.text}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
              style={{
                fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: '18px', color: 'var(--ink)', flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {state.text}
            </span>
          )}

          {/* Drag to the Calendar: the grip starts an HTML5 drag with the
              same payload the Todo rows use; the rest of the node still moves
              on the canvas (React Flow ignores .nodrag). */}
          <span
            data-testid="task-calendar-grip"
            className="nodrag task-card-action"
            draggable
            title={isPastScheduled ? 'Missed — drag onto the Calendar to move it' : 'Drag onto the Calendar to plan it'}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId, durationMin: state.plannedMin }));
              e.dataTransfer.effectAllowed = 'move';
            }}
            style={{
              width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'grab',
              color: isPastScheduled ? 'var(--rust)' : 'var(--ink-3)',
              background: isPastScheduled ? 'color-mix(in srgb, var(--rust) 14%, transparent)' : 'var(--paper-2)',
            }}
          >
            <CardIcon name={isPastScheduled ? 'replan' : 'grip'} size={13} />
          </span>
      </div>

      {/* Row 2: tag · when */}
      <CardMetaRow
        tag={tag}
        tone={tagTone}
        icon={isActiveRunning ? 'clock' : 'calendar'}
        when={isActiveRunning ? 'Focusing now' : isActivePaused ? 'Paused' : when ? (isPastScheduled ? `Was ${when}` : when) : 'Not on the calendar'}
        whenColor={isActiveRunning ? 'var(--acid-ink, var(--acid))' : isPastScheduled ? 'color-mix(in srgb, var(--rust) 72%, var(--ink))' : undefined}
      />

        {/* Note — free-form text under the task body. Click to edit.
            window.prompt() is blocked in Electron renderer, so we use an
            inline textarea (Enter+Cmd/Ctrl commits, Escape cancels, blur commits). */}
        {isEditingNote ? (
          <textarea
            data-testid="task-note-editor"
            value={noteValue}
            autoFocus
            placeholder="note… (⌘/Ctrl+Enter to save, Esc to cancel)"
            onChange={(e) => setNoteValue(e.target.value)}
            onKeyDown={handleNoteKeyDown}
            onBlur={commitNoteEdit}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 36,
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              lineHeight: 1.4,
              fontStyle: 'italic',
              color: 'var(--ink-2)',
              background: 'var(--paper-2)',
              border: '1px solid var(--ink-4)',
              borderRadius: 3,
              outline: 'none',
              caretColor: 'var(--acid)',
              padding: '4px 6px',
              marginTop: 2,
            }}
          />
        ) : (
          state.note && state.note.length > 0 && (
            <div
              data-testid="task-note"
              onClick={(e) => {
                e.stopPropagation();
                startNoteEdit();
              }}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 11,
                lineHeight: '15px',
                color: 'var(--ink-3)',
                fontStyle: 'italic',
                cursor: 'text',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to edit note"
            >
              {state.note}
            </div>
          )
        )}

        {/* Meter: what was recorded against the plan. The right label is the
            estimate — double-click to change it. */}
        <CardMeter
          ratio={state.timeOpen ? (trackedMin > 0 ? 1 : 0) : plannedMin > 0 ? trackedMin / plannedMin : 0}
          color={over ? 'var(--rust)' : isActive ? 'var(--acid)' : 'var(--ink-3)'}
          left={trackedMin >= 1 ? fmtDur(trackedMin) + (over ? ` · +${fmtDur(trackedMin - plannedMin)}` : '') : isActive ? 'Started' : 'Not started'}
          rightNode={isEditingEta ? (
            <input
              type="number"
              min={1}
              value={etaValue}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setEtaValue(e.target.value)}
              onKeyDown={handleEtaKeyDown}
              onBlur={commitEtaEdit}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ width: 54, background: 'var(--paper-2)', border: '1px solid var(--ink-3)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', textAlign: 'right', padding: '1px 4px' }}
            />
          ) : (
            <span
              className="task-eta"
              title="Your estimate — double-click to change"
              onDoubleClick={(e) => { e.stopPropagation(); startEtaEdit(); }}
              style={{ cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <CardIcon name="clock" size={11} />
              {state.timeOpen ? 'no set time' : trackedMin >= 1 ? `of ${fmtDur(plannedMin)}` : fmtDur(plannedMin)}
            </span>
          )}
        />

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
                ? inlineMode === 'subtask'
                  ? 'subtask name…'
                  : inlineMode === 'next'
                    ? 'next task name…'
                    : 'parallel task name…'
                : 'how long? (min, optional — Enter to skip)'
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
