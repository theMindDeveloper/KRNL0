// Decision 40 — adding a plan: while you type, a small card above the field
// shows what the plan will be (its day, time or any time, length, deadline),
// filled from your words. Change any of it before adding; or just press Enter.
// The field keeps the focus the whole time (buttons never take it).

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../ui/layers';
import { TimeField, parseTime } from '../../ui/TimeField';
import { MenuIcon } from '../../ui/menuIcons';
import { dayWord, fmtLength } from '../../ui/WhenPopover';
import { addDays } from '../../../../shared/due';

export interface PlanDraft {
  day: string | null;
  time: string | null;
  lengthMin: number | null;
  deadline: string | null;
}

/** What the user changed on the card; undefined = take it from the words. */
export type PlanOverrides = Partial<PlanDraft>;

export function effectiveDraft(fromWords: PlanDraft, ov: PlanOverrides): PlanDraft {
  const day = ov.day !== undefined ? ov.day : fromWords.day;
  const time = ov.time !== undefined ? ov.time : fromWords.time;
  return {
    day: day ?? (time ? fromWords.day : null),
    time: day ? time : null,
    lengthMin: ov.lengthMin !== undefined ? ov.lengthMin : fromWords.lengthMin,
    deadline: ov.deadline !== undefined ? ov.deadline : fromWords.deadline,
  };
}

/** "Fri 16:00 · 1h · by Sat" — the button's words. */
export function draftSummary(d: PlanDraft, today: string): string {
  const parts: string[] = [];
  if (d.day) parts.push(d.time ? `${d.day === today ? 'today' : dayWord(d.day, today)} ${d.time}` : `${dayWord(d.day, today)}, any time`);
  if (d.lengthMin) parts.push(fmtLength(d.lengthMin));
  if (d.deadline) parts.push(`by ${dayWord(d.deadline, today)}`);
  return parts.join(' · ');
}

interface Props {
  name: string;
  today: string;
  draft: PlanDraft;
  /** Set one thing on the card (the words stop deciding it). */
  onSet: (patch: PlanOverrides) => void;
  onAdd: () => void;
  /** The add row's box: the card opens just above it. */
  anchor: { left: number; right: number; top: number };
}

const keep = (e: React.MouseEvent) => e.preventDefault(); // the field keeps the focus

export function PlanAddCard({ name, today, draft, onSet, onAdd, anchor }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(200);
  useLayoutEffect(() => {
    const m = ref.current?.offsetHeight ?? 0;
    if (m && Math.abs(m - h) > 1) setH(m);
  });
  const [timeText, setTimeText] = useState(draft.time ?? '');
  // Words typed later (e.g. "16:00") show in the field unless the card set it.
  const shownTime = timeText !== '' || draft.time === null ? timeText : draft.time;
  const W = 330;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8));
  const top = Math.max(8, anchor.top - h - 6);
  const summary = draftSummary(draft, today);

  return createPortal(
    <div
      ref={ref}
      data-testid="plan-add-card"
      onMouseDown={(e) => { e.stopPropagation(); if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 10, borderRadius: 12,
        background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 650, overflowWrap: 'anywhere' }}>{name || ' '}</span>
      <span style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: -4 }}>Pick below, or type it: fri 16:00 1h by sat</span>

      <Row icon="when">
        <Chip on={draft.day === null} onClick={() => { onSet({ day: null, time: null }); setTimeText(''); }} testId="plan-add-noday">No day</Chip>
        {days.map((d) => (
          <Chip key={d} on={draft.day === d} onClick={() => onSet({ day: d })} testId={`plan-add-day-${d}`}>{d === today ? 'Today' : dayWord(d, today)}</Chip>
        ))}
      </Row>
      {draft.day && (
        <Row icon="length" iconOverride="when">
          <Chip on={!draft.time} onClick={() => { onSet({ time: null }); setTimeText(''); }} testId="plan-add-anytime">Any time</Chip>
          <span onMouseDown={(e) => e.stopPropagation()}>
            <TimeField value={shownTime} onChange={(v) => { setTimeText(v); const t = parseTime(v); onSet({ time: t ?? null }); }} placeholder="--:--" testId="plan-add-time" onEnter={onAdd} style={{ width: 86 }} />
          </span>
        </Row>
      )}
      <Row icon="length">
        {[null, 15, 30, 45, 60, 90, 120].map((m) => (
          <Chip key={String(m)} on={draft.lengthMin === m} onClick={() => onSet({ lengthMin: m })} testId={`plan-add-len-${m ?? 'none'}`}>{m === null ? 'No length' : fmtLength(m)}</Chip>
        ))}
      </Row>
      <Row icon="deadline">
        <Chip on={draft.deadline === null} onClick={() => onSet({ deadline: null })} testId="plan-add-nodeadline">No deadline</Chip>
        {[1, 3, 7].map((n) => {
          const d = addDays(today, n);
          return <Chip key={n} on={draft.deadline === d} onClick={() => onSet({ deadline: d })} testId={`plan-add-dl-${n}`}>{`by ${dayWord(d, today)}`}</Chip>;
        })}
        {draft.deadline && ![1, 3, 7].some((n) => addDays(today, n) === draft.deadline) && <Chip on onClick={() => {}} testId="plan-add-dl-typed">{`by ${dayWord(draft.deadline, today)}`}</Chip>}
      </Row>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--paper-3)', paddingTop: 8 }}>
        <button type="button" data-testid="plan-add-add" onMouseDown={keep} onClick={onAdd}
          style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontFamily: 'inherit', fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {summary ? `Add · ${summary} ↵` : 'Add ↵'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Row({ icon, iconOverride, children }: { icon: 'when' | 'length' | 'deadline'; iconOverride?: 'when'; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--ink-3)', display: 'inline-flex', width: 14, flexShrink: 0, alignSelf: 'flex-start', marginTop: 5 }}><MenuIcon name={iconOverride ?? icon} size={13} /></span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" data-testid={testId} onMouseDown={keep} onClick={onClick}
      style={{ height: 22, padding: '0 8px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'transparent' : 'var(--paper-3)'}`, background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
        color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', fontWeight: on ? 650 : 500 }}>
      {children}
    </button>
  );
}
