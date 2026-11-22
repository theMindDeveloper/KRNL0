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
}

/** A plan as the engine carries it. */
export const planItem = (id: string, minutes: number, extra: Partial<DragItem> = {}): DragItem =>
  ({ kind: 'task', id, name: id, tone: 'var(--acid)', lenMin: minutes, plannedMin: minutes, ...extra });
