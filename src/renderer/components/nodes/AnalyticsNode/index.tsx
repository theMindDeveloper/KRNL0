/**
 * AnalyticsNode — free-floating analytics dashboard.
 *
 * 2026-05-18 overhaul:
 *   - Responsive chart sizing via ResizeObserver — every chart adapts to its
 *     card's measured width as the node is resized.
 *   - Settings gear in the titlebar reveals per-card hide/pin toggles. State
 *     lives on `state.hiddenCards` + `state.pinnedCards` (stable IDs).
 *   - New "Insights" view with multivariate visuals: donut for sessions split
 *     by source, donut for daily-block split, scatter (tasks × focus, size by
 *     habits) showing Pearson r, and a stacked-area daily mix.
 *   - Card-grid layout uses CSS grid auto-fit so the dashboard reflows from a
 *     narrow 1-column reading view to a wide 3-column dashboard.
 *
 * Read-only — no connectors, no node edges. Spawned via dock or `A` shortcut.
 */

import { useCallback, useMemo } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import {
  ActivityStrip,
  CalendarHeatmap,
  DonutChart,
  DowBars,
  HourLine,
  MonthBars,
  Scatter,
  StackedArea,
  TotalsPanel,
  lastNDays,
  listDataSources,
  todayLocal,
  useAnalytics,
  useElementSize,
} from '../../../analytics';
import type {
  DonutSlice,
  ScatterPoint,
} from '../../../analytics';
import type {
  AnalyticsCardId,
  AnalyticsConfig,
  AnalyticsMetric,
  AnalyticsState,
  AnalyticsView,
} from './types';
import {
  ANALYTICS_CARD_LABELS,
  ANALYTICS_VIEWS,
  defaultAnalyticsState,
} from './types';

const VIEW_LABELS: Record<AnalyticsView, string> = {
  overview: 'Overview',
  calendar: 'Calendar',
  patterns: 'Patterns',
  insights: 'Insights',
  sources: 'Sources',
};

const RANGE_PRESETS = [7, 30, 90, 365] as const;

const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  taskCount: 'tasks',
  habitCount: 'habits',
  focusMin: 'focus',
  sessions: 'sessions',
};

// Donut palette anchored to the brand tokens. Index-stable so source colours
// don't reshuffle when a new source registers — every existing source stays on
// its hue.
const SOURCE_PALETTE: Record<string, string> = {
  task: 'var(--cyan)',
  habit: 'var(--acid)',
  pomo: 'var(--rust)',
};

const FALLBACK_PALETTE = ['#8a7bff', '#5dd3c5', '#d18bff', '#f4d35e', '#ff8e64'];

// ── chrome ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(180deg, #16181a 0%, #0e1012 100%)',
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
  padding: '10px 14px',
  background: 'linear-gradient(180deg, #1f2226 0%, #16181a 100%)',
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
  padding: '2px 8px',
  border: '1px solid #2a2e33',
  borderRadius: 999,
  background: 'rgba(20,22,24,0.6)',
  color: '#eef1f4',
};

const gearBtnStyle = (active: boolean): React.CSSProperties => ({
  width: 24,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 6,
  background: active ? 'var(--acid)' : 'transparent',
  color: active ? '#0e1012' : '#aab0b7',
  border: '1px solid ' + (active ? 'var(--acid)' : '#2a2e33'),
  cursor: 'pointer',
  padding: 0,
  transition: 'background 120ms, color 120ms, border-color 120ms',
});

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 14px 0',
  flexShrink: 0,
  flexWrap: 'wrap',
};

const tabPill = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '5px 11px',
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
  padding: '3px 8px',
  border: '1px solid ' + (active ? '#3a4048' : '#23262a'),
  borderRadius: 4,
  background: active ? 'var(--acid, #c9f158)' : 'transparent',
  color: active ? '#0e1012' : '#c8cdd3',
  cursor: 'pointer',
  fontWeight: active ? 700 : 500,
});

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px 14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

