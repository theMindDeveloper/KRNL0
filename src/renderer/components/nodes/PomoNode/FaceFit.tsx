// Fits the timer face into the space its window has left, so START and the
// task picker under it are never cut off (the station's Pomo slot is shorter
// than a face plus its controls: at 1280×800 START sat 148 px below the edge).
//
// The face keeps its own design and is scaled down as a whole. Below
// COMPACT_BELOW its small labels would drop under the 11 px floor (at 0.45 a
// 11 px label is 5 px), so the panel shows `compact` instead — big digits, a
// progress bar, one label — and returns to the face when there's room again.
// Measured with ResizeObserver; the face's natural height comes from
// offsetHeight, which a transform doesn't change, so there's no feedback loop.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const MIN_SCALE = 0.45;
/** Under this the face's labels are too small to read: show the compact face. */
export const COMPACT_BELOW = 0.85;

/**
 * How many secondary rows a station Pomo of body height `h` px sheds so the
 * face, the time and START fit: 0 = none, 1 = "log past time", 2 = + the
 * cycles strip, 3 = + the session dots.
 */
export function compactLevelFor(h: number): 0 | 1 | 2 | 3 {
  return h >= 330 ? 0 : h >= 295 ? 1 : h >= 262 ? 2 : 3;
}

export function FaceFit({ children }: { children: ReactNode; compact?: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The face you picked always stays: a short window scales it down, and when
  // its small labels would fall under the 11 px floor they are left out
  // (never drawn over the digits). No switch to another look on resize.
  const [labelsOff, setLabelsOff] = useState(false);
  const labelsOffRef = useRef(false);
  /** The face's natural height with its labels (kept while they are off). */
  const withLabelsRef = useRef(0);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    const fit = (): void => {
      const room = o.clientHeight;
      const cur = i.offsetHeight;
      if (!labelsOffRef.current) withLabelsRef.current = cur;
      const withLabels = withLabelsRef.current;
      if (withLabels <= 0 || room <= 0 || cur <= 0) return;
      // 4 px spare: big digits' line boxes run a little past their container.
      const wantFull = withLabels <= room ? 1 : (room - 4) / withLabels;
      const off = wantFull < COMPACT_BELOW;
      if (off !== labelsOffRef.current) {
        labelsOffRef.current = off;
        setLabelsOff(off);
        // Measure again once the face has re-laid out (its height may not change,
        // so the observer alone would not call back).
        requestAnimationFrame(fit);
      }
      const natural = off ? cur : withLabels;
      const want = natural <= room ? 1 : Math.floor(((room - 4) / natural) * 100) / 100;
      const next = Math.max(MIN_SCALE, want);
      setScale((c) => (Math.abs(c - next) < 0.01 ? c : next));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    fit();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      data-testid="pomo-face-fit"
      data-scale={scale}
      data-labels={labelsOff ? 'off' : undefined}
      // Takes what's left after the controls; never forces the window taller.
      style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}
    >
      <div
        ref={inner}
        data-face="full"
        style={{
          // Scaled from its top centre; the width is widened by 1/scale so the
          // face keeps its proportions across the whole window.
          width: `${100 / scale}%`,
          flexShrink: 0,
          alignSelf: 'flex-start',
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          // Labels inside the face are drawn at 11 px / scale, so after the
          // scale they still read at the 11 px floor (the big digits scale);
          // with no room for them they are left out.
          ['--face-label' as string]: labelsOff ? '0px' : `${(11 / scale).toFixed(2)}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The face for a short window (FaceFit `compact`): the time at a size that
 * reads, a thin progress line, and one label — all at or above the 11 px floor.
 */
export function CompactFace({ time, label, pct }: { time: string; label: string; pct: number | null }) {
  return (
    <div data-testid="pomo-compact-face" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '2px 0' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 34, lineHeight: 1, fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
      {pct !== null && (
        <span aria-hidden style={{ width: '70%', height: 3, borderRadius: 2, background: 'color-mix(in srgb, var(--ink) 12%, transparent)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: 'var(--acid)' }} />
        </span>
      )}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.2, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}
