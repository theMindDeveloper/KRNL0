// Small popovers from a habit's right-click menu: "Times a week…" and
// "Amount a day…". App-styled; Esc or a click outside closes them.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../ui/layers';

function Shell({ x, y, h, testId, onClose, children }: { x: number; y: number; h: number; testId: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
      <div
        data-testid={testId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - h),
          width: 284, zIndex: Z.popover, padding: 14, borderRadius: 12, background: 'var(--paper)', boxSizing: 'border-box',
          border: '1px solid var(--paper-3)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-sans)',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

const say: React.CSSProperties = { fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.4 };
const pill = (on: boolean): React.CSSProperties => ({
  minWidth: 34, height: 30, borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 650,
  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`, background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent', color: 'var(--ink)',
});
const quiet: React.CSSProperties = { height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12 };

/** "Times a week…" — 1–6, or no target. */
export function TargetPopover({ x, y, value, onPick, onClose }: { x: number; y: number; value: number | null; onPick: (n: number | null) => void; onClose: () => void }) {
  return (
    <Shell x={x} y={y} h={150} testId="habit-target-pop" onClose={onClose}>
      <div style={say}>How many times a week? Any days count, and a rest day never breaks the streak.</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5, 6].map((n, i) => (
          <button key={n} type="button" data-testid={`habit-target-${n}`} autoFocus={value === null ? i === 0 : value === n} onClick={() => onPick(n)} style={pill(value === n)}>{n}×</button>
        ))}
      </div>
      {value !== null && (
        <button type="button" data-testid="habit-target-off" onClick={() => onPick(null)} style={{ ...quiet, alignSelf: 'flex-start' }}>No target (every day it repeats)</button>
      )}
    </Shell>
  );
}

/** "Amount a day…" — "8 glasses"; Plain tick clears it. */
export function AmountPopover({ x, y, target, unit, onSave, onClose }: {
  x: number; y: number; target: number | null; unit: string;
  onSave: (a: { target: number; unit: string } | null) => void; onClose: () => void;
}) {
  const [t, setT] = useState<number | null>(target);
  const [u, setU] = useState(unit);
  return (
    <Shell x={x} y={y} h={200} testId="habit-amount-pop" onClose={onClose}>
      <div style={say}>How much a day? Each click on the day adds one; the day counts once it is reached.</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {[2, 3, 4, 5, 6, 8, 10, 20].map((n, i) => (
          <button key={n} type="button" data-testid={`habit-amount-${n}`} autoFocus={t === null ? i === 0 : t === n} onClick={() => setT(n)} style={pill(t === n)}>{n}</button>
        ))}
      </div>
      <input
        data-testid="habit-amount-unit"
        value={u}
        placeholder="unit, e.g. glasses, pages, km"
        maxLength={24}
        onChange={(e) => setU(e.target.value)}
        style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, outline: 'none' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" data-testid="habit-amount-off" onClick={() => onSave(null)} style={{ ...quiet, height: 30 }}>Plain tick</button>
        <button type="button" data-testid="habit-amount-save" disabled={t === null}
          onClick={() => { if (t !== null) onSave({ target: t, unit: u }); }}
          style={{ height: 30, padding: '0 14px', borderRadius: 8, border: 'none', background: t === null ? 'var(--paper-3)' : 'var(--btn-primary-bg)', color: t === null ? 'var(--ink-4)' : 'var(--btn-primary-fg)', cursor: 'pointer', fontSize: 12.5, fontWeight: 650 }}>
          {t === null ? 'Pick an amount' : `Save · ${t}${u.trim() ? ` ${u.trim()}` : ''} a day`}
        </button>
      </div>
    </Shell>
  );
}
