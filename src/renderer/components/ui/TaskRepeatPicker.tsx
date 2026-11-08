// "Repeat…" on a plan (review 5.3): every day, weekdays, or every <weekday>.
// Ticking it off brings the next one. App-styled, never a native picker.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';
import { describeTaskRepeat, type TaskRepeat } from '../../../shared/repeatTask';

interface Props {
  x: number;
  y: number;
  /** ISO weekday (1 = Mon) offered for "every <weekday>": the plan's own day. */
  weekday: number;
  value: TaskRepeat | null;
  onPick: (r: TaskRepeat | null) => void;
  onClose: () => void;
}

const same = (a: TaskRepeat | null, b: TaskRepeat) => !!a && a.kind === b.kind && (a.kind !== 'weekly' || (b.kind === 'weekly' && a.day === b.day));

export function TaskRepeatPicker({ x, y, weekday, value, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const options: TaskRepeat[] = [{ kind: 'daily' }, { kind: 'weekdays' }, { kind: 'weekly', day: weekday }];
  const W = 250;
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />
      <div
        data-testid="task-repeat-picker"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: Math.max(8, Math.min(x, window.innerWidth - W - 8)), top: Math.max(8, Math.min(y, window.innerHeight - 220)),
          width: W, zIndex: Z.popover, boxSizing: 'border-box', padding: 12, borderRadius: 12, background: 'var(--paper)',
          border: '1px solid var(--paper-3)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>Repeat this plan. When you tick it off, the next one appears.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {options.map((o) => (
            <button key={o.kind} type="button" data-testid={`task-repeat-${o.kind}`} onClick={() => onPick(o)}
              style={{
                textAlign: 'left', height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)',
                border: `1px solid ${same(value, o) ? 'var(--acid)' : 'transparent'}`, background: same(value, o) ? 'color-mix(in srgb, var(--acid) 14%, transparent)' : 'transparent', color: 'var(--ink)',
              }}>
              {describeTaskRepeat(o).replace(/^./, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
        {value && (
          <button type="button" data-testid="task-repeat-off" onClick={() => onPick(null)}
            style={{ alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12 }}>
            Don't repeat
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
