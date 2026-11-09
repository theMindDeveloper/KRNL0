// Decision 40 — make something on the Calendar (double-click empty hours, the
// + button, or right-click → "New here…"). Once adds a
// plan at that time; Repeats adds a repeating event (a class, a shift — never
// ticked). The same card edits an event.
//
// Same look as the habit card (HabitAddAsk, draft A): the name on top, a
// switch, the days as circles, labelled Time and Length rows, one full-width
// button. One fixed height: nothing jumps while you set it.

import { pickerOpen } from '../../ui/Popover';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../ui/layers';
import { TimeField, parseTime } from '../../ui/TimeField';
import { MenuIcon } from '../../ui/menuIcons';
import { fmtLength } from '../../ui/WhenPopover';

export interface EventDraft {
  name: string;
  mode: 'once' | 'repeat';
  /** ISO weekdays 1 = Mon … 7 = Sun (Repeats). */
  days: number[];
  time: string;
  lengthMin: number;
}

interface Props {
  x: number;
  y: number;
  /** "Wed 11", the day it was made on (Once). */
  dayLabel: string;
  initial: EventDraft;
  /** False when editing an event (it always repeats). */
  allowOnce: boolean;
  submitLabel?: string;
  onSubmit: (d: EventDraft) => void;
  onClose: () => void;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function EventCard({ x, y, dayLabel, initial, allowOnce, submitLabel, onSubmit, onClose }: Props) {
  const [d, setD] = useState<EventDraft>(initial);
  const [timeText, setTimeText] = useState(initial.time);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerOpen()) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const time = parseTime(timeText);
  const endMin = time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + d.lengthMin : 0;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  const sorted = [...d.days].sort().join();
  // Short words where they exist, so the button always fits the card.
  const dayWords = sorted === '1,2,3,4,5,6,7' ? 'every day' : sorted === '1,2,3,4,5' ? 'weekdays' : sorted === '6,7' ? 'weekends'
    : d.days.length <= 2 ? [...d.days].sort().map((n) => SHORT[n - 1]).join(' ') : [...d.days].sort().map((n) => LETTERS[n - 1]).join(' ');
  const valid = d.name.trim() !== '' && !!time && (d.mode === 'once' || d.days.length > 0);
  const summary = d.mode === 'once' ? `${dayLabel} ${time ?? ''}` : d.days.length ? `${dayWords} ${time ?? ''}` : '';
  const label = submitLabel ?? (d.mode === 'once' ? 'Add plan' : d.days.length ? 'Add event' : 'Pick a day');
  const submit = () => { if (valid && time) onSubmit({ ...d, name: d.name.trim(), time }); };

  const W = 330;
  const H = 330;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - H - 8));
  const toggleDay = (n: number) => setD((p) => ({ ...p, days: p.days.includes(n) ? p.days.filter((v) => v !== n) : [...p.days, n] }));

  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
      <div
        data-testid="event-card"
        data-owns-keys="true"
        role="dialog"
        aria-label={allowOnce ? 'New here' : 'Edit event'}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 14, borderRadius: 12,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
        }}
      >
        {/* The name is the title, like the habit card's. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            autoFocus
            data-testid="event-name"
            aria-label="Name"
            placeholder={d.mode === 'repeat' ? 'Name it (Class, Shift…)' : 'Name it'}
            value={d.name}
            onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{ flex: 1, minWidth: 0, height: 28, border: 'none', borderBottom: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)', padding: '0 2px', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, outline: 'none' }}
          />
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 6, margin: -4, display: 'inline-flex' }}>
            <MenuIcon name="drop" size={12} />
          </button>
        </div>

        {allowOnce && (
          <div role="tablist" aria-label="Once or repeating" style={segWrap}>
            {(['once', 'repeat'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={d.mode === m} data-testid={`event-mode-${m}`} onClick={() => setD((p) => ({ ...p, mode: m }))} style={segBtn(d.mode === m)}>
                {m === 'repeat' && <MenuIcon name="repeat" size={11} />}{m === 'once' ? 'Once' : 'Repeats'}
              </button>
            ))}
          </div>
        )}

        {/* Days (Repeats) or the one day (Once): always the same height. */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
          {d.mode === 'repeat' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              {LETTERS.map((l, i) => {
                const on = d.days.includes(i + 1);
                return (
                  <button key={i} type="button" aria-pressed={on} data-testid={`event-day-${i + 1}`} aria-label={NAMES[i]} title={NAMES[i]} onClick={() => toggleDay(i + 1)}
                    style={{ width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500, border: 'none',
                      boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--paper-3)', background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)' }}>
                    {l}
                  </button>
                );
              })}
            </div>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontSize: 12.5 }}>
              <MenuIcon name="day" size={13} />On {dayLabel}, once
            </span>
          )}
        </div>

        <div style={rowGrid}>
          <span style={rowLabel}>Time</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimeField value={timeText} onChange={setTimeText} testId="event-time" minuteStep={15} onEnter={submit} onEscape={onClose} style={{ width: 96 }} />
            <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{time ? `to ${end}` : ''}</span>
          </div>
        </div>
        <div style={rowGrid}>
          <span style={rowLabel}>Length</span>
          <span style={stepper}>
            <button type="button" aria-label="Shorter" onClick={() => setD((p) => ({ ...p, lengthMin: Math.max(15, p.lengthMin - 15) }))} style={stepBtn}>−</button>
            <span data-testid="event-length" style={{ minWidth: 48, textAlign: 'center', fontSize: 12.5, fontWeight: 650 }}>{fmtLength(d.lengthMin)}</span>
            <button type="button" aria-label="Longer" onClick={() => setD((p) => ({ ...p, lengthMin: Math.min(16 * 60, p.lengthMin + 15) }))} style={stepBtn}>+</button>
          </span>
        </div>

        <div style={{ borderTop: '1px solid var(--paper-3)', paddingTop: 11, marginTop: 'auto' }}>
          <button type="button" data-testid="event-submit" disabled={!valid} onClick={submit}
            title={summary ? `${label} · ${summary}` : undefined}
            style={{ width: '100%', height: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: valid ? 'pointer' : 'default',
              background: valid ? 'var(--btn-primary-bg, var(--acid))' : 'var(--paper-3)', color: valid ? 'var(--btn-primary-fg, #111)' : 'var(--ink-4)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}{summary && valid ? <span style={{ fontWeight: 500, opacity: 0.75 }}> · {summary}</span> : null} ↵
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const segWrap: React.CSSProperties = { display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' };
const segBtn = (on: boolean): React.CSSProperties => ({
  flex: 1, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: on ? 650 : 500,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
});
const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center', gap: 8, minHeight: 30 };
const rowLabel: React.CSSProperties = { fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' };
const stepper: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 30, borderRadius: 8, boxSizing: 'border-box', overflow: 'hidden', width: 'fit-content',
  boxShadow: 'inset 0 0 0 1px var(--paper-3)',
};
const stepBtn: React.CSSProperties = {
  width: 28, height: 30, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, fontFamily: 'var(--font-mono)',
};
