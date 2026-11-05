// Station panel sizes from the saved geometry (ADR 0008: "resize persists").
// Panels only read `defaultSize` when they mount — on reload and on every
// Station ↔ Canvas switch — so that is where the saved sizes must go in.

/**
 * Percent sizes for the visible panels `ids`: the saved fractions scaled to
 * fill `total` % (100 unless a fixed panel takes part of the row), or
 * `defaults` when anything is missing, unusable, or would put a panel under
 * its minimum (e.g. a panel that was hidden when it was saved).
 */
export function restoredSizes(
  ids: readonly string[],
  defaults: readonly number[],
  mins: readonly number[],
  saved: Readonly<Record<string, number>> | undefined,
  total = 100,
): number[] {
  if (!saved || ids.length === 0) return [...defaults];
  const raw = ids.map((id) => saved[id]);
  if (raw.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) return [...defaults];
  const sum = (raw as number[]).reduce((a, v) => a + v, 0);
  const sizes = (raw as number[]).map((v) => (v / sum) * total);
  return sizes.some((v, i) => v < (mins[i] ?? 0)) ? [...defaults] : sizes;
}

/**
 * Percent sizes for a row where one panel (`absorberId`, the embedded canvas)
 * takes whatever the others leave. Every other visible panel comes back at
 * the width it was saved at — its share of the whole row, not rescaled — so
 * a panel that was hidden and shown again keeps the width the user gave it
 * even though the row was saved without it in the meantime (the canvas had
 * filled its space). A panel with no usable saved width gets its default.
 *
 * Falls back to `restoredSizes` (proportional) when the absorber isn't
 * visible, and to `defaults` when the absorber would end up under its minimum.
 */
export function restoredSizesAround(
  absorberId: string,
  ids: readonly string[],
  defaults: readonly number[],
  mins: readonly number[],
  saved: Readonly<Record<string, number>> | undefined,
  total = 100,
): number[] {
  const absorber = ids.indexOf(absorberId);
  if (absorber === -1) return restoredSizes(ids, defaults, mins, saved, total);
  const sizes = ids.map((id, i) => {
    if (i === absorber) return 0;
    const v = saved?.[id];
    const pct = typeof v === 'number' && Number.isFinite(v) ? v * 100 : NaN;
    return pct >= (mins[i] ?? 0) ? pct : defaults[i]!;
  });
  const rest = total - sizes.reduce((a, v) => a + v, 0);
  if (rest < (mins[absorber] ?? 0)) return [...defaults];
  sizes[absorber] = rest;
  return sizes;
}