// Grid container — auto-fit so cards reflow from 1 to N columns as the user
// resizes the node. minmax(280, 1fr) guarantees a comfortable minimum card
// width before wrapping to a new row.
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
  alignItems: 'start',
};

// ── ChartCard wrapper ────────────────────────────────────────────────────────

interface ChartCardProps {
  cardId: AnalyticsCardId;
  title: string;
  /** Optional subtitle / metric pill row, rendered next to the title. */
  toolbar?: React.ReactNode;
  /** Optional wider span — passes through grid `gridColumn: span N`. */
  span?: number;
  hidden: boolean;
  pinned: boolean;
  settingsOpen: boolean;
  onToggleHidden: () => void;
  onTogglePin: () => void;
  children: (size: { width: number; height: number }) => React.ReactNode;
}

function ChartCard({
  cardId,
  title,
  toolbar,
  span,
  hidden,
  pinned,
  settingsOpen,
  onToggleHidden,
  onTogglePin,
  children,
}: ChartCardProps) {
  // Measure the chart-host area so SVG children can size to the card.
  const [hostRef, hostSize] = useElementSize<HTMLDivElement>();

  // In settings mode we still render hidden cards but dimmed and labelled,
  // so the user can re-enable them without leaving the gear panel. Normal
  // mode skips them entirely.
  if (hidden && !settingsOpen) return null;

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1a1d20 0%, #131517 100%)',
    border: `1px solid ${pinned ? 'rgba(201,241,88,0.45)' : '#23262a'}`,
    boxShadow: pinned ? '0 0 0 1px rgba(201,241,88,0.18) inset' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    opacity: hidden ? 0.45 : 1,
    transition: 'opacity 140ms, border-color 140ms, box-shadow 140ms',
    gridColumn: span ? `span ${span}` : undefined,
    minHeight: 0,
  };

  return (
    <div data-card-id={cardId} data-pinned={pinned || undefined} data-hidden={hidden || undefined} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: pinned ? 'var(--acid)' : '#9aa1a8',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: pinned ? 700 : 500,
          }}
        >
          {pinned ? '★ ' : ''}{title}
        </span>
        <div style={{ flex: 1 }} />
        {toolbar}
        {settingsOpen && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              data-testid={`analytics-card-pin-${cardId}`}
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              onMouseDown={(e) => e.stopPropagation()}
              title={pinned ? 'Unpin card' : 'Pin to top'}
              style={cardActionBtn(pinned, 'var(--acid)')}
            >
              {pinned ? '★' : '☆'}
            </button>
            <button
              type="button"
              data-testid={`analytics-card-hide-${cardId}`}
              onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
              onMouseDown={(e) => e.stopPropagation()}
              title={hidden ? 'Show card' : 'Hide card'}
              style={cardActionBtn(false, '#ff8e64')}
            >
              {hidden ? '+' : '−'}
            </button>
          </div>
        )}
      </div>
      <div ref={hostRef} style={{ width: '100%', minHeight: 0 }}>
        {children(hostSize)}
      </div>
    </div>
  );
}

function cardActionBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    width: 20,
    height: 20,
    display: 'grid',
    placeItems: 'center',
    background: active ? accent : 'transparent',
    color: active ? '#0e1012' : accent,
    border: `1px solid ${accent}`,
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    padding: 0,
  };
}

// ── responsive chart helpers ─────────────────────────────────────────────────

// Most chart components still take width/height props. Pad the measured host
// down a tad so a 1px border doesn't trigger an infinite resize loop.
function chartWidth(measured: number, fallback: number): number {
  return measured > 0 ? Math.max(140, measured - 2) : fallback;
}

