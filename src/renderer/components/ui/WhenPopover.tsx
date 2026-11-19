// Decision 40 — one popover for a plan's When (a day + time, or a day at any
// time; its length; a reminder) and its Deadline. Replaces "Edit time",
// "Due date…" and "Reminder…". App-styled: no native pickers.
//
// window-frame.md, cards — short by default: three day chips and "Date" (the
// month opens only when asked for), time, length; the deadline is one row; the
// actions are one row in the menus' order (what happened, Won't do, Delete)
// with the rest behind More; the main button says "Save", never a second "Done".

import { pickerOpen } from './Popover';
import { useEasyMode } from '../../store/uiMode';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';
import { addDays } from '../../../shared/due';
import { TimeField, parseTime } from './TimeField';
import { AppSelect } from './AppSelect';
import { MenuIcon, type MenuIconName } from './menuIcons';
import { LineGlyph } from './LineGlyph';

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
  /** `sub`: a quiet line under the name, e.g. "after Day 2" for a chained plan. */
  title?: { text: string; tone?: string; sub?: string };
  /** …and what you can do with it (the timer, show it, delete it), the same
   *  from the Todo row and from its block on the Calendar. */
  actions?: ReadonlyArray<{ key: string; label: string; icon: MenuIconName; onClick: () => void; danger?: boolean }>;
  /** Adding a plan: the card follows the typed words (controlled). Each
   *  change on the card is reported; the parent keeps the value. */
  onChange?: (next: WhenValue) => void;
  /** Adding a plan: sits just above the add row, no backdrop, and the text
   *  field keeps the focus (typing goes on while the card is open). */
  anchorAbove?: { left: number; top: number };
  /** The main button's words ("Save ↵" when editing, "Add ↵" when adding). */
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
  const easy = useEasyMode();
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
  // The month is one tap away ("Date"); the three day chips cover most plans.
  const [gridOpen, setGridOpen] = useState(false);
  // Actions used less often (the timer, Show) sit behind More.
  const [moreOpen, setMoreOpen] = useState(false);
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
      if (e.key === 'Escape') { if (pickerOpen()) return; e.stopPropagation(); onClose(); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement) && !pickerOpen()) { e.preventDefault(); apply(); }
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
  // A day that is none of the chips shows on the "Date" chip itself.
  const offQuick = !!selected && !quick.some(([, d]) => d === selected);
  // menus.md — what happened, Won't do, Delete; everything else behind More.
  const MAIN = ['done', 'wontdo', 'delete'];
  const mainActions = (actions ?? []).filter((a) => MAIN.includes(a.key)).sort((a, b) => MAIN.indexOf(a.key) - MAIN.indexOf(b.key));
  const moreActions = (actions ?? []).filter((a) => !MAIN.includes(a.key));

  const W = 300;
  const left = Math.max(8, Math.min(anchorAbove ? anchorAbove.left : x, window.innerWidth - W - 8));
  const top = anchorAbove ? Math.max(8, anchorAbove.top - cardH - 8) : Math.max(8, Math.min(y, window.innerHeight - cardH - 8));
  const monthLabel = new Date(`${days[14]}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return createPortal(
    <>
      {!anchorAbove && <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />}
      <div
        ref={cardRef}
        data-testid="when-popover"
        className="kw-card"
        data-owns-keys="true"
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
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span data-testid="plan-card-title" style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{title.text}</span>
              {title.sub && <span data-testid="plan-card-sub" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{title.sub}</span>}
            </span>
            <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0 }}>
              <LineGlyph name="close" size={12} />
            </button>
          </div>
        )}
        {/* Picking the deadline uses the same day picker, named, with a way back. */}
        {tab === 'deadline' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" role="tab" aria-selected={false} data-testid="when-tab-when" onClick={() => { setTab('when'); setGridOpen(false); }} style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 6px 0 2px' }}>
              <MenuIcon name="back" size={12} />When
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 650 }}><MenuIcon name="deadline" size={11} />Deadline</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {quick.map(([label, ymd]) => (
            <button key={label} type="button" data-testid={`when-quick-${label.toLowerCase().replace(/ /g, '-')}`} onClick={() => pick(ymd)} style={chip(selected === ymd)}>{label}</button>
          ))}
          <button type="button" data-testid="when-pick-date" aria-expanded={gridOpen} title="Pick another date" onClick={() => setGridOpen((o) => !o)}
            style={{ ...chip(offQuick), display: 'inline-flex', alignItems: 'center', gap: 5, ...(gridOpen && !offQuick ? { borderColor: 'var(--ink-3)', color: 'var(--ink)' } : {}) }}>
            <MenuIcon name="day" size={12} />{offQuick && selected ? dayWord(selected, today) : 'Date'}
          </button>
        </div>

        {gridOpen && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
              <button type="button" aria-label="Earlier weeks" onClick={() => setWeekOffset((w) => Math.max(0, w - 5))} disabled={weekOffset === 0} style={navBtn(weekOffset === 0)}>‹</button>
              <span>{monthLabel}</span>
              <button type="button" aria-label="Later weeks" onClick={() => setWeekOffset((w) => w + 5)} style={navBtn(false)}>›</button>
            </div>
            <div data-testid="when-month" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
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
          </>
        )}

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
            {/* Reminders are Advanced (owner, 2026-11-09); in Easy a reminder set
                earlier still shows, so it can be seen and turned off. */}
            {hasTime && (!easy || value.remindMin !== null) && (
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
            {/* easy-mode D19 — Easy plans have one date, their When (a deadline set
                earlier still shows here, so it can be seen and cleared). One row,
                not a tab: it opens the same day picker for the deadline. */}
            {(!easy || !!value.deadline) && (
              <div style={rowStyle}>
                <span style={iconCol}><MenuIcon name="deadline" /></span>
                <button type="button" role="tab" aria-selected={false} data-testid="when-tab-deadline" onClick={() => { setTab('deadline'); setGridOpen(false); }}
                  style={{ ...chip(false), ...(v.deadline ? { color: late ? 'var(--rust)' : 'var(--ink)', borderColor: late ? 'var(--rust)' : 'var(--ink-4)' } : { color: 'var(--ink-3)' }) }}>
                  {v.deadline ? `Deadline ${dayWord(v.deadline, today)}` : 'Add a deadline'}
                </button>
              </div>
            )}
          </>
        )}

        {late && <div data-testid="when-late" style={{ color: 'var(--rust)', fontSize: 11 }}>After its deadline</div>}

        {mainActions.length + moreActions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--paper-3)', paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {mainActions.map((a) => {
                // Delete is the one icon everybody knows: it keeps the row on one line.
                const iconOnly = a.key === 'delete';
                return (
                  <button key={a.key} type="button" data-testid={`plan-card-${a.key}`} onClick={a.onClick} title={iconOnly ? a.label : undefined} aria-label={iconOnly ? a.label : undefined}
                    style={{ ...actionBtn, flex: a.key === 'done' ? '1 1 0' : '0 0 auto', minWidth: 0, overflow: 'hidden', color: a.danger ? 'var(--rust)' : 'var(--ink)', ...(iconOnly ? { width: 28, padding: 0, justifyContent: 'center' } : {}) }}>
                    <span style={{ display: 'inline-flex', color: a.danger ? 'var(--rust)' : 'var(--ink-3)' }}><MenuIcon name={a.icon} size={13} /></span>
                    {!iconOnly && a.label}
                  </button>
                );
              })}
              {moreActions.length > 0 && (
                <button type="button" data-testid="plan-card-more" aria-expanded={moreOpen} title="More" aria-label="More" onClick={() => setMoreOpen((o) => !o)}
                  style={{ ...actionBtn, flex: mainActions.length === 0 ? '1 1 auto' : '0 0 auto', width: mainActions.length === 0 ? undefined : 28, padding: mainActions.length === 0 ? '4px 8px' : 0, justifyContent: 'center', color: moreOpen ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', borderColor: moreOpen ? 'var(--acid-ink, var(--acid))' : 'var(--paper-3)' }}>
                  <MenuIcon name="more" size={13} />{mainActions.length === 0 && 'More'}
                </button>
              )}
            </div>
            {moreOpen && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {moreActions.map((a) => (
                  <button key={a.key} type="button" data-testid={`plan-card-${a.key}`} onClick={a.onClick} style={{ ...actionBtn, flex: '1 1 auto', color: a.danger ? 'var(--rust)' : 'var(--ink)' }}>
                    <span style={{ display: 'inline-flex', color: 'var(--ink-3)' }}><MenuIcon name={a.icon} size={13} /></span>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--paper-3)', paddingTop: 8 }}>
          {tab === 'when'
            ? <button type="button" data-testid="when-clear" onClick={() => { setV((p) => ({ ...p, day: null, time: null })); setTimeText(''); setTimeTouched(true); }} style={ghost}>No day</button>
            : <button type="button" data-testid="when-no-deadline" onClick={() => setV((p) => ({ ...p, deadline: null }))} style={ghost}>No deadline</button>}
          <button type="button" data-testid="when-done" onClick={apply} title="Save the day, time and deadline"
            style={{ height: 28, padding: '0 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
            {primaryLabel ?? 'Save ↵'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 };
const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
  border: '1px solid var(--paper-3)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11.5, boxSizing: 'border-box',
};
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
