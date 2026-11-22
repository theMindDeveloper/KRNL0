/**
 * jsdom has no layout. For drag tests: each day column `[data-cal-day]` is
 * drawn 100 px wide side by side from x = 0, one hour = 40 px from y = 0
 * (rows 00–24), and `document.elementsFromPoint` finds the column (or a
 * given element) under a point.
 */
import { vi } from 'vitest';
import { beginCalendarDrag, type DragItem } from '../calendarDrag';

export const HOUR_PX = 40;
export const COL_PX = 100;

export function mockCalendarLayout(opts: { outside?: () => Element | null } = {}): () => void {
  const cols = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-cal-day]'));
  const rect = (l: number, t: number, w: number, h: number): DOMRect => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) } as DOMRect);
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const i = cols().indexOf(this);
    if (i >= 0) return rect(i * COL_PX, 0, COL_PX, 24 * HOUR_PX);
    if (this.hasAttribute('data-cal-anytime')) return rect(-1000, -1000, 0, 0);
    // The Calendar (a drop surface) and its hours: the columns' area.
    if (this.hasAttribute('data-cal-surface') || this.getAttribute('data-testid') === 'calendar-grid-body') return rect(0, 0, Math.max(1, cols().length) * COL_PX, 24 * HOUR_PX);
    // A plan block: tall enough that a grab is never on its resize edges.
    if (this.getAttribute('data-testid')?.startsWith('task-block-')) return rect(-10000, -10000, 20000, 20000);
    return rect(0, 0, 0, 0);
  });
  const d = document as unknown as { elementsFromPoint?: ((x: number, y: number) => Element[]) | undefined };
  const before = d.elementsFromPoint;
  d.elementsFromPoint = (x: number, y: number) => {
    const out = opts.outside?.();
    if (out && (x < 0 || y < 0 || x >= cols().length * COL_PX)) return [out];
    const c = cols()[Math.floor(x / COL_PX)];
    return c && y >= 0 && y < 24 * HOUR_PX ? [c] : out ? [out] : [];
  };
  return () => { spy.mockRestore(); d.elementsFromPoint = before; };
}

/** Lets the engine's animation frame run. */
export const nextFrame = () => new Promise((r) => setTimeout(r, 40));

/**
 * Carries something in from outside the Calendar (a Todo row, a task card's
 * grip) and lets go at a point, through the one drag engine.
 */
export async function carryIn(item: DragItem, to: { x: number; y: number }): Promise<void> {
  beginCalendarDrag({ clientX: -50, clientY: -50, button: 0 }, { item });
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: to.x, clientY: to.y }));
  await nextFrame();
  window.dispatchEvent(new MouseEvent('pointerup', { clientX: to.x, clientY: to.y }));
  // The browser's click that follows a release (the engine swallows it).
  window.dispatchEvent(new MouseEvent('click', { clientX: to.x, clientY: to.y }));
  // The board changes after the landed frame is drawn (Decision 63).
  await afterLanding();
}

/**
 * Waits as the engine does after a release (a frame, then a task), and a
 * little more: queued after the engine's own step, so it always runs after it.
 */
export async function afterLanding(): Promise<void> {
  await new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
  await new Promise<void>((r) => setTimeout(r, 0));
}

/** A release, its click, and the frame after which the board changes. */
export async function release(x: number, y: number): Promise<void> {
  window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y }));
  window.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }));
  await afterLanding();
}

/** A stand-in drop surface covering the page (for sources tested without a Calendar). */
export function pageSurfaceEl(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 5000, bottom: 5000, width: 5000, height: 5000, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** A plan as the engine carries it. */
export const planItem = (id: string, minutes: number, extra: Partial<DragItem> = {}): DragItem =>
  ({ kind: 'task', id, name: id, tone: 'var(--acid)', lenMin: minutes, plannedMin: minutes, ...extra });
