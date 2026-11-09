// @vitest-environment jsdom
// Text containment rule (charts/common.ts, docs/04-visual-system/design-tokens.md):
// no chart label may touch or cross the edge of the shape it sits in.
// This is the guard — if a chart change puts text on an edge, it fails here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import {
  boxOutline,
  fitArcLabel,
  fitCircleLabel,
  MIN_LABEL_FONT,
  TEXT_INSET,

} from '../../../src/renderer/analytics/charts/common';
import { DonutChart } from '../../../src/renderer/analytics/charts/DonutChart';

afterEach(() => cleanup());

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// Independent oracle: real glyph metrics measured with getBBox() in the
// running app (JetBrains Mono, 2026-11-02): advance 0.632em max, line box
// 1.33em. Deliberately NOT the fitter's own textWidth/textHeight, so a
// fitter that under-estimates text size fails here.
const MEASURED_ADVANCE_EM = 0.632;
const MEASURED_HEIGHT_EM = 1.33;

/** Is the label's real box, plus TEXT_INSET clearance, wholly inside the slice? */
function boxInsideSlice(
  x: number, y: number, text: string, fontSize: number,
  rOuter: number, rInner: number, start: number, end: number,
): boolean {
  const hw = (text.length * fontSize * MEASURED_ADVANCE_EM) / 2 + TEXT_INSET;
  const hh = (fontSize * MEASURED_HEIGHT_EM) / 2 + TEXT_INSET;
  // Dense sampling, including the interior, as a second opinion.
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const px = x - hw + (2 * hw * i) / 20;
      const py = y - hh + (2 * hh * j) / 20;
      const d = Math.hypot(px, py);
      if (d > rOuter + 1e-9 || d < rInner - 1e-9) return false;
      let a = Math.atan2(py, px) - start;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (end - start < Math.PI * 2 - 1e-6 && a > end - start + 1e-9) return false;
    }
  }
  return true;
}

describe('fitArcLabel — every label it places is inside its slice', () => {
  it('holds for 3,000 random slices, ring widths and sizes', () => {
    const rand = rng(42);
    let placed = 0;
    for (let n = 0; n < 3000; n++) {
      const size = 80 + rand() * 240;
      const rOuter = size / 2 - 6;
      const innerRatio = [0, 0.4, 0.55, 0.7, 0.8][Math.floor(rand() * 5)]!;
      const rInner = rOuter * innerRatio;
      const start = -Math.PI / 2 + rand() * Math.PI * 2;
      const sweep = rand() ** 2 * Math.PI * 2;
      const text = `${Math.round((sweep / (Math.PI * 2)) * 100)}%`;
      const fit = fitArcLabel({ text, rOuter, rInner, start, end: start + sweep, maxFont: 12 });
      if (!fit) continue;
      placed++;
      expect(fit.fontSize).toBeGreaterThanOrEqual(MIN_LABEL_FONT);
      expect(boxInsideSlice(fit.x, fit.y, text, fit.fontSize, rOuter, rInner, start, start + sweep)).toBe(true);
    }
    expect(placed).toBeGreaterThan(500); // the rule shrinks/hides, it doesn't just hide everything
  });

  it('hides a label that cannot fit even at the minimum font', () => {
    expect(fitArcLabel({ text: '3%', rOuter: 100, rInner: 55, start: 0, end: 0.05, maxFont: 12 })).toBeNull();
  });

  it('places the reported 31% label (220px donut, 0.55 ring) inside its slice', () => {
    const rOuter = 104;
    const rInner = rOuter * 0.55;
    const fit = fitArcLabel({ text: '31%', rOuter, rInner, start: -Math.PI / 2, end: -Math.PI / 2 + 1.95, maxFont: 12 });
    expect(fit).not.toBeNull();
    expect(boxInsideSlice(fit!.x, fit!.y, '31%', fit!.fontSize, rOuter, rInner, -Math.PI / 2, -Math.PI / 2 + 1.95)).toBe(true);
  });

  it('shrinks before it hides', () => {
    // Band too thin for 12px with clearance, wide enough for the 11px floor.
    const fit = fitArcLabel({ text: '31%', rOuter: 60, rInner: 26, start: 0, end: 1.9, maxFont: 12 });
    expect(fit).not.toBeNull();
    expect(fit!.fontSize).toBeLessThan(12);
    expect(fit!.fontSize).toBeGreaterThanOrEqual(11);
  });
});

describe('fitCircleLabel — centre text stays inside the hole', () => {
  it('long totals shrink, and vanish rather than overflow', () => {
    const big = fitCircleLabel('5h20', 60, 24);
    const tight = fitCircleLabel('123h45', 30, 24);
    expect(big).not.toBeNull();
    if (tight !== null) {
      const hw = (6 * tight * MEASURED_ADVANCE_EM) / 2 + TEXT_INSET;
      const hh = (tight * MEASURED_HEIGHT_EM) / 2 + TEXT_INSET;
      expect(Math.hypot(hw, hh)).toBeLessThanOrEqual(30);
    }
    expect(fitCircleLabel('a very long centre label', 20, 24)).toBeNull();
  });
});

describe('boxOutline', () => {
  it('includes all four corners', () => {
    const pts = boxOutline(0, 0, 2, 1).map(([x, y]) => `${x},${y}`);
    for (const c of ['-2,-1', '2,-1', '-2,1', '2,1']) expect(pts).toContain(c);
  });
});

describe('DonutChart renders only contained labels', () => {
  const datasets = [
    // The reported case: thin ring, 31/31/25/6/6 split.
    [100, 100, 80, 20, 20],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [500, 3, 2, 1],
    [50, 50],
  ];
  for (const [k, values] of datasets.entries()) {
    for (const size of [120, 180, 220]) {
      it(`dataset ${k} @ ${size}px`, () => {
        const data = values.map((v, i) => ({ id: `s${i}`, label: `S${i}`, value: v, color: '#888' }));
        const { container } = render(React.createElement(DonutChart, {
          data, innerRatio: 0.55, size, centerPrimary: '5h20', centerSecondary: '6 tasks',
        }));
        const rOuter = size / 2 - 6;
        const rInner = rOuter * 0.55;
        const total = values.reduce((s, v) => s + v, 0);
        const labels = Array.from(container.querySelectorAll('[data-testid="donut-slice-label"]'));
        // Recompute each slice's span and confirm the drawn label is inside it.
        let acc = -Math.PI / 2;
        const spans = values.map((v) => { const s = acc; acc += (v / total) * Math.PI * 2; return [s, acc] as const; });
        for (const el of labels) {
          const x = Number(el.getAttribute('x')) - size / 2;
          const y = Number(el.getAttribute('y')) - size / 2;
          const f = Number(el.getAttribute('font-size'));
          const text = el.textContent ?? '';
          const inSome = spans.some(([s, e]) => boxInsideSlice(x, y, text, f, rOuter, rInner, s, e));
          expect(inSome, `label "${text}" at ${f}px crosses a slice edge`).toBe(true);
        }
      });
    }
  }
});
