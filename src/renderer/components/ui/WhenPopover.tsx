// Decision 40 — one popover for a plan's When (a day + time, or a day at any
// time; its length; a reminder) and, on its own tab, its Deadline. Replaces
// "Edit time", "Due date…" and "Reminder…". App-styled: no native pickers.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';
import { addDays } from '../../../shared/due';
import { TimeField, parseTime } from './TimeField';
import { AppSelect } from './AppSelect';
import { MenuIcon, type MenuIconName } from './menuIcons';

export interface WhenValue {
  /** YYYY-MM-DD, or null for no day. */
  day: string | null;
  /** HH:MM, or null for any time. */
  time: string | null;
  /** Minutes, or null for no length. */
  lengthMin: number | null;
  /** Minutes before the start (0 = at the start), or null. Only with a time. */
  remindMin: number | null;
  /** YYYY-MM-DD, or null for no deadline. */
  deadline: string | null;
}

interface Props {
  x: number;
  y: number;
  today: string;
  value: WhenValue;
  tab?: 'when' | 'deadline';
  onApply: (next: WhenValue) => void;
  onClose: () => void;
  /** The plan card (Decision 40): the plan's name at the top… */
  title?: { text: string; tone?: string };
  /** …and what you can do with it (the timer, show it, delete it), the same
   *  from the Todo row and from its block on the Calendar. */
  actions?: ReadonlyArray<{ key: string; label: string; icon: MenuIconName; onClick: () => void; danger?: boolean }>;
  /** Adding a plan: the card follows the typed words (controlled). Each
   *  change on the card is reported; the parent keeps the value. */
  onChange?: (next: WhenValue) => void;
  /** Adding a plan: sits just above the add row, no backdrop, and the text
   *  field keeps the focus (typing goes on while the card is open). */
  anchorAbove?: { left: number; top: number };
  /** The main button's words ("Done ↵" when editing, "Add · … ↵" when adding). */
  primaryLabel?: string;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const REMIND: Array<{ value: string; label: string }> = [
  { value: 'off', label: 'No reminder' },
  { value: '0', label: 'At the start' },
  { value: '5', label: '5 min before' },
  { value: '10', label: '10 min before' },
  { value: '15', label: '15 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 h before' },
];

export const fmtLength = (m: number | null): string => {
  if (!m) return 'none';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${String(r).padStart(2, '0')}` : `${h}h`) : `${r}m`;
};

/** "Today", "Tmrw", "Fri", "Sat 21", "21 Nov" — the day words used everywhere (Decision 40). */
export function dayWord(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00`);
  const n = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tmrw';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (n >= 7 && n < 28) return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function WhenPopover({ x, y, today, value, tab: tab0 = 'when', onApply, onClose, title, actions, onChange, anchorAbove, primaryLabel }: Props) {
  const [tab, setTab] = useState<'when' | 'deadline'>(tab0);
  const [vLocal, setVLocal] = useState<WhenValue>(value);
  // Controlled (adding a plan): the parent's value is the card's value.
  const v = onChange ? value : vLocal;
  const setV = (f: (p: WhenValue) => WhenValue) => { const next = f(v); if (onChange) onChange(next); else setVLocal(next); };
  const [timeText, setTimeText] = useState(value.time ?? '');
  const [timeTouched, setTimeTouched] = useState(false);
  // While adding, a time typed in the words shows here until the card's own field is used.
  const shownTime = onChange && !timeTouched ? (value.time ?? '') : timeText;
  const setTime = (t: string) => {
    setTimeText(t);
    setTimeTouched(true);
    if (onChange) { const pt = t.trim() ? parseTime(t) : null; onChange({ ...v, day: v.day ?? (pt ? today : null), time: pt ?? null }); }
  };
  const [weekOffset, setWeekOffset] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(420);
  useLayoutEffect(() => {
    const m = cardRef.current?.offsetHeight ?? 0;
    if (m && Math.abs(m - cardH) > 1) setCardH(m);
  });

