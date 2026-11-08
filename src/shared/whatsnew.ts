// What's new after an update (launch-experience.md F5–F9).
//
// The notes ship inside the app, keyed by major.minor, so they work offline
// and always match the installed version. Every feature release adds one
// entry at the top of RELEASES in its release PR. Patch releases need none:
// they only get the small "Updated to x.y.z" notice.

import { minorOf } from './appState';

export type WhatsNewArt = 'mini' | 'menubar' | 'feedback' | 'streak' | 'sessions';
/** What "Show me" does for a highlight. */
export type WhatsNewAction = 'pomo' | 'feedback' | 'settings' | 'none';

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
    date: '6 Nov 2026',
    summary: 'floating timer, taskbar time, feedback',
    items: [
      {
        label: 'A timer that floats',
        kicker: 'New · floating timer',
        caption: 'Minimise KRNL0 while the Pomo runs and the timer stays above your other windows.',
        title: 'Your timer, now on\ntop of everything.',
        body: 'A small timer floats over whatever you work in. Pause, take a break or stop right from it, in Pomodoro and Observe.',
        art: 'mini',
        action: 'pomo',
      },
      {
        label: 'Time left on your taskbar',
        kicker: 'New · taskbar and menu bar',
        caption: 'A progress bar on the KRNL0 taskbar icon on Windows, the minutes next to your clock on a Mac.',
        title: 'Glance,\ndon’t switch.',
        body: 'See how long is left without opening KRNL0. Hover the taskbar icon on Windows, or click the time in the Mac menu bar, to pause, break or stop.',
        art: 'menubar',
        action: 'pomo',
      },
      {
        label: 'Send feedback from the app',
        kicker: 'New · send feedback',
        caption: 'Help › Send feedback. Your version and system are added for you.',
        title: 'Tell us what\nto fix next.',
        body: 'A short form, right in the app. It opens a filled-in GitHub issue, and nothing is sent until you post it.',
        art: 'feedback',
        action: 'feedback',
      },
    ],
    more: [
      'A copy of your board is saved before every update (Settings › Updates › Board backups).',
      'Welcome back: after two or more days away, a short list of what slipped, with one-click fixes.',
      'Milestone cards for habit streaks and focus sessions, with a Celebrations switch in Settings.',
      'Observe mode draws breaks as a thin line instead of stripes.',
      'The Calendar shows your plan as blocks, habits as small pills you can tick, and what you recorded on a track at the left of each day that fills up to now, like the Clock; switch Recorded and Habits in its header.',
      'Plans that overlap in a narrow day stand side by side as slim bars named by their first letters; Fix overlap puts them one after another, and dragging a plan to the strip at the bottom unschedules it.',
      'The month view shows every plan of a day (a full day scrolls) and never hides one behind "+N".',
      'A task card keeps the same shape when you tick it, so nothing moves under your click.',
      'The floating timer comes in three looks (Dial, Capsule, Box) and asks what an Observe span was.',
      'Easier to read: larger labels, stronger contrast in light and dark, and line icons throughout.',
      'Habits & Routines: a routine (a class, a work shift) sits on your Calendar every week and is never ticked; skip one week, move one, or end it. Habits can be "any time".',
      'Adding asks first: type a name, press Enter, and say whether you tick it off (a habit) or it just happens (a routine). Nothing is added with settings you did not choose.',
      'Habits: aim for 3 times a week on any days, mark a rest day when you are sick or away, and archive a habit to keep its history.',
      'Plans: a due date apart from the time, a reminder before it starts (even with the window closed), and Drop for things you are not doing any more.',
      'New tour: Help › Staying on track.',
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
