// Station panel sizes from the saved geometry (ADR 0008: "resize persists").
// Panels only read `defaultSize` when they mount — on reload and on every
// Station ↔ Canvas switch — so that is where the saved sizes must go in.

/**
 * Percent sizes for the visible panels `ids`: the saved fractions scaled to
 * fill 100 %, or `defaults` when anything is missing, unusable, or would put
 * a panel under its minimum (e.g. a panel that was hidden when it was saved).
 */
export function restoredSizes(
  ids: readonly string[],
  defaults: readonly number[],
  mins: readonly number[],
  saved: Readonly<Record<string, number>> | undefined,
): number[] {
  if (!saved || ids.length === 0) return [...defaults];
  const raw = ids.map((id) => saved[id]);
  if (raw.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) return [...defaults];
  const total = (raw as number[]).reduce((a, v) => a + v, 0);
  const sizes = (raw as number[]).map((v) => (v / total) * 100);
  return sizes.some((v, i) => v < (mins[i] ?? 0)) ? [...defaults] : sizes;
}
