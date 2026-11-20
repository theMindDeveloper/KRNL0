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

import { useState, useEffect, createContext, useContext } from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { LayoutMode } from '../../../shared/types';

const MIN_WIDTH  = 1024;
const MIN_HEIGHT = 640;

/**
 * The web app's phone / iPad shell shows each board window in a view of its
 * own (Decision 51), so its canvas shows only the free cards, as in Station.
 * The context is for components under the shell; the flag for event handlers.
 */
export const MothersElsewhereContext = createContext(false);
let mothersElsewhere = false;
export function setMothersElsewhere(on: boolean): void { mothersElsewhere = on; }

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

/**
 * Station is what the window shows right now: saved as station AND the
 * viewport is big enough. Event handlers read this instead of
 * board.layoutMode, which stays 'station' during the narrow fallback.
 */
export function isStationShown(layoutMode: LayoutMode | undefined): boolean {
  return mothersElsewhere || (layoutMode === 'station' && viewportMeetsMinimum());
}

export function useStationViewportGate(): ViewportGateResult {
  const elsewhere = useContext(MothersElsewhereContext);
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

  if (elsewhere) return { effectiveMode: 'station', isFallingBack: false };
  if (savedMode === 'station' && !meetsMinimum) {
    return { effectiveMode: 'canvas', isFallingBack: true };
  }
  return { effectiveMode: savedMode, isFallingBack: false };
}
