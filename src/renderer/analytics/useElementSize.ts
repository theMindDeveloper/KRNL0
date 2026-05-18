// ResizeObserver-backed measurement hook. Lets chart components draw against
// their actual container size instead of a hard-coded width/height. Returns
// {width, height} of the observed element; SSR-safe (returns {0,0} until the
// first observer tick).

import { useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T>,
  ElementSize,
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Round so chart math doesn't churn on sub-pixel deltas — the resize
      // observer fires every frame during a window drag otherwise.
      const w = Math.round(width);
      const h = Math.round(height);
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
