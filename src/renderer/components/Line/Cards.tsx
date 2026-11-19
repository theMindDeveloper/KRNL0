// The two cards a mark opens: a plan (Did it · Later · Skip) and a stretch
// nobody named (what was it?). One of each for the whole layout.

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { setPlanDone, wontDoTask } from '../../store/planActions';
import { scheduleTaskAt } from '../../store/scheduleActions';
import { undoable } from '../../store/undoNotice';
import { localYMD } from '../../../shared/ymd';
import { TimeField } from '../ui/TimeField';
import { useDismissOutside } from '../ui/useDismissOutside';
import type { TaskState } from '../nodes/TaskNode/types';
import { colorFor, fmtClock, fmtDur, pomoOf, UNNAMED, type GapMark, type PlanMark } from './dayData';
import { deletePlan, movePlanLater, nameGap } from './lineActions';

function place(at: { x: number; y: number }, height: number): CSSProperties {
  const w = 330;
  const left = Math.max(12, Math.min(at.x - 40, window.innerWidth - w - 12));
  const top = at.y + 14 + height > window.innerHeight ? Math.max(12, at.y - height - 14) : at.y + 14;
  return { left, top };
}

function useClose(onClose: () => void): void {
  useDismissOutside(true, ['.kl-pop'], onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function PlanCard({ mark, at, nowMs, onClose }: { mark: PlanMark; at: { x: number; y: number }; nowMs: number; onClose: () => void }) {
  useClose(onClose);
  const [later, setLater] = useState(false);
  // The task as it is now (the mark is a snapshot from when the card opened).
  const done = useBoardStore((s) => (s.board?.nodes.find((n) => n.id === mark.taskId)?.state as TaskState | undefined)?.done === true);
  const taskId = mark.taskId;
  if (!taskId) return null;
  const day = localYMD(new Date(mark.startMs));
  const passed = mark.endMs <= nowMs;
  const act = (fn: () => unknown): void => { void fn(); onClose(); };

  return (
    <div className="kl-pop" role="dialog" aria-label={mark.text} data-testid="line-plan-card" style={place(at, 210)}>
      <h4>{mark.text}</h4>
      <div style={{ fontSize: 11, marginTop: 4, color: !done && passed ? 'var(--rust)' : 'var(--ink-3)' }}>
        {new Date(mark.startMs).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtClock(mark.startMs)} – {fmtClock(mark.endMs)}
        {!done && passed ? ' · its time passed' : ''}
      </div>
      {mark.recordedMs > 0 && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--cyan)' }}>recorded {fmtDur(mark.recordedMs)} during it</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11.5, color: 'var(--ink-3)' }}>
        starts at
        <TimeField value={fmtClock(mark.startMs)} testId="line-plan-time" onChange={(v) => { void scheduleTaskAt(taskId, `${day}T${v}`); }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {done ? (
          <button type="button" className="kl-btn kl-btn--sm" data-testid="line-plan-undone" onClick={() => act(() => setPlanDone(taskId, false))}>Not done</button>
        ) : (
          <>
            <button type="button" className="kl-btn kl-btn--sm kl-btn--p" data-testid="line-plan-did" onClick={() => act(() => setPlanDone(taskId, true))}>Did it</button>
            <button type="button" className="kl-btn kl-btn--sm" data-testid="line-plan-later" aria-expanded={later} onClick={() => setLater((o) => !o)}>Later</button>
            <button type="button" className="kl-btn kl-btn--sm" data-testid="line-plan-skip" title="Won't do: off the plan, not counted as missed" onClick={() => act(() => wontDoTask(taskId))}>Skip</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="kl-btn kl-btn--sm kl-btn--danger" data-testid="line-plan-delete" onClick={() => act(() => undoable(`Deleted "${mark.text}"`, () => { void deletePlan(taskId); }))}>Delete</button>
      </div>
      {later && !done && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="kl-chip" data-testid="line-plan-later-today" onClick={() => act(() => movePlanLater(taskId, mark.startMs, 'later-today', nowMs))}>Later today</button>
          <button type="button" className="kl-chip" data-testid="line-plan-tomorrow" onClick={() => act(() => movePlanLater(taskId, mark.startMs, 'tomorrow', nowMs))}>Tomorrow, same time</button>
        </div>
      )}
    </div>
  );
}

/** The names used most in what was recorded, newest first. */
export function recentLabels(board: Parameters<typeof pomoOf>[0], max = 4): string[] {
  const out: string[] = [];
  const hist = pomoOf(board)?.history ?? [];
  for (let i = hist.length - 1; i >= 0 && out.length < max; i--) {
    const r = hist[i]!;
    const name = (r.label ?? '').trim();
    if (r.kind === 'break' || !name || name === UNNAMED) continue;
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

export function GapCard({ gap, at, onClose }: { gap: GapMark; at: { x: number; y: number }; onClose: () => void }) {
  useClose(onClose);
  const board = useBoardStore((s) => s.board);
  const names = useMemo(() => recentLabels(board), [board]);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = (label: string): void => {
    const err = nameGap(gap.startMs, gap.endMs, label);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="kl-pop" role="dialog" aria-label="Name this time" data-testid="line-gap-card" style={place(at, 190)}>
      <h4>{fmtClock(gap.startMs)} – {fmtClock(gap.endMs)}</h4>
      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-3)' }}>{fmtDur(gap.endMs - gap.startMs)} with nothing recorded. What was it?</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {names.map((n) => (
          <button key={n} type="button" className="kl-chip" data-testid={`line-gap-name-${n}`} onClick={() => save(n)}><i style={{ background: colorFor(n) }} />{n}</button>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (other.trim()) save(other); }}>
        <input
          autoFocus
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="something else"
          data-testid="line-gap-input"
          style={{ flex: 1, minWidth: 0, height: 28, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', font: 'inherit', fontSize: 12, padding: '0 8px', outline: 0 }}
        />
        <button type="submit" className="kl-btn kl-btn--sm kl-btn--p" disabled={!other.trim()}>Save</button>
      </form>
      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--rust)', marginTop: 8 }}>{error}</div>}
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 10 }}>Nothing to say? Close this. The stretch just stays empty.</div>
    </div>
  );
}
