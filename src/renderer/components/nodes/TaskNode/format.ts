// Task card time formatting. Kept out of index.tsx so React Fast Refresh can
// hot-swap the component.

/**
 * Decision 22 F16 — format seconds as `H:MM:SS` (≥1h) or `MM:SS` (<1h).
 */
export function formatElapsed(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
