/* useDockStyle — persisted dock-frame variant selector.
 *
 * Stores choice in localStorage and mirrors to <html data-dock="..."> so the
 * chassis CSS in `src/renderer/styles/chassis.css` activates. Pattern matches
 * the theme hook in src/renderer/components/TopBar/index.tsx.
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

export function useDockStyle(): [DockStyle, (s: DockStyle) => void] {
  const [style, setStyleState] = useState<DockStyle>(() => readStored());

  useEffect(() => {
    apply(style);
  }, [style]);

  const setStyle = useCallback((s: DockStyle) => {
    setStyleState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch { /* ignore */ }
  }, []);

  return [style, setStyle];
}