// ── main ─────────────────────────────────────────────────────────────────────

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
  const events = analytics.events();

  const hiddenCards = state.hiddenCards ?? [];
  const pinnedCards = state.pinnedCards ?? [];
  const settingsOpen = state.settingsOpen ?? false;

  const isHidden = useCallback(
    (id: AnalyticsCardId) => hiddenCards.includes(id),
    [hiddenCards],
  );
  const isPinned = useCallback(
    (id: AnalyticsCardId) => pinnedCards.includes(id),
    [pinnedCards],
  );
  const toggleHidden = useCallback(
    (id: AnalyticsCardId) => onCommand('analytics.toggleCardHidden', { cardId: id }),
    [onCommand],
  );
  const togglePin = useCallback(
    (id: AnalyticsCardId) => onCommand('analytics.togglePinCard', { cardId: id }),
    [onCommand],
  );

  const onResizeEnd = (_e: unknown, p: { width: number; height: number }): void => {
    onCommand('analytics.setSize', { width: p.width, height: p.height });
  };

  // ── derived data for the new Insights view ─────────────────────────────────

  // Source-split donut: count of events per registered source within range.
  const sourceSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.date < range.start || e.date > range.end) continue;
      counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count], i) => {
        const src = sources.find((s) => s.id === id);
        const color = SOURCE_PALETTE[id] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]!;
        return { id, label: src?.label ?? id, value: count, color };
      });
  }, [events, range, sources]);

  // Day-of-week donut: pomo session count grouped by weekday. Shows which
  // days you actually do focused work, regardless of total magnitude.
  const sessionsByDowSlices: DonutSlice[] = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return dow
      .map((d, i) => ({
        id: `dow-${i}`,
        label: labels[i] ?? `Day ${i}`,
        value: Math.round(d.focusMin),
        color: FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]!,
      }))
      .filter((s) => s.value > 0);
  }, [dow]);

  // Scatter: each day in range is a point. x=focusMin, y=taskCount, r=habits.
  const scatterPoints: ScatterPoint[] = useMemo(
    () =>
      byDay.map((d) => ({
        id: d.date,
        x: d.focusMin,
        y: d.taskCount,
        r: d.habitCount,
        label: d.date,
        color: 'var(--cyan)',
      })),
    [byDay],
  );

  return (
    <div data-testid="analytics-node-root" style={rootStyle}>
      <NodeResizeControl
        position="bottom-right"
        minWidth={420}
        minHeight={320}
        maxWidth={1600}
        maxHeight={1600}
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
        <button
          type="button"
          data-testid="analytics-gear"
          aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
          onClick={(e) => { e.stopPropagation(); onCommand('analytics.setSettingsOpen', { open: !settingsOpen }); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={gearBtnStyle(settingsOpen)}
          title={settingsOpen ? 'Done curating' : 'Pin or hide cards'}
        >
          {settingsOpen ? '✓' : '⚙'}
        </button>
      </div>

      {/* Tabs + range chips + (when gear open) reset button */}
      <div style={toolbarStyle}>
        {ANALYTICS_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`analytics-tab-${v}`}
            onClick={(e) => { e.stopPropagation(); onCommand('analytics.setView', { view: v }); }}
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
              onClick={(e) => { e.stopPropagation(); onCommand('analytics.setRangeDays', { days }); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={chipBtn(state.rangeDays === days)}
            >
              {days}d
            </button>
          ))}
        </div>
        {settingsOpen && (
          <button
            type="button"
            data-testid="analytics-reset-layout"
            onClick={(e) => { e.stopPropagation(); onCommand('analytics.resetCardLayout', {}); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              ...chipBtn(false),
              borderColor: '#ff8e64',
              color: '#ff8e64',
            }}
            title="Show every card, clear pins"
          >
            reset layout
          </button>
        )}
      </div>

      <div style={bodyStyle}>
        {/* SETTINGS PROMPT — a thin banner explains what gear mode does. */}
        {settingsOpen && (
          <div
            data-testid="analytics-settings-banner"
            style={{
              padding: '6px 10px',
              background: 'rgba(201,241,88,0.06)',
              border: '1px solid rgba(201,241,88,0.3)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: '#c8cdd3',
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: 'var(--acid)' }}>★</span> pin to top  ·  <span style={{ color: '#ff8e64' }}>−</span> hide from view — click <span style={{ color: 'var(--acid)' }}>✓</span> when done
          </div>
        )}

        <ViewBody
          view={view}
          state={state}
          byDay={byDay}
          dow={dow}
          hour={hour}
          months={months}
          tot={tot}
          open={open}
          streaks={streaks}
          sources={sources}
          events={events}
          year={year}
          range={range}
          settingsOpen={settingsOpen}
          isHidden={isHidden}
          isPinned={isPinned}
          toggleHidden={toggleHidden}
          togglePin={togglePin}
          onCommand={onCommand}
          sourceSlices={sourceSlices}
          sessionsByDowSlices={sessionsByDowSlices}
          scatterPoints={scatterPoints}
        />
      </div>
    </div>
  );
}

