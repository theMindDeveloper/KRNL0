// time-model F5 (revised #207) — plan-first, one click, never silent.
// When a task's calendar block covers "now" and the Pomo isn't on a task,
// offer it: idle → "Start on it", running untagged → "Track as it".
// × hides the suggestion for that task until the plan changes.

import { useEffect, useState } from 'react';
import type { PomoState } from './types';
import { useBoardStore } from '../../../store/boardStore';
import { plannedTaskAt } from '../../../store/plannedNow';

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
      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 12, background: 'var(--paper-2)', fontFamily: 'var(--font-read)', minWidth: 0 }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Planned now</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span title={planned.text} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15.5, fontWeight: 600, color: 'var(--ink)' }}>
          {planned.text}
        </span>
        <button
          type="button"
          data-testid="pomo-planned-accept"
          onClick={() => (running
            ? onCommand('pomo.tag', { taskId: planned.id })
            : onCommand('pomo.start', { activeTaskId: planned.id, label: planned.text }))}
          style={{ flexShrink: 0, cursor: 'pointer', height: 34, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--paper-3)', color: 'var(--ink)', fontFamily: 'var(--font-read)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          title={running ? `Count this session toward "${planned.text}"` : `Start a session on "${planned.text}"`}
        >
          {running ? 'Track it' : 'Start on it'}
        </button>
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
        {'or '}
        <button
          type="button"
          data-testid="pomo-planned-dismiss"
          title="Hide this suggestion and pick what you are doing"
          onClick={() => setDismissed(planned.id)}
          style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 12.5, boxShadow: 'inset 0 -1px 0 var(--ink-4)' }}
        >
          {running ? 'leave it untagged' : 'pick something else'}
        </button>
      </span>
    </div>
  );
}
