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
      style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '5px 8px',
        border: '1px dashed var(--paper-3)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--ink-2)', minWidth: 0,
      }}
    >
      <span style={{ color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 8.5, flexShrink: 0 }}>Planned now</span>
      <span title={planned.text} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
        {planned.text}
      </span>
      <button
        type="button"
        data-testid="pomo-planned-accept"
        onClick={() => (running
          ? onCommand('pomo.tag', { taskId: planned.id })
          : onCommand('pomo.start', { activeTaskId: planned.id, label: planned.text }))}
        style={{
          flexShrink: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
          textTransform: 'uppercase', padding: '3px 7px', borderRadius: 4,
          border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
        }}
        title={running ? `Count this session toward "${planned.text}"` : `Start a session on "${planned.text}"`}
      >
        {running ? 'Track it' : 'Start on it'}
      </button>
      <button
        type="button"
        aria-label="Hide suggestion"
        data-testid="pomo-planned-dismiss"
        onClick={() => setDismissed(planned.id)}
        style={{ flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-4)', fontSize: 12, padding: 0, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}
