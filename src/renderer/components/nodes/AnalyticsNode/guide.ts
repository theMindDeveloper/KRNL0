// Analytics pages. Each page fills the window with a grid of related charts
// (6 columns × 2 rows per page), so nothing scrolls and no space is wasted.
// Navigation is a row of icon buttons in the toolbar (see PageIcon).

import type { CSSProperties } from 'react';
import type { AnalyticsCardId } from './types';

export type PageId = 'summary' | 'activity' | 'year' | 'hours' | 'estimates' | 'tags' | 'log' | 'insights' | 'habits';

export interface AnalyticsPage {
  id: PageId;
  label: string;
}

export const PAGES: readonly AnalyticsPage[] = [
  { id: 'summary',   label: 'Summary' },
  { id: 'activity',  label: 'Activity' },
  { id: 'year',      label: 'Year' },
  { id: 'hours',     label: 'Hours' },
  { id: 'estimates', label: 'Plan vs actual' },
  { id: 'tags',      label: 'Time by tag' },
  { id: 'log',       label: 'Time log' },
  { id: 'insights',  label: 'Insights' },
  { id: 'habits',    label: 'Habits' },
];

/** Where a card sits: page, first sub-row (0/1), row span, first column (1–6), column span. */
interface Slot { page: PageId; row: 0 | 1; rows: 1 | 2; col: number; cols: number }

const LAYOUT: Partial<Record<AnalyticsCardId | 'summary', Slot>> = {
  summary:                       { page: 'summary',   row: 0, rows: 2, col: 1, cols: 6 },
  'overview.activity':           { page: 'activity',  row: 0, rows: 1, col: 1, cols: 6 },
  'patterns.cumulative':         { page: 'activity',  row: 1, rows: 1, col: 1, cols: 3 },
  'insights.stacked':            { page: 'activity',  row: 1, rows: 1, col: 4, cols: 3 },
  'calendar.heatmap':            { page: 'year',      row: 0, rows: 1, col: 1, cols: 6 },
  'patterns.month':              { page: 'year',      row: 1, rows: 1, col: 1, cols: 6 },
  'overview.dowHour':            { page: 'hours',     row: 0, rows: 1, col: 1, cols: 6 },
  'overview.dow':                { page: 'hours',     row: 1, rows: 1, col: 1, cols: 3 },
  'overview.hour':               { page: 'hours',     row: 1, rows: 1, col: 4, cols: 3 },
  'estimates.kpis':              { page: 'estimates', row: 0, rows: 1, col: 1, cols: 3 },
  'estimates.mix':               { page: 'estimates', row: 0, rows: 1, col: 4, cols: 3 },
  'estimates.perTask':           { page: 'estimates', row: 1, rows: 1, col: 1, cols: 3 },
  'estimates.daily':             { page: 'estimates', row: 1, rows: 1, col: 4, cols: 3 },
  // ADR 0016 — time by tag
  'time.donut':                  { page: 'tags',      row: 0, rows: 1, col: 1, cols: 2 },
  'time.list':                   { page: 'tags',      row: 0, rows: 1, col: 3, cols: 4 },
  'time.daily':                  { page: 'tags',      row: 1, rows: 1, col: 1, cols: 6 },
  'time.log':                    { page: 'log',       row: 0, rows: 2, col: 1, cols: 6 },
  'insights.radar':              { page: 'insights',  row: 0, rows: 1, col: 1, cols: 2 },
  'insights.donutSessionsByDay': { page: 'insights',  row: 0, rows: 1, col: 3, cols: 2 },
  'insights.donutSources':       { page: 'insights',  row: 0, rows: 1, col: 5, cols: 2 },
  'insights.scatterTasksFocus':  { page: 'insights',  row: 1, rows: 1, col: 1, cols: 2 },
  'insights.histogramFocus':     { page: 'insights',  row: 1, rows: 1, col: 3, cols: 2 },
  'insights.histogramTasks':     { page: 'insights',  row: 1, rows: 1, col: 5, cols: 2 },
  'sources.streaks':             { page: 'habits',    row: 0, rows: 2, col: 1, cols: 3 },
  'sources.list':                { page: 'habits',    row: 0, rows: 2, col: 4, cols: 3 },
};

/** Easy mode hides the pages built on links (per-task plan vs actual, time by tag). */
export const EASY_HIDDEN_PAGES: ReadonlySet<PageId> = new Set<PageId>(['estimates', 'tags']);
export const pagesFor = (easy: boolean): readonly AnalyticsPage[] =>
  easy ? PAGES.filter((p) => !EASY_HIDDEN_PAGES.has(p.id)) : PAGES;
const pageIndex = (easy: boolean) => new Map<PageId, number>(pagesFor(easy).map((p, i) => [p.id, i]));
const PAGE_INDEX = pageIndex(false);
const EASY_PAGE_INDEX = pageIndex(true);

export function isPagedCard(id: string): boolean {
  return id in LAYOUT;
}

export function pageOfCard(id: string): PageId | null {
  return LAYOUT[id as AnalyticsCardId]?.page ?? null;
}

/** CSS grid placement for a card (rows are 2 per page). */
export function cardPlacement(id: string, easy = false): CSSProperties {
  const s = LAYOUT[id as AnalyticsCardId | 'summary'];
  const index = (easy ? EASY_PAGE_INDEX : PAGE_INDEX).get(s?.page ?? 'summary');
  if (!s || index === undefined) return { display: 'none' };
  const row = index * 2 + s.row + 1;
  return { gridRow: `${row} / span ${s.rows}`, gridColumn: `${s.col} / span ${s.cols}` };
}

/** Selector for the first card on a page (the page's jump target). */
export function pageSelector(page: PageId): string {
  if (page === 'summary') return '[data-testid="analytics-summary"]';
  const first = Object.entries(LAYOUT).find(([, s]) => s?.page === page && s.row === 0 && s.col === 1)?.[0];
  return first ? `[data-card-id="${first}"]` : '';
}

/** Cards shown on a page, in reading order (the Summary page has none). */
export function cardsOfPage(page: PageId): AnalyticsCardId[] {
  return (Object.entries(LAYOUT) as Array<[AnalyticsCardId | 'summary', Slot]>)
    .filter(([id, slot]) => id !== 'summary' && slot.page === page)
    .sort(([, a], [, b]) => a.row - b.row || a.col - b.col)
    .map(([id]) => id as AnalyticsCardId);
}
