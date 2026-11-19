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
import { CARD_W, CardClose, cardBox, cardCtls, cardDayDot, cardFoot, cardHead, cardLabel, cardPrimary, cardRow, cardSeg, cardSegBtn, cardStepBtn, cardStepValue, cardStepper, cardTime, cardTitle } from '../../ui/addCard';
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

  const W = CARD_W;
  const H = 330;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - H - 8));
  const toggleDay = (n: number) => setD((p) => ({ ...p, days: p.days.includes(n) ? p.days.filter((v) => v !== n) : [...p.days, n] }));

  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
      <div
        data-testid="event-card"
        className="kw-card"
        data-owns-keys="true"
        role="dialog"
        aria-label={allowOnce ? 'New here' : 'Edit event'}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          ...cardBox, position: 'fixed', left, top, zIndex: Z.popover,
        }}
      >
        {/* The name is the title, like the habit card's. */}
        <div style={cardHead}>
          <input
            autoFocus
            data-testid="event-name"
            aria-label="Name"
            placeholder={d.mode === 'repeat' ? 'Name it (Class, Shift…)' : 'Name it'}
            value={d.name}
            onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{ ...cardTitle, height: 28, border: 'none', borderBottom: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)', padding: 0, fontFamily: 'inherit', outline: 'none' }}
          />
          <CardClose onClick={onClose} />
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
                    style={cardDayDot(on)}>
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
          <div style={cardCtls}>
            <TimeField value={timeText} onChange={setTimeText} testId="event-time" minuteStep={15} onEnter={submit} onEscape={onClose} style={cardTime} />
            <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{time ? `to ${end}` : ''}</span>
          </div>
        </div>
        <div style={rowGrid}>
          <span style={rowLabel}>Length</span>
          <span style={stepper}>
            <button type="button" aria-label="Shorter" onClick={() => setD((p) => ({ ...p, lengthMin: Math.max(15, p.lengthMin - 15) }))} style={stepBtn}>−</button>
            <span data-testid="event-length" style={cardStepValue}>{fmtLength(d.lengthMin)}</span>
            <button type="button" aria-label="Longer" onClick={() => setD((p) => ({ ...p, lengthMin: Math.min(16 * 60, p.lengthMin + 15) }))} style={stepBtn}>+</button>
          </span>
        </div>

        <div style={{ ...cardFoot, marginTop: 'auto' }}>
          <button type="button" data-testid="event-submit" disabled={!valid} onClick={submit}
            title={summary ? `${label} · ${summary}` : undefined}
            style={{ ...cardPrimary(valid), width: '100%' }}>
            {label}{summary && valid ? <span style={{ fontWeight: 500, opacity: 0.75 }}> · {summary}</span> : null} ↵
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// One layout for every add card (ui/addCard.tsx).
const segWrap = cardSeg;
const segBtn = cardSegBtn;
const rowGrid = cardRow;
const rowLabel = cardLabel;
const stepper = cardStepper();
const stepBtn = cardStepBtn;
