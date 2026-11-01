/**
 * useFrameTheme — the active frame style, the current light/dark mode and the
 * resolved manifest, kept in sync for components whose styling cannot come
 * from CSS (xterm colours, Pomo default face) — ADR 0009, F7/F8.
 */

import { useEffect, useState } from 'react';
import { useDockStyle } from '../components/ChassisLayer/useDockStyle';
import type { FrameMode } from '../../shared/frameStyles';
import { currentMode } from './applyFrameTheme';
import { MANIFESTS } from './manifests';
import type { ThemeManifest } from './types';

function readMode(): FrameMode {
  return typeof document === 'undefined' ? 'dark' : currentMode();
}

export function useFrameTheme(): { style: keyof typeof MANIFESTS; mode: FrameMode; manifest: ThemeManifest } {
  const [style] = useDockStyle();
  const [mode, setMode] = useState<FrameMode>(readMode);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => setMode(readMode()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return { style, mode, manifest: MANIFESTS[style] };
}
