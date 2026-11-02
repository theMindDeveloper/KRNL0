// The Analytics guide: a short, ordered set of pages that answer the
// questions people actually ask. Shown as an always-visible list beside the
// chart (one click to any page). Other charts stay off.

import type { AnalyticsCardId } from './types';

export interface GuidePage {
  id: AnalyticsCardId | 'summary';
  /** Short label for the page list — must fit ~11 characters. */
  label: string;
}

export const GUIDE: readonly GuidePage[] = [
  { id: 'summary',           label: 'Summary' },
  { id: 'overview.activity', label: 'Activity' },
  { id: 'calendar.heatmap',  label: 'Year' },
  { id: 'overview.dowHour',  label: 'Hours' },
  { id: 'estimates.kpis',    label: 'Estimates' },
  { id: 'estimates.perTask', label: 'Per task' },
  { id: 'estimates.mix',     label: 'Time split' },
  { id: 'sources.streaks',   label: 'Streaks' },
];

const ORDER = new Map<string, number>(GUIDE.map((g, i) => [g.id, i]));

export function isGuideCard(id: string): boolean {
  return ORDER.has(id);
}

/** CSS `order` for a card: guide pages in guide order; anything else after. */
export function cardOrder(id: string): number {
  return ORDER.get(id) ?? 100;
}
