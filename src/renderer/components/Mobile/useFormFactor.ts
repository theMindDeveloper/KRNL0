// Which shell the web app shows (Decision 51, designs Phone*/Tablet*):
//   phone   narrower than 700 px: header, one view at a time, tab bar
//   tablet  700–1199 px: side rail, two-column Today
//   desktop 1200 px and up: the desktop app's own Station / Canvas
// The desktop app (Electron) always keeps its own layout.

import { useEffect, useState } from 'react';
import { IS_WEB } from '../../platform';

export type FormFactor = 'phone' | 'tablet' | 'desktop';

export const PHONE_MAX = 700;
export const TABLET_MAX = 1200;

export function formFactorFor(width: number): FormFactor {
  if (width < PHONE_MAX) return 'phone';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useFormFactor(enabled: boolean = IS_WEB): FormFactor {
  // Media queries, not innerWidth: a phone browser can report a wider
  // innerWidth for a moment (zoomed out to fit wide content), while the media
  // query follows the device's own width.
  const read = (): FormFactor => {
    if (!enabled || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
    if (window.matchMedia(`(max-width: ${PHONE_MAX - 0.02}px)`).matches) return 'phone';
    if (window.matchMedia(`(max-width: ${TABLET_MAX - 0.02}px)`).matches) return 'tablet';
    return 'desktop';
  };
  const [ff, setFf] = useState<FormFactor>(read);
  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return;
    const queries = [PHONE_MAX, TABLET_MAX].map((w) => window.matchMedia(`(max-width: ${w - 0.02}px)`));
    const on = (): void => setFf(read());
    for (const q of queries) q.addEventListener('change', on);
    window.addEventListener('resize', on);
    on();
    return () => { for (const q of queries) q.removeEventListener('change', on); window.removeEventListener('resize', on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return ff;
}
