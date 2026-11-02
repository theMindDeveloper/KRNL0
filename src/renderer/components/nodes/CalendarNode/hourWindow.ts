// No-scroll Calendar grid — which whole hours are on screen, and where the
// previous / next window starts. Pure; exported for tests.

export interface HourWindow {
  startHour: number;
  /** Exclusive. */
  endHour: number;
  /** Hours that fit the panel. */
  span: number;
  pages: number;
}

export function hourWindow(scrollTop: number, viewH: number, rowHeight: number, rowCount = 24): HourWindow {
  const span = Math.max(1, Math.min(rowCount, Math.floor((viewH > 0 ? viewH : rowHeight * rowCount) / rowHeight)));
  const startHour = Math.max(0, Math.min(rowCount - span, Math.round(scrollTop / rowHeight)));
  return { startHour, endHour: startHour + span, span, pages: Math.ceil(rowCount / span) };
}

/** Start hour of the window one step earlier (-1) or later (+1). */
export function stepHourWindow(scrollTop: number, viewH: number, rowHeight: number, rowCount: number, dir: 1 | -1): number {
  const w = hourWindow(scrollTop, viewH, rowHeight, rowCount);
  return Math.max(0, Math.min(rowCount - w.span, w.startHour + dir * w.span));
}
