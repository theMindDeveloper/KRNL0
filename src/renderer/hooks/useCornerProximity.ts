import { useCallback, useRef, useState } from 'react';

/**
 * useCornerProximity — reveals a corner-anchored UI element when the cursor
 * gets close to that corner of the host element.
 *
 * Returns a boolean that's `true` while the cursor is within `threshold`
 * pixels of the requested corner (default bottom-right), plus the event
 * handlers and ref to wire into the host node.
 *
 * Designed for resize-handle reveal on TextNode / ImageNode: the handle is
 * invisible at rest and fades in when the user's cursor approaches the
 * bottom-right corner. State only flips on threshold crossings, so mousemove
 * spam does not cause spurious re-renders.
 */
export function useCornerProximity(opts: {
  threshold?: number;
  corner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
} = {}) {
  const threshold = opts.threshold ?? 48;
  const corner = opts.corner ?? 'bottom-right';

  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);

  const setNearIfChanged = (next: boolean) => {
    if (nearRef.current === next) return;
    nearRef.current = next;
    setNear(next);
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx =
      corner === 'bottom-right' || corner === 'top-right' ? r.right : r.left;
    const cy =
      corner === 'bottom-right' || corner === 'bottom-left' ? r.bottom : r.top;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    setNearIfChanged(dx * dx + dy * dy < threshold * threshold);
  // setNearIfChanged is stable via refs; safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corner, threshold]);

  const onMouseLeave = useCallback(() => {
    setNearIfChanged(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rootRef, near, onMouseMove, onMouseLeave };
}
