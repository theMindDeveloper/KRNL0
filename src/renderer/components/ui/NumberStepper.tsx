// NumberStepper — minimal app-level number input with custom ▲▼ controls.
// Strips the native browser spinner; replaces it with two compact icon buttons.
// Handles RF node context: stops pointer/keyboard event propagation internally.

import { useState } from 'react';

interface NumberStepperProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  testId?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  step = 1,
  testId,
}: NumberStepperProps) {
  const [focused, setFocused] = useState(false);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const inc = () => onChange(clamp(value + step));
  const dec = () => onChange(clamp(value - step));

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      data-testid={testId ? `${testId}-wrap` : undefined}
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        height: 26,
        background: 'var(--paper)',
        border: `1px solid ${focused ? 'var(--acid)' : 'var(--paper-3)'}`,
        borderRadius: 4,
        overflow: 'hidden',
        transition: 'border-color 0.12s',
        flexShrink: 0,
      }}
    >
      {/* Number field — native spinner hidden via global CSS in tokens.css.
          The testId lands on the <input> itself so callers can use
          fireEvent.change to set its .value directly (jsdom only exposes
          value-setters on actual form fields, not on wrapping divs). */}
      <input
        data-testid={testId}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (Number.isFinite(raw)) onChange(clamp(raw));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={stop}
        style={{
          width: 36,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink)',
          textAlign: 'right',
          padding: '0 4px 0 6px',
          MozAppearance: 'textfield',
        } as React.CSSProperties}
      />

      {/* Arrow column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 15,
          borderLeft: '1px solid var(--paper-3)',
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          className="krnl-stepper-btn"
          style={{ borderBottom: '1px solid var(--paper-3)' }}
          onClick={(e) => { e.stopPropagation(); inc(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ▲
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          className="krnl-stepper-btn"
          onClick={(e) => { e.stopPropagation(); dec(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
