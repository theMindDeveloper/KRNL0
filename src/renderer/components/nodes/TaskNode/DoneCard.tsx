// The done card (docs/06-requirements/engagement.md F2, design 9B "Big
// number"). A finished task keeps its 220 × 120 card, so links and ports stay
// where they were, and shows the result: how long it took (the hero), what was
// planned, when it was finished, and how today is going (the same ring as the
// Clock). Ticking plays a one-shot reward: the check pops, eight small dots
// burst from it, the border glows once. Then it rests.

import type { MouseEvent, ReactNode } from 'react';
import { CARD_H, CardIcon, CardMetaRow, CardMeter, cardFrameStyle } from './CardParts';
import { toneVarForTask } from '../../../utils/taskColor';
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
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
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
  /** The task node's id — its tag colour is the same as on the open card. */
  taskId: string;
  state: TaskState;
  trackedSec: number;
  /** Just ticked: play the one-shot reward. */
  celebrate: boolean;
  onReopen: () => void;
  onContextMenu: (e: MouseEvent) => void;
  children?: ReactNode;
}

export function DoneCard({ taskId, state, trackedSec, celebrate, onReopen, onContextMenu, children }: Props) {
  const plannedMin = state.plannedMin ?? state.durationMin ?? 0;
  const tookMin = trackedSec / 60;
  const at = state.completedAt ? new Date(state.completedAt) : null;
  const atLabel = at && !Number.isNaN(at.getTime())
    ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    : '';
  const tone = toneVarForTask(taskId);
  const planned = !state.timeOpen && plannedMin > 0;
  // A finished task never ends on a penalty: it reads "took X", in plain ink.
  const verdict = !planned || tookMin <= 0 ? null
    : Math.abs(tookMin - plannedMin) <= Math.max(5, plannedMin * 0.1) ? 'on plan'
    : `of ${fmtTook(plannedMin)} planned`;

  return (
    <div
      data-testid="task-node-root"
      data-done="true"
      data-done-card="true"
      className={`done task-done-card${celebrate ? ' task-done-card--celebrate' : ''}`}
      onContextMenu={onContextMenu}
      style={{ ...cardFrameStyle('done'), height: CARD_H }}
    >
      {/* Row 1: check · title · reopen — the same places as the open card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
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
        <span className="task-text" title={state.text} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: '18px', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {state.text}
        </span>
        <button
          type="button"
          className="nodrag task-card-action"
          onClick={(e) => { e.stopPropagation(); onReopen(); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Reopen"
          aria-label="Reopen"
          style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, border: 0, cursor: 'pointer', background: 'transparent', color: 'var(--ink-3)' }}
        >
          <CardIcon name="undo" size={13} />
        </button>
      </div>

      {/* Row 2: tag · when it was finished */}
      <CardMetaRow tag={state.tag ?? ''} tone={tone} icon="check" when={atLabel ? `Done ${atLabel}` : 'Done'} whenColor="var(--acid-ink, var(--acid))" />

      {/* Meter: full — how long it took, against the plan */}
      <CardMeter
        ratio={1}
        color="var(--acid)"
        leftTestId="done-card-took"
        left={tookMin > 0 ? `Took ${fmtTook(tookMin)}` : 'Done'}
        right={verdict ?? (planned ? `${fmtTook(plannedMin)} planned` : 'no set time')}
      />
      {children}
    </div>
  );
}
