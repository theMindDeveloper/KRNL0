/**
 * Decision 59 — a Station window has a real minimum size.
 *
 * react-resizable-panels 4 reads a plain number as PIXELS, so the old
 * `minSize={10}` ("10 %") let a window shrink to 10 px (the owner squeezed
 * the Todos to a sliver). A window keeps at least MIN_WINDOW px, but never
 * more than a fair share of its row, so a full row always still fits.
 */

export const MIN_WINDOW = { width: 240, height: 150 } as const;

/** The minimum as a percent string for a panel among `count` in a row `containerPx` long. */
export function minSizeOf(px: number, containerPx: number, count: number): string {
  if (!(containerPx > 0)) return '0%';
  const fair = 100 / Math.max(1, count);
  const want = (px / containerPx) * 100;
  return `${Math.round(Math.min(fair * 0.9, want) * 10) / 10}%`;
}
