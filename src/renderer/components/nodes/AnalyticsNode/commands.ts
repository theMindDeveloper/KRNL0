// Pure FSM commands for the AnalyticsNode. Mutations route through onCommand
// like every other node so undo/redo, board persistence, and replay work.

import type { AnalyticsCardId, AnalyticsConfig, AnalyticsMetric, AnalyticsState, AnalyticsView } from './types';
import { ANALYTICS_VIEWS } from './types';

export const analyticsSetView = (
  state: AnalyticsState,
  args: { view: AnalyticsView },
): AnalyticsState => {
  if (!ANALYTICS_VIEWS.includes(args.view)) return state;
  if (state.view === args.view) return state;
  return { ...state, view: args.view };
};

export const analyticsSetRangeDays = (
  state: AnalyticsState,
  args: { days: number },
): AnalyticsState => {
  if (!Number.isFinite(args.days)) return state;
  const days = Math.max(1, Math.min(365, Math.round(args.days)));
  if (days === state.rangeDays) return state;
  return { ...state, rangeDays: days };
};

export const analyticsSetMetric = (
  state: AnalyticsState,
  args: { metric: AnalyticsMetric },
): AnalyticsState => {
  if (state.metric === args.metric) return state;
  return { ...state, metric: args.metric };
};

export const analyticsSetYear = (
  state: AnalyticsState,
  args: { year: number },
): AnalyticsState => {
  if (!Number.isFinite(args.year)) return state;
  const y = Math.round(args.year);
  if (y === state.year) return state;
  return { ...state, year: y };
};

export const analyticsSetSize = (
  state: AnalyticsState,
  args: { width: number; height: number },
): AnalyticsState => {
  const w = Math.max(360, Math.round(args.width));
  const h = Math.max(280, Math.round(args.height));
  if (w === state.width && h === state.height) return state;
  return { ...state, width: w, height: h };
};

// ── Card curation (2026-05-18 overhaul) ────────────────────────────────────
// The user can hide cards they don't care about and pin the ones they want
// at the top of every view. State preserves insertion order on pin so the
// user's layout matches their selection sequence.

export const analyticsToggleCardHidden = (
  state: AnalyticsState,
  args: { cardId: AnalyticsCardId },
): AnalyticsState => {
  const hidden = state.hiddenCards ?? [];
  const isHidden = hidden.includes(args.cardId);
  const next = isHidden
    ? hidden.filter((id) => id !== args.cardId)
    : [...hidden, args.cardId];
  // Pinning + hiding are mutually exclusive — hiding a pinned card unpins it
  // so re-showing later doesn't surprise the user with a sticky-top reveal.
  const pinned = state.pinnedCards ?? [];
  const pinnedAfter = !isHidden
    ? pinned.filter((id) => id !== args.cardId)
    : pinned;
  return { ...state, hiddenCards: next, pinnedCards: pinnedAfter };
};

export const analyticsTogglePinCard = (
  state: AnalyticsState,
  args: { cardId: AnalyticsCardId },
): AnalyticsState => {
  const pinned = state.pinnedCards ?? [];
  const isPinned = pinned.includes(args.cardId);
  const next = isPinned
    ? pinned.filter((id) => id !== args.cardId)
    : [...pinned, args.cardId];
  // Pinning a hidden card un-hides it (you can't pin something you can't see).
  const hidden = state.hiddenCards ?? [];
  const hiddenAfter = !isPinned
    ? hidden.filter((id) => id !== args.cardId)
    : hidden;
  return { ...state, pinnedCards: next, hiddenCards: hiddenAfter };
};

export const analyticsSetSettingsOpen = (
  state: AnalyticsState,
  args: { open: boolean },
): AnalyticsState => {
  if (state.settingsOpen === args.open) return state;
  return { ...state, settingsOpen: args.open };
};

export const analyticsResetCardLayout = (
  state: AnalyticsState,
): AnalyticsState => ({
  ...state,
  hiddenCards: [],
  pinnedCards: [],
});

export type AnalyticsCommand =
  | 'analytics.setView'
  | 'analytics.setRangeDays'
  | 'analytics.setMetric'
  | 'analytics.setYear'
  | 'analytics.setSize'
  | 'analytics.toggleCardHidden'
  | 'analytics.togglePinCard'
  | 'analytics.setSettingsOpen'
  | 'analytics.resetCardLayout';

export const ANALYTICS_COMMANDS: readonly AnalyticsCommand[] = [
  'analytics.setView',
  'analytics.setRangeDays',
  'analytics.setMetric',
  'analytics.setYear',
  'analytics.setSize',
  'analytics.toggleCardHidden',
  'analytics.togglePinCard',
  'analytics.setSettingsOpen',
  'analytics.resetCardLayout',
] as const;

// Re-export configs for parity with other node modules.
export type { AnalyticsConfig };
