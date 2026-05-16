/**
 * AnalyticsNode — free-floating child node hosting the KRNL analytics dashboard.
 *
 * Not a mother. Spawns from the dock's keyboard shortcut ('A') without a
 * dock button (Issue #134 — "normal child floating node and not in the
 * dock"). Reads from the analytics engine via useAnalytics(); all numbers
 * are derived from board.nodes — no parallel storage, no event log.
 */

import { useMemo } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '../types';
import {
  ActivityStrip,
  CalendarHeatmap,
  DowBars,
  HourLine,
  MonthBars,
  TotalsPanel,
  lastNDays,
  yearRange,
  useAnalytics,
  todayLocal,
} from '../../../analytics';
import { listDataSources } from '../../../analytics';
import type { AnalyticsConfig, AnalyticsState, AnalyticsView } from './types';
import { defaultAnalyticsState, ANALYTICS_VIEWS } from './types';

const VIEW_LABELS: Record<AnalyticsView, string> = {
  overview: 'Overview',
  calendar: 'Calendar',
  patterns: 'Patterns',
  sources: 'Sources',
};

const RANGE_PRESETS = [7, 30, 90, 365] as const;

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--paper-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '6px 12px 0',
};

const tabButton = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '4px 8px',
  border: '1px solid var(--paper-3)',
  borderBottom: active ? '1px solid var(--node-bg)' : '1px solid var(--paper-3)',
  borderRadius: '4px 4px 0 0',
  background: active ? 'var(--node-bg)' : 'var(--paper-2)',
  color: active ? 'var(--acid)' : 'var(--ink-3)',
  cursor: 'pointer',
});

const chipBtn = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  letterSpacing: '0.04em',
  padding: '2px 6px',
  border: '1px solid var(--paper-3)',
  borderRadius: 3,
  background: active ? 'var(--acid)' : 'var(--paper-2)',
  color: active ? '#1a1814' : 'var(--ink-3)',
  cursor: 'pointer',
});

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 12px',
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export function AnalyticsNode({
  node,
  selected,
  onCommand,
}: NodeProps<AnalyticsState, AnalyticsConfig>) {
  const state: AnalyticsState = { ...defaultAnalyticsState(), ...(node.state ?? {}) };
  const view = state.view;
  const analytics = useAnalytics();

  const range = useMemo(() => lastNDays(state.rangeDays), [state.rangeDays]);
  const year = state.year ?? new Date(todayLocal() + 'T00:00:00').getFullYear();

  const byDay = analytics.byDay(range);
  const tot = analytics.totals(range);
  const open = analytics.open();
  const dow = analytics.byDayOfWeek(range);
  const hour = analytics.byHourOfDay(range);
  const months = analytics.byMonth(year);
  const streaks = analytics.streaks();
  const sources = listDataSources();

  const onResizeEnd = (
    _e: unknown,
    p: { width: number; height: number },
  ): void => {
    onCommand('analytics.setSize', { width: p.width, height: p.height });
  };

  return (
    <div
      data-testid="analytics-node-root"
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <NodeResizer
        isVisible={selected === true}
        minWidth={420}
        minHeight={320}
        maxWidth={1400}
        maxHeight={1400}
        onResizeEnd={onResizeEnd}
        handleStyle={{
          width: 8,
          height: 8,
          background: '#0e0d0b',
          border: '1.5px solid var(--acid)',
          borderRadius: '50%',
        }}
        lineStyle={{ borderColor: 'rgba(201,241,88,0.4)', borderWidth: 1 }}
      />

      <div style={headerStyle}>
        <span>
          <span style={{ color: 'var(--cyan)' }}>●</span>
          {' analytics · '}
          <span style={{ color: 'var(--ink-2)' }}>{sources.length} sources</span>
        </span>
        <span style={{ color: 'var(--ink-4)' }}>
          {streaks.longestHabitStreak > 0
            ? `streak · ${streaks.longestHabitStreak}d`
            : `${tot.tasksDone} done`}
        </span>
      </div>

      <div style={tabsStyle}>
        {ANALYTICS_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`analytics-tab-${v}`}
            onClick={(e) => {
              e.stopPropagation();
              onCommand('analytics.setView', { view: v });
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={tabButton(view === v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end', paddingBottom: 4 }}>
          {RANGE_PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              data-testid={`analytics-range-${days}`}
              onClick={(e) => {
                e.stopPropagation();
                onCommand('analytics.setRangeDays', { days });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={chipBtn(state.rangeDays === days)}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 12px' }}>
        {view === 'overview' && (
          <>
            <div style={sectionStyle}>
              <span style={sectionLabelStyle}>Totals · last {state.rangeDays} days</span>
              <TotalsPanel totals={tot} open={open} rangeLabel={`${range.start} → ${range.end}`} />
            </div>
            <div style={sectionStyle}>
              <span style={sectionLabelStyle}>Activity strip</span>
              <ActivityStrip data={byDay} metric={state.metric} width={580} height={48} />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {(['taskCount', 'habitCount', 'focusMin', 'sessions'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`analytics-metric-${m}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCommand('analytics.setMetric', { metric: m });
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={chipBtn(state.metric === m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '4px 12px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={sectionLabelStyle}>By weekday</span>
                <DowBars data={dow} metric="tasks" width={280} height={110} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={sectionLabelStyle}>By hour</span>
                <HourLine data={hour} metric="tasks" width={280} height={110} />
              </div>
            </div>
          </>
        )}

        {view === 'calendar' && (
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>
              Calendar heatmap · last {state.rangeDays} days · {state.metric}
            </span>
            <div style={{ overflowX: 'auto' }}>
              <CalendarHeatmap data={byDay} metric={state.metric} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {(['taskCount', 'habitCount', 'focusMin', 'sessions'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommand('analytics.setMetric', { metric: m });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={chipBtn(state.metric === m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'patterns' && (
          <>
            <div style={sectionStyle}>
              <span style={sectionLabelStyle}>By weekday · tasks</span>
              <DowBars data={dow} metric="tasks" width={580} height={120} />
            </div>
            <div style={sectionStyle}>
              <span style={sectionLabelStyle}>By hour · tasks</span>
              <HourLine data={hour} metric="tasks" width={580} height={120} />
            </div>
            <div style={sectionStyle}>
              <span style={sectionLabelStyle}>By month · {year}</span>
              <MonthBars data={months} metric="tasks" width={580} height={120} />
            </div>
          </>
        )}

        {view === 'sources' && (
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>Registered data sources</span>
            <table
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--ink-2)',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr style={{ color: 'var(--ink-4)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>id</th>
                  <th style={{ padding: '4px 6px' }}>label</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>events</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const count = analytics.events().filter((e) => e.source === s.id).length;
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--paper-3)' }}>
                      <td style={{ padding: '4px 6px' }}>{s.id}</td>
                      <td style={{ padding: '4px 6px' }}>{s.label}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {streaks.perHabit.length > 0 && (
              <>
                <span style={{ ...sectionLabelStyle, marginTop: 8 }}>Habit streaks</span>
                <table
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--ink-2)',
                    borderCollapse: 'collapse',
                  }}
                >
                  <tbody>
                    {streaks.perHabit.map((h) => (
                      <tr key={h.habitId} style={{ borderTop: '1px solid var(--paper-3)' }}>
                        <td style={{ padding: '4px 6px' }}>{h.label}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--acid)' }}>
                          {h.streak}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalyticsNode;
