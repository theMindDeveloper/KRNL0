// What's new after an update (launch-experience.md F5–F9).
//
// The notes ship inside the app, keyed by major.minor, so they work offline
// and always match the installed version. Every feature release adds one
// entry at the top of RELEASES in its release PR. Patch releases need none:
// they only get the small "Updated to x.y.z" notice.

import { minorOf } from './appState';

export type WhatsNewArt = 'mini' | 'menubar' | 'feedback' | 'streak' | 'sessions' | 'guide' | 'board' | 'boards' | 'windows' | 'cards' | 'sync' | 'phone' | 'update';
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
  /** With action 'tour': which tour "Show me" starts (default: the first-day tour). */
  tour?: string;
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
    minor: '0.14',
    date: 'Nov 2026',
    summary: 'Your server updates in one click, and installs with one command',
    items: [
      {
        label: 'Your server, up to date in one click',
        kicker: 'New · Server updates',
        caption: 'When your server has a new version, the saved badge says so.',
        title: 'Your server,\nup to date in one click.',
        body: 'When your KRNL0 server has a new version, a small dot appears on the saved badge. Click Update server and type your password: it makes a backup, checks that the release is the real one, restarts, and goes back by itself if anything fails. Or let it update itself at night.',
        art: 'update',
        action: 'tour',
        tour: 'sync',
      },
    ],
    more: [
      'Docker in one command, on Linux, Mac and Windows, with the updater included. A server started with docker run moves over with its data.',
      'Settings › Updates shows your server: its version, how it updates, and the night switch.',
      'The website one version behind keeps everything a newer KRNL0 added, and a window it does not know yet shows as a quiet card.',
      'Each KRNL0 release now prepares the matching server release by itself.',
      'Command: krnl sync server.',
    ],
  },
  {
    minor: '0.13',
    date: 'Nov 2026',
    summary: 'Your board on every device through your own server, and on your phone',
    items: [
      {
        label: 'Your board on every device',
        kicker: 'New · Your own server',
        caption: 'Every computer you connect keeps the same boards, plans, habits and time.',
        title: 'Your board,\non every device.',
        body: 'Run your own KRNL0 server at home and connect it from the saved badge in the top bar. Every computer you connect keeps the same boards, plans, habits and time. Offline too: changes wait and go when the server is back. Nothing passes through anyone else.',
        art: 'sync',
        action: 'tour',
        tour: 'sync',
      },
      {
        label: 'Open it on your phone',
        kicker: 'New · In the browser',
        caption: 'Today, the timer, calendar, habits and canvas, laid out for a phone.',
        title: 'Open it on\nyour phone.',
        body: 'Your server also serves KRNL0 to your phone and your iPad: Today with the timer, your plans and habits, the calendar, insights and the canvas, laid out for the screen in your hand. Hold a finger on a plan for its menu. The terminal and the AI stay in this app.',
        art: 'phone',
        action: 'none',
      },
    ],
    more: [
      'The saved badge in the top bar now also tells sync: saved · synced, syncing, saved · offline.',
      'Connecting checks the server’s fingerprint, and the key stays in your system’s keychain.',
      'Edits made on two devices at the same moment are both kept.',
      'Pictures and files sync too.',
      'A tutorial: Help › Tutorials › Saved and synced.',
      'Commands: krnl sync status / connect / disconnect / retry.',
    ],
  },
  {
    minor: '0.12',
    date: 'Nov 2026',
    summary: 'Separate boards, one look for every window, plan cards you can read',
    items: [
      {
        label: 'One board per project',
        kicker: 'New · Separate boards',
        caption: 'Each board has its own todos, habits, calendar, timer history and analytics.',
        title: 'One board\nper project.',
        body: 'Make a board for uni, one for work, one for home. Each has its own todos, habits, calendar, timer history and analytics. Your old canvases became boards by themselves; nothing was deleted.',
        art: 'boards',
        action: 'tour',
        tour: 'boards',
      },
      {
        label: 'One look for every window',
        kicker: 'Redesigned · Every window',
        caption: 'The same header, the same view switch, the same buttons.',
        title: 'The same place,\nin every window.',
        body: 'Every window now has the same header, the same view switch and the same buttons, in normal letters you can read. The Timer got one calm face and a clock of its own. Two styles to choose from, Paper and Pro, in Settings.',
        art: 'windows',
        action: 'settings',
      },
      {
        label: 'Plan cards you can read',
        kicker: 'Redesigned · Cards',
        caption: 'A plan, a habit, an event and logged time use one kind of card.',
        title: 'A day, a time,\na deadline. One card.',
        body: 'Adding a plan, a habit or an event uses one kind of card: a short list you read from top to bottom. Pick the day with one press, add a time or a deadline if it has one. Click away and it is kept.',
        art: 'cards',
        action: 'none',
      },
    ],
    more: [
      'Two styles, Paper and Pro, chosen in Settings. The style picker left the board.',
      'Two volumes in Settings › Sounds: app sounds and the AI voice, each with its own slider.',
      'One timer at a time across boards. If it is still running in another board, a note in the top bar takes you back to it.',
      'Reminders reach you from every board, with the board’s name.',
      'Narrow windows keep their full name; the views get tighter instead of running over the edge.',
      'The Calendar week wraps long names, and the Year view fills its window.',
      'The Timer has one face, a clock font of its own, and its settings as a list.',
      'Connectors only on task cards. Notes, images and frames have none.',
      'A plan card keeps your change when you click elsewhere.',
      'A voiced tutorial for boards (the orb’s menu, Advanced). All older tours match the new look.',
      'Safer storage: a board switch that fails is undone, and every board gets a safety copy before an update.',
      'Commands: krnl board list / new / switch / rename / delete, and krnl sound voice.',
    ],
  },
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
      'The Calendar: double-click empty hours or press + to add a plan or a repeating class or shift, an ANY TIME strip for plans with a day but no time, deadlines as flags.',
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
