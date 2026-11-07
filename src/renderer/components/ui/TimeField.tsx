// TimeField — app-styled "HH:MM" field. Type the time, or open the clock
// button for hour / minute columns. Replaces <input type="time">, whose
// picker is drawn by the OS and ignores the app theme.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Popover } from './Popover';

interface Props {
  value: string;               // "HH:MM"
  onChange: (value: string) => void;
  testId?: string;
  minuteStep?: number;
  style?: CSSProperties;
  /** Enter in the field, with the parsed time. The field stops key events
   *  from reaching window listeners, so a host form submits through this. */
  onEnter?: (value: string) => void;
  /** Escape in the field (when its picker is closed). */
  onEscape?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts "9", "930", "1430", "9:05", "09:30" → "HH:MM"; null when it isn't a time. */
export function parseTime(raw: string): string | null {
  const t = raw.trim();
  let h: number;
  let min: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (colon) {
    h = Number(colon[1]);
    min = Number(colon[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    // Digits only: the last two are minutes once there are more than two.
    h = Number(t.length <= 2 ? t : t.slice(0, -2));
    min = t.length <= 2 ? 0 : Number(t.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function TimeField({ value, onChange, testId, minuteStep = 5, style, onEnter, onEscape }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const [hh, mm] = value.split(':').map(Number) as [number, number];
  const commit = (raw: string): string => {
    const t = parseTime(raw);
    if (t) { onChange(t); setDraft(t); return t; }
    setDraft(value);
    return value;
  };
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  if (Number.isFinite(mm) && !minutes.includes(mm)) minutes.push(mm), minutes.sort((a, b) => a - b);

  return (
    <div
      ref={wrap}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, boxSizing: 'border-box', height: 34, padding: '0 4px 0 9px',
        borderRadius: 8, border: `1px solid ${open ? 'var(--acid)' : 'var(--paper-3)'}`, background: 'var(--paper-2)',
        ...style,
      }}
    >
      <input
        data-testid={testId}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const t = /^\d{2}:\d{2}$/.test(e.target.value) ? parseTime(e.target.value) : null;
          if (t) onChange(t);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onEnter?.(commit(draft));
          else if (e.key === 'Escape') { if (open) setOpen(false); else onEscape?.(); }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          flex: 1, minWidth: 0, width: '100%', border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 14, fontVariantNumeric: 'tabular-nums', padding: 0,
        }}
      />
      <button
        type="button"
        aria-label="Pick a time"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, background: open ? 'var(--paper-3)' : 'transparent', color: 'var(--ink-3)' }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="5.5" /><path d="M7 4v3.2l2 1.3" /></svg>
      </button>
      <Popover anchor={wrap.current} open={open} onClose={() => setOpen(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <Column label="Hour" items={Array.from({ length: 24 }, (_, i) => i)} selected={hh} onPick={(h) => onChange(`${pad(h)}:${pad(mm || 0)}`)} />
          <Column label="Min" items={minutes} selected={mm} onPick={(m) => { onChange(`${pad(hh || 0)}:${pad(m)}`); setOpen(false); }} />
        </div>
      </Popover>
    </div>
  );
}

function Column({ label, items, selected, onPick }: { label: string; items: number[]; selected: number; onPick: (n: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[data-on="true"]');
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.offsetHeight / 2;
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 54 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', padding: '4px 6px 4px', textAlign: 'center' }}>{label}</span>
      <div ref={list} style={{ maxHeight: 216, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, position: 'relative', scrollbarWidth: 'thin' }}>
        {items.map((n) => {
          const on = n === selected;
          return (
            <button
              key={n}
              type="button"
              data-on={on ? 'true' : undefined}
              onClick={() => onPick(n)}
              style={{
                flexShrink: 0, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                background: on ? 'var(--acid)' : 'transparent',
                color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-2)', fontWeight: on ? 700 : 500,
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--paper-2)'; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              {pad(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
