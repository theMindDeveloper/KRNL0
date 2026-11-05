// UpdateService — the one update state machine (Decision 36).
//
// Knows nothing about Electron: the backend (electron-updater on Windows, the
// GitHub API elsewhere), the timers and the "save before restart" hook are
// passed in, so tests drive it with fakes (app-updates.md NF3).
//
//   idle ─check→ checking ─┬→ up-to-date
//                          ├→ available            (notify mode)
//                          ├→ downloading → ready  (auto mode)
//                          └→ error                (quiet; next check retries)

import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  RELEASES_URL,
  isNewerVersion,
  stripV,
} from '../../shared/update';
import type {
  UpdateActionResult,
  UpdateMode,
  UpdaterPort,
  UpdateState,
} from '../../shared/update';

/** What a backend found: the newest published release. */
export interface ReleaseInfo {
  version: string;
  releaseUrl: string;
}

export interface UpdateBackend {
  readonly mode: UpdateMode;
  /** The newest published release (drafts and pre-releases excluded). */
  latest(): Promise<ReleaseInfo>;
  /** Auto mode: download the release `latest()` just found. */
  download?(onProgress: (percent: number) => void): Promise<void>;
  /** Auto mode: quit, install the downloaded update silently, relaunch. */
  quitAndInstall?(): void;
}

export interface UpdateServiceOptions {
  currentVersion: string;
  /** Null = updates are off in this build; `disabledReason` says why. */
  backend: UpdateBackend | null;
  disabledReason?: string;
  /** Opens a URL in the user's browser. */
  openExternal: (url: string) => Promise<void>;
  /** Asks the open window to commit edits and save before the app quits. */
  beforeInstall?: () => Promise<void>;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
  log?: (message: string) => void;
  /** Delay between answering an install request and quitting, so a CLI reply reaches the terminal. */
  installDelayMs?: number;
}

