// The Analytics "guide": a short, ordered set of pages that answer the
// questions people actually ask, instead of 25 charts behind six tabs.
// Everything else stays available under "More charts".

import type { AnalyticsCardId } from './types';

export interface GuidePage {
  id: AnalyticsCardId | 'summary';
  icon: string;
  title: string;
  hint: string;
}

export const GUIDE: readonly GuidePage[] = [
  { id: 'summary',            icon: '✦', title: 'Summary',            hint: 'Your period in plain words' },
  { id: 'overview.activity',  icon: '▁▃▅', title: 'Activity',         hint: 'Day by day, last N days' },
  { id: 'calendar.heatmap',   icon: '▦', title: 'Year',               hint: 'Every day of the past year' },
  { id: 'overview.dowHour',   icon: '◷', title: 'When you work',      hint: 'Weekday × hour' },
  { id: 'estimates.kpis',     icon: '⇄', title: 'Plan vs actual',     hint: 'How good your estimates are' },
  { id: 'estimates.perTask',  icon: '☰', title: 'Per task',           hint: 'Planned vs tracked, task by task' },
  { id: 'estimates.mix',      icon: '◔', title: 'Where time went',    hint: 'Planned, unplanned, untagged' },
  { id: 'sources.streaks',    icon: '🔥', title: 'Habit streaks',      hint: 'Current streak per habit' },
];

const ORDER = new Map<string, number>(GUIDE.map((g, i) => [g.id, i]));

export function isGuideCard(id: string): boolean {
  return ORDER.has(id);
}

/** CSS `order` for a card: guide pages first, in guide order; the rest after. */
export function cardOrder(id: string): number {
  return ORDER.get(id) ?? 100;
}

export function guideInfo(id: string): GuidePage | undefined {
  return GUIDE.find((g) => g.id === id);
}
