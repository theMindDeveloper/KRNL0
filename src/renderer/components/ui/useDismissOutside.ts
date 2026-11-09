// Pop-ups close when you click somewhere else. Listens in the capture phase,
// so a canvas or window that stops the event (React Flow's pane, a node that
// stops propagation) can't keep a pop-up open. `keep` lists what counts as
// inside: the pop-up itself, the field that opened it, a selector.

import { useEffect, useRef, type RefObject } from 'react';

type Keep = string | RefObject<Element | null>;

export function useDismissOutside(active: boolean, keep: readonly Keep[], onDismiss: () => void): void {
  const latest = useRef({ keep, onDismiss });
  latest.current = { keep, onDismiss };
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      for (const k of latest.current.keep) {
        if (typeof k === 'string' ? t.closest(k) : k.current?.contains(t)) return;
      }
      latest.current.onDismiss();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active]);
}