  const apply = () => {
    const t = shownTime.trim() ? parseTime(shownTime) : null;
    const time = v.day ? t : null;
    onApply({ ...v, time, remindMin: time ? v.remindMin : null });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); apply(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7; // Mon = 0
  const monday = addDays(today, -dow + weekOffset * 7);
  const days = Array.from({ length: 35 }, (_, i) => addDays(monday, i));
  const friday = addDays(today, (4 - dow + 7) % 7 || 7);
  const nextMon = addDays(today, 7 - dow);
  const quick: Array<[string, string]> = tab === 'when'
    ? [['Today', today], ['Tmrw', addDays(today, 1)], ...(friday !== addDays(today, 1) ? [['Fri', friday] as [string, string]] : []), ...(nextMon !== addDays(today, 1) ? [['Next Mon', nextMon] as [string, string]] : [['In a week', addDays(today, 7)] as [string, string]])]
    : [['Today', today], ['Tmrw', addDays(today, 1)], ['Fri', friday], ['In a week', addDays(today, 7)]];
  const selected = tab === 'when' ? v.day : v.deadline;
  const pick = (d: string) => setV((p) => (tab === 'when' ? { ...p, day: d } : { ...p, deadline: d }));
  const late = !!(v.day && v.deadline && v.day > v.deadline);
  const hasTime = !!(v.day && shownTime.trim() && parseTime(shownTime));

  const W = 264;
  const left = Math.max(8, Math.min(anchorAbove ? anchorAbove.left : x, window.innerWidth - W - 8));
  const top = anchorAbove ? Math.max(8, anchorAbove.top - cardH - 8) : Math.max(8, Math.min(y, window.innerHeight - cardH - 8));
  const monthLabel = new Date(`${days[14]}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return createPortal(
    <>
      {!anchorAbove && <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />}
      <div
        ref={cardRef}
        data-testid="when-popover"
        data-adding={anchorAbove ? 'true' : undefined}
        role="dialog"
        aria-label={tab === 'when' ? 'When' : 'Deadline'}
        // Adding: clicks on the card never take the focus from the text field.
        onMouseDown={(e) => { e.stopPropagation(); if (anchorAbove && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
        style={{
          position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 10, borderRadius: 12,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {title.tone && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: title.tone, flexShrink: 0, marginTop: 5 }} />}
            <span data-testid="plan-card-title" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{title.text}</span>
            <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0 }}>
              <MenuIcon name="drop" size={12} />
            </button>
          </div>
        )}
        <div role="tablist" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' }}>
          {(['when', 'deadline'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} data-testid={`when-tab-${t}`} onClick={() => setTab(t)}
              style={{ flex: 1, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontFamily: 'inherit', fontSize: 11.5, fontWeight: tab === t ? 650 : 500,
                background: tab === t ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
                color: tab === t ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
              {t === 'deadline' && <MenuIcon name="deadline" size={11} />}{t === 'when' ? 'When' : 'Deadline'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {quick.map(([label, ymd]) => (
            <button key={label} type="button" data-testid={`when-quick-${label.toLowerCase().replace(/ /g, '-')}`} onClick={() => pick(ymd)} style={chip(selected === ymd)}>{label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
          <button type="button" aria-label="Earlier weeks" onClick={() => setWeekOffset((w) => Math.max(0, w - 5))} disabled={weekOffset === 0} style={navBtn(weekOffset === 0)}>‹</button>
          <span>{monthLabel}</span>
          <button type="button" aria-label="Later weeks" onClick={() => setWeekOffset((w) => w + 5)} style={navBtn(false)}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {LETTERS.map((l, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-4)' }}>{l}</span>)}
          {days.map((d) => {
            const past = d < today;
            const on = d === selected;
            const isDeadline = d === v.deadline;
            const isWhen = tab === 'deadline' && d === v.day;
            return (
              <button
                key={d}
                type="button"
                data-testid={`when-day-${d}`}
                disabled={past}
                title={new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                onClick={() => pick(d)}
                style={{
                  position: 'relative', height: 26, borderRadius: 6, padding: 0, cursor: past ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 11.5,
                  border: d === today ? '1px solid var(--ink-3)' : '1px solid transparent',
                  background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : past ? 'var(--ink-4)' : 'var(--ink-2)',
                  opacity: past ? 0.45 : 1, fontWeight: on ? 700 : 500,
                }}
              >
                {Number(d.slice(8))}
                {isDeadline && tab === 'when' && <span aria-label="deadline" style={{ position: 'absolute', top: 1, right: 2, color: d < today ? 'var(--rust)' : 'var(--ink-2)', lineHeight: 0 }}><MenuIcon name="deadline" size={8} /></span>}
                {isWhen && <span aria-label="its day" style={{ position: 'absolute', bottom: 2, left: '50%', marginLeft: -2, width: 4, height: 4, borderRadius: 2, background: 'var(--acid)' }} />}
              </button>
            );
          })}
        </div>

        {tab === 'when' && (
          <>
            <div style={rowStyle}>
              <span style={iconCol}><MenuIcon name="when" /></span>
              <button type="button" data-testid="when-any-time" onClick={() => setTime('')} style={chip(!shownTime.trim())}>Any time</button>
              <TimeField value={shownTime} onChange={setTime} testId="when-time" placeholder="--:--" onEnter={() => apply()} onEscape={onClose} style={{ width: 96 }} />
            </div>
            <div style={rowStyle}>
              <span style={iconCol}><MenuIcon name="length" /></span>
              <button type="button" aria-label="Shorter" data-testid="when-len-minus" onClick={() => setV((p) => ({ ...p, lengthMin: p.lengthMin && p.lengthMin > 15 ? p.lengthMin - 15 : null }))} style={stepBtn}>−</button>
              <span data-testid="when-length" style={{ minWidth: 52, textAlign: 'center', color: v.lengthMin ? 'var(--ink)' : 'var(--ink-3)' }}>{fmtLength(v.lengthMin)}</span>
              <button type="button" aria-label="Longer" data-testid="when-len-plus" onClick={() => setV((p) => ({ ...p, lengthMin: Math.min(480, (p.lengthMin ?? 0) + 15) }))} style={stepBtn}>+</button>
            </div>
            {hasTime && (
              <div style={rowStyle}>
                <span style={iconCol}><MenuIcon name="reminder" /></span>
                <AppSelect
                  value={v.remindMin === null ? 'off' : String(v.remindMin)}
                  options={REMIND}
                  onChange={(s) => setV((p) => ({ ...p, remindMin: s === 'off' ? null : Number(s) }))}
                  testId="when-remind"
                  ariaLabel="Reminder"
                  style={{ flex: 1 }}
                />
              </div>
            )}
          </>
        )}

        {late && <div data-testid="when-late" style={{ color: 'var(--rust)', fontSize: 11 }}>After its deadline</div>}

        {actions && actions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderTop: '1px solid var(--paper-3)', paddingTop: 8 }}>
            {actions.map((a) => (
              <button key={a.key} type="button" data-testid={`plan-card-${a.key}`} onClick={a.onClick}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid var(--paper-3)', background: 'transparent', color: a.danger ? 'var(--rust)' : 'var(--ink)', fontFamily: 'inherit', fontSize: 11.5 }}>
                <span style={{ display: 'inline-flex', color: a.danger ? 'var(--rust)' : 'var(--ink-3)' }}><MenuIcon name={a.icon} size={13} /></span>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--paper-3)', paddingTop: 8 }}>
          {tab === 'when'
            ? <button type="button" data-testid="when-clear" onClick={() => { setV((p) => ({ ...p, day: null, time: null })); setTimeText(''); setTimeTouched(true); }} style={ghost}>No day</button>
            : <button type="button" data-testid="when-no-deadline" onClick={() => setV((p) => ({ ...p, deadline: null }))} style={ghost}>No deadline</button>}
          <button type="button" data-testid="when-done" onClick={apply} title="Save the day, time and deadline"
            style={{ height: 28, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontFamily: 'inherit', fontSize: 12, fontWeight: 650 }}>
            {primaryLabel ?? 'Done ↵'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 };
const iconCol: React.CSSProperties = { width: 14, display: 'inline-flex', color: 'var(--ink-3)', flexShrink: 0 };
const chip = (on: boolean): React.CSSProperties => ({
  height: 24, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
  border: `1px solid ${on ? 'transparent' : 'var(--paper-3)'}`,
  background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-2)', fontWeight: on ? 650 : 500,
});
const stepBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};
const navBtn = (off: boolean): React.CSSProperties => ({
  width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: off ? 'var(--ink-4)' : 'var(--ink-2)', cursor: off ? 'default' : 'pointer', fontSize: 14, padding: 0,
});
const ghost: React.CSSProperties = { height: 26, padding: '0 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5 };
