// Pointer maths on a zoomed canvas. Kept out of WeekView.tsx so React Fast
// Refresh can hot-swap the component.

/** Screen px per CSS px for `el`: the canvas zoom when the calendar sits on
 *  the canvas, 1 in Station mode. Pointer positions are screen px while
 *  `rowHeight` is CSS px, so every pointer→minute conversion divides by this. */
export function screenScale(el: HTMLElement): number {
  const css = el.offsetWidth;
  const screen = el.getBoundingClientRect().width;
  return css > 0 && Number.isFinite(screen) && screen > 0 ? screen / css : 1;
}
