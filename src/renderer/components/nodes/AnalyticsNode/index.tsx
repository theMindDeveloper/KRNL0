/**
 * AnalyticsNode — free-floating analytics dashboard.
 *
 * 2026-05-18 (rev 2) overhaul:
 *   - Container-queried responsive grid: card-count adapts to the node's own
 *     measured width (≤ 480 → 1 col, ≤ 880 → 2 col, otherwise 3 col). Cards
 *     share a consistent row height so wide layouts don't leak dead space.
 *   - Settings sidebar lists every card in the catalogue with a show/hide
 *     toggle + pin star — hidden cards stay discoverable and re-toggleable
 *     instead of vanishing entirely.
 *   - Far richer Overview: KPI tiles (with deltas + sparklines), DowHour
 *     heatmap, activity strip, and the existing dow/hour minis.
 *   - Insights view bundles multivariate visuals: radar, scatter, donut/pie,
 *     stacked area, cumulative trajectory, focus-distribution histogram.
 *   - Patterns view gains the cumulative trajectory card.
 *
 * Read-only — no connectors, no node edges. Spawned via dock or `A` shortcut.
 */

import { useCallback, useMemo } from 'react';
import type { NodeProps } from '../types';
import {
  ActivityStrip,
  CalendarHeatmap,
  CumulativeLine,
  DonutChart,
  DowBars,
  DowHourMatrix,
  Histogram,
  HourLine,
  KpiTiles,
  MonthBars,
  Radar,
  Scatter,
  StackedArea,
  addDays,
  lastNDays,
  listDataSources,
  todayLocal,
  useAnalytics,
  useElementSize,
} from '../../../analytics';
import type {
  DonutSlice,
  RadarAxis,
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

// Each view lists the cards it owns, in their default order. The settings
// sidebar groups by view so the picker mirrors the user's mental model.
const CARDS_BY_VIEW: Record<AnalyticsView, readonly AnalyticsCardId[]> = {
  overview: [
    'overview.kpis',
    'overview.activity',
    'overview.dowHour',
    'overview.dow',
    'overview.hour',
  ],
  calendar: ['calendar.heatmap'],
  patterns: [
    'patterns.cumulative',
    'patterns.dow',
    'patterns.hour',
    'patterns.month',
  ],
  insights: [
    'insights.radar',
    'insights.scatterTasksFocus',
    'insights.scatterHabitFocus',
    'insights.donutSources',
    'insights.donutSessionsByDay',
    'insights.stacked',
    'insights.histogramFocus',
    'insights.histogramTasks',
  ],
  sources: ['sources.list', 'sources.streaks'],
};

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
  width: 26,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 6,
  background: active ? 'var(--acid)' : 'transparent',
  color: active ? '#0e1012' : '#aab0b7',
  border: '1px solid ' + (active ? 'var(--acid)' : '#2a2e33'),
  cursor: 'pointer',
  padding: 0,
  fontSize: 13,
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

// ── responsive helpers ───────────────────────────────────────────────────────

// Map measured body width to a card column count. The node is locked at
// 540×540 — minus padding the body is ~510px, so 2 cols is the sweet spot.
// Breakpoints tuned to drop to 1-col when the settings sidebar eats half the
// inner width (≈ 280px main column).
function colCountFor(width: number): number {
  if (width < 320) return 1;
  if (width < 720) return 2;
  return 3;
}

// ── ChartCard wrapper ────────────────────────────────────────────────────────

interface ChartCardProps {
  cardId: AnalyticsCardId;
  title: string;
  toolbar?: React.ReactNode;
  /** Effective grid span — caller computes against current col count. */
  span?: number;
  hidden: boolean;
  pinned: boolean;
  settingsOpen: boolean;
  /** Each card declares a target chart height so the row is consistent across
   *  the grid. Card padding + title adds ≈ 50px of chrome. Pass `'auto'` for
   *  cards whose content (HTML tiles, tables) sizes itself — the host then
   *  grows naturally instead of clipping. */
  contentHeight?: number | 'auto';
  /** When the content uses `'auto'` it's helpful to publish a typical width to
   *  child charts that still take a `width` prop. */
  measuredWidthFallback?: number;
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
  contentHeight = 220,
  onToggleHidden,
  onTogglePin,
  children,
}: ChartCardProps) {
  const [hostRef, hostSize] = useElementSize<HTMLDivElement>();

  if (hidden) return null;

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1a1d20 0%, #131517 100%)',
    border: `1px solid ${pinned ? 'rgba(201,241,88,0.45)' : '#23262a'}`,
    boxShadow: pinned
      ? '0 0 0 1px rgba(201,241,88,0.18) inset, 0 6px 20px rgba(0,0,0,0.35)'
      : 'inset 0 1px 0 rgba(255,255,255,0.02), 0 4px 14px rgba(0,0,0,0.25)',
    borderRadius: 8,
    padding: '10px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 140ms, box-shadow 140ms',
    gridColumn: span ? `span ${span}` : undefined,
    minHeight: 0,
    minWidth: 0,
  };

  return (
    <div data-card-id={cardId} data-pinned={pinned || undefined} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: pinned ? 'var(--acid)' : '#9aa1a8',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: pinned ? 700 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flexShrink: 1,
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
              title="Hide card"
              style={cardActionBtn(false, '#ff8e64')}
            >
              −
            </button>
          </div>
        )}
      </div>
      <div
        ref={hostRef}
        style={{
          width: '100%',
          ...(contentHeight === 'auto'
            ? { minHeight: 0 }
            : { height: contentHeight, minHeight: 0 }),
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
        }}
      >
        {children(hostSize)}
      </div>
    </div>
  );
}

function cardActionBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    background: active ? accent : 'transparent',
    color: active ? '#0e1012' : accent,
    border: `1px solid ${accent}`,
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    padding: 0,
  };
}

// Most chart components still take width/height props. Pad the measured host
// down a tad so a 1px border doesn't trigger an infinite resize loop.
function chartWidth(measured: number, fallback: number): number {
  return measured > 0 ? Math.max(140, measured - 2) : fallback;
}
function chartHeight(measured: number, fallback: number): number {
  return measured > 0 ? Math.max(120, measured) : fallback;
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
  const prevRange = useMemo(
    () => ({
      start: addDays(range.start, -state.rangeDays),
      end: addDays(range.start, -1),
    }),
    [range.start, state.rangeDays],
  );
  const year = state.year ?? new Date(todayLocal() + 'T00:00:00').getFullYear();

  const byDay = analytics.byDay(range);
  const tot = analytics.totals(range);
  const prevTot = analytics.totals(prevRange);
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

  // 2026-05-18 (rev 3): node is fixed-size now — no resize handler.

  // Container size — drives the grid column count.
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>();
  const colCount = colCountFor(bodySize.width || (state.width ?? 720));

  // Clamp span helper — never let a card request more columns than exist.
  const clamp = useCallback(
    (requested: number) => Math.min(requested, colCount),
    [colCount],
  );

  // ── derived data for the new Insights view ─────────────────────────────────

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

  const scatterTasksFocus: ScatterPoint[] = useMemo(
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

  const scatterHabitFocus: ScatterPoint[] = useMemo(
    () =>
      byDay.map((d) => ({
        id: d.date,
        x: d.habitCount,
        y: d.focusMin,
        r: d.taskCount,
        label: d.date,
        color: 'var(--acid)',
      })),
    [byDay],
  );

  const radarAxes: RadarAxis[] = useMemo(() => {
    const prevByDay = analytics.byDay(prevRange);
    const days = state.rangeDays;
    const activeNow = byDay.filter((d) => d.taskCount + d.habitCount + d.focusMin > 0).length;
    const activePrev = prevByDay.filter((d) => d.taskCount + d.habitCount + d.focusMin > 0).length;
    const base: RadarAxis[] = [
      { key: 'tasks', label: 'Tasks', value: tot.tasksDone, previous: prevTot.tasksDone },
      { key: 'habits', label: 'Habits', value: tot.habitCheckins, previous: prevTot.habitCheckins },
      { key: 'focus', label: 'Focus min', value: tot.focusMin, previous: prevTot.focusMin },
      { key: 'sessions', label: 'Sessions', value: tot.sessions, previous: prevTot.sessions },
      { key: 'active', label: 'Active days', value: activeNow, previous: activePrev, max: days },
    ];
    if (streaks.longestHabitStreak > 0) {
      base.push({ key: 'streak', label: 'Longest streak', value: streaks.longestHabitStreak });
    }
    return base;
  }, [analytics, prevRange, tot, prevTot, byDay, state.rangeDays, streaks.longestHabitStreak]);

  return (
    <div data-testid="analytics-node-root" style={rootStyle}>
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
          <span style={{ color: '#9aa1a8' }}>focus </span>
          <span style={{ color: '#f4f6f8' }}>{tot.focusMin}m</span>
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

      {/* Tabs + range chips */}
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
      </div>

      {/* Body — split: cards on the left, settings sidebar on the right */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 14px 16px',
          display: 'flex',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <ViewBody
            view={view}
            state={state}
            byDay={byDay}
            dow={dow}
            hour={hour}
            months={months}
            tot={tot}
            prevTot={prevTot}
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
            scatterTasksFocus={scatterTasksFocus}
            scatterHabitFocus={scatterHabitFocus}
            radarAxes={radarAxes}
            colCount={colCount}
            clamp={clamp}
          />
        </div>

        {settingsOpen && (
          <SettingsSidebar
            currentView={view}
            hiddenCards={hiddenCards}
            pinnedCards={pinnedCards}
            onToggleHidden={toggleHidden}
            onTogglePin={togglePin}
            onReset={() => onCommand('analytics.resetCardLayout', {})}
          />
        )}
      </div>
    </div>
  );
}

// ── Settings sidebar ─────────────────────────────────────────────────────────

interface SettingsSidebarProps {
  currentView: AnalyticsView;
  hiddenCards: readonly AnalyticsCardId[];
  pinnedCards: readonly AnalyticsCardId[];
  onToggleHidden: (id: AnalyticsCardId) => void;
  onTogglePin: (id: AnalyticsCardId) => void;
  onReset: () => void;
}

function SettingsSidebar({
  currentView,
  hiddenCards,
  pinnedCards,
  onToggleHidden,
  onTogglePin,
  onReset,
}: SettingsSidebarProps) {
  return (
    <aside
      data-testid="analytics-settings-sidebar"
      style={{
        width: 196,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #16191c 0%, #101214 100%)',
        border: '1px solid #23262a',
        borderRadius: 8,
        padding: '12px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'auto',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--acid)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}
        >
          Curate cards
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="analytics-reset-layout"
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...chipBtn(false),
            borderColor: '#ff8e64',
            color: '#ff8e64',
            fontSize: 8,
          }}
          title="Show every card, clear pins"
        >
          reset
        </button>
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: '#9aa1a8',
          letterSpacing: '0.04em',
          lineHeight: 1.45,
        }}
      >
        <span style={{ color: 'var(--acid)' }}>★</span> pin to top  ·  <span style={{ color: '#ff8e64' }}>✕</span> hide
      </p>

      {ANALYTICS_VIEWS.map((v) => (
        <div key={v} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: v === currentView ? '#eef1f4' : '#7d848b',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: v === currentView ? 700 : 500,
              borderBottom: '1px dashed #23262a',
              paddingBottom: 3,
            }}
          >
            {VIEW_LABELS[v]}
          </span>
          {CARDS_BY_VIEW[v].map((id) => {
            const hidden = hiddenCards.includes(id);
            const pinned = pinnedCards.includes(id);
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  opacity: hidden ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: hidden ? '#7d848b' : '#c8cdd3',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: hidden ? 'line-through' : 'none',
                  }}
                  title={ANALYTICS_CARD_LABELS[id]}
                >
                  {ANALYTICS_CARD_LABELS[id]}
                </span>
                <button
                  type="button"
                  data-testid={`analytics-sidebar-pin-${id}`}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(id); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={pinned ? 'Unpin' : 'Pin to top'}
                  style={cardActionBtn(pinned, 'var(--acid)')}
                >
                  {pinned ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  data-testid={`analytics-sidebar-hide-${id}`}
                  onClick={(e) => { e.stopPropagation(); onToggleHidden(id); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={hidden ? 'Show' : 'Hide'}
                  style={cardActionBtn(hidden, '#ff8e64')}
                >
                  {hidden ? '+' : '✕'}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
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
  prevTot: ReturnType<ReturnType<typeof useAnalytics>['totals']>;
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
  scatterTasksFocus: ScatterPoint[];
  scatterHabitFocus: ScatterPoint[];
  radarAxes: RadarAxis[];
  colCount: number;
  clamp: (requested: number) => number;
}

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
    view, state, byDay, dow, hour, months, tot, prevTot, open, streaks, sources, events,
    year, range, settingsOpen, isHidden, isPinned, toggleHidden, togglePin,
    onCommand, sourceSlices, sessionsByDowSlices, scatterTasksFocus, scatterHabitFocus,
    radarAxes, colCount, clamp,
  } = props;

  // Grid track count is driven by the measured node width so cards never
  // squeeze below 280px and never leave random whitespace on the right.
  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
    gap: 12,
    alignItems: 'stretch',
    gridAutoRows: 'min-content',
  };

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
          cardId: 'overview.kpis' as const,
          render: () => (
            <ChartCard
              cardId="overview.kpis"
              title={`KPIs · last ${state.rangeDays} days`}
              span={clamp(3)}
              contentHeight="auto"
              hidden={isHidden('overview.kpis')}
              pinned={isPinned('overview.kpis')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.kpis')}
              onTogglePin={() => togglePin('overview.kpis')}
            >
              {() => (
                <KpiTiles
                  totals={tot}
                  prevTotals={prevTot}
                  open={open}
                  byDay={byDay}
                  rangeLabel={`${range.start} → ${range.end}`}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.activity' as const,
          render: () => (
            <ChartCard
              cardId="overview.activity"
              title={`Activity · ${METRIC_LABELS[state.metric]}`}
              span={clamp(3)}
              contentHeight={70}
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
                  height={chartHeight(size.height, 70)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.dowHour' as const,
          render: () => (
            <ChartCard
              cardId="overview.dowHour"
              title="Weekday × hour heatmap"
              span={clamp(2)}
              contentHeight={220}
              hidden={isHidden('overview.dowHour')}
              pinned={isPinned('overview.dowHour')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.dowHour')}
              onTogglePin={() => togglePin('overview.dowHour')}
            >
              {(size) => (
                <DowHourMatrix
                  events={events}
                  range={range}
                  metric="count"
                  width={chartWidth(size.width, 520)}
                  height={chartHeight(size.height, 220)}
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
              title="By weekday · tasks"
              contentHeight={220}
              hidden={isHidden('overview.dow')}
              pinned={isPinned('overview.dow')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.dow')}
              onTogglePin={() => togglePin('overview.dow')}
            >
              {(size) => (
                <DowBars
                  data={dow}
                  metric="tasks"
                  width={chartWidth(size.width, 280)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'overview.hour' as const,
          render: () => (
            <ChartCard
              cardId="overview.hour"
              title="By hour · tasks"
              contentHeight={220}
              hidden={isHidden('overview.hour')}
              pinned={isPinned('overview.hour')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('overview.hour')}
              onTogglePin={() => togglePin('overview.hour')}
            >
              {(size) => (
                <HourLine
                  data={hour}
                  metric="tasks"
                  width={chartWidth(size.width, 280)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c) => <CardSlot key={c.cardId}>{c.render()}</CardSlot>)}</div>;
  }

  if (view === 'calendar') {
    return (
      <div style={cardGridStyle}>
        <ChartCard
          cardId="calendar.heatmap"
          title={`Year heatmap · ${METRIC_LABELS[state.metric]}`}
          span={clamp(3)}
          contentHeight={200}
          toolbar={metricPicker(state.metric, setMetric)}
          hidden={isHidden('calendar.heatmap')}
          pinned={isPinned('calendar.heatmap')}
          settingsOpen={settingsOpen}
          onToggleHidden={() => toggleHidden('calendar.heatmap')}
          onTogglePin={() => togglePin('calendar.heatmap')}
        >
          {() => (
            <div style={{ width: '100%', overflowX: 'auto' }}>
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
          cardId: 'patterns.cumulative' as const,
          render: () => (
            <ChartCard
              cardId="patterns.cumulative"
              title={`Cumulative · last ${state.rangeDays}d`}
              span={clamp(3)}
              contentHeight={240}
              hidden={isHidden('patterns.cumulative')}
              pinned={isPinned('patterns.cumulative')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.cumulative')}
              onTogglePin={() => togglePin('patterns.cumulative')}
            >
              {(size) => (
                <CumulativeLine
                  data={byDay}
                  width={chartWidth(size.width, 580)}
                  height={chartHeight(size.height, 240)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'patterns.dow' as const,
          render: () => (
            <ChartCard
              cardId="patterns.dow"
              title="Weekday pattern · tasks"
              span={clamp(colCount >= 3 ? 2 : 1)}
              contentHeight={220}
              hidden={isHidden('patterns.dow')}
              pinned={isPinned('patterns.dow')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.dow')}
              onTogglePin={() => togglePin('patterns.dow')}
            >
              {(size) => (
                <DowBars
                  data={dow}
                  metric="tasks"
                  width={chartWidth(size.width, 580)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'patterns.hour' as const,
          render: () => (
            <ChartCard
              cardId="patterns.hour"
              title="Hour pattern · tasks"
              contentHeight={220}
              hidden={isHidden('patterns.hour')}
              pinned={isPinned('patterns.hour')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.hour')}
              onTogglePin={() => togglePin('patterns.hour')}
            >
              {(size) => (
                <HourLine
                  data={hour}
                  metric="tasks"
                  width={chartWidth(size.width, 320)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'patterns.month' as const,
          render: () => (
            <ChartCard
              cardId="patterns.month"
              title={`Month pattern · ${year}`}
              span={clamp(3)}
              contentHeight={220}
              hidden={isHidden('patterns.month')}
              pinned={isPinned('patterns.month')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('patterns.month')}
              onTogglePin={() => togglePin('patterns.month')}
            >
              {(size) => (
                <MonthBars
                  data={months}
                  metric="tasks"
                  width={chartWidth(size.width, 580)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c) => <CardSlot key={c.cardId}>{c.render()}</CardSlot>)}</div>;
  }

  if (view === 'insights') {
    const cards = orderCards(
      [
        {
          cardId: 'insights.radar' as const,
          render: () => (
            <ChartCard
              cardId="insights.radar"
              title={`Multivariate · this vs prev ${state.rangeDays}d`}
              span={clamp(colCount >= 3 ? 1 : 1)}
              contentHeight={260}
              hidden={isHidden('insights.radar')}
              pinned={isPinned('insights.radar')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.radar')}
              onTogglePin={() => togglePin('insights.radar')}
            >
              {(size) => (
                <Radar
                  axes={radarAxes}
                  width={Math.min(chartWidth(size.width, 280), 320)}
                  height={chartHeight(size.height, 260)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.scatterTasksFocus' as const,
          render: () => (
            <ChartCard
              cardId="insights.scatterTasksFocus"
              title={`Tasks × focus · per day`}
              span={clamp(colCount >= 3 ? 2 : 1)}
              contentHeight={260}
              hidden={isHidden('insights.scatterTasksFocus')}
              pinned={isPinned('insights.scatterTasksFocus')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.scatterTasksFocus')}
              onTogglePin={() => togglePin('insights.scatterTasksFocus')}
            >
              {(size) => (
                <Scatter
                  data={scatterTasksFocus}
                  width={chartWidth(size.width, 480)}
                  height={chartHeight(size.height, 260)}
                  xLabel="focus min"
                  yLabel="tasks done"
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.scatterHabitFocus' as const,
          render: () => (
            <ChartCard
              cardId="insights.scatterHabitFocus"
              title={`Habits × focus · per day`}
              span={clamp(colCount >= 3 ? 2 : 1)}
              contentHeight={260}
              hidden={isHidden('insights.scatterHabitFocus')}
              pinned={isPinned('insights.scatterHabitFocus')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.scatterHabitFocus')}
              onTogglePin={() => togglePin('insights.scatterHabitFocus')}
            >
              {(size) => (
                <Scatter
                  data={scatterHabitFocus}
                  width={chartWidth(size.width, 480)}
                  height={chartHeight(size.height, 260)}
                  xLabel="habit checkins"
                  yLabel="focus min"
                  pointColor="var(--acid)"
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
              contentHeight={260}
              hidden={isHidden('insights.donutSources')}
              pinned={isPinned('insights.donutSources')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.donutSources')}
              onTogglePin={() => togglePin('insights.donutSources')}
            >
              {(size) => {
                const side = Math.min(220, chartWidth(size.width, 220));
                return <DonutChart data={sourceSlices} innerRatio={0} size={side} />;
              }}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.donutSessionsByDay' as const,
          render: () => (
            <ChartCard
              cardId="insights.donutSessionsByDay"
              title="Focus by weekday (donut)"
              contentHeight={260}
              hidden={isHidden('insights.donutSessionsByDay')}
              pinned={isPinned('insights.donutSessionsByDay')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.donutSessionsByDay')}
              onTogglePin={() => togglePin('insights.donutSessionsByDay')}
            >
              {(size) => {
                const total = sessionsByDowSlices.reduce((s, d) => s + d.value, 0);
                const side = Math.min(220, chartWidth(size.width, 220));
                return (
                  <DonutChart
                    data={sessionsByDowSlices}
                    innerRatio={0.55}
                    size={side}
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
          render: () => (
            <ChartCard
              cardId="insights.stacked"
              title="Daily mix (stacked)"
              span={clamp(3)}
              contentHeight={220}
              hidden={isHidden('insights.stacked')}
              pinned={isPinned('insights.stacked')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.stacked')}
              onTogglePin={() => togglePin('insights.stacked')}
            >
              {(size) => (
                <StackedArea
                  data={byDay}
                  width={chartWidth(size.width, 560)}
                  height={chartHeight(size.height, 220)}
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.histogramFocus' as const,
          render: () => (
            <ChartCard
              cardId="insights.histogramFocus"
              title="Focus minutes · distribution"
              contentHeight={240}
              hidden={isHidden('insights.histogramFocus')}
              pinned={isPinned('insights.histogramFocus')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.histogramFocus')}
              onTogglePin={() => togglePin('insights.histogramFocus')}
            >
              {(size) => (
                <Histogram
                  values={byDay.map((d) => d.focusMin)}
                  bins={10}
                  width={chartWidth(size.width, 320)}
                  height={chartHeight(size.height, 240)}
                  color="var(--rust)"
                  xLabel="min/day"
                />
              )}
            </ChartCard>
          ),
        },
        {
          cardId: 'insights.histogramTasks' as const,
          render: () => (
            <ChartCard
              cardId="insights.histogramTasks"
              title="Tasks per day · distribution"
              contentHeight={240}
              hidden={isHidden('insights.histogramTasks')}
              pinned={isPinned('insights.histogramTasks')}
              settingsOpen={settingsOpen}
              onToggleHidden={() => toggleHidden('insights.histogramTasks')}
              onTogglePin={() => togglePin('insights.histogramTasks')}
            >
              {(size) => (
                <Histogram
                  values={byDay.map((d) => d.taskCount)}
                  bins={8}
                  width={chartWidth(size.width, 320)}
                  height={chartHeight(size.height, 240)}
                  color="var(--cyan)"
                  xLabel="tasks/day"
                />
              )}
            </ChartCard>
          ),
        },
      ],
      state.pinnedCards ?? [],
    );
    return <div style={cardGridStyle}>{cards.map((c) => <CardSlot key={c.cardId}>{c.render()}</CardSlot>)}</div>;
  }

  // sources
  return (
    <div style={cardGridStyle}>
      <ChartCard
        cardId="sources.list"
        title="Registered sources"
        span={clamp(2)}
        contentHeight={240}
        hidden={isHidden('sources.list')}
        pinned={isPinned('sources.list')}
        settingsOpen={settingsOpen}
        onToggleHidden={() => toggleHidden('sources.list')}
        onTogglePin={() => togglePin('sources.list')}
      >
        {() => (
          <div style={{ width: '100%', overflow: 'auto' }}>
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
          </div>
        )}
      </ChartCard>
      {streaks.perHabit.length > 0 && (
        <ChartCard
          cardId="sources.streaks"
          title="Habit streaks"
          contentHeight={240}
          hidden={isHidden('sources.streaks')}
          pinned={isPinned('sources.streaks')}
          settingsOpen={settingsOpen}
          onToggleHidden={() => toggleHidden('sources.streaks')}
          onTogglePin={() => togglePin('sources.streaks')}
        >
          {() => (
            <div style={{ width: '100%', overflow: 'auto' }}>
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
        </ChartCard>
      )}
    </div>
  );
}

function CardSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default AnalyticsNode;
