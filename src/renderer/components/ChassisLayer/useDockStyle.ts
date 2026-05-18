/* useDockStyle — persisted dock-frame variant selector with shared state.
 *
 * Stores choice in localStorage and mirrors to <html data-dock="..."> so the
 * chassis CSS in `src/renderer/styles/chassis.css` activates.
 *
 * Module-level shared state: every component that calls `useDockStyle()`
 * subscribes to the same value. When one calls `setStyle`, all subscribed
 * components re-render with the new value. Required for station mode where
 * the dock-style picker lives in the embedded canvas (CanvasFlow) but the
 * actual chassis chrome lives in StationLayout — without shared state, the
 * picker would update only its own component's hook instance, leaving the
 * chrome stale.
 */

import { useEffect, useState, useCallback } from 'react';

export type DockStyle = 'classic' | 'synthesizer' | 'telemetry' | 'krnl-dock';

export const DOCK_STYLES: DockStyle[] = ['classic', 'synthesizer', 'telemetry', 'krnl-dock'];

const STORAGE_KEY = 'krnl0-dock-style';

const DEFAULT_DOCK_STYLE: DockStyle = 'telemetry';

function readStored(): DockStyle {
  if (typeof localStorage === 'undefined') return DEFAULT_DOCK_STYLE;
  const v = localStorage.getItem(STORAGE_KEY);
  return DOCK_STYLES.includes(v as DockStyle) ? (v as DockStyle) : DEFAULT_DOCK_STYLE;
}

function apply(style: DockStyle) {
  if (typeof document === 'undefined') return;
  if (style === 'classic') {
    document.documentElement.removeAttribute('data-dock');
  } else {
    document.documentElement.setAttribute('data-dock', style);
  }
}

// ── Module-level shared state ──────────────────────────────────────────────
let current: DockStyle = readStored();
const subscribers = new Set<(s: DockStyle) => void>();

function setCurrent(next: DockStyle) {
  if (next === current) return;
  current = next;
  apply(next);
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  subscribers.forEach((fn) => fn(next));
}

// Apply on first import so <html data-dock> matches storage before paint.
apply(current);

export function useDockStyle(): [DockStyle, (s: DockStyle) => void] {
  const [style, setLocal] = useState<DockStyle>(current);

  useEffect(() => {
    // Catch up if the value changed between render and effect run.
    if (current !== style) setLocal(current);
    const sub = (s: DockStyle) => setLocal(s);
    subscribers.add(sub);
    return () => { subscribers.delete(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStyle = useCallback((s: DockStyle) => {
    setCurrent(s);
  }, []);

  return [style, setStyle];
}
