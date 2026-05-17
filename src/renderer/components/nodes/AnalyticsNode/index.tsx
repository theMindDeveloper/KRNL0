/**
 * AnalyticsNode — free-floating child node hosting the KRNL analytics dashboard.
 *
 * Not a mother. Spawns from the dock button or 'A' shortcut. Reads from the
 * analytics engine via useAnalytics(); all numbers are derived from
 * board.nodes — no parallel storage, no event log.
 *
 * UI: dark glass card with a gradient titlebar, four pill-tabs, a compact
 * range strip, and section cards for each chart. No connectors — analytics
 * is a read-only dashboard (handles suppressed in rfAdapters by kind check).
 */

import { useMemo } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import {
  ActivityStrip,
  CalendarHeatmap,
  DowBars,
  HourLine,
  MonthBars,
  TotalsPanel,
  lastNDays,
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

const METRIC_LABELS: Record<'taskCount' | 'habitCount' | 'focusMin' | 'sessions', string> = {
  taskCount: 'tasks',
  habitCount: 'habits',
  focusMin: 'focus',
  sessions: 'sessions',
};

// ── chrome ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background:
    'linear-gradient(180deg, #16181a 0%, #0e1012 100%)',
  border: '1px solid #2a2e33',
  borderRadius: 10,
  boxShadow:
    '0 8px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  overflow: 'hidden',
  color: '#eef1f4',
};

const titlebarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background:
    'linear-gradient(180deg, #1f2226 0%, #16181a 100%)',
  borderBottom: '1px solid #0a0c0e',
  boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.03)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#c8cdd3',
  flexShrink: 0,
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--acid, #c9f158)',
  boxShadow: '0 0 6px rgba(201,241,88,0.7)',
};

const summaryChipStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.06em',
  padding: '2px 7px',
  border: '1px solid #2a2e33',
  borderRadius: 999,
  background: 'rgba(20,22,24,0.6)',
  color: '#eef1f4',
};

const tabsBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 12px 0',
  flexShrink: 0,
};

const tabPill = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '4px 10px',
  border: '1px solid ' + (active ? '#3a4048' : '#23262a'),
  borderRadius: 999,
  background: active
    ? 'linear-gradient(180deg, #2a2e33 0%, #1c1f23 100%)'
    : 'transparent',
  color: active ? 'var(--acid, #c9f158)' : '#aab0b7',
  cursor: 'pointer',
  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
  transition: 'all 120ms',
});

const chipBtn = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  letterSpacing: '0.04em',
  padding: '2px 7px',
  border: '1px solid ' + (active ? '#3a4048' : '#23262a'),
  borderRadius: 4,
  background: active ? 'var(--acid, #c9f158)' : 'transparent',
  color: active ? '#0e1012' : '#c8cdd3',
  cursor: 'pointer',
  fontWeight: active ? 700 : 500,
});

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1a1d20 0%, #131517 100%)',
  border: '1px solid #23262a',
  borderRadius: 6,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
};

const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  padding: '8px 12px',
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: '#9aa1a8',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '8px 0 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

