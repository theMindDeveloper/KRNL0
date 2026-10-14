/**
 * HoldButton — a destructive-action button that only fires after the user
 * presses and HOLDS it for `holdMs` (default 1200ms). A fill bar animates
 * across the button as confirmation; releasing early cancels with no effect.
 *
 * This is the safety net for irreversible operations (clear history, factory
 * reset) — no second "are you sure?" dialog, the hold IS the confirmation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface HoldButtonProps {
  label: string;
  /** Label shown while the hold is in progress (e.g. "Keep holding…"). */
  holdingLabel?: string;
  onConfirm: () => void;
  holdMs?: number;
  /** Accent colour for fill + border. Defaults to a danger red. */
  accent?: string;
  testId?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function HoldButton({
  label,
  holdingLabel,
  onConfirm,
  holdMs = 1200,
  accent = '#ff6b5e',
  testId,
  disabled = false,
  style,
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0); // 0..1
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const firedRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(1, elapsed / holdMs);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        onConfirm();
      }
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdMs, onConfirm, stop]);

  const start = useCallback(() => {
    if (disabled) return;
    firedRef.current = false;
    startRef.current = Date.now();
    setHolding(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  // Safety: clean up the rAF if the component unmounts mid-hold.
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onMouseDown={(e) => { e.stopPropagation(); start(); }}
      onMouseUp={(e) => { e.stopPropagation(); stop(); }}
      onMouseLeave={() => stop()}
      onTouchStart={(e) => { e.stopPropagation(); start(); }}
      onTouchEnd={(e) => { e.stopPropagation(); stop(); }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '7px 12px',
        borderRadius: 5,
        border: `1px solid ${accent}`,
        background: 'transparent',
        color: accent,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
      title="Press and hold to confirm"
    >
      {/* Fill bar — grows left→right as the hold progresses. */}
      <span
        aria-hidden
        data-testid={testId ? `${testId}-fill` : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: `${progress * 100}%`,
          background: accent,
          opacity: 0.28,
          transition: holding ? 'none' : 'width 120ms ease-out',
          pointerEvents: 'none',
        }}
      />
      <span style={{ position: 'relative' }}>
        {holding ? (holdingLabel ?? 'Keep holding…') : label}
      </span>
    </button>
  );
}
