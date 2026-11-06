// App state across launches (Decision 38, docs/06-requirements/launch-experience.md).
//
// One small file in userData (`app-state.json`) that remembers what the app
// itself needs between runs: the last version that opened this board, the
// last time KRNL0 was in use, which What's new was read, and the user's
// Celebrations switch. It never holds board data. Pure: shared by main, the
// sys CLI, the renderer and tests.

import { compareVersions } from './update';

export const DAY_MS = 86_400_000;
/** "Welcome back" only after this long away (launch-experience.md F12). */
export const WELCOME_BACK_MIN_MS = 2 * DAY_MS;
/** Board copies kept in the backups folder (F4). */
export const BACKUPS_KEPT = 3;

export interface AppStateFile {
  /** Version of the last run on this userData folder; null before the first. */
  lastVersion: string | null;
  /** Epoch ms of the last time the main window was in use. */
  lastActiveAt: number | null;
  /** major.minor of the last What's new the user saw ("0.11"). */
  whatsNewSeen: string | null;
  /** Milestone cards on/off (Settings › Celebrations). */
  celebrations: boolean;
  /** Milestone ids already shown ("streak:<habitId>:30", "sessions:100"). */
  milestonesSeen: string[];
  /** Mac/Linux: a release the user chose to skip ("Skip version"). */
  skippedVersion: string | null;
}

export const DEFAULT_APP_STATE: AppStateFile = {
  lastVersion: null,
  lastActiveAt: null,
  whatsNewSeen: null,
  celebrations: true,
  milestonesSeen: [],
  skippedVersion: null,
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Read the file's JSON; anything missing or malformed falls back to the default. */
export function parseAppState(raw: unknown): AppStateFile {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_APP_STATE, milestonesSeen: [] };
  const r = raw as Record<string, unknown>;
  return {
    lastVersion: str(r['lastVersion']),
    lastActiveAt: num(r['lastActiveAt']),
    whatsNewSeen: str(r['whatsNewSeen']),
    celebrations: typeof r['celebrations'] === 'boolean' ? r['celebrations'] : true,
    milestonesSeen: Array.isArray(r['milestonesSeen'])
      ? r['milestonesSeen'].filter((x): x is string => typeof x === 'string').slice(-500)
      : [],
    skippedVersion: str(r['skippedVersion']),
  };
}

/** What the renderer may change (the rest is main's bookkeeping). */
export type AppPrefsPatch = Partial<Pick<AppStateFile, 'whatsNewSeen' | 'celebrations' | 'milestonesSeen' | 'skippedVersion'>>;

export function applyPrefsPatch(state: AppStateFile, raw: unknown): AppStateFile {
  if (typeof raw !== 'object' || raw === null) return state;
  const p = raw as Record<string, unknown>;
  const next = { ...state };
  if ('whatsNewSeen' in p) next.whatsNewSeen = str(p['whatsNewSeen']);
  if (typeof p['celebrations'] === 'boolean') next.celebrations = p['celebrations'];
  if ('skippedVersion' in p) next.skippedVersion = str(p['skippedVersion']);
  if (Array.isArray(p['milestonesSeen'])) {
    next.milestonesSeen = p['milestonesSeen'].filter((x): x is string => typeof x === 'string').slice(-500);
  }
  return next;
}

/** "0.11.2" → "0.11". */
export function minorOf(version: string): string {
  const m = /^v?(\d+)\.(\d+)/.exec(version.trim());
  return m ? `${m[1]}.${m[2]}` : version;
}

/** How the running version relates to the last one: a feature release changes major.minor. */
export type UpdateKind = 'first-run' | 'same' | 'patch' | 'feature' | 'downgrade';

export function updateKind(previous: string | null, current: string): UpdateKind {
  if (previous === null) return 'first-run';
  const c = compareVersions(current, previous);
  if (c === 0) return 'same';
  if (c < 0) return 'downgrade';
  return minorOf(previous) === minorOf(current) ? 'patch' : 'feature';
}

/** Everything the window needs to know at launch (`app:launch`). */
export interface LaunchInfo {
  version: string;
  /** The version that last opened this board, when it differs from this one. */
  previousVersion: string | null;
  kind: UpdateKind;
  /** File name of the board copy made before this version opened it. */
  backupFile: string | null;
  /** Folder that holds the board copies. */
  backupDir: string;
  /** Board copies on disk, newest first. */
  backups: string[];
  /** How long KRNL0 was not in use before this launch; null on the first run. */
  awayMs: number | null;
  /** Epoch ms the away time started (last use); null on the first run. */
  awayFrom: number | null;
  /** This launch was faked for a preview (KRNL0_SIMULATE_* env vars). */
  simulated: boolean;
  /** "Windows 11 · x64", for feedback reports. */
  system: string;
  prefs: AppStateFile;
}

/** Backup name for the board as the previous version left it. */
export function backupFileName(previousVersion: string | null, currentVersion: string): string {
  const from = previousVersion ? `v${previousVersion}` : 'older';
  return `board-${from}-before-v${currentVersion}.json`;
}

/** Board copies to delete so only the newest `keep` remain. `files` are names with mtimes. */
export function backupsToPrune(files: ReadonlyArray<{ name: string; mtimeMs: number }>, keep = BACKUPS_KEPT): string[] {
  return [...files]
    .filter((f) => /^board-.*\.json$/.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keep)
    .map((f) => f.name);
}

/** True when the "Welcome back" catch-up should open (F12). */
export function shouldWelcomeBack(info: Pick<LaunchInfo, 'awayMs' | 'kind'>): boolean {
  return info.awayMs !== null && info.awayMs >= WELCOME_BACK_MIN_MS && info.kind !== 'first-run';
}

/** "away 4 days" / "away 2 days". */
export function describeAway(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `away ${days} day${days === 1 ? '' : 's'}`;
  const h = Math.max(1, Math.round(ms / 3_600_000));
  return `away ${h} h`;
}

/** What the sys CLI needs from main (`krnl app …`); absent in tests / headless. */
export interface AppStatePort {
  launch(): LaunchInfo | null;
  setPrefs(patch: AppPrefsPatch): AppStateFile;
}
