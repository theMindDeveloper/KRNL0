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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '../types';
import { useBoardStore } from '../../../store/boardStore';
import { HoldButton } from '../../ui/HoldButton';
import { PagedView } from '../../ui/PagedView';
import { summarizeAnalytics } from '../../../analytics/summary';
import { SummaryHero } from './SummaryHero';
import { EASY_HIDDEN_PAGES, cardPlacement, isPagedCard, pageOfCard, pageSelector, pagesFor, type PageId } from './guide';
import { useEasyMode } from '../../../store/uiMode';
import { PageNav } from './PageNav';
import { AnalyticsSettings } from './AnalyticsSettings';
import { computeEstimates, describeAccuracy } from '../../../analytics/estimates';
import { computeTagBreakdown } from '../../../analytics/tags';
import { TagDailyBars, TagList } from '../../../analytics/charts/TagCharts';
import { EstimateBars, DailyPlanActual, FocusMix, Legend, COLOR_PLANNED, COLOR_TRACKED, fmtMinutes } from '../../../analytics/charts/PlanVsActual';
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
import { useLocalDay } from '../../../hooks/useLocalDay';

// The page each (older) view name opens: `krnl analytics show --view …` and
// the saved view land on their page instead of always on Summary.
const VIEW_PAGE: Record<AnalyticsView, PageId> = {
  overview: 'summary',
  calendar: 'year',
  patterns: 'hours',
  insights: 'insights',
  estimates: 'estimates',
  time: 'tags',
  sources: 'habits',
};

const VIEW_LABELS: Record<AnalyticsView, string> = {
  overview: 'Overview',
  calendar: 'Calendar',
  patterns: 'Patterns',
  insights: 'Insights',
  estimates: 'Plan vs actual',
  time: 'Time',
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

const FALLBACK_PALETTE = ['#8a7bff', '#5dd3c5', '#d18bff', '#f4d35e', 'var(--k-an-warm, #ff8e64)'];
// Seven days, seven hues — the 5-colour palette repeated Mon/Sat and Tue/Sun.
const WEEKDAY_PALETTE = [...FALLBACK_PALETTE, 'var(--cyan)', 'var(--acid)'];

/** A source without a fixed hue keeps one by its id, not by its rank today. */
function fallbackColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]!;
}

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
  estimates: ['estimates.kpis', 'estimates.perTask', 'estimates.daily', 'estimates.mix'],
  time: ['time.donut', 'time.list', 'time.daily'],
  sources: ['sources.list', 'sources.streaks'],
};

// ── chrome ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(180deg, var(--k-an-bg-2, #16181a) 0%, var(--k-an-bg, #0e1012) 100%)',
  border: '1px solid var(--k-an-line-2, #2a2e33)',
  borderRadius: 10,
  boxShadow:
    '0 8px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  overflow: 'hidden',
  color: 'var(--k-an-ink-1, #eef1f4)',
};

const titlebarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  background: 'linear-gradient(180deg, var(--k-an-bg-3, #1f2226) 0%, var(--k-an-bg-2, #16181a) 100%)',
  borderBottom: '1px solid #0a0c0e',
  boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.03)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--k-an-ink-2, #c8cdd3)',
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
  border: '1px solid var(--k-an-line-2, #2a2e33)',
  borderRadius: 999,
  background: 'var(--k-an-bg-3, rgba(20,22,24,0.6))',
  color: 'var(--k-an-ink-1, #eef1f4)',
};

const gearBtnStyle = (active: boolean): React.CSSProperties => ({
  width: 26,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 6,
  background: active ? 'var(--acid)' : 'transparent',
  color: active ? 'var(--k-an-on-accent, #0e1012)' : 'var(--k-an-ink-2b, #aab0b7)',
  border: '1px solid ' + (active ? 'var(--acid)' : 'var(--k-an-line-2, #2a2e33)'),
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
  border: '1px solid ' + (active ? 'var(--k-an-line-3, #3a4048)' : 'var(--k-an-line, #23262a)'),
  borderRadius: 999,
  background: active
    ? 'linear-gradient(180deg, var(--k-an-line-2, #2a2e33) 0%, var(--k-an-tab-end, #1c1f23) 100%)'
    : 'transparent',
  color: active ? 'var(--k-an-accent-ink, var(--acid, #c9f158))' : 'var(--k-an-ink-2b, #aab0b7)',
  cursor: 'pointer',
  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
  transition: 'all 120ms',
});

