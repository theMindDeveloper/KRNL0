# Releasing KRNL0

How a change gets from `main` to every installed KRNL0. Decision 36 ·
[app-updates.md](../06-requirements/app-updates.md).

**The one idea:** installed apps compare **version numbers**, not files. They check GitHub
for the newest *published* release; if its version is higher than their own, they update
(Windows: download, then install on restart; macOS/Linux: show "Download"). So every
release needs a new, higher version number, and clicking **Publish** on GitHub is the
switch that ships it.

---

## 1. Pick the version (SemVer, before 1.0)

| Change | Bump | Example | Command |
|---|---|---|---|
| **Patch:** bug fixes, small polish, copy, performance. Nothing new to learn. | patch | `0.10.0 → 0.10.1` | `npm version patch --no-git-tag-version` |
| **Feature release:** new features, new node kinds, visible redesigns, board-schema changes. | minor | `0.10.3 → 0.11.0` | `npm version minor --no-git-tag-version` |
| **Pre-release** for testers only (optional). Never offered to normal installs. | prerelease | `0.11.0-beta.1` | `npm version prerelease --preid beta --no-git-tag-version` |

Rules:
- **Never reuse a version, and never move a tag.** Re-releasing a different build as the same
  version never reaches installed apps (they think they're up to date), and a mismatched
  `latest.yml` makes Windows reject the download (sha512 check). A fix to a release is the
  next patch.
- **Never hand-upload an installer** to a release without the `latest.yml` and `.blockmap`
  from the *same* build. CI uploads all three together; let it.
- `1.0.0` is a deliberate decision (stable board format, public launch), not just "the next one".

## 2. Release PR (Workflow B is fine for a pure release)

On a branch `chore/release-vX.Y.Z`:

1. `npm version <patch|minor> --no-git-tag-version` — bumps `package.json` and
   `package-lock.json`. The status bar, `krnl version` and the updater all read this number.
2. `CHANGELOG.md` — new `## [X.Y.Z] — YYYY-MM-DD` section (Added / Fixed).
3. `docs/releases/vX.Y.Z.md` — the user-facing notes. CI uses this file as the GitHub
   release body, and the app's **What's new** opens that page. Write it for people planning
   their day, not for developers.
4. `docs/08-history/HISTORY.md` — a `Type: Release` entry (AGENTS.md rule 2).
5. `npm run typecheck` and `npm test` green. Merge the PR.

## 3. Tag `main` and let CI build

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

`.github/workflows/release.yml` then:
- fails at once if the tag isn't `v` + `package.json`'s version;
- typechecks, tests, builds Windows (NSIS, on `windows-2022`) and macOS (arm64 DMG);
- creates a **draft** release `vX.Y.Z` with `KRNL0-Setup-X.Y.Z.exe`, its `.blockmap`,
  `latest.yml`, the `.dmg` and its blockmap, and the notes from `docs/releases/vX.Y.Z.md`.

Watch it with `gh run watch` (or the Actions tab). A red build means nothing was published.
Fix it on `main`, then delete the tag (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`)
and tag again. That's the one time re-tagging is fine: nothing was published yet.

## 4. Check the draft, then Publish

1. Open the draft on GitHub. Check that the assets are there, **including `latest.yml`**, and
   that the notes read well.
2. Optional smoke test: download the `.exe` and install it over your current install.
3. Click **Publish release**.

Within ~4 h (or right away with Settings → Updates → **Check now**, or `krnl update check`)
every running Windows install downloads it and shows *"KRNL0 X.Y.Z is ready — Restart"*;
macOS/Linux show *"is out — Download"*. Apps that are closed pick it up on their next start.

**Pulling a bad release:** mark it as a draft again (or delete it) on GitHub. Apps stop
being offered it at once. Apps that already downloaded it will still install it, so ship
the fix as the next patch quickly. Never "fix" it under the same version.

---

## First release with the updater

Apps on **v0.10.0 or older have no updater**. The first updater-enabled version (`0.10.1`
or `0.11.0`) has to be installed by hand once, the old way. From then on every published
release arrives by itself. The first *automatic* update can be seen only once a second
updater-enabled version is published.

## Platform notes

- **Windows:** unsigned installers show SmartScreen ("Windows protected your PC → More info →
  Run anyway") on the *first manual* install only; updates install silently. Signing (an
  Authenticode certificate, or free SignPath for open source) removes it: add
  `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets. No code change.
- **macOS:** notify-only. Real auto-update needs an Apple Developer ID ($99/yr) + notarisation
  (`MAC_CSC_LINK`, `APPLE_ID`, … secrets), a `zip` target next to the `dmg` (Squirrel.Mac
  installs from the zip; electron-builder then writes `latest-mac.yml`), and switching the
  macOS backend in `src/main/updater/index.ts` to electron-updater.
- **Dev builds and worktrees never update** (`app.isPackaged`, `KRNL0_USER_DATA`).
  `KRNL0_UPDATES=notify npm run dev` runs the notify-only check against the real releases,
  to see the flow; `KRNL0_DISABLE_UPDATES=1` turns it off in an installed build.

## Board compatibility (every release)

An update replaces the app, never the board (`~/Documents/krnl0`). A new version must open
every older `board.json`: schema changes need a migration in
`src/main/persistence/board.ts` plus a test in `tests/unit/main/` (see the
`*-migration.test.ts` files). There is no downgrade path, so a newer board format must not
make the app before it lose data silently.
