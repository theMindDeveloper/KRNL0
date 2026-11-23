// Easing and keyframe helpers. Everything is a pure function of time t (seconds).
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const inOut = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
export const outExpo = (x: number) => { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
export const inPow = (x: number, p = 3) => Math.pow(clamp(x), p);
export const outPow = (x: number, p = 3) => 1 - Math.pow(1 - clamp(x), p);
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export type Keys<T extends Record<string, number>> = [number, T, ((x: number) => number)?][];
/** Value between the keys around t; the ease of the arriving key shapes the segment. */
export function keys<T extends Record<string, number>>(ks: Keys<T>, t: number): T {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, b, e] = ks[i];
    if (t < t1) {
      const [t0, a] = ks[i - 1];
      const p = (e ?? sine)((t - t0) / (t1 - t0));
      const o = {} as T;
      for (const k in a) (o as Record<string, number>)[k] = lerp(a[k], b[k], p);
      return o;
    }
  }
  return ks[ks.length - 1][1];
}
// deterministic pseudo-random
export const rand = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
