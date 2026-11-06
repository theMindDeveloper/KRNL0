// The done card (docs/06-requirements/engagement.md F2, design 9B "Big
// number"). A finished task keeps its 220 × 120 card, so links and ports stay
// where they were, and shows the result: how long it took (the hero), what was
// planned, when it was finished, and how today is going (the same ring as the
// Clock). Ticking plays a one-shot reward: the check pops, eight small dots
// burst from it, the border glows once. Then it rests.

import type { MouseEvent, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../../store/boardStore';
import type { TaskState } from './types';

type Loose = Record<string, unknown>;
const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "1h 28" / "45m". */
export function fmtTook(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}` : `${h}h`;
}

/** Today: tasks finished, and planned blocks done of planned. */
export function todayTally(nodes: ReadonlyArray<{ kind: string; state: unknown }>, nowMs: number): { doneToday: number; planned: number; plannedDone: number } {
  const today = ymd(nowMs);
  let doneToday = 0;
  let planned = 0;
  let plannedDone = 0;
  for (const n of nodes) {
    if (n.kind !== 'todo.task') continue;
    const s = n.state as Loose;
    const done = s['done'] === true;
    if (done && typeof s['completedAt'] === 'string' && ymd(Date.parse(s['completedAt'])) === today) doneToday += 1;
    if (typeof s['scheduledFor'] === 'string' && s['scheduledFor'].startsWith(today)) {
      planned += 1;
      if (done) plannedDone += 1;
    }
  }
  return { doneToday, planned, plannedDone };
}

interface Props {
  state: TaskState;
  trackedSec: number;
  /** Just ticked: play the one-shot reward. */
  celebrate: boolean;
  onReopen: () => void;
  onContextMenu: (e: MouseEvent) => void;
  children?: ReactNode;
}

export function DoneCard({ state, trackedSec, celebrate, onReopen, onContextMenu, children }: Props) {
  const tally = useBoardStore(useShallow((s) => todayTally(s.board?.nodes ?? [], Date.now())));
  const plannedMin = state.plannedMin ?? state.durationMin ?? 0;
  const tookMin = trackedSec / 60;
  const at = state.completedAt ? new Date(state.completedAt) : null;
  const atLabel = at && !Number.isNaN(at.getTime())
    ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    : '';
  const usePlan = tally.planned > 0;
  const ratio = usePlan ? tally.plannedDone / tally.planned : 1;
  const C = 2 * Math.PI * 8;
  const k9 = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' } as const;

  return (
    <div
      data-testid="task-node-root"
      data-done="true"
      data-done-card="true"
      className={`done task-done-card${celebrate ? ' task-done-card--celebrate' : ''}`}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative', width: 220, height: 120, boxSizing: 'border-box',
        padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 4,
        borderRadius: 'var(--radius-lg)', background: 'var(--node-bg)',
        border: '1px solid color-mix(in srgb, var(--acid) 45%, var(--paper-3))', boxShadow: 'var(--shadow-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <button
            type="button"
            className={`task-check task-check--done${celebrate ? ' task-check--pop' : ''}`}
            style={{ marginTop: 0 }}
            onClick={(e) => { e.stopPropagation(); onReopen(); }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Mark undone"
            title="Reopen"
          >
            <span className="task-check__mark">✓</span>
          </button>
          {celebrate && (
            <span aria-hidden className="task-done-burst">
              {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 45}deg` } as React.CSSProperties} />)}
            </span>
          )}
        </span>
        <span className="task-text" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {state.text}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2, minWidth: 0 }}>
        <span data-testid="done-card-took" style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          {tookMin > 0 ? fmtTook(tookMin) : 'Done'}
        </span>
        <span style={{ ...k9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tookMin > 0
            ? (state.timeOpen || plannedMin <= 0 ? 'recorded' : `of ${fmtTook(plannedMin)} planned`)
            : (state.timeOpen || plannedMin <= 0 ? 'no time recorded' : `${fmtTook(plannedMin)} planned`)}
        </span>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--paper-3)" strokeWidth="2.6" />
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--acid)" strokeWidth="2.6" strokeLinecap="round"
            strokeDasharray={`${(ratio * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 10 10)" />
        </svg>
        <span data-testid="done-card-today" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          {usePlan ? `${tally.plannedDone} of ${tally.planned} planned today` : `${tally.doneToday} done today`}
        </span>
        <span style={{ flex: 1 }} />
        {atLabel && <span style={k9}>{atLabel}</span>}
      </div>
      {children}
    </div>
  );
}
