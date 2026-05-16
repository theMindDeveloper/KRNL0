// TotalsPanel — big-number summary tiles for a Totals object.

import type { OpenCounters, Totals } from '../types';

export interface TotalsPanelProps {
  totals: Totals;
  open?: OpenCounters;
  rangeLabel?: string;
}

const cellStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  background: 'var(--paper-2)',
  border: '1px solid var(--paper-3)',
  borderRadius: 6,
  minWidth: 64,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const valueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 20,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--ink)',
  lineHeight: 1,
};

const subStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-3)',
};

export function TotalsPanel({ totals, open, rangeLabel }: TotalsPanelProps) {
  return (
    <div
      data-testid="analytics-totals"
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
    >
      <div style={cellStyle}>
        <span style={labelStyle}>Tasks done</span>
        <span style={valueStyle}>{totals.tasksDone}</span>
        {rangeLabel && <span style={subStyle}>{rangeLabel}</span>}
      </div>
      <div style={cellStyle}>
        <span style={labelStyle}>Habit check-ins</span>
        <span style={valueStyle}>{totals.habitCheckins}</span>
      </div>
      <div style={cellStyle}>
        <span style={labelStyle}>Focus min</span>
        <span style={valueStyle}>{totals.focusMin}</span>
        <span style={subStyle}>{totals.sessions} sessions</span>
      </div>
      {open && (
        <div style={cellStyle}>
          <span style={labelStyle}>Open today</span>
          <span style={valueStyle}>
            {open.tasksOpen}
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{' / '}{open.tasksTotal}</span>
          </span>
          <span style={subStyle}>
            {open.sessionsToday} sess · {open.focusMinToday}m today
          </span>
        </div>
      )}
    </div>
  );
}
