/**
 * Frame budget for decorative CSS animations (issue #197,
 * docs/06-requirements/render-frame-budget.md).
 *
 * Chromium renders a smooth infinite animation at the monitor's refresh rate
 * (~218 fps measured on a high-refresh panel), and each frame costs CPU in the
 * GPU process and the renderer. A slow breathing badge does not need that.
 *
 * We give every infinite CSS animation an effect-level `steps(N)` timing so
 * its value only changes ~30 times per second. Chromium skips the frames in
 * between, which cut idle CPU ~5x in measurement while the animations keep
 * their keyframes, curves and durations (effect easing composes on top of the
 * per-keyframe easing).
 *
 * Their start times are also snapped to one shared 30 fps beat so all of
 * them change in the same frame instead of interleaving (see alignToBeat).
 *
 * Untouched: transitions, finite (one-shot) animations, JS-created Web
 * Animations, and anything inside `data-frame-budget="off"`.
 */

export const DEFAULT_BUDGET_FPS = 30;

/** Number of steps that gives ~`fps` updates per second over `durationMs`. */
export function stepsFor(durationMs: number, fps: number = DEFAULT_BUDGET_FPS): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 2;
  return Math.max(2, Math.round((durationMs / 1000) * fps));
}

function isOptedOut(target: Element | null): boolean {
  return !!target?.closest?.('[data-frame-budget="off"]');
}

/**
 * Apply the budget to one animation if it qualifies. Returns true when the
 * animation was changed.
 */
export function budgetAnimation(anim: Animation, fps: number = DEFAULT_BUDGET_FPS): boolean {
  if (typeof CSSAnimation === 'undefined' || !(anim instanceof CSSAnimation)) return false;
  const effect = anim.effect;
  if (!(effect instanceof KeyframeEffect)) return false;
  const timing = effect.getTiming();
  if (timing.iterations !== Infinity) return false;
  if (isOptedOut(effect.target)) return false;
  const duration = typeof timing.duration === 'number' ? timing.duration : 0;
  const easing = `steps(${stepsFor(duration, fps)})`;
  if (timing.easing === easing) return false;
  effect.updateTiming({ easing });
  alignToBeat(anim, typeof timing.delay === 'number' ? timing.delay : 0, fps);
  return true;
}

/**
 * Put the animation's step boundaries on the shared `fps` beat of the
 * document timeline. Without this, a dozen stepped animations each change at
 * their own moments and together still wake Chromium far more than 30x/s
 * (measured: aligning halved idle CPU again). Shifts the phase by less than
 * one step (< 34 ms) — invisible.
 */
export function alignToBeat(anim: Animation, delayMs: number, fps: number = DEFAULT_BUDGET_FPS): void {
  const start = anim.startTime;
  if (typeof start !== 'number' || !Number.isFinite(start)) return;
  const beat = 1000 / fps;
  const origin = start + delayMs;
  const aligned = Math.ceil(origin / beat) * beat - delayMs;
  if (aligned !== start) anim.startTime = aligned;
}

/** Budget every animation currently on `root`'s subtree. */
export function budgetAll(root: Document | Element = document, fps: number = DEFAULT_BUDGET_FPS): number {
  const anims = 'getAnimations' in root
    ? (root instanceof Document ? root.getAnimations() : root.getAnimations({ subtree: true }))
    : [];
  let n = 0;
  for (const a of anims) if (budgetAnimation(a, fps)) n++;
  return n;
}

/**
 * Install once at renderer startup. Budgets existing animations and every
 * infinite CSS animation that starts later. Returns an uninstall function.
 */
export function installFrameBudget(doc: Document = document, fps: number = DEFAULT_BUDGET_FPS): () => void {
  const onStart = (e: Event): void => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const name = (e as AnimationEvent).animationName;
    for (const a of el.getAnimations()) {
      if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && a.animationName === name) {
        budgetAnimation(a, fps);
      }
    }
  };
  doc.addEventListener('animationstart', onStart, true);
  budgetAll(doc, fps);
  return () => doc.removeEventListener('animationstart', onStart, true);
}