// ── view body ────────────────────────────────────────────────────────────────

interface ViewBodyProps {
  view: AnalyticsView;
  state: AnalyticsState;
  byDay: ReturnType<ReturnType<typeof useAnalytics>['byDay']>;
  dow: ReturnType<ReturnType<typeof useAnalytics>['byDayOfWeek']>;
  hour: ReturnType<ReturnType<typeof useAnalytics>['byHourOfDay']>;
  months: ReturnType<ReturnType<typeof useAnalytics>['byMonth']>;
  tot: ReturnType<ReturnType<typeof useAnalytics>['totals']>;
  open: ReturnType<ReturnType<typeof useAnalytics>['open']>;
  streaks: ReturnType<ReturnType<typeof useAnalytics>['streaks']>;
  sources: ReturnType<typeof listDataSources>;
  events: ReturnType<ReturnType<typeof useAnalytics>['events']>;
  year: number;
  range: { start: string; end: string };
  settingsOpen: boolean;
  isHidden: (id: AnalyticsCardId) => boolean;
  isPinned: (id: AnalyticsCardId) => boolean;
  toggleHidden: (id: AnalyticsCardId) => void;
  togglePin: (id: AnalyticsCardId) => void;
  onCommand: (cmd: string, args?: Record<string, unknown>) => void;
  sourceSlices: DonutSlice[];
  sessionsByDowSlices: DonutSlice[];
  scatterPoints: ScatterPoint[];
}

// Sort pinned cards to the front while preserving the user's pin order, so
// the dashboard layout matches the order in which they pinned things.
function orderCards<T extends { cardId: AnalyticsCardId }>(
  cards: T[],
  pinnedOrder: readonly AnalyticsCardId[],
): T[] {
  const pinnedSet = new Set(pinnedOrder);
  const pinned = cards
    .filter((c) => pinnedSet.has(c.cardId))
    .sort((a, b) => pinnedOrder.indexOf(a.cardId) - pinnedOrder.indexOf(b.cardId));
  const rest = cards.filter((c) => !pinnedSet.has(c.cardId));
  return [...pinned, ...rest];
}