export function AnalyticsNode({
  node,
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
    <div data-testid="analytics-node-root" style={rootStyle}>
      <NodeResizeControl
        position="bottom-right"
        minWidth={460}
        minHeight={340}
        maxWidth={1400}
        maxHeight={1400}
        onResizeEnd={onResizeEnd}
        style={{
          background: 'transparent',
          border: 'none',
          width: 18,
          height: 18,
          right: 2,
          bottom: 2,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          style={{
            position: 'absolute',
            right: 2,
            bottom: 2,
            cursor: 'nwse-resize',
            color: '#7d848b',
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <path d="M13 5L5 13M13 9L9 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </NodeResizeControl>

      {/* Titlebar */}
      <div style={titlebarStyle}>
        <span style={dotStyle} aria-hidden />
        <span style={{ color: '#f4f6f8', fontWeight: 600 }}>Analytics</span>
        <span style={{ color: '#7d848b' }}>·</span>
        <span style={{ color: '#aab0b7' }}>{sources.length} sources</span>
        <div style={{ flex: 1 }} />
        <span style={summaryChipStyle}>
          <span style={{ color: '#9aa1a8' }}>done </span>
          <span style={{ color: '#f4f6f8' }}>{tot.tasksDone}</span>
        </span>
        <span style={summaryChipStyle}>
          <span style={{ color: '#9aa1a8' }}>streak </span>
          <span style={{ color: 'var(--acid, #c9f158)' }}>{streaks.longestHabitStreak}d</span>
        </span>
      </div>

      {/* Tabs + range chips */}
      <div style={tabsBarStyle}>
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
            style={tabPill(view === v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
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

      <div style={bodyStyle}>
        {view === 'overview' && (
          <>
            <div style={{ padding: '0 12px' }}>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>
                  Totals · last {state.rangeDays} days
                </span>
                <TotalsPanel
                  totals={tot}
                  open={open}
                  rangeLabel={`${range.start} → ${range.end}`}
                />
              </div>
            </div>
            <div style={{ padding: '0 12px' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={sectionLabelStyle}>Activity · {METRIC_LABELS[state.metric]}</span>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 4 }}>
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
                        {METRIC_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <ActivityStrip data={byDay} metric={state.metric} width={580} height={52} />
              </div>
            </div>
            <div style={cardGridStyle}>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>By weekday</span>
                <DowBars data={dow} metric="tasks" width={280} height={120} />
              </div>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>By hour</span>
                <HourLine data={hour} metric="tasks" width={280} height={120} />
              </div>
            </div>
          </>
        )}

        {view === 'calendar' && (
          <div style={{ padding: '0 12px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={sectionLabelStyle}>
                  Calendar · last {state.rangeDays}d · {METRIC_LABELS[state.metric]}
                </span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 4 }}>
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
                      {METRIC_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <CalendarHeatmap data={byDay} metric={state.metric} />
              </div>
            </div>
          </div>
        )}

        {view === 'patterns' && (
          <>
            <div style={{ padding: '0 12px' }}>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>By weekday · tasks</span>
                <DowBars data={dow} metric="tasks" width={580} height={130} />
              </div>
            </div>
            <div style={{ padding: '0 12px' }}>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>By hour · tasks</span>
                <HourLine data={hour} metric="tasks" width={580} height={130} />
              </div>
            </div>
            <div style={{ padding: '0 12px' }}>
              <div style={cardStyle}>
                <span style={sectionLabelStyle}>By month · {year}</span>
                <MonthBars data={months} metric="tasks" width={580} height={130} />
              </div>
            </div>
          </>
        )}

        {view === 'sources' && (
          <div style={{ padding: '0 12px' }}>
            <div style={cardStyle}>
              <span style={sectionLabelStyle}>Registered data sources</span>
              <table
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: '#eef1f4',
                  borderCollapse: 'collapse',
                }}
              >
                <thead>
                  <tr style={{ color: '#9aa1a8', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px' }}>id</th>
                    <th style={{ padding: '4px 6px' }}>label</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>events</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => {
                    const count = analytics.events().filter((e) => e.source === s.id).length;
                    return (
                      <tr key={s.id} style={{ borderTop: '1px solid #23262a' }}>
                        <td style={{ padding: '4px 6px' }}>{s.id}</td>
                        <td style={{ padding: '4px 6px' }}>{s.label}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {streaks.perHabit.length > 0 && (
              <div style={{ ...cardStyle, marginTop: 8 }}>
                <span style={sectionLabelStyle}>Habit streaks</span>
                <table
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#eef1f4',
                    borderCollapse: 'collapse',
                  }}
                >
                  <tbody>
                    {streaks.perHabit.map((h) => (
                      <tr key={h.habitId} style={{ borderTop: '1px solid #23262a' }}>
                        <td style={{ padding: '4px 6px' }}>{h.label}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--acid, #c9f158)' }}>
                          {h.streak}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalyticsNode;
