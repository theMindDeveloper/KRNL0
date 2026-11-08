// Decision 40 — make something on the Calendar: right-click empty hours →
// "New here…". Once adds a plan at that time; Repeats adds a repeating event
// (a class, a shift — never ticked). The same card edits an event.

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

export function EventCard({ x, y, dayLabel, initial, allowOnce, submitLabel, onSubmit, onClose }: Props) {
  const [d, setD] = useState<EventDraft>(initial);
  const [timeText, setTimeText] = useState(initial.time);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const time = parseTime(timeText);
  const endMin = time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + d.lengthMin : 0;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  const sorted = [...d.days].sort().join();
  // Short words where they exist, so the button always fits the card.
  const dayLetters = sorted === '1,2,3,4,5,6,7' ? 'every day' : sorted === '1,2,3,4,5' ? 'weekdays' : sorted === '6,7' ? 'weekends' : [...d.days].sort().map((n) => LETTERS[n - 1]).join('');
  const valid = d.name.trim() !== '' && !!time && (d.mode === 'once' || d.days.length > 0);
  const label = submitLabel ?? (d.mode === 'once' ? `Add plan · ${dayLabel} ${time ?? ''}` : d.days.length ? `Add event · ${dayLetters} ${time ?? ''}` : 'Pick a day');
  const submit = () => { if (valid && time) onSubmit({ ...d, name: d.name.trim(), time }); };

  const W = 268;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 300));
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />
      <div
        data-testid="event-card"
        role="dialog"
        aria-label={allowOnce ? 'New here' : 'Edit event'}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 12, borderRadius: 12,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--ink-2)' }}>
          <span>{d.mode === 'once' ? `${dayLabel} · ${time ?? '--:--'}–${time ? end : '--:--'}` : `${time ?? '--:--'}–${time ? end : '--:--'}`}</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
            <MenuIcon name="drop" size={12} />
          </button>
        </div>
        <input
          autoFocus
          data-testid="event-name"
          aria-label="Name"
          placeholder="Name"
          value={d.name}
          onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          style={{ height: 30, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', padding: '0 9px', fontFamily: 'inherit', fontSize: 12.5, outline: 'none' }}
        />
        {allowOnce && (
          <div role="tablist" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' }}>
            {(['once', 'repeat'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={d.mode === m} data-testid={`event-mode-${m}`} onClick={() => setD((p) => ({ ...p, mode: m }))}
                style={{ flex: 1, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontFamily: 'inherit', fontSize: 11.5, fontWeight: d.mode === m ? 650 : 500,
                  background: d.mode === m ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
                  color: d.mode === m ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
                {m === 'repeat' && <MenuIcon name="repeat" size={11} />}{m === 'once' ? 'Once' : 'Repeats'}
              </button>
            ))}
          </div>
        )}
        {d.mode === 'repeat' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {LETTERS.map((l, i) => {
              const on = d.days.includes(i + 1);
              return (
                <button key={i} type="button" aria-pressed={on} data-testid={`event-day-${i + 1}`}
                  aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}
                  onClick={() => setD((p) => ({ ...p, days: on ? p.days.filter((x) => x !== i + 1) : [...p.days, i + 1] }))}
                  style={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500,
                    border: on ? 'none' : '1px solid var(--paper-3)', background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)' }}>
                  {l}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--ink-3)', display: 'inline-flex' }}><MenuIcon name="when" /></span>
          <TimeField value={timeText} onChange={setTimeText} testId="event-time" minuteStep={15} onEnter={submit} onEscape={onClose} style={{ width: 96 }} />
          <span style={{ color: 'var(--ink-3)', display: 'inline-flex', marginLeft: 6 }}><MenuIcon name="length" /></span>
          <button type="button" aria-label="Shorter" onClick={() => setD((p) => ({ ...p, lengthMin: Math.max(15, p.lengthMin - 15) }))} style={stepBtn}>−</button>
          <span data-testid="event-length" style={{ minWidth: 40, textAlign: 'center' }}>{fmtLength(d.lengthMin)}</span>
          <button type="button" aria-label="Longer" onClick={() => setD((p) => ({ ...p, lengthMin: Math.min(16 * 60, p.lengthMin + 15) }))} style={stepBtn}>+</button>
        </div>
        <button type="button" data-testid="event-submit" disabled={!valid} onClick={submit}
          style={{ alignSelf: 'stretch', minHeight: 30, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: valid ? 'pointer' : 'default', opacity: valid ? 1 : 0.5,
            background: 'var(--btn-primary-bg, var(--acid))', color: 'var(--btn-primary-fg, #111)', fontFamily: 'inherit', fontSize: 12, fontWeight: 650, whiteSpace: 'normal', textAlign: 'center' }}>
          {label} ↵
        </button>
      </div>
    </>,
    document.body,
  );
}

const stepBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};
