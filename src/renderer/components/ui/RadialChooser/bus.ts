// ADR 0002 — Module-level singleton bus for RadialChooser.
// Only one chooser may be open at a time. The hook registers itself here;
// the host reads from here to render.

import type { ChooserSession } from './types';

type Listener = () => void;

interface Bus {
  session: ChooserSession | null;
  listeners: Set<Listener>;
  subscribe: (fn: Listener) => () => void;
  notify: () => void;
  open: (session: ChooserSession) => void;
  close: () => void;
  updateHovered: (index: number | null) => void;
}

export const radialBus: Bus = {
  session: null,
  listeners: new Set(),

  subscribe(fn: Listener) {
    radialBus.listeners.add(fn);
    return () => {
      radialBus.listeners.delete(fn);
    };
  },

  notify() {
    for (const fn of radialBus.listeners) {
      fn();
    }
  },

  open(session: ChooserSession) {
    // If already open: close the previous one first with onCancel.
    if (radialBus.session) {
      radialBus.session.onCancel?.();
    }
    radialBus.session = session;
    radialBus.notify();
  },

  close() {
    radialBus.session = null;
    radialBus.notify();
  },

  updateHovered(index: number | null) {
    if (!radialBus.session) return;
    if (radialBus.session.hoveredIndex === index) return;
    radialBus.session = { ...radialBus.session, hoveredIndex: index };
    radialBus.notify();
  },
};
