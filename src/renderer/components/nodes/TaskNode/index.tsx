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
import { useTick } from '../../../hooks/useTick';
import type { PomoState } from '../PomoNode/types';
import { trackedSecondsForTask, planStatus, selectPomoNode, pomoOnlyBoard } from '../../../store/trackedTime';
import { formatElapsed } from './format';
import { DoneCard } from './DoneCard';
import { saveBoard } from '../../../store/eventLog';
import { undoable } from '../../../store/undoNotice';

function fmtMin(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

/**
 * Plan vs reality — "PLAN 1h · TRACKED 52m" strip at the bottom of a task
 * card. Tracked time is the sum of pomo work spans tagged with this task
 * (store/trackedTime.ts); the bar fills tracked / planned and turns rust when
 * more time was spent than planned. Hidden until something was tracked.
 */
function PlanTrackedBar(props: { taskId: string; plannedMin: number; live: boolean; open?: boolean; done?: boolean }) {
  // Only the card the pomo is running on ticks; every other card re-renders
  // just when the pomo node changes.
  return props.live ? <LivePlanTrackedBar {...props} /> : <PlanTrackedBarView {...props} nowMs={null} />;
}

function LivePlanTrackedBar(props: { taskId: string; plannedMin: number; live: boolean; open?: boolean; done?: boolean }) {
  const tick = useTick();
  return <PlanTrackedBarView {...props} nowMs={tick} />;
}

function PlanTrackedBarView({ taskId, plannedMin, live, open = false, done = false, nowMs }: { taskId: string; plannedMin: number; live: boolean; open?: boolean; done?: boolean; nowMs: number | null }) {
  const pomoNode = useBoardStore(selectPomoNode);
  const trackedSec = useMemo(
    () => trackedSecondsForTask(pomoOnlyBoard(pomoNode), taskId, Date.now()),
    // nowMs only changes for the live card (tick), forcing a fresh total.
    [pomoNode, taskId, nowMs],
  );
  // An open-ended task has no plan to run over: show what was tracked only.
  const status = open ? (trackedSec > 0 ? 'on-track' : 'untracked') : planStatus(trackedSec, plannedMin);
  if (status === 'untracked' && !live) return null;
  const ratio = open ? 0 : plannedMin > 0 ? trackedSec / (plannedMin * 60) : 0;
  // A finished task never ends on a penalty: once done, an overrun reads as a
  // neutral "took X" (research C11, docs/research/engagement-and-onboarding.md).
  const overrun = status === 'overrun' && !done;
  const color = overrun ? 'var(--rust)' : live ? 'var(--acid)' : 'var(--ink-3)';
  return (
    <div data-testid="task-plan-tracked" style={{ padding: '4px 10px 6px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.06em',
          color: 'var(--ink-3)',
          marginBottom: 3,
        }}
      >
        <span>{open ? 'NO SET TIME' : `PLAN ${fmtMin(plannedMin)}`}</span>
        <span style={{ color }}>
          {overrun ? '+' + fmtMin(trackedSec / 60 - plannedMin) + ' OVER · ' : ''}
          {done ? 'TOOK' : 'TRACKED'} {fmtMin(trackedSec / 60)}
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--paper-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(1, ratio) * 100}%`, background: color }} />
      </div>
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
  // An open-ended task (added without a duration) has no estimate to show —
  // the calendar says "no set time" too.
  const etaDisplay = state.timeOpen ? 'no set time' : `~${state.plannedMin ?? state.durationMin} min`;

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
  const isGrayed = state.done || isPastScheduled;

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
            if (!n) return '';
            if (n.kind === 'habit.lane') {
              const habitId = (n.state as { habitId?: string })?.habitId ?? '';
              for (const mn of (s.board?.nodes ?? [])) {
                if (mn.kind !== 'habit' || !mn.isMother) continue;
                const ms = mn.state as { habits?: Array<{ id: string; name: string }> } | null;
                const h = ms?.habits?.find((x) => x.id === habitId);
                if (h) {
                  return h.name.length > 14 ? h.name.slice(0, 12) + '…' : h.name;
                }
              }
              return 'HBT';
            }
            const txt = (n.state as { text?: string } | undefined)?.text ?? '';
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
  const borderColor = isActiveRunning
    ? 'var(--acid)'
    : isActivePaused
      ? 'var(--acid)'
      : 'var(--paper-3)';
  const boxShadow = isActiveRunning
    ? '0 0 0 2px var(--acid), 0 0 24px color-mix(in srgb, var(--acid) 45%, transparent)'
    : isActivePaused
      ? '0 0 0 2px var(--acid)'
      : 'var(--shadow-1)';

  // engagement.md F2 — a done task shows the done card (design 9B): the
  // result, the plan, the time, today's progress. Just ticked → the reward.
  if (state.done) {
    return (
      <DoneCard
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
        opacity: isGrayed ? 0.4 : 1,
        transition: 'opacity 0.15s, box-shadow 0.2s, border-color 0.2s',
        cursor: isGrayed ? 'default' : 'pointer',
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
            color: isActiveRunning ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            boxShadow: isActiveRunning
              ? '0 0 6px color-mix(in srgb, var(--acid) 40%, transparent)'
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
        {/* Drag to the Calendar: the grip starts an HTML5 drag with the
            same payload the Todo rows use; the rest of the node still moves
            on the canvas (React Flow ignores .nodrag). */}
        {!state.done && (
          <span
            data-testid="task-calendar-grip"
            className="nodrag"
            draggable
            title="Drag onto the Calendar to schedule"
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                'application/krnl-task',
                JSON.stringify({ taskId, durationMin: state.plannedMin }),
              );
              e.dataTransfer.effectAllowed = 'move';
            }}
            style={{
              cursor: 'grab',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1,
              color: 'var(--ink-3)',
              padding: '0 6px 0 0',
              userSelect: 'none',
            }}
          >
            ⠿
          </span>
        )}
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

        {/* #180 — Tasks are events. They carry no kind toggle and no
            START/PAUSE timer controls; the Pomodoro is a separate, independent
            observer that no task can load into or drive. */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} />
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* F3: checkbox + title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <button
            type="button"
            className={`task-check${state.done ? ' task-check--done' : ''}${popping ? ' task-check--pop' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onCommand('task.toggle');
            }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={state.done ? 'Mark undone' : 'Mark done'}
          >
            {state.done && <span className="task-check__mark">✓</span>}
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
                lineHeight: 1.4,
                color: 'var(--ink-3)',
                fontStyle: 'italic',
                padding: '4px 0 2px',
                borderTop: '1px dashed var(--paper-3)',
                cursor: 'text',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
              title="Click to edit note"
            >
              {state.note}
            </div>
          )
        )}

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
              onFocus={(e) => e.currentTarget.select()}
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

      <PlanTrackedBar
        taskId={node.id}
        plannedMin={state.plannedMin ?? state.durationMin ?? 25}
        live={isActiveRunning}
        open={state.timeOpen === true}
        done={state.done}
      />
    </div>
  );
}
