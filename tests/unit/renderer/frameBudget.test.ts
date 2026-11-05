// @vitest-environment jsdom
/**
 * Frame budget — docs/06-requirements/render-frame-budget.md (issue #197).
 * jsdom has no Web Animations, so minimal CSSAnimation / KeyframeEffect
 * stand-ins model the bits the helper reads and writes.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  stepsFor,
  budgetAnimation,
  budgetAll,
  installFrameBudget,
} from '../../../src/renderer/utils/frameBudget';

interface Timing { duration: number | string; iterations: number; easing: string }

class FakeKeyframeEffect {
  timing: Timing;
  constructor(public target: Element | null, timing: Partial<Timing>) {
    this.timing = { duration: 1000, iterations: Infinity, easing: 'linear', ...timing };
  }
  getTiming(): Timing { return { ...this.timing }; }
  updateTiming(t: Partial<Timing>): void { this.timing = { ...this.timing, ...t }; }
}
class FakeAnimation {
  startTime: number | null = null;
  constructor(public effect: FakeKeyframeEffect) {}
}
class FakeCSSAnimation extends FakeAnimation {
  constructor(effect: FakeKeyframeEffect, public animationName: string) { super(effect); }
}

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let anims: FakeAnimation[] = [];

beforeAll(() => {
  for (const k of ['CSSAnimation', 'KeyframeEffect']) saved[k] = g[k];
  g.CSSAnimation = FakeCSSAnimation;
  g.KeyframeEffect = FakeKeyframeEffect;
  (document as unknown as { getAnimations: () => FakeAnimation[] }).getAnimations = () => anims;
  (Element.prototype as unknown as { getAnimations: () => FakeAnimation[] }).getAnimations = function (this: Element) {
    return anims.filter((a) => a.effect.target === this);
  };
});
afterAll(() => {
  for (const k of Object.keys(saved)) g[k] = saved[k];
});
afterEach(() => { anims = []; document.body.innerHTML = ''; });

function cssAnim(el: Element, name: string, timing: Partial<Timing>): FakeCSSAnimation {
  const a = new FakeCSSAnimation(new FakeKeyframeEffect(el, timing), name);
  anims.push(a);
  return a;
}
const asAnim = (a: FakeAnimation): Animation => a as unknown as Animation;

describe('stepsFor', () => {
  it('gives ~30 updates per second of duration', () => {
    expect(stepsFor(1600)).toBe(48);
    expect(stepsFor(60_000)).toBe(1800);
    expect(stepsFor(3200, 20)).toBe(64);
  });
  it('never returns fewer than 2 steps', () => {
    expect(stepsFor(10)).toBe(2);
    expect(stepsFor(0)).toBe(2);
    expect(stepsFor(Number.NaN)).toBe(2);
  });
});

describe('budgetAnimation', () => {
  it('F1 — quantises an infinite CSS animation to steps', () => {
    const el = document.createElement('div');
    const a = cssAnim(el, 'krnl-task-flow-dash', { duration: 1600 });
    expect(budgetAnimation(asAnim(a))).toBe(true);
    expect(a.effect.getTiming().easing).toBe('steps(48)');
  });

  it('F3 — leaves one-shot animations alone', () => {
    const el = document.createElement('div');
    const a = cssAnim(el, 'cal-cell-confirm', { duration: 400, iterations: 1 });
    expect(budgetAnimation(asAnim(a))).toBe(false);
    expect(a.effect.getTiming().easing).toBe('linear');
  });

  it('F3 — leaves JS-created (non-CSS) animations alone', () => {
    const el = document.createElement('div');
    const a = new FakeAnimation(new FakeKeyframeEffect(el, { duration: 1000 }));
    expect(budgetAnimation(asAnim(a))).toBe(false);
  });

  it('F4 — respects data-frame-budget="off" on an ancestor', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-frame-budget', 'off');
    const el = document.createElement('span');
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    const a = cssAnim(el, 'ai-swirl', { duration: 2000 });
    expect(budgetAnimation(asAnim(a))).toBe(false);
    expect(a.effect.getTiming().easing).toBe('linear');
  });

  it('aligns step boundaries to the shared 30 fps beat', () => {
    const beat = 1000 / 30;
    const el = document.createElement('div');
    const a = cssAnim(el, 'a', { duration: 1600 });
    a.startTime = 1012.7;
    const b = cssAnim(el, 'b', { duration: 3200, delay: 50 } as Partial<Timing>);
    b.startTime = 2000.4;
    budgetAnimation(asAnim(a));
    budgetAnimation(asAnim(b));
    const onBeat = (x: number): boolean => Math.abs(x / beat - Math.round(x / beat)) < 1e-6;
    expect(onBeat(a.startTime as number)).toBe(true);
    expect(onBeat((b.startTime as number) + 50)).toBe(true);
    expect((a.startTime as number) - 1012.7).toBeLessThan(beat);
    expect((a.startTime as number) - 1012.7).toBeGreaterThanOrEqual(0);
  });

  it('leaves pending animations (no start time) unaligned', () => {
    const el = document.createElement('div');
    const a = cssAnim(el, 'a', { duration: 1000 });
    budgetAnimation(asAnim(a));
    expect(a.startTime).toBeNull();
  });

  it('is idempotent', () => {
    const el = document.createElement('div');
    const a = cssAnim(el, 'x', { duration: 1000 });
    expect(budgetAnimation(asAnim(a))).toBe(true);
    expect(budgetAnimation(asAnim(a))).toBe(false);
  });
});

describe('installFrameBudget', () => {
  it('F1 — budgets animations already running at install', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const a = cssAnim(el, 'krnl-live-breathe', { duration: 3200 });
    const off = installFrameBudget(document);
    expect(a.effect.getTiming().easing).toBe('steps(96)');
    off();
  });

  it('F2 — budgets an infinite animation that starts later', () => {
    const off = installFrameBudget(document);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const a = cssAnim(el, 'clock-sec-sweep', { duration: 60_000 });
    const ev = new Event('animationstart', { bubbles: true });
    Object.defineProperty(ev, 'animationName', { value: 'clock-sec-sweep' });
    el.dispatchEvent(ev);
    expect(a.effect.getTiming().easing).toBe('steps(1800)');
    off();
  });

  it('stops listening after uninstall', () => {
    const off = installFrameBudget(document);
    off();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const a = cssAnim(el, 'late', { duration: 1000 });
    const ev = new Event('animationstart', { bubbles: true });
    Object.defineProperty(ev, 'animationName', { value: 'late' });
    el.dispatchEvent(ev);
    expect(a.effect.getTiming().easing).toBe('linear');
  });

  it('budgetAll counts only changed animations', () => {
    const el = document.createElement('div');
    cssAnim(el, 'a', { duration: 1000 });
    cssAnim(el, 'b', { duration: 500, iterations: 2 });
    expect(budgetAll(document)).toBe(1);
  });
});