export class UpdateService implements UpdaterPort {
  private current: UpdateState;
  private readonly listeners = new Set<(s: UpdateState) => void>();
  private inFlight: Promise<UpdateState> | null = null;
  private timers: unknown[] = [];
  private installing = false;

  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private readonly setIntervalFn: (fn: () => void, ms: number) => unknown;
  private readonly clearTimerFn: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(private readonly opts: UpdateServiceOptions) {
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimerFn = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[updater] ${m}`));
    const mode = opts.backend?.mode ?? 'notify';
    this.current = opts.backend
      ? { status: 'idle', currentVersion: opts.currentVersion, mode }
      : {
          status: 'disabled',
          currentVersion: opts.currentVersion,
          mode,
          reason: opts.disabledReason ?? 'not available in this build',
        };
  }

  state(): UpdateState {
    return { ...this.current };
  }

  /** Called with every new state (main forwards it to the window). */
  subscribe(listener: (s: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Schedule the first check shortly after start, then one every 4 h (F1). */
  start(): void {
    if (!this.opts.backend) return;
    this.timers.push(this.setTimeoutFn(() => { void this.check(); }, FIRST_CHECK_DELAY_MS));
    this.timers.push(this.setIntervalFn(() => { void this.check(); }, CHECK_INTERVAL_MS));
  }

  stop(): void {
    for (const t of this.timers) this.clearTimerFn(t);
    this.timers = [];
  }

  /**
   * Check GitHub for a newer release. Concurrent calls share one check. In
   * auto mode a found update starts downloading; the promise resolves once
   * the state says so ('downloading'), not when the download ends.
   */
  check(): Promise<UpdateState> {
    const backend = this.opts.backend;
    if (!backend) return Promise.resolve(this.state());
    // Downloading or installing: the answer is already known.
    if (this.current.status === 'downloading' || this.installing) return Promise.resolve(this.state());
    if (this.inFlight) return this.inFlight;

    const before = this.current;
    this.set({ ...this.base(), status: 'checking' });

    this.inFlight = (async () => {
      try {
        const release = await backend.latest();
        const version = stripV(release.version);
        const checkedAt = this.now();
        if (!isNewerVersion(version, this.opts.currentVersion)) {
          this.set({ ...this.base(), status: 'up-to-date', checkedAt });
          return this.state();
        }
        // Already downloaded this one (F2): keep it, don't fetch it twice.
        if (before.status === 'ready' && before.latestVersion === version) {
          this.set({ ...before, checkedAt });
          return this.state();
        }
        if (backend.mode === 'notify' || !backend.download) {
          this.set({ ...this.base(), status: 'available', latestVersion: version, releaseUrl: release.releaseUrl, checkedAt });
          return this.state();
        }
        this.startDownload(backend, version, release.releaseUrl, checkedAt);
        return this.state();
      } catch (err) {
        const message = errorMessage(err);
        this.log(`check failed: ${message}`);
        // A downloaded update stays installable even if a later check fails (F9).
        if (before.status === 'ready') {
          this.set({ ...before, checkedAt: this.now() });
        } else {
          this.set({ ...this.base(), status: 'error', error: message, checkedAt: this.now() });
        }
        return this.state();
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Restart into the downloaded update (auto) or open the download page (notify). */
  async install(): Promise<UpdateActionResult> {
    const s = this.current;
    if (s.status === 'available' && s.mode === 'notify') {
      return this.openRelease();
    }
    if (s.status !== 'ready') {
      return { ok: false, message: `No update is ready to install (${s.status}). Run "krnl update check" first.` };
    }
    const backend = this.opts.backend;
    if (!backend?.quitAndInstall) {
      return { ok: false, message: 'This build cannot install updates by itself.' };
    }
    if (this.installing) {
      return { ok: true, message: `Already restarting into KRNL0 ${s.latestVersion ?? ''}.` };
    }
    this.installing = true;
    try {
      await this.opts.beforeInstall?.();
    } catch (err) {
      // Saving is best-effort: the board is saved on every change already.
      this.log(`beforeInstall failed: ${errorMessage(err)}`);
    }
    // Reply first, quit a moment later (F7): the terminal that ran
    // "krnl update install" dies with the app.
    this.setTimeoutFn(() => {
      try {
        backend.quitAndInstall!();
      } catch (err) {
        this.installing = false;
        this.log(`quitAndInstall failed: ${errorMessage(err)}`);
        this.set({ ...this.base(), status: 'error', error: errorMessage(err), checkedAt: this.now() });
      }
    }, this.opts.installDelayMs ?? 1200);
    return { ok: true, message: `Restarting into KRNL0 ${s.latestVersion ?? ''}…` };
  }

  async openRelease(): Promise<UpdateActionResult> {
    const url = this.current.releaseUrl ?? RELEASES_URL;
    try {
      await this.opts.openExternal(url);
      return { ok: true, message: `Opened ${url}` };
    } catch (err) {
      return { ok: false, message: `Couldn't open ${url}: ${errorMessage(err)}` };
    }
  }

  private startDownload(backend: UpdateBackend, version: string, releaseUrl: string, checkedAt: number): void {
    this.set({ ...this.base(), status: 'downloading', latestVersion: version, releaseUrl, percent: 0, checkedAt });
    let lastPercent = -1;
    void backend.download!((percent) => {
      const p = Math.max(0, Math.min(100, Math.floor(percent)));
      // One update per whole percent — the window doesn't need 50 events a second.
      if (p === lastPercent || this.current.status !== 'downloading') return;
      lastPercent = p;
      this.set({ ...this.current, percent: p });
    }).then(
      () => {
        this.log(`downloaded ${version}`);
        this.set({ ...this.base(), status: 'ready', latestVersion: version, releaseUrl, checkedAt });
      },
      (err: unknown) => {
        const message = errorMessage(err);
        this.log(`download failed: ${message}`);
        this.set({ ...this.base(), status: 'error', error: `download failed: ${message}`, latestVersion: version, releaseUrl, checkedAt: this.now() });
      },
    );
  }

  private base(): Pick<UpdateState, 'currentVersion' | 'mode'> {
    return { currentVersion: this.current.currentVersion, mode: this.current.mode };
  }

  private set(next: UpdateState): void {
    this.current = next;
    const snapshot = this.state();
    for (const l of this.listeners) {
      try { l(snapshot); } catch (err) { this.log(`listener failed: ${errorMessage(err)}`); }
    }
  }
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // electron-updater errors can carry whole HTTP bodies; one line is enough.
  const line = raw.split('\n')[0] ?? raw;
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
