/**
 * useStationViewportGate — narrow-viewport fallback for Station Mode.
 *
 * ADR 0008 § 9.5.
 *
 * Below 1024 × 640: effective mode is 'canvas' for the session.
 * Above threshold: restore saved mode immediately.
 *
 * The persisted value in boardStore (board.layoutMode) is unchanged — only
 * the effective mode returned by this hook differs.  StatusBar reads the
 * second returned value to show a notice when falling back.
 */

import { useState, useEffect } from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { LayoutMode } from '../../../shared/types';

const MIN_WIDTH  = 1024;
const MIN_HEIGHT = 640;

/** Returns true if the current window meets Station Mode's minimum viewport. */
function viewportMeetsMinimum(): boolean {
  if (typeof window === 'undefined') return true; // SSR / test guard
  return window.innerWidth >= MIN_WIDTH && window.innerHeight >= MIN_HEIGHT;
}

interface ViewportGateResult {
  /** The effective layout mode for the current session. */
  effectiveMode: LayoutMode;
  /** True when station was requested but the viewport is too narrow. */
  isFallingBack: boolean;
}

export function useStationViewportGate(): ViewportGateResult {
  const savedMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');
  const [meetsMinimum, setMeetsMinimum] = useState<boolean>(() => viewportMeetsMinimum());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const check = () => setMeetsMinimum(viewportMeetsMinimum());

    window.addEventListener('resize', check, { passive: true });
    // Check immediately in case window was resized before mount.
    check();
    return () => window.removeEventListener('resize', check);
  }, []);

  if (savedMode === 'station' && !meetsMinimum) {
    return { effectiveMode: 'canvas', isFallingBack: true };
  }
  return { effectiveMode: savedMode, isFallingBack: false };
}