function ViewBody(props: ViewBodyProps) {
  const {
    view, state, byDay, dow, hour, months, tot, open, streaks, sources, events,
    year, range, settingsOpen, isHidden, isPinned, toggleHidden, togglePin,
    onCommand, sourceSlices, sessionsByDowSlices, scatterPoints,
  } = props;

  const metricPicker = (currentMetric: AnalyticsMetric, onChange: (m: AnalyticsMetric) => void) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['taskCount', 'habitCount', 'focusMin', 'sessions'] as const).map((m) => (
        <button
          key={m}
          type="button"
          data-testid={`analytics-metric-${m}`}
          onClick={(e) => { e.stopPropagation(); onChange(m); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={chipBtn(currentMetric === m)}
        >
          {METRIC_LABELS[m]}
        </button>
      ))}
    </div>
  );

  const setMetric = (m: AnalyticsMetric) => onCommand('analytics.setMetric', { metric: m });

  if (view === 'overview') {
    const cards = orderCards(
      [
        {
          cardId: 'overview.totals' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="overview.totals"
              title={`Totals · last ${state.rangeDays} days`}
              span={2}
              hidden={isHidden('overview.totals')}
              pinned={isPinned('overview.totals')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.totals')}
              onTogglePin={() => togglePin('overview.totals')}
            >
              {() => <TotalsPanel totals={tot} open={open} rangeLabel={`${range.start} → ${range.end}`} />}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.activity' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="overview.activity"
              title={`Activity · ${METRIC_LABELS[state.metric]}`}
              span={2}
              toolbar={metricPicker(state.metric, setMetric)}
              hidden={isHidden('overview.activity')}
              pinned={isPinned('overview.activity')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.activity')}
              onTogglePin={() => togglePin('overview.activity')}
            >
              {(size) => (
                <ActivityStrip
                  data={byDay}
                  metric={state.metric}
                  width={chartWidth(size.width, 580)}
                  height={56}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.dow' as const,
          render: () => (
            <ChartCard
              cardId="overview.dow"
              title="By weekday"
              hidden={isHidden('overview.dow')}
              pinned={isPinned('overview.dow')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.dow')}
              onTogglePin={() => togglePin('overview.dow')}
            >
              {(size) => <DowBars data={dow} metric="tasks" width={chartWidth(size.width, 280)} height={140} />}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.hour' as const,
          render: () => (
            <ChartCard
              cardId="overview.hour"
              title="By hour"
              hidden={isHidden('overview.hour')}
              pinned={isPinned('overview.hour')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.hour')}
              onTogglePin={() => togglePin('overview.hour')}
            >
              {(size) => <HourLine data={hour} metric="tasks" width={chartWidth(size.width, 280)} height={140} />}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c, i) => <CardSlot key={c.cardId + i}>{c.render()}</CardSlot>)}</div>;
  }

  if (view === 'calendar') {
    return (
      <div style={cardGridStyle}>
        <ChartCard
          cardId="calendar.heatmap"
          title={`Year heatmap · ${METRIC_LABELS[state.metric]}`}
          span={2}
          toolbar={metricPicker(state.metric, setMetric)}
          hidden={isHidden('calendar.heatmap')}
          pinned={isPinned('calendar.heatmap')}
          settingsOpen={settingsOpen}
          onToggleHidden={() => toggleHidden('calendar.heatmap')}
          onTogglePin={() => togglePin('calendar.heatmap')}
        >
          {() => (
            <div style={{ overflowX: 'auto' }}>
              <CalendarHeatmap data={byDay} metric={state.metric} />
            </div>
          )}
        </ChartCard>
      </div>
    );
  }

  if (view === 'patterns') {
    const cards = orderCards(
      [
        {
          cardId: 'patterns.dow' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="patterns.dow"
              title="Weekday pattern · tasks"
              span={2}
              hidden={isHidden('patterns.dow')}
              pinned={isPinned('patterns.dow')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.dow')}
              onTogglePin={() => togglePin('patterns.dow')}
            >
              {(size) => <DowBars data={dow} metric="tasks" width={chartWidth(size.width, 580)} height={150} />}
            </ChartCard>
          ),
        },
        {
          cardId: 'patterns.hour' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="patterns.hour"
              title="Hour pattern · tasks"
              span={2}
              hidden={isHidden('patterns.hour')}
              pinned={isPinned('patterns.hour')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.hour')}
              onTogglePin={() => togglePin('patterns.hour')}
            >
              {(size) => <HourLine data={hour} metric="tasks" width={chartWidth(size.width, 580)} height={150} />}
            </ChartCard>
          ),
        },
        {
          cardId: 'patterns.month' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="patterns.month"
              title={`Month pattern · ${year}`}
              span={2}
              hidden={isHidden('patterns.month')}
              pinned={isPinned('patterns.month')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.month')}
              onTogglePin={() => togglePin('patterns.month')}
            >
              {(size) => <MonthBars data={months} metric="tasks" width={chartWidth(size.width, 580)} height={150} />}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c, i) => <CardSlot key={c.cardId + i}>{c.render()}</CardSlot>)}</div>;
  }

  if (view === 'insights') {
    const cards = orderCards(
      [
        {
          cardId: 'insights.scatterTasksFocus' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="insights.scatterTasksFocus"
              title={`Tasks × focus · last ${state.rangeDays}d`}
              span={2}
              hidden={isHidden('insights.scatterTasksFocus')}
              pinned={isPinned('insights.scatterTasksFocus')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.scatterTasksFocus')}
              onTogglePin={() => togglePin('insights.scatterTasksFocus')}
            >
              {(size) => (
                <Scatter
                  data={scatterPoints}
                  width={chartWidth(size.width, 560)}
                  height={240}
                  xLabel="focus min · per day"
                  yLabel="tasks done"
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.donutSources' as const,
          render: () => (
            <ChartCard
              cardId="insights.donutSources"
              title="Sources split (pie)"
              hidden={isHidden('insights.donutSources')}
              pinned={isPinned('insights.donutSources')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.donutSources')}
              onTogglePin={() => togglePin('insights.donutSources')}
            >
              {(size) => (
                <DonutChart
                  data={sourceSlices}
                  innerRatio={0}
                  size={Math.min(220, chartWidth(size.width, 220))}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.donutSessionsByDay' as const,
          render: () => (
            <ChartCard
              cardId="insights.donutSessionsByDay"
              title="Focus by weekday (donut)"
              hidden={isHidden('insights.donutSessionsByDay')}
              pinned={isPinned('insights.donutSessionsByDay')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.donutSessionsByDay')}
              onTogglePin={() => togglePin('insights.donutSessionsByDay')}
            >
              {(size) => {
                const total = sessionsByDowSlices.reduce((s, d) => s + d.value, 0);
                return (
                  <DonutChart
                    data={sessionsByDowSlices}
                    innerRatio={0.55}
                    size={Math.min(220, chartWidth(size.width, 220))}
                    centerPrimary={String(total)}
                    centerSecondary="focus min"
                  />
                );
              }}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.stacked' as const,
          span: 2,
          render: () => (
            <ChartCard
              cardId="insights.stacked"
              title="Daily mix (stacked)"
              span={2}
              hidden={isHidden('insights.stacked')}
              pinned={isPinned('insights.stacked')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.stacked')}
              onTogglePin={() => togglePin('insights.stacked')}
            >
              {(size) => <StackedArea data={byDay} width={chartWidth(size.width, 560)} height={160} />}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c, i) => <CardSlot key={c.cardId + i}>{c.render()}</CardSlot>)}</div>;
  }

  // sources
  return (
    <div style={cardGridStyle}>
      <ChartCard
        cardId="sources.list"
        title="Registered sources"
        hidden={isHidden('sources.list')}
        pinned={isPinned('sources.list')}
        settingsOpen={settingsOpen}
        onToggleHidden={() => toggleHidden('sources.list')}
        onTogglePin={() => togglePin('sources.list')}
      >
        {() => (
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
                const count = events.filter((e) => e.source === s.id).length;
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
        )}
      </ChartCard>
      {streaks.perHabit.length > 0 && (
        <ChartCard
          cardId="sources.streaks"
          title="Habit streaks"
          hidden={isHidden('sources.streaks')}
          pinned={isPinned('sources.streaks')}
          settingsOpen={settingsOpen}
          onToggleHidden={() => toggleHidden('sources.streaks')}
          onTogglePin={() => togglePin('sources.streaks')}
        >
          {() => (
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
          )}
        </ChartCard>
      )}
    </div>
  );
}

// Identity pass-through — exists so map() can supply a stable key boundary
// for cards rendered in an `orderCards` loop (cards themselves already have
// a stable data-card-id, but the outer fragment needs the React key).
function CardSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default AnalyticsNode;
