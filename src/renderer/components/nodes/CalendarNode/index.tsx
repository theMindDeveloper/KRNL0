import type { NodeProps } from '../types';
import type { CalendarState, CalendarConfig } from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW_LABELS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DOW_LABELS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function CalendarNode({ node, onCommand }: NodeProps<CalendarState, CalendarConfig>) {
  const { state, config } = node;
  const firstDay = config?.firstDay ?? 1;
  const today = todayStr();

  const eventSet = new Set(state.events.map((e) => e.date));

  // Day-of-week for the 1st of the displayed month (0=Sun...6=Sat).
  const firstDOW = new Date(state.year, state.month, 1).getDay();

  // Number of days in the displayed month.
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();

  // Build grid cells. The grid always starts on firstDay.
  // offset: how many blank leading cells.
  const offset = firstDay === 1
    ? (firstDOW === 0 ? 6 : firstDOW - 1)   // Monday-start: Sun wraps to 6
    : firstDOW;                               // Sunday-start: directly use getDay()

  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells: Array<{ day: number | null; key: string | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const d = i - offset + 1;
    if (d < 1 || d > daysInMonth) {
      cells.push({ day: null, key: null });
    } else {
      cells.push({ day: d, key: dateKey(state.year, state.month, d) });
    }
  }

  const dowLabels = firstDay === 1 ? DOW_LABELS_MON : DOW_LABELS_SUN;

  return (
    <div
      style={{
        width: 304,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 10,
        boxShadow: '0 2px 6px rgba(26,24,20,0.06)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Node header */}
      <div
        style={{
          padding: '7px 12px 6px',
          borderBottom: '1px solid var(--paper-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-4)', display: 'inline-block' }} />
        <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Calendar</span>
      </div>

      {/* Calendar body */}
      <div style={{ padding: '12px 14px 14px' }}>
        {/* Month navigation header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            marginBottom: 8,
          }}
        >
          <div>
            <span style={{ color: 'var(--ink)', fontWeight: 600, letterSpacing: '0.04em' }}>
              {MONTH_NAMES[state.month]}
            </span>
            <span style={{ color: 'var(--ink-3)', marginLeft: 6, fontWeight: 400 }}>
              {state.year}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              type="button"
              onClick={() => onCommand('calendar.prevMonth')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                cursor: 'pointer',
                width: 20,
                height: 20,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onCommand('calendar.nextMonth')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                cursor: 'pointer',
                width: 20,
                height: 20,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ›
            </button>
          </div>
        </div>

        {/* Day-of-week labels + grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 2,
          }}
        >
          {/* DOW headers */}
          {dowLabels.map((lbl) => (
            <div
              key={lbl}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-4)',
                textAlign: 'center',
                textTransform: 'uppercase',
                padding: '4px 0 6px',
                letterSpacing: '0.08em',
              }}
            >
              {lbl}
            </div>
          ))}

          {/* Day cells */}
          {cells.map((cell, idx) => {
            if (cell.day === null) {
              return (
                <div
                  key={`blank-${idx}`}
                  style={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}
                />
              );
            }
            const isToday = cell.key === today;
            const hasEvent = cell.key !== null && eventSet.has(cell.key);
            return (
              <div
                key={cell.key ?? idx}
                style={{
                  aspectRatio: '1',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: isToday ? 'var(--acid)' : 'var(--ink-2)',
                  borderRadius: 3,
                  background: isToday ? 'var(--ink)' : 'transparent',
                  fontWeight: isToday ? 600 : 400,
                  position: 'relative',
                  cursor: 'default',
                }}
              >
                {cell.day}
                {hasEvent && !isToday && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 3,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'var(--rust)',
                    }}
                  />
                )}
                {hasEvent && isToday && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 3,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'var(--acid)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Events list */}
        {state.events.length > 0 && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px dashed var(--paper-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {state.events.map((evt, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 12,
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-3)',
                    fontSize: 10,
                    width: 38,
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}
                >
                  {evt.date.slice(5)}
                </span>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: evt.color ?? 'var(--rust)',
                    flexShrink: 0,
                    alignSelf: 'center',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: 'var(--ink)', flex: 1, lineHeight: 1.3 }}>
                  {evt.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CalendarNode;
