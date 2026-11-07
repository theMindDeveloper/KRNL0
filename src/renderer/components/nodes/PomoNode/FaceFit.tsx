// Fits the timer face into the space its window has left, so START and the
// task picker under it are never cut off (the station's Pomo slot is shorter
// than a face plus its controls: at 1280×800 START sat 148 px below the edge).
//
// The face keeps its own design and is scaled down as a whole — never below
// MIN_SCALE — rather than each of the seven faces learning a compact layout.
// Measured with ResizeObserver; the face's natural height comes from
// offsetHeight, which a transform doesn't change, so there's no feedback loop.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const MIN_SCALE = 0.45;

/**
 * How many secondary rows a station Pomo of body height `h` px sheds so the
 * face, the time and START fit: 0 = none, 1 = "log past time", 2 = + the
 * cycles strip, 3 = + the session dots.
 */
export function compactLevelFor(h: number): 0 | 1 | 2 | 3 {
  return h >= 330 ? 0 : h >= 295 ? 1 : h >= 262 ? 2 : 3;
}

export function FaceFit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    const fit = (): void => {
      const natural = i.offsetHeight;
      const room = o.clientHeight;
      if (natural <= 0 || room <= 0) return;
      const next = Math.max(MIN_SCALE, Math.min(1, Math.floor((room / natural) * 100) / 100));
      setScale((cur) => (Math.abs(cur - next) < 0.01 ? cur : next));
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
      // Takes what's left after the controls; never forces the window taller.
      style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}
    >
      <div
        ref={inner}
        style={{
          // Scaled from its top centre; the width is widened by 1/scale so the
          // face keeps its proportions across the whole window.
          width: `${100 / scale}%`,
          flexShrink: 0,
          alignSelf: 'flex-start',
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
