// App updates (Decision 36, docs/06-requirements/app-updates.md).
// Shared by main (UpdateService), the sys CLI and the renderer, so it must
// stay free of Electron and Node imports.

/**
 * How this build gets a new version:
 * - `auto`   — downloads in the background and installs on restart (Windows NSIS).
 * - `notify` — tells the user and links the release page (macOS without an
 *              Apple signature, Linux).
 */
export type UpdateMode = 'auto' | 'notify';

export type UpdateStatus =
  /** Updates are off in this build; `reason` says why. */
  | 'disabled'
  /** On, nothing checked yet. */
  | 'idle'
  | 'checking'
  | 'up-to-date'
  /** A newer version exists. Notify mode: the user downloads it from `releaseUrl`. */
  | 'available'
  /** Auto mode: the newer version is downloading (`percent`). */
  | 'downloading'
  /** Auto mode: downloaded and verified; installs on restart or on quit. */
  | 'ready'
  /** The last check or download failed (`error`). Never shown as a popup. */
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** The running app's version. */
  currentVersion: string;
  mode: UpdateMode;
  /** The newer version, once one was found. */
  latestVersion?: string;
  /** GitHub release page of `latestVersion` (release notes, manual download). */
  releaseUrl?: string;
  /** 0–100 while downloading. */
  percent?: number;
  /** Why updates are off (status `disabled`). */
  reason?: string;
  /** What went wrong (status `error`). */
  error?: string;
  /** Epoch ms of the last finished check, successful or not. */
  checkedAt?: number;
}

/** Result of an action the user (or the CLI) asked for. */
export interface UpdateActionResult {
  ok: boolean;
  message: string;
}

/** What the sys CLI needs from the updater (injected into SysFacade). */
export interface UpdaterPort {
  state(): UpdateState;
  /** Check now; resolves with the state after the check (and, in auto mode, once the download started). */
  check(): Promise<UpdateState>;
  /** Restart into a downloaded update (auto) or open the download page (notify). */
  install(): Promise<UpdateActionResult>;
  /** Open the release page of the newest version (or the releases list). */
  openRelease(): Promise<UpdateActionResult>;
}

export const RELEASES_URL = 'https://github.com/theMindDeveloper/KRNL0/releases';
export const LATEST_RELEASE_API = 'https://api.github.com/repos/theMindDeveloper/KRNL0/releases/latest';

/** First check this long after start, so it never competes with loading the board. */
export const FIRST_CHECK_DELAY_MS = 15_000;
/** Then every 4 h — well inside GitHub's 60 unauthenticated requests per hour. */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

function parseVersion(v: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.') : [],
  };
}

/**
 * SemVer order: negative when a < b, 0 when equal, positive when a > b.
 * A leading "v" is accepted (git tags). A pre-release sorts below its release
 * (1.0.0-beta < 1.0.0). Unparseable input compares as equal, so a malformed
 * tag never looks like an update.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const d = pa.core[i]! - pb.core[i]!;
    if (d !== 0) return d;
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) {
    return pb.pre.length - pa.pre.length;
  }
  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** "v0.11.0" → "0.11.0". */
export function stripV(version: string): string {
  return version.trim().replace(/^v/, '');
}

/** One plain-language line for the state — shared by Settings and the CLI. */
export function describeUpdateState(s: UpdateState, now = Date.now()): string {
  const checked = s.checkedAt !== undefined ? ` · checked ${formatAgo(now - s.checkedAt)}` : '';
  switch (s.status) {
    case 'disabled':    return `Updates are off (${s.reason ?? 'this build'})`;
    case 'idle':        return 'Not checked yet';
    case 'checking':    return 'Checking for updates…';
    case 'up-to-date':  return `Up to date${checked}`;
    case 'available':   return s.mode === 'auto'
      ? `KRNL0 ${s.latestVersion ?? ''} is available`
      : `KRNL0 ${s.latestVersion ?? ''} is out — download it from the release page`;
    case 'downloading': return `Downloading KRNL0 ${s.latestVersion ?? ''}… ${Math.round(s.percent ?? 0)}%`;
    case 'ready':       return `KRNL0 ${s.latestVersion ?? ''} is ready — restart to update`;
    case 'error':       return `Couldn't check for updates: ${s.error ?? 'unknown error'}${checked}`;
  }
}

function formatAgo(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
