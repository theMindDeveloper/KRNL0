// Pick a due day: quick answers first (today, tomorrow, Friday, next week),
// then the next five weeks as a small grid. App-styled, never a native picker.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';
import { addDays } from '../../../shared/due';

interface Props {
  x: number;
  y: number;
  today: string;
  value: string | null;
  onPick: (dueOn: string | null) => void;
  onClose: () => void;
  /** False for a repeating plan with no Calendar time: it needs a day. */
  canClear?: boolean;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DuePicker({ x, y, today, value, onPick, onClose, canClear = true }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7; // Mon = 0
  const monday = addDays(today, -dow);
  const friday = addDays(today, (4 - dow + 7) % 7);
  const quick: Array<[string, string]> = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ...(friday !== today && friday !== addDays(today, 1) ? [['Friday', friday] as [string, string]] : []),
    ['In a week', addDays(today, 7)],
  ];
  const days = Array.from({ length: 35 }, (_, i) => addDays(monday, i));
  const W = 252;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 300));

  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />
      <div
        data-testid="due-picker"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 12, borderRadius: 12,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Due by</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {quick.map(([label, ymd], i) => (
            <button key={label} type="button" autoFocus={i === 0} data-testid={`due-quick-${label.toLowerCase().replace(/ /g, '-')}`} onClick={() => onPick(ymd)} style={chip(value === ymd)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {LETTERS.map((l, i) => <span key={i} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>{l}</span>)}
          {days.map((d) => {
            const past = d < today;
            const on = d === value;
            const n = Number(d.slice(8));
            return (
              <button
                key={d}
                type="button"
                data-testid={`due-day-${d}`}
                disabled={past}
                title={new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                onClick={() => onPick(d)}
                style={{
                  height: 26, borderRadius: 6, padding: 0, cursor: past ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5,
                  border: d === today ? '1px solid var(--paper-3)' : '1px solid transparent',
                  background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : past ? 'var(--ink-4)' : 'var(--ink-2)',
                  opacity: past ? 0.45 : 1, fontWeight: on ? 700 : 500,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        {value !== null && canClear && (
          <button type="button" data-testid="due-clear" onClick={() => onPick(null)}
            style={{ alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12 }}>
            No due date
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}

const chip = (on: boolean): React.CSSProperties => ({
  height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)',
  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent', color: 'var(--ink)',
});
