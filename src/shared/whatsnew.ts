// What's new after an update (launch-experience.md F5–F9).
//
// The notes ship inside the app, keyed by major.minor, so they work offline
// and always match the installed version. Every feature release adds one
// entry at the top of RELEASES in its release PR. Patch releases need none:
// they only get the small "Updated to x.y.z" notice.

import { minorOf } from './appState';

export type WhatsNewArt = 'mini' | 'menubar' | 'feedback' | 'streak' | 'sessions' | 'guide' | 'board';
/** What "Show me" does for a highlight. */
export type WhatsNewAction = 'pomo' | 'feedback' | 'settings' | 'tour' | 'none';

export interface WhatsNewItem {
  /** Short line in the 01–03 list. */
  label: string;
  /** Small caps line over the picture. */
  kicker: string;
  caption: string;
  /** Headline; "\n" breaks the line. */
  title: string;
  body: string;
  art: WhatsNewArt;
  action: WhatsNewAction;
}

export interface WhatsNewRelease {
  /** "0.11" — matched against the running version's major.minor. */
  minor: string;
  /** Release date, "6 Nov 2026". */
  date: string;
  /** One line for Settings › Recent versions. */
  summary: string;
  /** Three highlights at most (F6). */
  items: WhatsNewItem[];
  /** Smaller changes, listed in the CLI and the full notes. */
  more: string[];
}

export const RELEASES: readonly WhatsNewRelease[] = [
  {
    minor: '0.11',
    date: 'Nov 2026',
    summary: 'Easy mode and a voiced guide, plans, habits and events on one board, a floating timer',
    items: [
      {
        label: 'Easy mode, and a guide',
        kicker: 'New · Easy mode and voiced tours',
        caption: 'Plan it, do it, see how it went. A spoken tour shows you every part.',
        title: 'Start simple.\nWe’ll show you around.',
        body: 'KRNL0 starts in Easy mode: plan your day, record what you do, see how it went. A guide walks you through your first day out loud, and every window has its own short tour. Advanced is one switch away.',
        art: 'guide',
        action: 'tour',
      },
      {
        label: 'Your week on one board',
        kicker: 'New · When, deadlines, board cards',
        caption: 'Habits and repeating events get cards next to your plans.',
        title: 'Plans, habits and\nevents, together.',
        body: 'Give a plan a day and a time, or just a day, and a deadline if it has one. Classes and shifts repeat on the Calendar by themselves. Habits and events get cards: tick today’s square, skip a class, or Show anything on the Calendar.',
        art: 'board',
        action: 'none',
      },
      {
        label: 'A timer that floats',
        kicker: 'New · floating timer and taskbar',
        caption: 'Minimise KRNL0 while the timer runs: it stays above your other windows.',
        title: 'Your timer, now on\ntop of everything.',
        body: 'A small timer floats over whatever you work in, and the time left shows on the taskbar (Windows) or next to the clock (Mac). Pause, take a break or stop from either.',
        art: 'mini',
        action: 'pomo',
      },
    ],
    more: [
      'Tours for every window, voiced, in Easy and Advanced (the orb’s menu). The first one starts on its own the first time you open KRNL0.',
      'Ask the orb anything: it answers with Claude Code (when it is installed) and can change your board for you.',
      'Show: one click lights up a plan on the board and on the Calendar.',
      'The Calendar: double-click empty hours to add a plan, a Repeating button for classes and shifts, an ANY TIME strip for plans with a day but no time, deadlines as flags.',
      'Habits: times a week, a daily goal (8 glasses), rest days that keep a streak, Week / Month / Year views, and archive.',
      'Plans: Won’t do for things you drop, and in Advanced a reminder before a plan starts (even with the window closed).',
      'Quick add: type “Gym tomorrow 18:00 1h”, “Pay rent fri” or “Meeting 14:00-15:30” and it lands on the right day and time.',
      'Close the day: in the evening, one card with what you did today.',
      'Night shifts: a repeating event can run past midnight.',
      'Sounds: three sound packs for ticks and the timer, with volume and an off switch (Settings › Sounds).',
      'The floating timer comes in three looks (Dial, Capsule, Box), and the Pomo has a Minimal face.',
      'Align to grid (Settings › Canvas): what you move settles into a neat spot, never on top of something. Cards only, or everything.',
      'Station: a divider you let go near the line above or below clicks onto it.',
      'A new board tour: notes, sticky notes, Show, the habit and event cards, Align to grid.',
      'Send feedback from the app (Help › Send feedback): a filled-in GitHub issue, nothing sent until you post it.',
      'Welcome back: after two or more days away, a short list of what slipped, with one-click fixes.',
      'Milestone cards for streaks and focus sessions, with a Celebrations switch in Settings.',
      'A copy of your board is saved before every update (Settings › Updates › Board backups).',
      'Easier to read: larger labels, stronger contrast, line icons, and button text that never spills out.',
      'Fixed: new wires snapping onto hidden cards; a tour’s highlight jumping to another task when the board moved.',
    ],
  },
  {
    minor: '0.10',
    date: '5 Nov 2026',
    summary: 'updates arrive by themselves',
    items: [],
    more: ['Windows installs download in the background and install when you quit.'],
  },
];

/** The notes for this version's major.minor, if any. */
export function notesFor(version: string): WhatsNewRelease | null {
  const minor = minorOf(version);
  return RELEASES.find((r) => r.minor === minor && r.items.length > 0) ?? null;
}

/** The newest notes that have highlights (Help › What's new, `krnl whatsnew`). */
export function latestNotes(): WhatsNewRelease | null {
  return RELEASES.find((r) => r.items.length > 0) ?? null;
}

/** Should the dialog open on this launch? Once per feature release (F5). */
export function shouldShowWhatsNew(args: { kind: string; version: string; seen: string | null }): boolean {
  if (args.kind !== 'feature') return false;
  const notes = notesFor(args.version);
  return notes !== null && args.seen !== notes.minor;
}

/** Plain text for the terminal. */
export function describeWhatsNew(r: WhatsNewRelease): string {
  const lines = [`What's new in KRNL0 ${r.minor} · ${r.date}`, ''];
  r.items.forEach((it, i) => {
    lines.push(`${String(i + 1).padStart(2, '0')}  ${it.label}`);
    lines.push(`    ${it.body}`);
  });
  if (r.more.length > 0) {
    lines.push('', 'Also:');
    for (const m of r.more) lines.push(`  · ${m}`);
  }
  return lines.join('\n');
}
