// Update backends (Decision 36).
//
// - NSIS (Windows): electron-updater reads `latest.yml` from the newest
//   published GitHub release, downloads the installer (differential via the
//   blockmap), checks its sha512, and installs it silently on restart/quit.
// - GitHub notify (macOS, Linux): Squirrel.Mac won't install into an app
//   without an Apple Developer ID signature, so these builds only ask
//   GitHub's API for the latest release and link its page.
//
// electron-updater is imported lazily: dev builds, tests and the notify
// path never load it.

import { LATEST_RELEASE_API, RELEASES_URL, stripV } from '../../shared/update';
import type { ReleaseInfo, UpdateBackend } from './UpdateService';

type ElectronUpdaterModule = typeof import('electron-updater');
type AppUpdater = ElectronUpdaterModule['autoUpdater'];

export function releasePageUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${stripV(version)}`;
}

/**
 * electron-updater is CommonJS and defines `autoUpdater` with a getter. Loaded
 * through `import()` (the bundled main process keeps a real dynamic import),
 * Node does not see that getter as a named export: `mod.autoUpdater` is
 * undefined and the object is on `mod.default`. v0.10.1 and v0.11.0 read
 * `mod.autoUpdater` and every check failed with "Cannot set properties of
 * undefined (setting 'autoDownload')" — no install could update itself.
 */
export function pickAutoUpdater(mod: unknown): AppUpdater {
  const m = mod as { autoUpdater?: AppUpdater; default?: { autoUpdater?: AppUpdater } } | null;
  const u = m?.autoUpdater ?? m?.default?.autoUpdater;
  if (!u) throw new Error('electron-updater did not load (no autoUpdater)');
  return u;
}

export function createNsisBackend(log: (m: string) => void): UpdateBackend {
  let loaded: Promise<AppUpdater> | null = null;
  const updater = (): Promise<AppUpdater> => {
    loaded ??= import('electron-updater').then((mod) => {
      const u = pickAutoUpdater(mod);
      // We decide when to download (UpdateService), never electron-updater.
      u.autoDownload = false;
      // "Later" still gets the update: installed silently when the app quits (F2).
      u.autoInstallOnAppQuit = true;
      u.allowPrerelease = false;
      u.allowDowngrade = false;
      u.logger = {
        info: (m?: unknown) => log(String(m)),
        warn: (m?: unknown) => log(`warn: ${String(m)}`),
        error: (m?: unknown) => log(`error: ${String(m)}`),
        debug: () => { /* too chatty */ },
      };
      return u;
    });
    return loaded;
  };

  return {
    mode: 'auto',
    async latest(): Promise<ReleaseInfo> {
      const u = await updater();
      const result = await u.checkForUpdates();
      if (!result) throw new Error('the updater is not active in this build');
      const version = stripV(result.updateInfo.version);
      return { version, releaseUrl: releasePageUrl(version) };
    },
    async download(onProgress: (percent: number) => void): Promise<void> {
      const u = await updater();
      const onEvent = (p: { percent: number }): void => onProgress(p.percent);
      u.on('download-progress', onEvent);
      try {
        await u.downloadUpdate();
      } finally {
        u.removeListener('download-progress', onEvent);
      }
    },
    quitAndInstall(): void {
      if (!loaded) throw new Error('no update was downloaded');
      void loaded.then((u) => {
        // isSilent: no installer wizard; isForceRunAfter: reopen KRNL0 after.
        u.quitAndInstall(true, true);
      });
    },
  };
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const FETCH_TIMEOUT_MS = 15_000;

export function createGithubNotifyBackend(fetchFn: FetchLike): UpdateBackend {
  return {
    mode: 'notify',
    async latest(): Promise<ReleaseInfo> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await fetchFn(LATEST_RELEASE_API, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'KRNL0-updater',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new Error('GitHub did not answer in time');
        throw new Error(`couldn't reach GitHub (${err instanceof Error ? err.message : String(err)})`);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 404) throw new Error('no published release yet');
      if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached — will try again later');
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
      // releases/latest never returns drafts or pre-releases; guard anyway.
      if (body.draft === true || body.prerelease === true) throw new Error('latest release is not published');
      if (typeof body.tag_name !== 'string' || body.tag_name.trim() === '') throw new Error('GitHub release has no tag');
      const version = stripV(body.tag_name);
      const releaseUrl = typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/')
        ? body.html_url
        : releasePageUrl(version);
      return { version, releaseUrl };
    },
  };
}
