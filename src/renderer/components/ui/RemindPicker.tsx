// "Remind me…" (review 4.1): how long before a plan starts to get a system
// notification. App-styled chips; fires while the plan is on the Calendar,
// window open or closed to the tray.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';

const LEADS: Array<[number, string]> = [[0, 'At the start'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 h before']];

interface Props {
  x: number;
  y: number;
  value: number | null;
  onPick: (min: number | null) => void;
  onClose: () => void;
}

export function RemindPicker({ x, y, value, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const W = 240;
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />
      <div
        data-testid="remind-picker"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: Math.max(8, Math.min(x, window.innerWidth - W - 8)), top: Math.max(8, Math.min(y, window.innerHeight - 220)),
          width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 12, borderRadius: 12, background: 'var(--paper)',
          border: '1px solid var(--paper-3)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>Remind me when it is on the Calendar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {LEADS.map(([min, label]) => (
            <button key={min} type="button" data-testid={`remind-${min}`} onClick={() => onPick(min)}
              style={{
                textAlign: 'left', height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)',
                border: `1px solid ${value === min ? 'var(--acid)' : 'transparent'}`, background: value === min ? 'color-mix(in srgb, var(--acid) 14%, transparent)' : 'transparent', color: 'var(--ink)',
              }}>
              {label}
            </button>
          ))}
        </div>
        {value !== null && (
          <button type="button" data-testid="remind-off" onClick={() => onPick(null)}
            style={{ alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12 }}>
            No reminder
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