const chipBtn = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  letterSpacing: '0.04em',
  padding: '3px 8px',
  border: '1px solid ' + (active ? 'var(--k-an-line-3, #3a4048)' : 'var(--k-an-line, #23262a)'),
  borderRadius: 4,
  background: active ? 'var(--acid, #c9f158)' : 'transparent',
  color: active ? 'var(--k-an-on-accent, #0e1012)' : 'var(--k-an-ink-2, #c8cdd3)',
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
  const easy = useEasyMode();

  // A hidden card keeps its grid cell as an empty placeholder: the pager cuts
  // pages at card tops, so a missing top card shifted every later page by
  // half, and the page jump lost its target.
  if (hidden) return <div data-card-id={cardId} data-hidden-card aria-hidden style={{ ...cardPlacement(cardId, easy), minHeight: 0 }} />;

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, var(--k-an-bg-2b, #1a1d20) 0%, var(--k-an-bg, #131517) 100%)',
    border: `1px solid ${pinned ? 'rgba(201,241,88,0.45)' : 'var(--k-an-line, #23262a)'}`,
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
    // Its cell in the page grid (6 columns × 2 rows per page, see guide.ts).
    ...cardPlacement(cardId, easy),
    boxSizing: 'border-box',
    overflow: 'hidden',
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
            color: pinned ? 'var(--acid)' : 'var(--k-an-ink-3, #9aa1a8)',
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
              style={cardActionBtn(false, 'var(--k-an-warm, #ff8e64)')}
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
          // The chart takes all the room the page leaves under the title.
          flex: '1 1 0',
          minHeight: contentHeight === 'auto' ? 0 : Math.min(120, contentHeight),
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
    color: active ? 'var(--k-an-on-accent, #0e1012)' : accent,
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

  // Re-derive the ranges at local midnight; otherwise a window left open
  // overnight keeps charting a range that ends yesterday.
  const today = useLocalDay();
  const range = useMemo(() => lastNDays(state.rangeDays), [state.rangeDays, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevRange = useMemo(
    () => ({
      start: addDays(range.start, -state.rangeDays),
      end: addDays(range.start, -1),
    }),
    [range.start, state.rangeDays],
  );
  const year = state.year ?? new Date(todayLocal() + 'T00:00:00').getFullYear();

  const byDay = analytics.byDay(range);
  // The year heatmap always shows the last 365 days, whatever the range.
  const yearRange = useMemo(() => lastNDays(365), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const yearByDay = analytics.byDay(yearRange);

  // One sequence of full-page cards (no tabs). The header names the card on
  // screen; "All charts" jumps straight to any card.
  const [currentCard, setCurrentCard] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);

  const onPageChange = useCallback((item: HTMLElement | null) => {
    setCurrentCard(item?.getAttribute('data-card-id') ?? (item ? 'summary' : null));
    setJumpTo(null);
  }, []);

  // Open the saved / CLI-set view's page. Deferred a frame so the pager has
  // measured its cards (and its first page report has passed).
  useEffect(() => {
    const page = view ? VIEW_PAGE[view] : undefined;
    if (!page || page === 'summary') return;
    const id = requestAnimationFrame(() => setJumpTo(pageSelector(page)));
    return () => cancelAnimationFrame(id);
  }, [view]);

  // Plain-language summary on top of Overview (same text as `analytics summary`).
  const summary = summarizeAnalytics(analytics, range, prevRange, state.rangeDays);
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

  // Easy mode drops the link-based pages (plan vs actual, time by tag).
  const easy = useEasyMode();
  const pages = pagesFor(easy);
  const isHidden = useCallback(
    (id: AnalyticsCardId) => {
      if (hiddenCards.includes(id) || !isPagedCard(id)) return true;
      const page = pageOfCard(id);
      return easy && page !== null && EASY_HIDDEN_PAGES.has(page);
    },
    [hiddenCards, easy],
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
  const [bodyRef] = useElementSize<HTMLDivElement>();
  const currentPage: PageId = currentCard && currentCard !== 'summary' ? (pageOfCard(currentCard) ?? 'summary') : 'summary';
  // One card per page (PagedView fillItems) — a single column.
  void colCountFor;
  const colCount = 1;

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
      .map(([id, count]) => {
        const src = sources.find((s) => s.id === id);
        const color = SOURCE_PALETTE[id] ?? fallbackColor(id);
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
        color: WEEKDAY_PALETTE[i]!,
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
        <span style={{ color: 'var(--k-an-ink, #f4f6f8)', fontWeight: 600 }}>Analytics</span>
        <span style={{ color: 'var(--k-an-ink-4, #7d848b)' }}>·</span>
        <span style={{ color: 'var(--k-an-ink-2b, #aab0b7)' }}>{sources.length} sources</span>
        <div style={{ flex: 1 }} />
        <span style={summaryChipStyle}>
          <span style={{ color: 'var(--k-an-ink-3, #9aa1a8)' }}>done </span>
          <span style={{ color: 'var(--k-an-ink, #f4f6f8)' }}>{tot.tasksDone}</span>
        </span>
        <span style={summaryChipStyle}>
          <span style={{ color: 'var(--k-an-ink-3, #9aa1a8)' }}>focus </span>
          <span style={{ color: 'var(--k-an-ink, #f4f6f8)' }}>{tot.focusMin}m</span>
        </span>
        <span style={summaryChipStyle}>
          <span style={{ color: 'var(--k-an-ink-3, #9aa1a8)' }}>streak </span>
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

      {/* Page icons + range chips — one compact row; the rest is charts. */}
      <div style={toolbarStyle}>
        <PageNav current={currentPage} pages={pages} onPick={(id) => setJumpTo(pageSelector(id))} />
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

      {/* Body — split: cards on the left, settings sidebar on the right.
          No scrolling: cards are split into pages (PagedView). */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '12px 14px 16px',
          display: 'flex',
          gap: 12,
          minHeight: 0,
          position: 'relative',
        }}
      >
        <PagedView
          testId="analytics-pages"
          itemSelector="[data-page-item], [data-card-id]"
          fillItems
          revealSelector={jumpTo}
          onPageChange={onPageChange}
          showPager={false}
          style={{ flex: 1, minWidth: 0 }}
          contentStyle={{
            // Each page = 2 rows of the grid, each row half a page (minus the gap).
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gridTemplateRows: `repeat(${pages.length * 2}, calc((var(--page-h, 400px) - 10px) / 2))`,
            gap: 10,
          }}
        >
          <SummaryHero summary={summary} byDay={byDay} />
          {ANALYTICS_VIEWS.map((v) => (
          <ViewBody
            key={v}
            view={v}
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
            yearByDay={yearByDay}
          />
          ))}
        </PagedView>

        {settingsOpen && (
          <AnalyticsSettings
            hiddenCards={hiddenCards}
            onToggleHidden={toggleHidden}
            onReset={() => onCommand('analytics.resetCardLayout', {})}
            onClose={() => onCommand('analytics.setSettingsOpen', { open: false })}
          />
        )}
      </div>
    </div>
  );
}

// ── view body ────────────────────────────────────────────────────────────────

interface ViewBodyProps {
  view: AnalyticsView;
  /** Last 365 days — the year heatmap ignores the range chips. */
  yearByDay: ReturnType<ReturnType<typeof useAnalytics>['byDay']>;
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

// ── Plan vs actual ────────────────────────────────────────────────────────────
// Estimate (task plannedMin) vs actual (pomo work tagged with the task), per
// task and per day, plus where the observed time went. See analytics/estimates.ts.
function EstimatesView(props: ViewBodyProps & { cardGridStyle: React.CSSProperties }) {
  const { range, settingsOpen, isHidden, isPinned, toggleHidden, togglePin, clamp, cardGridStyle, state } = props;
  const board = useBoardStore((s) => s.board);
  const est = useMemo(
    () => (board ? computeEstimates(board, range, Date.now()) : null),
    [board, range],
  );
  if (!est) return null;
  const k = est.kpis;
  const tile = (label: string, value: string, sub: string, testId: string) => (
    <div data-testid={testId} style={{ minWidth: 0, padding: '12px 14px', border: '1px solid var(--k-an-line, #2a2e33)', borderRadius: 10, background: 'var(--k-an-tile, rgba(255,255,255,0.02))', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, overflow: 'hidden' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--k-an-ink-3, #aab0b7)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(20px, 4vh, 30px)', fontWeight: 700, color: 'var(--k-an-ink-1, #eef0f2)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--k-an-ink-3, #aab0b7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  );
  const card = (id: AnalyticsCardId, title: string, span: number, contentHeight: number, body: (size: { width: number; height: number }) => React.ReactNode) => (
    <ChartCard
      key={id}
      cardId={id}
      title={title}
      span={clamp(span)}
      contentHeight={contentHeight}
      hidden={isHidden(id)}
      pinned={isPinned(id)}
      settingsOpen={settingsOpen}
      onToggleHidden={() => toggleHidden(id)}
      onTogglePin={() => togglePin(id)}
    >
      {body}
    </ChartCard>
  );
  const cards = orderCards(
    [
      {
        cardId: 'estimates.kpis' as const,
        render: () => card('estimates.kpis', `Plan vs actual · last ${state.rangeDays}d`, 3, 96, () => (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: 10, width: '100%', height: '100%' }}>
            {tile('Accuracy', k.medianRatio === null ? '—' : `×${k.medianRatio.toFixed(2)}`, describeAccuracy(k.medianRatio) + (k.ratioBasis ? ` · ${k.ratioBasis} tasks` : ''), 'estimates-kpi-accuracy')}
            {tile('Planned', fmtMinutes(k.plannedMin), 'on tasks you tracked', 'estimates-kpi-planned')}
            {tile('Tracked', fmtMinutes(k.trackedMin), `${k.overCount} over · ${k.underCount} within plan`, 'estimates-kpi-tracked')}
            {tile('Tagged focus', k.taggedShare === null ? '—' : `${Math.round(k.taggedShare * 100)}%`, 'of pomo work linked to a task', 'estimates-kpi-tagged')}
          </div>
        )),
      },
      {
        cardId: 'estimates.perTask' as const,
        render: () => card('estimates.perTask', 'Estimate vs actual · per task', 2, 250, (size) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Legend items={[{ label: 'Planned (estimate)', color: COLOR_PLANNED }, { label: 'Tracked (pomo, tagged)', color: COLOR_TRACKED }]} />
            <EstimateBars tasks={est.tasks} width={chartWidth(size.width, 480)} {...(size.height > 0 ? { height: size.height - 30 } : {})} />
          </div>
        )),
      },
      {
        cardId: 'estimates.mix' as const,
        render: () => card('estimates.mix', 'Where the time went', 1, 120, (size) => (
          <FocusMix mix={est.mix} width={chartWidth(size.width, 260)} />
        )),
      },
      {
        cardId: 'estimates.daily' as const,
        render: () => card('estimates.daily', 'Planned vs worked · per day', 3, 200, (size) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Legend items={[{ label: 'Planned on calendar', color: COLOR_PLANNED }, { label: 'Worked (pomo)', color: COLOR_TRACKED }]} />
            <DailyPlanActual days={est.days} width={chartWidth(size.width, 640)} height={chartHeight(size.height - 20, 170)} />
          </div>
        )),
      },
    ],
    state.pinnedCards ?? [],
  );
  return <div style={cardGridStyle}>{cards.map((c) => <CardSlot key={c.cardId}>{c.render()}</CardSlot>)}</div>;
}

// ── Time by tag (ADR 0016) ────────────────────────────────────────────────────
// Completed tasks grouped by their tag: minutes are pomo time tracked against
// the task, else its estimate. See analytics/tags.ts.
function TimeView(props: ViewBodyProps & { cardGridStyle: React.CSSProperties }) {
  const { range, settingsOpen, isHidden, isPinned, toggleHidden, togglePin, clamp, cardGridStyle, state } = props;
  const board = useBoardStore((s) => s.board);
  const res = useMemo(
    () => (board ? computeTagBreakdown(board, range, Date.now()) : null),
    [board, range],
  );
  if (!res) return null;
  const slices: DonutSlice[] = res.tags.map((t) => ({ id: t.id, label: t.label, value: t.minutes, color: t.color }));
  const card = (id: AnalyticsCardId, title: string, span: number, contentHeight: number, body: (size: { width: number; height: number }) => React.ReactNode) => (
    <ChartCard
      key={id}
      cardId={id}
      title={title}
      span={clamp(span)}
      contentHeight={contentHeight}
      hidden={isHidden(id)}
      pinned={isPinned(id)}
      settingsOpen={settingsOpen}
      onToggleHidden={() => toggleHidden(id)}
      onTogglePin={() => togglePin(id)}
    >
      {body}
    </ChartCard>
  );
  const cards = orderCards(
    [
      {
        cardId: 'time.donut' as const,
        render: () => card('time.donut', `Time by tag · last ${state.rangeDays}d`, 1, 260, (size) => (
          <DonutChart
            data={slices}
            innerRatio={0.55}
            size={Math.min(220, chartWidth(size.width, 220))}
            centerPrimary={fmtMinutes(res.totalMin)}
            centerSecondary={`${res.totalCount} tasks`}
            formatValue={fmtMinutes}
          />
        )),
      },
      {
        cardId: 'time.list' as const,
        render: () => card('time.list', 'Tags ranked · time · share · tasks', 2, 260, (size) => (
          <TagList tags={res.tags} width={chartWidth(size.width, 420)} />
        )),
      },
      {
        cardId: 'time.daily' as const,
        render: () => card('time.daily', 'Daily mix by tag', 3, 190, (size) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Legend items={res.tags.map((t) => ({ label: t.label, color: t.color }))} />
            <TagDailyBars days={res.days} tags={res.tags} width={chartWidth(size.width, 640)} height={chartHeight(size.height - 24, 150)} />
          </div>
        )),
      },
    ],
    state.pinnedCards ?? [],
  );
  return <div style={cardGridStyle}>{cards.map((c) => <CardSlot key={c.cardId}>{c.render()}</CardSlot>)}</div>;
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
  // Cards from every view join one ordered sequence (guide order, then the
  // extras), so the per-view grid wrappers step out of the layout.
  void colCount;
  const cardGridStyle: React.CSSProperties = { display: 'contents' };

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

  if (view === 'estimates') {
    return <EstimatesView {...props} cardGridStyle={cardGridStyle} />;
  }

  if (view === 'time') {
    return <TimeView {...props} cardGridStyle={cardGridStyle} />;
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
          {(size) => (
            <CalendarHeatmap data={props.yearByDay} metric={state.metric} width={size.width} height={size.height} />
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
          <PagedView style={{ width: '100%', height: '100%' }} itemSelector="tbody > tr">
            <table
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--k-an-ink-1, #eef1f4)',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr style={{ color: 'var(--k-an-ink-3, #9aa1a8)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>id</th>
                  <th style={{ padding: '4px 6px' }}>label</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>events</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const count = events.filter((e) => e.source === s.id).length;
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--k-an-line, #23262a)' }}>
                      <td style={{ padding: '4px 6px' }}>{s.id}</td>
                      <td style={{ padding: '4px 6px' }}>{s.label}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PagedView>
        )}
      </ChartCard>
      {/* No habits yet: still a (placeholder) card, so the page grid holds. */}
        <ChartCard
          cardId="sources.streaks"
          title="Habit streaks"
          contentHeight={240}
          hidden={isHidden('sources.streaks') || streaks.perHabit.length === 0}
          pinned={isPinned('sources.streaks')}
          settingsOpen={settingsOpen}
          onToggleHidden={() => toggleHidden('sources.streaks')}
          onTogglePin={() => togglePin('sources.streaks')}
        >
          {() => (
            <PagedView style={{ width: '100%', height: '100%' }} itemSelector="tbody > tr">
              <table
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--k-an-ink-1, #eef1f4)',
                  borderCollapse: 'collapse',
                }}
              >
                <tbody>
                  {streaks.perHabit.map((h) => (
                    <tr key={h.habitId} style={{ borderTop: '1px solid var(--k-an-line, #23262a)' }}>
                      <td style={{ padding: '4px 6px' }}>{h.label}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--acid, #c9f158)' }}>
                        {h.streak}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PagedView>
          )}
        </ChartCard>
    </div>
  );
}

function CardSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default AnalyticsNode;
