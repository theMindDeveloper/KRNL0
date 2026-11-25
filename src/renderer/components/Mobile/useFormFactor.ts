// Which shell the web app shows (Decision 51, designs Phone*/Tablet*, Decision 67):
//   phone   narrower than 700 px: header, one view at a time, tab bar
//   dock    a phone turned sideways (a touch screen, wider than tall, at most
//           500 px tall): a slim rail and two windows side by side, a dock
//           beside you (design "KRNL0 phone sideways · Dock", direction D)
//   tablet  700–1199 px: side rail, two-column Today
//   desktop 1200 px and up: the desktop app's own Station / Canvas
// The desktop app (Electron) always keeps its own layout.

import { useEffect, useState } from 'react';
import { IS_WEB } from '../../platform';

export type FormFactor = 'phone' | 'dock' | 'tablet' | 'desktop';

export const PHONE_MAX = 700;
export const TABLET_MAX = 1200;
/** A screen this short (or shorter), held sideways, is a phone on its side. */
export const DOCK_MAX_HEIGHT = 500;

/** Pure: the shell for a screen of this size. `coarse`: a finger is the pointer. */
export function formFactorFor(width: number, height: number = Number.POSITIVE_INFINITY, coarse = false): FormFactor {
  // Sideways on a phone the screen is 568–932 px wide but only ~320–430 tall:
  // the iPad layout (which needs ~700 px of height) showed half of itself.
  if (coarse && width > height && height <= DOCK_MAX_HEIGHT) return 'dock';
  if (width < PHONE_MAX) return 'phone';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

const DOCK_QUERY = `(orientation: landscape) and (max-height: ${DOCK_MAX_HEIGHT}px) and (pointer: coarse)`;

export function useFormFactor(enabled: boolean = IS_WEB): FormFactor {
  // Media queries, not innerWidth: a phone browser can report a wider
  // innerWidth for a moment (zoomed out to fit wide content), while the media
  // query follows the device's own width.
  const read = (): FormFactor => {
    if (!enabled || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
    if (window.matchMedia(DOCK_QUERY).matches) return 'dock';
    if (window.matchMedia(`(max-width: ${PHONE_MAX - 0.02}px)`).matches) return 'phone';
    if (window.matchMedia(`(max-width: ${TABLET_MAX - 0.02}px)`).matches) return 'tablet';
    return 'desktop';
  };
  const [ff, setFf] = useState<FormFactor>(read);
  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return;
    const queries = [DOCK_QUERY, ...[PHONE_MAX, TABLET_MAX].map((w) => `(max-width: ${w - 0.02}px)`)].map((q) => window.matchMedia(q));
    const on = (): void => setFf(read());
    for (const q of queries) q.addEventListener('change', on);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => { for (const q of queries) q.removeEventListener('change', on); window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return ff;
}
