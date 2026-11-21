// ADR 0001 Decision 24 — NowLine (Slice 3).
// Renders a 1px acid horizontal line at the current time position within the
// visible week. Owns its own 60-second interval tick — does NOT subscribe to
// Zustand and does NOT use RAF or any 60fps loop.

import { useEffect, useState } from 'react';
import { toYMD } from '../HabitNode/types';

export interface NowLineProps {
  weekStartDate: string;        // YYYY-MM-DD (first rendered day: Mon of the week, or the day in day view)
  /** Number of day columns rendered (7 for a week, 1 for the day view). */
  days?: number;
  hourRange: { start: number; end: number };
  rowHeight: number;
  columnWidth: number;
  gutterWidth: number;
  /** Draw the dot in today's column (off when the Clock rail's knob marks now). */
  showDot?: boolean;
}

// Parse a YYYY-MM-DD to a Date at local midnight.
function parseYMD(ymd: string): Date {
  return new Date(ymd + 'T00:00:00');
}

// Add n days to a YYYY-MM-DD string.
function addDays(ymd: string, n: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

export function NowLine({
  weekStartDate,
  days = 7,
  hourRange,
  rowHeight,
  columnWidth,
  gutterWidth,
  showDot = true,
}: NowLineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Only render if today is within [weekStartDate, weekStartDate+days).
  const todayYMD = toYMD(now);
  const weekEndDate = addDays(weekStartDate, days);
  if (todayYMD < weekStartDate || todayYMD >= weekEndDate) return null;

  // Today's column index among the rendered days.
  const weekDays = Array.from({ length: days }, (_, i) => addDays(weekStartDate, i));
  const todayColumnIndex = weekDays.indexOf(todayYMD);

  // Only render if current hour is within hourRange.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  if (currentHour < hourRange.start || currentHour > hourRange.end) return null;

  // Y position: fraction of hours from range start.
  const hoursFromStart = currentHour - hourRange.start + currentMinute / 60;
  const yPos = hoursFromStart * rowHeight;

  // X span: anchored to the parent container's full width via left:gutter +
  // right:0 so the bar always reaches the right edge of the day-cols area
  // regardless of how the columns flex out (previous fixed `width:
  // columnWidth*7` ended mid-week because columnWidth was a nominal 40px
  // while real columns were ~80px each).
  // Silence unused-param ESLint warning — columnWidth is no longer needed
  // but kept on the props interface for back-compat with callers.
  void columnWidth;

  // Decision 55 — today carries the line; the other days only a faint trace
  // of it, so the eye goes to today. No glow (calm, readable).
  const todayLeftPct = (todayColumnIndex * 100) / days;
  const colPct = 100 / days;

  return (
    <div
      data-testid="now-line"
      data-now-min={currentHour * 60 + currentMinute}
      style={{
        position: 'absolute',
        top: yPos,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* The faint trace across the whole week. */}
      <div
        data-testid="now-line-bar"
        style={{
          position: 'absolute',
          top: 0,
          left: gutterWidth,
          right: 0,
          height: 1,
          background: 'color-mix(in srgb, var(--k-now, #ef4444) 38%, transparent)',
        }}
      />
      {/* Today's part: solid and 2 px, from its left edge to its right. */}
      <div
        data-testid="now-line-today"
        style={{
          position: 'absolute',
          top: -0.5,
          left: `calc(${gutterWidth}px + ${todayLeftPct}%)`,
          width: `${colPct}%`,
          height: 2,
          background: 'var(--k-now, #ef4444)',
        }}
      />
      {/* A dot where today's line starts. */}
      {showDot && <div
        data-testid="now-line-dot"
        style={{
          position: 'absolute',
          top: -3.5,
          left: `calc(${gutterWidth}px + ${todayLeftPct}% - 4px)`,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--k-now, #ef4444)',
        }}
      />}
    </div>
  );
}
