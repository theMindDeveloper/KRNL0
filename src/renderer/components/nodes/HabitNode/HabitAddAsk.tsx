// Decision 40 — adding a habit (habits only: something you tick). The card
// opens with sensible defaults — every day, any time, a plain tick — so Enter
// after the name adds it. Nothing is asked in prose; the button says exactly
// what Enter will add. Something you don't tick (a class) is a repeating
// event, made on the Calendar.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HabitSchedule, IsoDow } from './types';
import { Z } from '../../ui/layers';
import { TimeField, parseTime } from '../../ui/TimeField';
import { MenuIcon } from '../../ui/menuIcons';

export interface AddAnswer {
  kind: 'habit' | 'routine';
  schedule: HabitSchedule;
  /** "3 times a week, any days". */
  perWeek?: number;
  /** "8 glasses a day" (optional). */
  amount?: { target: number; unit: string };
}

export interface CardDraft {
  mode: 'days' | 'week';
  days: IsoDow[];
  perWeek: number;
  /** "HH:MM" or '' for any time. */
  time: string;
  /** null = just a tick. */
  amount: { target: number; unit: string } | null;
}

export const DEFAULT_CARD: CardDraft = { mode: 'days', days: [1, 2, 3, 4, 5, 6, 7], perWeek: 3, time: '', amount: null };

const ALL: IsoDow[] = [1, 2, 3, 4, 5, 6, 7];
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** What the card adds, or null while it can't (no day picked, half an amount). */
export function cardToAnswer(d: CardDraft): AddAnswer | null {
  const t = d.time.trim() ? parseTime(d.time) : null;
  if (d.time.trim() && !t) return null;
  if (d.amount && !(d.amount.target >= 2)) return null;
  const amount = d.amount ? { amount: d.amount } : {};
  if (d.mode === 'week') return { kind: 'habit', schedule: { kind: 'daily', ...(t ? { timeOfDay: t } : {}) }, perWeek: d.perWeek, ...amount };
  if (d.days.length === 0) return null;
  const days = [...d.days].sort((a, b) => a - b) as IsoDow[];
  const schedule: HabitSchedule = days.length === 7 ? { kind: 'daily', ...(t ? { timeOfDay: t } : {}) }
    : days.join() === '1,2,3,4,5' ? { kind: 'weekdays', ...(t ? { timeOfDay: t } : {}) }
    : { kind: 'weekly', days, ...(t ? { timeOfDay: t } : {}) };
  return { kind: 'habit', schedule, ...amount };
}

/** "every day", "M W F · 18:00", "3× a week · 8 glasses" — the button's words. */
export function cardSummary(d: CardDraft): string {
  const t = d.time.trim() ? parseTime(d.time) : null;
  const when = d.mode === 'week' ? `${d.perWeek}× a week`
    : d.days.length === 7 ? 'every day'
    : [...d.days].sort().join() === '1,2,3,4,5' ? 'weekdays'
    : [...d.days].sort().join() === '6,7' ? 'weekends'
    : [...d.days].sort().map((x) => LETTERS[x - 1]).join(' ');
  const amt = d.amount && d.amount.target >= 2 ? ` · ${d.amount.target}${d.amount.unit ? ` ${d.amount.unit}` : ''}` : '';
  return `${when}${t ? ` · ${t}` : ''}${amt}`;
}

interface Props {
  name: string;
  /** The add row's box: the card opens above it. */
  anchor: { left: number; right: number; top: number };
  onAdd: (a: AddAnswer) => void;
  onCancel: () => void;
  /** Names already in the node (lower-case): a second "Gym" is allowed, but said. */
  taken?: ReadonlySet<string>;
  /** An archived habit with this name: restoring it keeps its history. */
  archivedMatch?: { id: string; name: string } | null;
  onRestore?: (id: string) => void;
  /** Opens the Calendar for something you don't tick. */
  onCalendar?: () => void;
  /** Editing an existing habit ("Days & time…"): its values, and the button says Save. */
  initial?: CardDraft;
  saveLabel?: string;
}

