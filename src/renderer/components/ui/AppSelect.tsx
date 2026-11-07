// AppSelect — app-styled replacement for <select>. The native option list is
// drawn by the OS (white, blue highlight) and can't follow the theme.

import { useRef, useState, type CSSProperties } from 'react';
import { Popover } from './Popover';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: readonly AppSelectOption[];
  onChange: (value: string) => void;
  testId?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

export function AppSelect({ value, options, onChange, testId, ariaLabel, style }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const pick = (v: string) => { setOpen(false); if (v !== value) onChange(v); };

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="nodrag"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', textAlign: 'left',
          background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--paper-3)', borderRadius: 4,
          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px', textTransform: 'none',
          ...style,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label ?? ''}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}>
          <path d="M1.5 3l2.5 2.5L6.5 3" />
        </svg>
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} minWidth={140}>
        <div role="listbox" style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                data-testid={testId ? `${testId}-option-${o.value || 'none'}` : undefined}
                onClick={() => pick(o.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 6, border: 'none',
                  background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
                  color: on ? 'var(--ink)' : 'var(--ink-2)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: on ? 650 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--paper-2)'; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                {on && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--acid)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
                )}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
