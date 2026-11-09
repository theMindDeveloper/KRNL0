// Decision 40 — adding a habit (habits only: something you tick). The card
// opens with sensible defaults — every day, any time, a plain tick — so Enter
// after the name adds it. Something you don't tick (a class) is a repeating
// event, made on the Calendar.
//
// Layout (canvas "Adding a habit", draft A): the days at the top, then one
// labelled row each for Time and Goal. One fixed height, nothing jumps.

import { pickerOpen } from '../../ui/Popover';
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
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
    : d.days.length === 6 ? `all but ${SHORT[([1, 2, 3, 4, 5, 6, 7] as const).find((x) => !d.days.includes(x))! - 1]}`
    // One or two days: their short names ("Mon", "Mon Thu"); more: letters.
    : d.days.length <= 2 ? [...d.days].sort().map((x) => SHORT[x - 1]).join(' ')
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
  /** easy-mode D20 — Easy: name, days and a time. Times a week and the goal
   *  are Advanced; a habit that already has them keeps them (shown, kept on Save). */
  simple?: boolean;
}

export function HabitAddAsk({ name, anchor, onAdd, onCancel, taken, archivedMatch, onRestore, onCalendar, initial, saveLabel, simple = false }: Props) {
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
      if (e.key === 'Escape') { if (pickerOpen()) return; e.preventDefault(); e.stopPropagation(); cancel(); return; }
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

  // ── the controls ─────────────────────────────────────────────────────────
  const modeSeg = (small: boolean) => (
    <div role="radiogroup" aria-label="On days or times a week" style={segWrap}>
      {([['days', 'On days'], ['week', 'Times a week']] as const).map(([m, label]) => (
        <button key={m} type="button" role="radio" aria-checked={d.mode === m} data-testid={`habit-ask-mode-${m}`} onClick={() => set({ mode: m })} style={segBtn(d.mode === m, small)}>
          {label}
        </button>
      ))}
    </div>
  );
  const dayDots = (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {ALL.map((dow) => {
        const on = d.days.includes(dow);
        return (
          <button key={dow} type="button" title={NAMES[dow - 1]} aria-label={NAMES[dow - 1]} aria-pressed={on} data-testid={`habit-ask-day-${dow}`} onClick={() => toggleDay(dow)}
            style={{ width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500, border: 'none',
              boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--paper-3)', background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)' }}>
            {LETTERS[dow - 1]}
          </button>
        );
      })}
    </div>
  );
  const perWeek = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32 }}>
      <span style={stepper(true)}>
        <button type="button" aria-label="Fewer" onClick={() => set({ perWeek: Math.max(1, d.perWeek - 1) })} style={stepBtn}>−</button>
        <span data-testid="habit-ask-per" style={{ minWidth: 22, textAlign: 'center', fontSize: 12.5, fontWeight: 650 }}>{d.perWeek}</span>
        <button type="button" aria-label="More" onClick={() => set({ perWeek: Math.min(6, d.perWeek + 1) })} style={stepBtn}>+</button>
      </span>
      <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>times a week, any days</span>
    </div>
  );
  // Days, or times a week: always the same height, so nothing below moves.
  const daysBlock = (
    <div style={{ height: 32 }}>
      {d.mode === 'days' ? dayDots : perWeek}
    </div>
  );
  const timeCtl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" data-testid="habit-ask-any" onClick={() => set({ time: '' })} style={pill(!d.time.trim())}>Any time</button>
      <TimeField value={d.time} onChange={(t) => set({ time: t })} placeholder="--:--" testId="habit-ask-time" style={{ width: 96 }} />
    </div>
  );
  const amountUnit = d.amount?.unit ?? '';
  const goalCtl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" data-testid="habit-ask-amount-off" onClick={() => set({ amount: null })} style={pill(!d.amount)}>Tick</button>
      {d.amount ? (
        <span style={stepper(true)}>
          <button type="button" aria-label="Fewer" onClick={() => set({ amount: { target: Math.max(2, (d.amount?.target ?? 2) - 1), unit: amountUnit } })} style={stepBtn}>−</button>
          <input data-habit-card="" data-testid="habit-ask-amount-n" inputMode="numeric" aria-label="How many a day" value={d.amount.target || ''}
            onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 3)); set({ amount: { target: n, unit: amountUnit } }); }}
            style={{ width: 26, height: 28, border: 'none', background: 'transparent', color: 'var(--ink)', textAlign: 'center', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 650, outline: 'none', padding: 0 }} />
          <button type="button" aria-label="More" onClick={() => set({ amount: { target: Math.min(999, (d.amount?.target ?? 1) + 1), unit: amountUnit } })} style={stepBtn}>+</button>
          <input data-habit-card="" data-testid="habit-ask-amount-unit" aria-label="Unit" placeholder="glasses" maxLength={16} value={amountUnit}
            onChange={(e) => set({ amount: { target: d.amount?.target ?? 0, unit: e.target.value } })}
            style={{ width: 70, height: 28, border: 'none', borderLeft: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12, outline: 'none', padding: '0 8px', boxSizing: 'border-box' }} />
        </span>
      ) : (
        <button type="button" data-testid="habit-ask-amount-open" onClick={() => set({ amount: { target: 8, unit: '' } })} title="Count something each day: 8 glasses, 20 pages"
          style={{ ...stepper(false), cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-4)', padding: '0 10px', gap: 8, fontSize: 12 }}>
          <span aria-hidden>−</span><span>8</span><span aria-hidden>+</span><span style={{ borderLeft: '1px solid var(--paper-3)', paddingLeft: 8 }}>glasses</span>
        </button>
      )}
    </div>
  );
  // The number is the day's goal, not the size of one tick: said once, always
  // on one line (the card keeps its height).
  const goalHelp = (
    <span data-testid="habit-ask-goal-help" style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {d.amount
        ? `Each click adds 1${amountUnit ? ` ${amountUnit.replace(/s$/, '')}` : ''} · done at ${d.amount.target || '?'}`
        : 'One click a day marks it done'}
    </span>
  );
  const showWeekMode = !simple || d.mode === 'week';
  const showGoal = !simple || !!d.amount;
  const body = (
    <>
      {showWeekMode && modeSeg(false)}
      {daysBlock}
      <div style={rowGrid}><span style={rowLabel}>Time</span>{timeCtl}</div>
      {showGoal && <div style={rowGrid}><span style={rowLabel}>Goal</span>{goalCtl}</div>}
      {showGoal && <div style={{ ...rowGrid, minHeight: 0, marginTop: -6 }}><span />{goalHelp}</div>}
    </>
  );
  const card = (
    <div
      ref={ref}
      role="dialog"
      aria-label={initial ? `Edit ${name}` : `Add ${name}`}
      data-testid="habit-ask"
      data-owns-keys="true"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box',
        maxHeight: vh - 16, overflowY: 'auto', padding: 14, borderRadius: 12,
        background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-3)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)', fontFamily: 'var(--font-mono)', fontSize: 12,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <button type="button" aria-label="Cancel" onClick={onCancel} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}><MenuIcon name="drop" size={12} /></button>
      </div>

      {body}

      {!initial && archivedMatch && onRestore && !dup && (
        // One small line: an archived habit with this name can come back with its history.
        <div data-testid="habit-ask-archived" style={{ display: 'flex' }}>
          <button type="button" data-testid="habit-ask-restore" onClick={() => onRestore(archivedMatch.id)}
            title={`"${archivedMatch.name}" is in your archive: restore it with its history`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, maxWidth: '100%', padding: '0 9px', borderRadius: 999, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <MenuIcon name="restart" size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Restore "{archivedMatch.name}" from the archive</span>
          </button>
        </div>
      )}
      {dup && (
        <div data-testid="habit-ask-dup" style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
          You already have a <b style={{ color: 'var(--ink-2)' }}>{name}</b>; this adds a second one.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--paper-3)', paddingTop: 11 }}>
        <button
          type="button"
          data-testid="habit-ask-add"
          disabled={!answer}
          onClick={add}
          title={answer ? `${saveLabel ?? 'Add'} · ${cardSummary(d)}` : undefined}
          style={{
            height: 34, width: '100%', borderRadius: 8, border: 'none', cursor: answer ? 'pointer' : 'default', padding: '0 12px',
            background: answer ? 'var(--btn-primary-bg)' : 'var(--paper-3)', color: answer ? 'var(--btn-primary-fg)' : 'var(--ink-4)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {!answer
            ? (d.mode === 'days' && d.days.length === 0 ? 'Pick a day' : 'Check the time or amount')
            : <>{saveLabel ?? 'Add'} <span style={{ fontWeight: 500, opacity: 0.75 }}>{cardSummary(d)}</span> ↵</>}
        </button>
        {!initial && onCalendar && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {"Don't tick it? "}
            <button type="button" data-testid="habit-ask-calendar" onClick={onCalendar} title="Something you don't tick, like a class: a repeating event on the Calendar"
              style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, boxShadow: 'inset 0 -1px 0 var(--ink-4)' }}>
              Put it on the Calendar
            </button>
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onCancel(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop, pointerEvents: initial ? 'auto' : 'none' }} />
      {card}
    </>,
    document.body,
  );
}

const segWrap: React.CSSProperties = { display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' };
const segBtn = (on: boolean, small: boolean): React.CSSProperties => ({
  flex: 1, height: small ? 22 : 26, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: small ? 11 : 11.5, whiteSpace: 'nowrap', padding: '0 4px',
  fontWeight: on ? 650 : 500,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
});
const pill = (on: boolean): React.CSSProperties => ({
  height: 30, padding: '0 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap', boxSizing: 'border-box', border: 'none',
  boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb, var(--acid) 40%, transparent)' : 'inset 0 0 0 1px var(--paper-3)',
  background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', fontWeight: on ? 650 : 500,
});
const stepper = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', height: 30, borderRadius: 8, boxSizing: 'border-box', overflow: 'hidden', border: 'none',
  boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb, var(--acid) 40%, transparent)' : 'inset 0 0 0 1px var(--paper-3)',
  background: on ? 'color-mix(in srgb, var(--acid) 7%, transparent)' : 'transparent',
});
const stepBtn: React.CSSProperties = {
  width: 26, height: 28, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, fontFamily: 'var(--font-mono)',
};
const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '48px 1fr', alignItems: 'center', gap: 8, minHeight: 30 };
const rowLabel: React.CSSProperties = { fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' };
