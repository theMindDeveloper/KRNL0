// Shared chart helpers — no React. Pure math.

export function maxOf(nums: readonly number[]): number {
  let m = 0;
  for (const n of nums) if (n > m) m = n;
  return m;
}

export function linearScale(domainMax: number, rangeMax: number): (v: number) => number {
  if (domainMax <= 0) return () => 0;
  return (v) => (v / domainMax) * rangeMax;
}

// Chart colors.
//
// AnalyticsNode's chrome reads --k-an-* tokens (ADR 0009): Classic keeps the
// original dark slate (the fallbacks); other frame styles map them to their
// own palette. Without a frame style it doesn't follow the global theme. Therefore axis / label / grid tokens
// must NOT use --ink-3 / --ink-4 / --paper-3 (which flip per theme and go
// olive-tan in light mode, leaving chart labels barely visible on the dark
// chart bg). Locked to bright greys instead so the labels read in every
// theme.
//
// Series colors (task / habit / focus) stay theme-aware — they pick up
// the user's brand tone choices and contrast against the chart's dark bg
// regardless.
export const COLOR_TASK = 'var(--cyan)';
export const COLOR_HABIT = 'var(--acid)';
export const COLOR_FOCUS = 'var(--rust)';
export const COLOR_GRID = 'var(--k-an-line-2, #2a2e33)';
export const COLOR_AXIS = 'var(--k-an-ink-2b, #aab0b7)';
export const COLOR_LABEL = 'var(--k-an-ink-2, #c8cdd3)';

// ── Text containment rule ────────────────────────────────────────────────────
// No chart text may touch or cross the edge of the shape it sits in (a donut
// slice, the donut hole, a bar, the plot area). Every SVG label is sized with
// the helpers below: shrink the font until the label's box — plus TEXT_INSET
// on every side, which also covers the 2.4px dark halo — fits, and if it
// still doesn't fit at the minimum size, don't draw it (the legend / tooltip
// carries the value instead). See docs/04-visual-system/design-tokens.md.

/** Clearance (px) every label keeps from any edge of its container. */
export const TEXT_INSET = 3;
/** Smallest font a chart label may shrink to before it is hidden instead. */
export const MIN_LABEL_FONT = 8;

/** Conservative width (px) of a monospace label. Measured JetBrains Mono
 *  advance is 0.62–0.63em; 0.66 leaves headroom for the wider pixel fonts
 *  some frame styles use. Add the label's CSS letter-spacing (in em). */
export function textWidth(text: string, fontSize: number, letterSpacingEm = 0): number {
  return text.length * fontSize * (0.66 + letterSpacingEm);
}

/** Points sampled along a box outline (corners + 7 per edge). */
export function boxOutline(cx: number, cy: number, hw: number, hh: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = cx - hw + 2 * hw * t;
    const y = cy - hh + 2 * hh * t;
    pts.push([x, cy - hh], [x, cy + hh], [cx - hw, y], [cx + hw, y]);
  }
  return pts;
}

/** Rendered line box height (px) — measured getBBox height is ≈1.33em. */
export function textHeight(fontSize: number): number {
  return fontSize * 1.35;
}

/**
 * Largest font in [MIN_LABEL_FONT, maxFont] at which `text`, centred on the
 * slice's mid-angle at radius (rOuter + rInner) / 2, lies entirely inside the
 * annular slice [start, end] × [rInner, rOuter] with TEXT_INSET clearance on
 * every side. Returns null when even the minimum size doesn't fit (hide it).
 * Works for pies too (rInner = 0).
 */
export function fitArcLabel(opts: {
  text: string;
  rOuter: number;
  rInner: number;
  start: number;
  end: number;
  maxFont: number;
}): { fontSize: number; x: number; y: number } | null {
  const { text, rOuter, rInner, start, end, maxFont } = opts;
  const mid = (start + end) / 2;
  const sweep = end - start;
  for (let f = maxFont; f >= MIN_LABEL_FONT; f -= 0.5) {
    const hw = textWidth(text, f) / 2 + TEXT_INSET;
    const hh = textHeight(f) / 2 + TEXT_INSET;
    // Try the band midline first, then nudge outward/inward (pies have room
    // further out than the midpoint).
    const radii = [(rOuter + rInner) / 2, rOuter * 0.62 + rInner * 0.38, rOuter * 0.5 + rInner * 0.5];
    for (const r of radii) {
      const x = r * Math.cos(mid);
      const y = r * Math.sin(mid);
      // The point of the box nearest the centre must clear the hole…
      const nx = Math.max(x - hw, Math.min(0, x + hw));
      const ny = Math.max(y - hh, Math.min(0, y + hh));
      if (Math.hypot(nx, ny) < rInner) continue;
      // …and every point along the box outline must sit inside the slice.
      const ok = boxOutline(x, y, hw, hh).every(([px, py]) => {
        if (Math.hypot(px, py) > rOuter) return false;
        if (sweep >= Math.PI * 2 - 1e-6) return true;
        // Angular position relative to the slice start, normalised to [0, 2π).
        let a = Math.atan2(py, px) - start;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return a <= sweep;
      });
      if (ok) return { fontSize: f, x, y };
    }
  }
  return null;
}

/**
 * Largest font in [MIN_LABEL_FONT, maxFont] at which a centred label of
 * `text` fits inside a circle of radius `r` (the donut hole), with its box
 * offset vertically by `dy` from the centre. Null = hide.
 */
export function fitCircleLabel(text: string, r: number, maxFont: number, dy = 0, letterSpacingEm = 0): number | null {
  for (let f = maxFont; f >= MIN_LABEL_FONT; f -= 0.5) {
    const hw = textWidth(text, f, letterSpacingEm) / 2 + TEXT_INSET;
    const far = Math.abs(dy) + textHeight(f) / 2 + TEXT_INSET;
    if (Math.hypot(hw, far) <= r) return f;
  }
  return null;
}

export const DOW_LABELS =['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// ── Readability rules (docs/04-visual-system — "Charts") ─────────────────────

/**
 * Axis ticks for a count axis: whole numbers only, each shown once. With a
 * small peak (≤ n) every integer 1…peak; otherwise ~n evenly spaced integers.
 * Never "0 1 1 1" from rounding fractional steps.
 */
export function countTicks(peak: number, n = 4): number[] {
  const p = Math.max(1, Math.ceil(peak));
  if (p <= n) return Array.from({ length: p }, (_, i) => i + 1);
  const step = Math.ceil(p / n);
  const out: number[] = [];
  for (let v = step; v < p; v += step) out.push(v);
  out.push(p);
  return [...new Set(out)];
}

/**
 * Keep a text label inside [minX, maxX]: returns the x and anchor to use so
 * the whole label is visible (it slides inward instead of being clipped).
 */
export function clampLabelX(x: number, text: string, fontSize: number, minX: number, maxX: number): { x: number; anchor: 'start' | 'middle' | 'end' } {
  const half = textWidth(text, fontSize) / 2;
  if (x - half < minX) return { x: minX, anchor: 'start' };
  if (x + half > maxX) return { x: maxX, anchor: 'end' };
  return { x, anchor: 'middle' };
}
