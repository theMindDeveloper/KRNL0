import { useState } from 'react';
// ADR 0001 — CalendarNode (Slice 2: MonthView wired).
// Slice 1 shell upgraded: 'month' case now renders the real MonthView.
// Week and year remain placeholder stubs for Slices 3/4.

import { MotherFrame, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { MOTHER_MAX, MOTHER_MIN, motherSizeOf } from '../../../../shared/motherLayout';
import type { NodeProps } from '../types';
import type { CalendarConfig, CalendarState } from './types';
import { defaultCalendarConfig } from './types';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { YearView } from './YearView';

export function CalendarNode({
  node,
  onCommand,
  slotIndex = 5,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<CalendarState, CalendarConfig>) {
  const config = (node.config ?? defaultCalendarConfig()) as CalendarConfig;
  // window-frame.md — the header's last slot: the day and week views put the Calendar's menu there.
  const [headSlot, setHeadSlot] = useState<HTMLElement | null>(null);

  // Placeholder body — replaced by real views in Slices 2/3/4.
  const renderBody = () => {
    switch (config.view) {
      case 'day':
        return (
          <WeekView
            state={node.state as CalendarState}
            config={config}
            onCommand={onCommand}
            singleDay
            headSlot={headSlot}
          />
        );
      case 'week':
        return (
          <WeekView
            state={node.state as CalendarState}
            config={config}
            onCommand={onCommand}
            headSlot={headSlot}
          />
        );
      case 'month':
        return (
          <MonthView
            state={node.state as CalendarState}
            config={config}
            onCommand={onCommand}
          />
        );
      case 'year':
        return <YearView state={node.state as CalendarState} onCommand={onCommand} />;
      default: {
        const _exhaustive: never = config.view;
        void _exhaustive;
        return null;
      }
    }
  };

  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      // Decision 60 — the Calendar can be resized on the Free canvas.
      width={motherSizeOf(node).width}
      minHeight={motherSizeOf(node).height}
      // The size follows the pointer live (the windows beside it move with it).
      resizable={{ onResize: (w, h, first) => useBoardStore.getState().resizeMother(node.id, w, h, { skipHistory: !first }), min: MOTHER_MIN, max: MOTHER_MAX }}
      position={node.position}
    >
      {/* window-frame.md — the standard header: name, then the views. */}
      <div className="krnl-node-header kw-head">
        <span className="kw-dot" style={{ background: 'var(--cyan)' }} />
        <span className="kw-title">Calendar</span>
        <span className="kw-sp" />
        <span className="kw-views nodrag" role="tablist" aria-label="Calendar view" data-testid="calendar-view-switch">
          {(['day', 'week', 'month', 'year'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={config.view === view}
              data-testid={`calendar-view-${view}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onCommand('calendar.setView', { view })}
            >
              {view}
            </button>
          ))}
        </span>
        <span ref={setHeadSlot} style={{ display: 'inline-flex' }} />
      </div>

      {/* View placeholder body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderBody()}
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
