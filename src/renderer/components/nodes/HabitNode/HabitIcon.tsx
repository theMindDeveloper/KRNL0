// Habit icons — line SVGs drawn in currentColor, so they follow the theme
// (light and dark) like the rest of the app's icons. No emoji: they render
// in the OS emoji font and ignore the palette.
//
// A habit stores an icon id ("run", "water"…). Habits saved with the old
// glyph/emoji palette are mapped to the matching id; any other text (set from
// the CLI) still shows as text.

import type { ReactNode } from 'react';

const P = (d: string) => <path d={d} />;

export const HABIT_ICON_SVGS: Readonly<Record<string, ReactNode>> = {
  pen: P('M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3'),
  trend: <>{P('M4 17l6-6 4 4 6-7')}{P('M15 8h5v5')}</>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>,
  code: <>{P('M8 7l-5 5 5 5')}{P('M16 7l5 5-5 5')}{P('M14 5l-4 14')}</>,
  meditate: <><circle cx="12" cy="5" r="2" />{P('M12 8v5M7 12l5 1 5-1M4 19c3-1 5-3 8-3s5 2 8 3M8 19l4-3 4 3')}</>,
  run: <><circle cx="15" cy="4.5" r="2" />{P('M8 21l3-6 3 2v4M6 12l3-4 4 1 3 4h3M11 15l2-6')}</>,
  book: <>{P('M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1V5z')}{P('M20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1V5z')}</>,
  water: P('M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'),
  sleep: <>{P('M3 18v-6h18v6M3 15h18M7 12V9h4a2 2 0 0 1 2 2v1')}{P('M3 18v2M21 18v2')}</>,
  food: <>{P('M4 12h16a8 8 0 0 1-16 0z')}{P('M9 9c0-2 1-3 3-4M13 9c1-2 3-3 5-3')}</>,
  brain: <>{P('M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 2 2 0 0 0 3-1V5a2 2 0 0 0-3-1z')}{P('M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 2 2 0 0 1-3-1')}</>,
  strength: <>{P('M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12')}</>,
  coffee: <>{P('M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9z')}{P('M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3')}</>,
  goal: <>{P('M5 21V4M5 4h11l-2 4 2 4H5')}</>,
  plant: <>{P('M12 21v-9')}{P('M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z')}</>,
  music: <><circle cx="7" cy="17" r="2.5" /><circle cx="17" cy="15" r="2.5" />{P('M9.5 17V6l10-2v11')}</>,
  clean: <>{P('M14 3l-4 9M7 12h8l2 9H5l2-9zM9 16v5M13 16v5')}</>,
  write: <>{P('M4 19h16')}{P('M6 15l9-9 3 3-9 9H6v-3z')}</>,
  sun: <><circle cx="12" cy="12" r="4" />{P('M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5')}</>,
  moon: P('M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z'),
  heart: P('M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'),
  walk: <><circle cx="13" cy="4.5" r="2" />{P('M10 21l2-6-2-3 1-4 3 3 3 1M12 15l3 6M10 8l-3 4')}</>,
  study: <>{P('M2 9l10-5 10 5-10 5-10-5z')}{P('M6 11v5c3 2 9 2 12 0v-5M22 9v6')}</>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2" />{P('M3 3l18 18')}</>,
};

/** Palette order shown in the picker. */
export const HABIT_ICON_IDS: readonly string[] = Object.keys(HABIT_ICON_SVGS);

/** Old palette glyphs / emoji → icon id. */
const LEGACY: Readonly<Record<string, string>> = {
  '✎': 'pen', '↗': 'trend', '◍': 'target', '⌬': 'code', '◆': 'goal', '▷': 'run', '○': 'target', '✦': 'sun',
  '🧘': 'meditate', '🏃': 'run', '📖': 'book', '💧': 'water', '🛌': 'sleep', '🥗': 'food', '🧠': 'brain', '💪': 'strength',
  '☕': 'coffee', '🎯': 'goal', '🌱': 'plant', '🎵': 'music', '🧹': 'clean', '✍️': 'write', '✍': 'write', '☀️': 'sun', '☀': 'sun', '🌙': 'moon',
};

/** The icon id for a stored value (id or legacy glyph), or null for free text. */
export function habitIconId(icon: string | undefined): string | null {
  if (!icon) return null;
  if (icon in HABIT_ICON_SVGS) return icon;
  return LEGACY[icon] ?? null;
}

/** A habit's icon at `size` px; falls back to `fallback` text when unset. */
export function HabitIcon({ icon, size = 14, fallback }: { icon: string | undefined; size?: number; fallback?: string }) {
  const id = habitIconId(icon);
  if (id) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
        {HABIT_ICON_SVGS[id]}
      </svg>
    );
  }
  return <>{icon ?? fallback ?? ''}</>;
}
