// ADR 0001 Decision 24 — NowLine (Slice 3).
// Renders a 1px acid horizontal line at the current time position within the
// visible week. Owns its own 60-second interval tick — does NOT subscribe to
// Zustand and does NOT use RAF or any 60fps loop.

import { useEffect, useState } from 'react';
import { toYMD } from '../HabitNode/types';

export interface NowLineProps {
  weekStartDate: string;        // YYYY-MM-DD (Mon of the rendered week)
  hourRange: { start: number; end: number };
  rowHeight: number;
  columnWidth: number;
  gutterWidth: number;
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
  hourRange,
  rowHeight,
  columnWidth,
  gutterWidth,
}: NowLineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Only render if today is within [weekStartDate, weekStartDate+7).
  const todayYMD = toYMD(now);
  const weekEndDate = addDays(weekStartDate, 7);
  if (todayYMD < weekStartDate || todayYMD >= weekEndDate) return null;

  // Compute today's column index (0=Mon, 6=Sun) from weekStartDate + todayYMD.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const todayColumnIndex = weekDays.indexOf(todayYMD);

  // Only render if current hour is within hourRange.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  if (currentHour < hourRange.start || currentHour > hourRange.end) return null;

  // Y position: fraction of hours from range start.
  const hoursFromStart = currentHour - hourRange.start + currentMinute / 60;
  const yPos = hoursFromStart * rowHeight;

  // X span: from start of gutter to end of all 7 columns.
  const lineLeft = gutterWidth;
  const lineWidth = columnWidth * 7;

  // X position of the dot: left edge of today's column + half-column.
  const dotLeft = gutterWidth + todayColumnIndex * columnWidth + columnWidth / 2 - 2;

  return (
    <div
      data-testid="now-line"
      style={{
        position: 'absolute',
        top: yPos,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Horizontal red "now" line spanning all 7 day-columns. */}
      <div
        data-testid="now-line-bar"
        style={{
          position: 'absolute',
          top: 0,
          left: lineLeft,
          width: lineWidth,
          height: 1,
          background: '#ef4444',
          boxShadow: '0 0 4px rgba(239, 68, 68, 0.7)',
        }}
      />
      {/* 4px dot at the intersection with today's column. */}
      <div
        data-testid="now-line-dot"
        style={{
          position: 'absolute',
          top: -2,
          left: dotLeft,
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
        }}
      />
    </div>
  );
}
