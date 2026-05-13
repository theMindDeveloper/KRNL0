// ADR 0001 — CalendarNode (Slice 1 shell).
// Renders an empty MotherFrame with a placeholder body. Slice 2/3/4 will
// replace the placeholder divs with real WeekView, MonthView, and YearView.

import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import type { NodeProps } from '../types';
import type { CalendarConfig, CalendarState } from './types';
import { defaultCalendarConfig } from './types';

export function CalendarNode({
  node,
  onCommand,
  slotIndex = 5,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<CalendarState, CalendarConfig>) {
  const config = (node.config ?? defaultCalendarConfig()) as CalendarConfig;

  // Placeholder body — replaced by real views in Slices 2/3/4.
  const renderBody = () => {
    switch (config.view) {
      case 'week':
        return (
          <div style={placeholderStyle}>
            <span>Week view (coming in Slice 2)</span>
          </div>
        );
      case 'month':
        return (
          <div style={placeholderStyle}>
            <span>Month view (coming in Slice 3)</span>
          </div>
        );
      case 'year':
        return (
          <div style={placeholderStyle}>
            <span>Year view (coming in Slice 4)</span>
          </div>
        );
      default: {
        const _exhaustive: never = config.view;
        void _exhaustive;
        return null;
      }
    }
  };

  return (
    <MotherFrame
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px 10px',
          borderBottom: '1px solid var(--paper-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-2)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Calendar</span>
        <span style={{ color: 'var(--ink-3)' }}>{config.view}</span>
      </div>

      {/* View placeholder body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {renderBody()}
      </div>

      {/* View toggle buttons (stub — wired to calendar.setView) */}
      <div
        style={{
          display: 'flex',
          borderTop: '1px solid var(--paper-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
        }}
      >
        {(['week', 'month', 'year'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => onCommand('calendar.setView', { view })}
            style={{
              flex: 1,
              padding: '6px 0',
              background: config.view === view ? 'var(--paper-2)' : 'transparent',
              border: 'none',
              borderRight: view !== 'year' ? '1px solid var(--paper-3)' : 'none',
              color: config.view === view ? 'var(--acid)' : 'var(--ink-3)',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {view}
          </button>
        ))}
      </div>
    </MotherFrame>
  );
}

const placeholderStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ink-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.08em',
  padding: 24,
  textAlign: 'center',
};
