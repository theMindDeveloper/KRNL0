import { useRef, useState } from 'react';
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
import { WeekView, requestEventsList } from './WeekView';
import { ContextMenu } from '../../ContextMenu';
import { MenuIcon } from '../../ui/menuIcons';
import { useEasyMode } from '../../../store/uiMode';
import { calendarLayersOf } from './types';
import { YearView } from './YearView';

export function CalendarNode({
  node,
  onCommand,
  slotIndex = 5,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<CalendarState, CalendarConfig>) {
  const config = (node.config ?? defaultCalendarConfig()) as CalendarConfig;
  // The Calendar's menu button is in the header in every view (it never comes
  // and goes when the view changes): the day and week views fill it with their
  // items; Month and Year have their own.
  const weekMenu = useRef<((x: number, y: number) => void) | null>(null);
  const [ownMenu, setOwnMenu] = useState<{ x: number; y: number } | null>(null);
  const easy = useEasyMode();
  const layers = calendarLayersOf(node.state as CalendarState);
  const openMenu = (x: number, y: number) => {
    if ((config.view === 'week' || config.view === 'day') && weekMenu.current) weekMenu.current(x, y);
    else setOwnMenu({ x, y });
  };

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
            menuRef={weekMenu}
          />
        );
      case 'week':
        return (
          <WeekView
            state={node.state as CalendarState}
            config={config}
            onCommand={onCommand}
            menuRef={weekMenu}
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
        <button
          type="button"
          className="kw-btn nodrag"
          data-testid="week-legend"
          aria-label="Calendar menu"
          aria-haspopup="menu"
          title={easy ? 'Repeating events' : config.view === 'month' ? 'What the month shows, repeating events' : config.view === 'year' ? 'Repeating events' : 'What the Calendar shows, repeating events, zoom'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(r.right - 200, r.bottom + 4); }}
        >
          <MenuIcon name="list" size={12} />
        </button>
      </div>
      {ownMenu && (
        <ContextMenu
          x={ownMenu.x}
          y={ownMenu.y}
          onDismiss={() => setOwnMenu(null)}
          items={[
            ...(config.view === 'month' && !easy ? [{
              label: 'Habits',
              icon: layers.habits ? <MenuIcon name="check" /> : <span />,
              hint: layers.habits ? 'shown' : 'hidden',
              onSelect: () => onCommand('calendar.setLayers', { habits: !layers.habits }),
            }] : []),
            {
              label: 'Repeating events…',
              icon: <MenuIcon name="repeat" />,
              ...(config.view === 'month' && !easy ? { divider: true } : {}),
              // The list lives in the week: it opens there.
              onSelect: () => { requestEventsList(ownMenu.x, ownMenu.y); onCommand('calendar.setView', { view: 'week' }); },
            },
          ]}
        />
      )}

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
