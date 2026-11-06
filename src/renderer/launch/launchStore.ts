// Launch experience in the window (Decision 38, launch-experience.md).
//
// Holds what main told us at launch (version, backup, time away) and which
// launch surface is open: What's new, the patch notice, Welcome back, the
// feedback dialog, a milestone card. Only one dialog opens at a time; the
// launch flow queues them (What's new first, then Welcome back).

import { create } from 'zustand';
import { useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { shouldWelcomeBack, type AppPrefsPatch, type AppStateFile, type LaunchInfo } from '../../shared/appState';
import { latestNotes, notesFor, shouldShowWhatsNew, type WhatsNewRelease } from '../../shared/whatsnew';
import type { FeedbackKind } from '../../shared/feedback';
import { computeCatchup, isEmptyCatchup, type Catchup } from './catchup';
import { allShareCards, findNewMilestone, type Milestone } from './milestones';
import { splashLaunch } from '../splash';

export interface LaunchUi {
  info: LaunchInfo | null;
  prefs: AppStateFile | null;
  whatsNew: WhatsNewRelease | null;
  /** "Updated to x.y.z" after a patch release. */
  patchVersion: string | null;
  welcome: { catchup: Catchup; awayMs: number | null } | null;
  feedback: { kind: FeedbackKind; title: string } | null;
  milestone: Milestone | null;
  /** The share window: every card the board can make, and which one is shown. */
  share: { cards: Milestone[]; id: string } | null;
}

export const useLaunchStore = create<LaunchUi>(() => ({
  info: null,
  prefs: null,
  whatsNew: null,
  patchVersion: null,
  welcome: null,
  feedback: null,
  milestone: null,
  share: null,
}));

export function todayYMD(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function setAppPrefs(patch: AppPrefsPatch): Promise<void> {
  const next = await window.krnl?.appPrefsSet?.(patch);
  if (next) useLaunchStore.setState({ prefs: next as AppStateFile });
}

// ── What's new ───────────────────────────────────────────────────────────────

export function openWhatsNew(release: WhatsNewRelease | null = latestNotes()): boolean {
  if (!release) return false;
  useLaunchStore.setState({ whatsNew: release, welcome: null, feedback: null });
  return true;
}

/** Closed (any button): never show this release's box again (F5). */
export function closeWhatsNew(runQueued = true): void {
  const r = useLaunchStore.getState().whatsNew;
  useLaunchStore.setState({ whatsNew: null });
  if (r) void setAppPrefs({ whatsNewSeen: r.minor });
  const next = queued;
  queued = null;
  if (runQueued) next?.();
}

// ── Welcome back ─────────────────────────────────────────────────────────────

/** Open the catch-up. `force` opens it even when nothing slipped (preview / CLI). */
export function openWelcomeBack(force = false, awayMs: number | null = useLaunchStore.getState().info?.awayMs ?? null): boolean {
  const board = useBoardStore.getState().board;
  if (!board) return false;
  const catchup = computeCatchup(board, todayYMD());
  if (!force && isEmptyCatchup(catchup)) return false;
  useLaunchStore.setState({ welcome: { catchup, awayMs }, whatsNew: null, feedback: null });
  if (!force) welcomed = true;
  return true;
}

export function refreshWelcomeBack(): void {
  const st = useLaunchStore.getState().welcome;
  const board = useBoardStore.getState().board;
  if (!st || !board) return;
  useLaunchStore.setState({ welcome: { ...st, catchup: computeCatchup(board, todayYMD()) } });
}

let welcomed = false;
/** Welcome back already summed up the days away on this launch (the morning line stays quiet). */
export function welcomedThisRun(): boolean {
  return welcomed;
}

/** A launch dialog is open: other moments (recap, morning line) wait. */
export function launchDialogOpen(): boolean {
  const s = useLaunchStore.getState();
  return s.whatsNew !== null || s.welcome !== null || s.feedback !== null || s.share !== null;
}

export function closeWelcomeBack(): void {
  useLaunchStore.setState({ welcome: null });
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function openFeedback(kind: FeedbackKind = 'bug', title = ''): void {
  useLaunchStore.setState({ feedback: { kind, title }, whatsNew: null, welcome: null });
}

export function closeFeedback(): void {
  useLaunchStore.setState({ feedback: null });
}

// ── Milestones ───────────────────────────────────────────────────────────────

export function showMilestone(m: Milestone): void {
  useLaunchStore.setState({ milestone: m });
}

export function closeMilestone(): void {
  useLaunchStore.setState({ milestone: null });
}

/** Open the share window on `pick` (or the first card), with every card the board can make. */
export function openShare(pick?: Milestone): boolean {
  const board = useBoardStore.getState().board;
  const cards = board ? allShareCards(board.nodes, todayYMD()) : [];
  if (pick && !cards.some((c) => c.id === pick.id)) cards.unshift(pick);
  const first = pick ?? cards.find((c) => c.kind === 'streak' && c.value > 0) ?? cards[cards.length - 1];
  if (!first) return false;
  useLaunchStore.setState({ share: { cards, id: first.id }, milestone: null });
  return true;
}

export function closeShare(): void {
  useLaunchStore.setState({ share: null });
}

// ── Launch flow ──────────────────────────────────────────────────────────────

let queued: (() => void) | null = null;
let started = false;

/** Mount once (App): fetch the launch info and feed the splash. */
export function useLaunchBridge(): void {
  useEffect(() => {
    let live = true;
    void window.krnl?.appLaunch?.().then((raw) => {
      if (!live || !raw) return;
      const info = raw as LaunchInfo;
      useLaunchStore.setState({ info, prefs: info.prefs });
      splashLaunch(info);
    }).catch(() => { /* no main (browser preview) */ });
    return () => { live = false; };
  }, []);
}

/**
 * Run once the board is on screen: the patch notice, then What's new, then
 * Welcome back — never two dialogs at once (F5, F8, F12).
 */
export function runLaunchFlow(): void {
  if (started) return;
  const { info } = useLaunchStore.getState();
  if (!info) return;
  started = true;
  const seen = info.prefs.whatsNewSeen;
  if (info.kind === 'patch' && info.previousVersion) useLaunchStore.setState({ patchVersion: info.version });

  const welcome = (): void => {
    if (shouldWelcomeBack(info) && openWelcomeBack(info.simulated, info.awayMs)) welcomed = true;
  };
  // A simulated feature update in a build whose own notes don't exist yet
  // (dev runs the previous version number) previews the newest notes.
  const notes = notesFor(info.version) ?? (info.simulated ? latestNotes() : null);
  const showNotes = info.simulated
    ? info.kind === 'feature' && notes !== null
    : shouldShowWhatsNew({ kind: info.kind, version: info.version, seen });
  if (showNotes && notes) {
    queued = welcome;
    openWhatsNew(notes);
  } else {
    welcome();
  }
}

/** Watch the board for a new milestone while Celebrations is on (F20). */
export function useMilestoneWatcher(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
      const { prefs, milestone, whatsNew, welcome } = useLaunchStore.getState();
      const board = useBoardStore.getState().board;
      if (!prefs || !prefs.celebrations || !board || milestone || whatsNew || welcome) return;
      const m = findNewMilestone(board.nodes, todayYMD(), prefs.milestonesSeen);
      if (!m) return;
      showMilestone(m);
      void setAppPrefs({ milestonesSeen: [...prefs.milestonesSeen, m.id] });
    };
    const unsub = useBoardStore.subscribe((s, prev) => {
      if (s.board === prev.board) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, 1200);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);
}
