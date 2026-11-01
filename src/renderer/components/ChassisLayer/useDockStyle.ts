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
 *
 * `DockStyle` and `DOCK_STYLES` are derived from the dock registry — adding a
 * new entry there extends the union automatically.
 */

import { useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DOCK_STYLES, DEFAULT_DOCK_STYLE, type DockStyle } from './dockRegistry';
import { applyFrameTheme, currentMode } from '../../themes/applyFrameTheme';
import { runLookTransition } from '../../themes/transition';

export type { DockStyle } from './dockRegistry';
export { DOCK_STYLES } from './dockRegistry';

const STORAGE_KEY = 'krnl0-dock-style';

function readStored(): DockStyle {
  if (typeof localStorage === 'undefined') return DEFAULT_DOCK_STYLE;
  const v = localStorage.getItem(STORAGE_KEY);
  return DOCK_STYLES.includes(v as DockStyle) ? (v as DockStyle) : DEFAULT_DOCK_STYLE;
}

function apply(style: DockStyle) {
  if (typeof document === 'undefined') return;
  // Writes data-dock and the style's tokens on <html> (ADR 0009).
  applyFrameTheme(style, currentMode());
}

let current: DockStyle = readStored();
const subscribers = new Set<(s: DockStyle) => void>();

function setCurrent(next: DockStyle) {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  // Tokens and every subscriber's re-render land inside one View Transition
  // frame, so the new style is revealed whole instead of half-repainted.
  runLookTransition(() => {
    apply(next);
    flushSync(() => subscribers.forEach((fn) => fn(next)));
  });
}

apply(current);

// Light/dark is a separate axis owned by TopBar; re-apply the style's tokens
// for the new mode whenever data-theme changes.
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(() => apply(current)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

/** Imperative access for the sys CLI bridge (useCliDispatch). */
export function getDockStyle(): DockStyle {
  return current;
}

export function setDockStyle(next: DockStyle): void {
  setCurrent(next);
}

export function useDockStyle(): [DockStyle, (s: DockStyle) => void] {
  const [style, setLocal] = useState<DockStyle>(current);

  useEffect(() => {
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
