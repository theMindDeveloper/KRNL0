// The server's update state as the app sees it (server-updates F1–F6, Decision 52).
// Read from GET /api/v1/server → `update`. Tolerant: a 0.1.0 server sends the
// check without a channel, and anything unexpected reads as "nothing to show".

const RELEASES = 'https://github.com/theMindDeveloper/krnl0-server/releases/latest/download';
export const DOCKER_INSTALL = `curl -fsSL ${RELEASES}/docker.sh | sh`;
export const DOCKER_INSTALL_WINDOWS = `irm ${RELEASES}/docker.ps1 | iex`;
export const LINUX_INSTALL = `curl -fsSL ${RELEASES}/install.sh | sh`;

export type UpdateChannel = 'one-click' | 'command' | 'none';
export type JobState = 'idle' | 'running' | 'done' | 'failed' | 'rolled-back';
export type JobStep = 'backup' | 'download' | 'verify' | 'switch' | 'health' | 'rollback' | 'restore';

export interface ServerUpdateJob {
  state: JobState;
  step: JobStep | null;
  from: string | null;
  to: string | null;
  message: string | null;
  at: string;
  auto: boolean;
}

export interface ServerUpdate {
  current: string;
  latest: string | null;
  available: boolean;
  url: string | null;
  channel: UpdateChannel;
  /** What to run on the server when it can't update itself; Linux/macOS form first. */
  command: string | null;
  commandWindows: string | null;
  commandLinux: string | null;
  reason: string | null;
  auto: boolean;
  job: ServerUpdateJob | null;
  /** The newest server release needs at least this KRNL0 (null: no need). */
  minApp: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length < 2000 ? v : null);
const STATES: readonly JobState[] = ['idle', 'running', 'done', 'failed', 'rolled-back'];
const STEPS: readonly JobStep[] = ['backup', 'download', 'verify', 'switch', 'health', 'rollback', 'restore'];

/** `update` from GET /api/v1/server, or null when the server sends nothing usable. */
export function readServerUpdate(raw: unknown): ServerUpdate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const u = raw as Record<string, unknown>;
  const current = str(u.current);
  if (!current) return null;
  const channel: UpdateChannel = u.channel === 'one-click' || u.channel === 'command' || u.channel === 'none' ? u.channel : 'command';
  const old = u.channel === undefined; // a 0.1.0 server: it can't update itself yet
  const j = typeof u.job === 'object' && u.job !== null ? (u.job as Record<string, unknown>) : null;
  const job: ServerUpdateJob | null = j && STATES.includes(j.state as JobState)
    ? {
      state: j.state as JobState,
      step: STEPS.includes(j.step as JobStep) ? (j.step as JobStep) : null,
      from: str(j.from), to: str(j.to), message: str(j.message), at: str(j.at) ?? '', auto: j.auto === true,
    }
    : null;
  return {
    current,
    latest: str(u.latest),
    available: u.available === true,
    url: str(u.url),
    channel,
    command: old ? DOCKER_INSTALL : str(u.command),
    commandWindows: old ? DOCKER_INSTALL_WINDOWS : str(u.commandWindows),
    commandLinux: old ? LINUX_INSTALL : null,
    reason: old ? 'This server version can not update itself yet. Run this once on the server: it keeps your data and adds the updater, so later updates are one click.' : str(u.reason),
    auto: u.auto === true,
    job,
    minApp: str(u.minApp),
  };
}

/** -1, 0, 1 for X.Y.Z versions. */
export function compareVersions(a: string, b: string): number {
  const p = (v: string): number[] => v.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** This KRNL0 is older than the newest server release needs (F5). */
export function needsNewerApp(u: ServerUpdate, appVersion: string): boolean {
  return !!u.minApp && compareVersions(appVersion, u.minApp) < 0;
}

/** Plain words for a step, as the drafts show them. */
export const STEP_WORDS: Record<JobStep, string> = {
  backup: 'Making a backup',
  download: 'Downloading',
  verify: 'Checking the signature',
  switch: 'Restarting',
  health: 'Waiting for it to answer',
  rollback: 'Going back',
  restore: 'Restoring the backup',
};

export interface ServerUpdateResult { ok: boolean; message: string | null; update: ServerUpdate | null }
