// Decision 40 — adding a plan, in the habit card's style: while you type, a
// small card above the field. A switch (No day / On a day), this week as day
// circles, a time row, a length row and a deadline row — each a quiet chip for
// "none" and the value next to it. Filled from the words; Enter adds. The
// field keeps the focus the whole time (buttons never take it).

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
const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEPS = [15, 30, 45, 60, 90, 120, 180, 240];

export function PlanAddCard({ name, today, draft, onSet, onAdd, anchor }: Props) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(220);
  useLayoutEffect(() => {
    const m = ref.current?.offsetHeight ?? 0;
    if (m && Math.abs(m - h) > 1) setH(m);
  });
  const [timeText, setTimeText] = useState('');
  // Words typed later ("16:00") show in the field unless the card set it.
  const shownTime = timeText !== '' ? timeText : draft.time ?? '';
  const W = 330;
  const left = Math.max(8, Math.min(anchor.right - W, window.innerWidth - W - 8));
  const top = Math.max(8, anchor.top - h - 8);
  const summary = draftSummary(draft, today);
  const onDay = draft.day !== null;
  const stepLen = (dir: 1 | -1) => {
    const cur = draft.lengthMin;
    if (dir === 1) onSet({ lengthMin: cur === null ? STEPS[0]! : STEPS.find((s) => s > cur) ?? Math.min(480, cur + 60) });
    else onSet({ lengthMin: cur === null || cur <= STEPS[0]! ? null : [...STEPS].reverse().find((s) => s < cur) ?? null });
  };

  const circles = (selected: string | null, pick: (d: string) => void, prefix: string) => (
    <div style={{ display: 'flex', gap: 6 }}>
      {week.map((d) => {
        const on = selected === d;
        const dow = new Date(`${d}T00:00:00`).getDay();
        return (
          <button key={d} type="button" data-testid={`${prefix}-${d}`} onMouseDown={keep} onClick={() => pick(d)}
            title={new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            aria-pressed={on}
            style={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500,
              border: on ? 'none' : d === today ? '1px solid var(--ink-3)' : '1px solid var(--paper-3)',
              background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)' }}>
            {LETTER[dow]}
          </button>
        );
      })}
    </div>
  );

  return createPortal(
    <div
      ref={ref}
      data-testid="plan-add-card"
      onMouseDown={(e) => { e.stopPropagation(); if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 12, borderRadius: 12,
        background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 650, overflowWrap: 'anywhere' }}>{name || ' '}</span>

      <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 2, borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' }}>
        {([['none', 'No day'], ['day', 'On a day']] as const).map(([k, label]) => {
          const on = (k === 'day') === onDay;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} data-testid={`plan-add-mode-${k}`} onMouseDown={keep}
              onClick={() => { if (k === 'none') { onSet({ day: null, time: null }); setTimeText(''); } else if (!onDay) onSet({ day: today }); }}
              style={{ height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 650 : 500,
                background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent', color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
              {label}
            </button>
          );
        })}
      </div>

      {onDay && (
        <>
          {circles(draft.day, (d) => onSet({ day: d }), 'plan-add-day')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={iconCol}><MenuIcon name="when" /></span>
            <Chip on={!draft.time} onClick={() => { onSet({ time: null }); setTimeText(''); }} testId="plan-add-anytime">Any time</Chip>
            <span onMouseDown={(e) => e.stopPropagation()}>
              <TimeField value={shownTime} onChange={(v) => { setTimeText(v); onSet({ time: parseTime(v) ?? null }); }} placeholder="--:--" testId="plan-add-time" onEnter={onAdd} style={{ width: 96 }} />
            </span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={iconCol}><MenuIcon name="length" /></span>
        <Chip on={draft.lengthMin === null} onClick={() => onSet({ lengthMin: null })} testId="plan-add-nolength">No length</Chip>
        <button type="button" aria-label="Shorter" data-testid="plan-add-len-minus" onMouseDown={keep} onClick={() => stepLen(-1)} style={stepBtn}>−</button>
        <span data-testid="plan-add-length" style={{ minWidth: 44, textAlign: 'center', color: draft.lengthMin ? 'var(--ink)' : 'var(--ink-4)' }}>{draft.lengthMin ? fmtLength(draft.lengthMin) : '—'}</span>
        <button type="button" aria-label="Longer" data-testid="plan-add-len-plus" onMouseDown={keep} onClick={() => stepLen(1)} style={stepBtn}>+</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={iconCol}><MenuIcon name="deadline" /></span>
        <Chip on={draft.deadline === null} onClick={() => onSet({ deadline: null })} testId="plan-add-nodeadline">No deadline</Chip>
        <Chip on={draft.deadline !== null} onClick={() => { if (draft.deadline === null) onSet({ deadline: draft.day ?? addDays(today, 1) }); }} testId="plan-add-deadline">
          {draft.deadline ? `by ${dayWord(draft.deadline, today)}` : 'Deadline'}
        </Chip>
      </div>
      {draft.deadline !== null && circles(draft.deadline, (d) => onSet({ deadline: d }), 'plan-add-dl')}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--paper-3)', paddingTop: 10 }}>
        <button type="button" data-testid="plan-add-add" onMouseDown={keep} onClick={onAdd}
          style={{ height: 30, padding: '0 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontFamily: 'inherit', fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {summary ? `Add · ${summary} ↵` : 'Add ↵'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

const iconCol: React.CSSProperties = { color: 'var(--ink-3)', display: 'inline-flex', width: 14, flexShrink: 0 };
const stepBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};

function Chip({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" data-testid={testId} onMouseDown={keep} onClick={onClick}
      style={{ height: 26, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'transparent' : 'var(--paper-3)'}`, background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
        color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', fontWeight: on ? 650 : 500 }}>
      {children}
    </button>
  );
}