export function HabitAddAsk({ name, anchor, onAdd, onCancel, taken, archivedMatch, onRestore, onCalendar, initial, saveLabel }: Props) {
  const dup = !initial && (taken?.has(name.trim().toLowerCase()) ?? false);
  const [d, setD] = useState<CardDraft>(initial ?? DEFAULT_CARD);
  const set = (patch: Partial<CardDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const answer = cardToAnswer(d);
  const add = () => { if (answer) onAdd(answer); };

  // Enter adds (also from the name field), digits 1–7 toggle days, Esc cancels.
  const latest = useRef({ d, add, onCancel });
  latest.current = { d, add, onCancel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { add: doAdd, onCancel: cancel } = latest.current;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      const inField = e.target instanceof HTMLInputElement;
      // Enter adds from anywhere: the name field, the time, the amount (a focused button clicks itself).
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); e.stopPropagation(); doAdd(); return; }
      if (!inField && /^[1-7]$/.test(e.key) && latest.current.d.mode === 'days') {
        e.preventDefault();
        const dow = Number(e.key) as IsoDow;
        setD((cur) => ({ ...cur, days: cur.days.includes(dow) ? cur.days.filter((x) => x !== dow) : [...cur.days, dow] }));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Open above the add row, inside the window (measured once drawn).
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(220);
  useLayoutEffect(() => {
    const m = ref.current?.offsetHeight ?? 0;
    if (m && Math.abs(m - h) > 1) setH(m);
  });
  const W = 330;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(anchor.right - W, vw - W - 8));
  const top = Math.max(8, Math.min(anchor.top - h - 8, vh - h - 8));
  const toggleDay = (dow: IsoDow) => set({ days: d.days.includes(dow) ? d.days.filter((x) => x !== dow) : [...d.days, dow] });

  const card = (
    <div
      ref={ref}
      role="dialog"
      aria-label={initial ? `Edit ${name}` : `Add ${name}`}
      data-testid="habit-ask"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box',
        maxHeight: vh - 16, overflowY: 'auto', padding: 12, borderRadius: 12,
        background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-3)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)', fontFamily: 'var(--font-mono)', fontSize: 12,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 650, overflowWrap: 'anywhere' }}>{name}</span>
        <button type="button" aria-label="Cancel" onClick={onCancel} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}><MenuIcon name="drop" size={12} /></button>
      </div>

      <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 2, borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' }}>
        {([['days', 'On days'], ['week', 'Times a week']] as const).map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={d.mode === m} data-testid={`habit-ask-mode-${m}`} onClick={() => set({ mode: m })}
            style={{ height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, whiteSpace: 'nowrap',
              fontWeight: d.mode === m ? 650 : 500,
              background: d.mode === m ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
              color: d.mode === m ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
            {label}
          </button>
        ))}
      </div>

      {d.mode === 'days' ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            {ALL.map((dow) => {
              const on = d.days.includes(dow);
              return (
                <button key={dow} type="button" title={NAMES[dow - 1]} aria-label={NAMES[dow - 1]} aria-pressed={on} data-testid={`habit-ask-day-${dow}`} onClick={() => toggleDay(dow)}
                  style={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500,
                    border: on ? 'none' : '1px solid var(--paper-3)', background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)' }}>
                  {LETTERS[dow - 1]}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--ink-3)' }}>
            {([['Every day', ALL], ['Weekdays', [1, 2, 3, 4, 5]], ['Weekends', [6, 7]]] as const).map(([label, days]) => (
              <button key={label} type="button" data-testid={`habit-ask-preset-${label.toLowerCase().replace(' ', '-')}`} onClick={() => set({ days: [...days] as IsoDow[] })}
                style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  color: [...d.days].sort().join() === [...days].join() ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" aria-label="Fewer" onClick={() => set({ perWeek: Math.max(1, d.perWeek - 1) })} style={stepBtn}>−</button>
          <span data-testid="habit-ask-per" style={{ minWidth: 14, textAlign: 'center', fontSize: 13, fontWeight: 650 }}>{d.perWeek}</span>
          <button type="button" aria-label="More" onClick={() => set({ perWeek: Math.min(6, d.perWeek + 1) })} style={stepBtn}>+</button>
          <span aria-hidden style={{ display: 'inline-flex', gap: 4 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} style={{ width: 8, height: 8, borderRadius: '50%', background: n <= d.perWeek ? 'var(--acid)' : 'transparent', boxShadow: n <= d.perWeek ? 'none' : 'inset 0 0 0 1px var(--ink-4)' }} />)}
          </span>
          <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>a week, any days</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--ink-3)', display: 'inline-flex' }}><MenuIcon name="when" /></span>
        <button type="button" data-testid="habit-ask-any" onClick={() => set({ time: '' })} style={chip(!d.time.trim())}>Any time</button>
        <TimeField value={d.time} onChange={(t) => set({ time: t })} placeholder="--:--" testId="habit-ask-time" style={{ width: 86 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--ink-3)', display: 'inline-flex' }}><MenuIcon name="amount" /></span>
        <button type="button" data-testid="habit-ask-amount-off" onClick={() => set({ amount: null })} style={chip(!d.amount)}>Just a tick</button>
        <button type="button" data-testid="habit-ask-amount-open" onClick={() => set({ amount: d.amount ?? { target: 8, unit: '' } })} style={chip(!!d.amount)}>Amount</button>
        {d.amount && (
          <>
            <input data-habit-card="" data-testid="habit-ask-amount-n" inputMode="numeric" aria-label="How many a day" value={d.amount.target || ''}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 3)); set({ amount: { target: n, unit: d.amount?.unit ?? '' } }); }}
              style={field(44)} />
            <input data-habit-card="" data-testid="habit-ask-amount-unit" aria-label="Unit" placeholder="glasses" maxLength={24} value={d.amount.unit}
              onChange={(e) => set({ amount: { target: d.amount?.target ?? 0, unit: e.target.value } })}
              style={field(84)} />
          </>
        )}
      </div>

      {!initial && archivedMatch && onRestore && !dup && (
        <div data-testid="habit-ask-archived" style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span><b style={{ color: 'var(--ink-2)' }}>{archivedMatch.name}</b> is in your archive, with its history.</span>
          <button type="button" data-testid="habit-ask-restore" onClick={() => onRestore(archivedMatch.id)}
            style={{ height: 24, padding: '0 9px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>
            Restore it instead
          </button>
        </div>
      )}
      {dup && (
        <div data-testid="habit-ask-dup" style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
          You already have a <b style={{ color: 'var(--ink-2)' }}>{name}</b>; this adds a second one.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--paper-3)', paddingTop: 10 }}>
        {!initial && onCalendar
          ? <button type="button" data-testid="habit-ask-calendar" onClick={onCalendar} title="Something you don't tick, like a class: a repeating event on the Calendar"
              style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, whiteSpace: 'nowrap' }}>
              Not ticked? Calendar →
            </button>
          : <span />}
        <button
          type="button"
          data-testid="habit-ask-add"
          disabled={!answer}
          onClick={add}
          style={{
            height: 30, padding: '0 12px', borderRadius: 7, border: 'none', cursor: answer ? 'pointer' : 'default',
            background: answer ? 'var(--btn-primary-bg)' : 'var(--paper-3)', color: answer ? 'var(--btn-primary-fg)' : 'var(--ink-4)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap', marginLeft: 'auto',
          }}
        >
          {!answer ? (d.mode === 'days' && d.days.length === 0 ? 'Pick a day' : 'Check the time or amount') : `${saveLabel ?? 'Add'} · ${cardSummary(d)} ↵`}
        </button>
      </div>
    </div>
  );
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onCancel(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1, pointerEvents: initial ? 'auto' : 'none' }} />
      {card}
    </>,
    document.body,
  );
}

const chip = (on: boolean): React.CSSProperties => ({
  height: 26, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap',
  border: `1px solid ${on ? 'transparent' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', fontWeight: on ? 650 : 500,
});
const stepBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};
const field = (w: number): React.CSSProperties => ({
  width: w, height: 26, padding: '0 7px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
});
