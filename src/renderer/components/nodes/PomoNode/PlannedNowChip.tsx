// time-model F5 (revised #207) — plan-first, one click, never silent.
// When a task's calendar block covers "now" and the Pomo isn't on a task,
// offer it: idle → "Start on it", running untagged → "Track as it".
// × hides the suggestion for that task until the plan changes.

import { useEffect, useState } from 'react';
import type { PomoState } from './types';
import { useBoardStore } from '../../../store/boardStore';
import { plannedTaskAt } from '../../../store/plannedNow';
import { blockedByOtherBoard } from '../../../store/boardsInfo';
import { toneVarForTask } from '../../../utils/taskColor';
import { LineGlyph } from '../../ui/LineGlyph';

export function PlannedNowChip({ state, easy, onCommand }: {
  state: PomoState;
  easy: boolean;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
}): JSX.Element | null {
  const board = useBoardStore((s) => s.board);
  // Re-check once a minute: blocks start and end while the Pomo sits idle.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (easy || state.activeTaskId || state.label) return null;
  const planned = plannedTaskAt(board, nowMs);
  if (!planned || planned.id === dismissed) return null;
  const running = state.status === 'running' || state.status === 'paused';
  if (!running && state.status !== 'idle' && state.status !== 'done') return null;

  return (
    <div
      data-testid="pomo-planned-now"
      className="nodrag"
      style={{ alignSelf: 'center', maxWidth: '100%', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 2, height: 36, padding: '0 4px 0 4px', borderRadius: 999, background: 'var(--paper-2)', fontFamily: 'var(--font-read)' }}
    >
      <button
        type="button"
        data-testid="pomo-planned-accept"
        onClick={() => (running
          ? onCommand('pomo.tag', { taskId: planned.id })
          : (blockedByOtherBoard() ? undefined : onCommand('pomo.start', { activeTaskId: planned.id, label: planned.text })))}
        style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 10px', borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}
        title={running ? `Count this session toward "${planned.text}"` : `Start on "${planned.text}"`}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: toneVarForTask(planned.id) }} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{planned.text}</span>
        <span style={{ flexShrink: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>{running ? 'count it for this' : 'planned now'}</span>
      </button>
      <button
        type="button"
        aria-label="Not this: pick something else"
        title="Not this: pick something else"
        data-testid="pomo-planned-dismiss"
        onClick={() => setDismissed(planned.id)}
        style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--ink-3)', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <LineGlyph name="close" size={11} />
      </button>
    </div>
  );
}
