// Decision 40/62 — make an event on the Calendar (its field, double-click empty
// hours, or right-click → "New here…"). Once: an event on that day; Repeats: a
// repeating event (a class, a shift). Events are never ticked; tasks come from
// the Todo node, never from here. The same card edits an event, either way.
//
// Same look as the habit card (HabitAddAsk, draft A): the name on top, a
// switch, the days as circles, labelled Time and Length rows, one full-width
// button. One fixed height: nothing jumps while you set it.

import { useOneOverlay } from '../../ui/oneOverlay';
import { pickerOpen } from '../../ui/Popover';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../ui/layers';
import { TimeField, parseTime } from '../../ui/TimeField';
import { MenuIcon } from '../../ui/menuIcons';
import { CARD_W, CardClose, CardGroup, cardBox, cardCtls, cardDayDot, cardFoot, cardHead, cardLabel, cardNote, cardPrimary, cardRow, cardSeg, cardSegBtn, cardStepBtn, cardStepValue, cardStepper, cardTime, cardTitle } from '../../ui/addCard';
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
  /** Show the Once · Repeats switch. */
  allowOnce: boolean;
  submitLabel?: string;
  onSubmit: (d: EventDraft) => void;
  onClose: () => void;
  /**
   * Decision 62 — the card of the Calendar's field, shown while you type (as
   * Todo's): its name comes from the field (no name box, no focus taken), it
   * follows the words (`value`), changes go back through `onChange`, and it
   * sits above the field (`anchorAbove`) with no backdrop.
   */
  attached?: { value: EventDraft; onChange: (d: EventDraft) => void; anchorAbove: { left: number; top: number } };
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function EventCard({ x, y, dayLabel, initial, allowOnce, submitLabel, onSubmit, onClose, attached }: Props) {
  // One overlay at a time (the card that follows typing is part of the add itself).
  useOneOverlay(!attached, onClose);
  const [own, setOwn] = useState<EventDraft>(initial);
  const d = attached ? attached.value : own;
  const setD = (fn: (p: EventDraft) => EventDraft) => {
    if (attached) attached.onChange(fn(attached.value));
    else setOwn(fn);
  };
  const [timeText, setTimeTextRaw] = useState(d.time);
  // Attached: the words can change the time; the field follows them.
  useEffect(() => { if (attached) setTimeTextRaw(attached.value.time); }, [attached?.value.time]);
  const setTimeText = (t: string) => {
    setTimeTextRaw(t);
    const ok = parseTime(t);
    if (attached && ok && ok !== attached.value.time) attached.onChange({ ...attached.value, time: ok });
  };
  useEffect(() => {
    // Attached: Escape belongs to the field (it stops adding).
    if (attached) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerOpen()) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, !!attached]);

  const time = parseTime(timeText);
  const endMin = time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + d.lengthMin : 0;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  const sorted = [...d.days].sort().join();
  // Short words where they exist, so the button always fits the card.
  const dayWords = sorted === '1,2,3,4,5,6,7' ? 'every day' : sorted === '1,2,3,4,5' ? 'weekdays' : sorted === '6,7' ? 'weekends'
    : d.days.length <= 2 ? [...d.days].sort().map((n) => SHORT[n - 1]).join(' ') : [...d.days].sort().map((n) => LETTERS[n - 1]).join(' ');
  const valid = d.name.trim() !== '' && !!time && (d.mode === 'once' || d.days.length > 0);
  const summary = d.mode === 'once' ? `${dayLabel} ${time ?? ''}` : d.days.length ? `${dayWords} ${time ?? ''}` : '';
  const label = submitLabel ?? (d.mode === 'once' || d.days.length ? 'Add event' : 'Pick a day');
  const submit = () => { if (valid && time) onSubmit({ ...d, name: d.name.trim(), time }); };

  const W = CARD_W;
  const H = 330;
  const ax = attached ? attached.anchorAbove.left : x;
  const ay = attached ? attached.anchorAbove.top - H - 8 : y;
  const left = Math.max(8, Math.min(ax, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(ay, window.innerHeight - H - 8));
  const toggleDay = (n: number) => setD((p) => ({ ...p, days: p.days.includes(n) ? p.days.filter((v) => v !== n) : [...p.days, n] }));

  return createPortal(
    <>
      {!attached && <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />}
      <div
        data-testid="event-card"
        className="kw-card"
        data-owns-keys="true"
        role="dialog"
        aria-label={allowOnce ? 'New here' : 'Edit event'}
        // Attached: a press on the card never takes the focus from the field.
        onMouseDown={(e) => { e.stopPropagation(); if (attached && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
        style={{
          ...cardBox, position: 'fixed', left, top, zIndex: Z.popover,
        }}
      >
        {/* The name is the title, like the habit card's. */}
        <div style={cardHead}>
          {attached ? (
            <span data-testid="event-name" style={{ ...cardTitle, height: 28, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: d.name ? 'var(--ink)' : 'var(--ink-4)' }}>{d.name || 'Name it'}</span>
          ) : <input
            autoFocus
            data-testid="event-name"
            aria-label="Name"
            placeholder={d.mode === 'repeat' ? 'Name it (Class, Shift…)' : 'Name it'}
            value={d.name}
            onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{ ...cardTitle, height: 28, border: 'none', background: 'transparent', color: 'var(--ink)', padding: 0, outline: 'none' }}
          />}
          <CardClose onClick={onClose} />
        </div>

        {allowOnce && (
          <div role="tablist" aria-label="Once or repeating" style={segWrap}>
            {(['once', 'repeat'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={d.mode === m} data-testid={`event-mode-${m}`} onClick={() => setD((p) => ({ ...p, mode: m }))} style={segBtn(d.mode === m)}>
                {m === 'repeat' && <MenuIcon name="repeat" size={12} />}{m === 'once' ? 'Once' : 'Repeats'}
              </button>
            ))}
          </div>
        )}

        {/* One block, a line per setting: the day(s), the time, the length. */}
        <CardGroup>
          <div style={{ ...cardRow, minHeight: 46 }}>
            {d.mode === 'repeat' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 4 }}>
                {LETTERS.map((l, i) => {
                  const on = d.days.includes(i + 1);
                  return (
                    <button key={i} type="button" aria-pressed={on} data-testid={`event-day-${i + 1}`} aria-label={NAMES[i]} title={NAMES[i]} onClick={() => toggleDay(i + 1)}
                      style={{ ...cardDayDot(on), width: 32, height: 32, ...(on ? {} : { background: 'var(--paper-3)' }) }}>
                      {l}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <span style={cardLabel}>Day</span>
                <span data-testid="event-day-once" style={{ fontWeight: 500, paddingRight: 4 }}>{dayLabel}</span>
              </>
            )}
          </div>
          <div style={cardRow}>
            <span style={cardLabel}>Time</span>
            <div style={cardCtls}>
              <TimeField value={timeText} onChange={setTimeText} testId="event-time" minuteStep={5} onEnter={submit} onEscape={onClose} style={cardTime} />
              {time && <span data-testid="event-end" style={cardNote}>– {end}</span>}
            </div>
          </div>
          <div style={cardRow}>
            <span style={cardLabel}>Length</span>
            <span style={cardStepper()}>
              <button type="button" aria-label="Shorter" onClick={() => setD((p) => ({ ...p, lengthMin: Math.max(15, p.lengthMin - 15) }))} style={cardStepBtn}>−</button>
              <span data-testid="event-length" style={cardStepValue}>{fmtLength(d.lengthMin)}</span>
              <button type="button" aria-label="Longer" onClick={() => setD((p) => ({ ...p, lengthMin: Math.min(16 * 60, p.lengthMin + 15) }))} style={cardStepBtn}>+</button>
            </span>
          </div>
        </CardGroup>

        <div style={{ ...cardFoot, marginTop: 'auto' }}>
          <button type="button" data-testid="event-submit" disabled={!valid} onClick={submit}
            title={summary ? `${label} · ${summary}` : undefined}
            style={{ ...cardPrimary(valid), width: '100%' }}>
            {label}{summary && valid ? <span style={{ fontWeight: 500, opacity: 0.72 }}> · {summary}</span> : null}
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
