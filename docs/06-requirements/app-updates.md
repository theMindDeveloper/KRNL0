# App updates — update notice and auto-update from GitHub Releases

Decision 36. Code: `src/main/updater/`, `src/shared/update.ts`, `src/sys/commands/update.ts`,
`src/renderer/store/updateStore.ts`, `src/renderer/components/ui/UpdateNoticeBar.tsx`.
Release process: [docs/releases/RELEASING.md](../releases/RELEASING.md).

Users should never have to visit GitHub, uninstall and reinstall to get a new version. The
installed app finds new releases on GitHub by itself, tells the user, and on Windows installs
them on restart. It costs nothing: GitHub Releases host the files, `electron-updater` does
the download and install.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Finds new releases by itself.** An installed app checks GitHub Releases ~15 s after start and every 4 h while it runs. Only *published* releases count: drafts and pre-releases are never offered. A version is newer by SemVer (`0.10.1 > 0.10.0`, `0.11.0 > 0.10.9`). |
| F2 | **Windows: download in the background, install on restart.** When a newer release exists, the installer is downloaded quietly (differential with the blockmap when possible) and checked against the release's sha512. When it is ready the user sees *"KRNL0 0.11.0 is ready — Restart to update · Later"*. **Restart** installs silently and reopens the app. **Later** hides the notice; the update installs by itself the next time the app quits. |
| F3 | **macOS / Linux: tell the user, link the download.** Without a paid Apple signing certificate the app can't replace itself, so it shows *"KRNL0 0.11.0 is out — Download · Later"*. **Download** opens the release page in the browser. |
| F4 | **The status bar shows it.** The version item reads `v0.10.0` normally, `v0.10.0 · ↓ 42%` while downloading, and `v0.10.0 → 0.11.0` (accent colour, clickable) once an update is ready or out. Clicking it does what the notice's main button does. |
| F5 | **Settings → Updates.** Shows the current version and the update state in plain words ("Up to date · checked 5 min ago", "0.11.0 ready — restart to update", "Couldn't reach GitHub"), with **Check now** and, when relevant, **Restart to update** / **Download** and **What's new** (opens the release page). |
| F6 | **Every update action has a CLI command** (AGENTS.md rule 8): `krnl update status [--json]`, `krnl update check [--json]`, `krnl update install`, `krnl update open`. |
| F7 | **Nothing is lost on restart.** Before installing, the open window commits an in-progress edit (blurs the focused field) and saves the camera. The board itself is saved on every change already, and it lives outside the install folder (`~/Documents/krnl0`), so the installer never touches it. When the install is started from the terminal, the reply is sent before the app quits. |
| F8 | **Off where it must be off.** No checks in a development build (`npm run dev`, every worktree — rule 10), when `KRNL0_USER_DATA` is set (an isolated data folder), or when `KRNL0_DISABLE_UPDATES=1`. The state then reads `disabled` with the reason. `KRNL0_UPDATES=notify` forces the notify-only check in any build (for trying the flow against the real GitHub releases). |
| F9 | **Quiet when offline.** A failed background check (offline, GitHub down, rate limit) never shows a notice or a dialog; it is only reported in Settings, the CLI and the log, and the next scheduled check tries again. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | **Free.** Only GitHub Releases on the public repo and the unauthenticated GitHub API (60 requests/h per IP; we use ≤ 1 per 4 h). No token ships in the app. |
| NF2 | **Integrity.** Windows updates are accepted only if their sha512 matches the `latest.yml` of the same release, over HTTPS. A signing certificate (later) adds publisher verification on top; nothing in the code has to change for it. |
| NF3 | **Testable without Electron.** The state machine (`UpdateService`) takes its backend and timers as arguments; unit tests drive it with fakes. |
| NF4 | **One state, many views.** Main owns the update state and pushes every change to the window; the window also pulls it on mount (an update can be ready before the window exists). |

## Use Cases

- **UC-U1 — Patch arrives (Windows).** The maintainer publishes v0.10.1. The user's running app finds it, downloads it, and shows "ready". The user keeps working, clicks **Restart** at a good moment; the app reopens on 0.10.1 with the same board.
- **UC-U2 — User says Later.** The notice is dismissed. The user quits KRNL0 at the end of the day; the installer runs silently on quit; tomorrow the app opens on the new version.
- **UC-U3 — Mac user.** The app shows "0.11.0 is out — Download". The browser opens the release page; the user installs the new `.dmg`.
- **UC-U4 — Assistant in the terminal.** "Is there an update?" → `krnl update check` → "KRNL0 0.11.0 is ready — run `krnl update install` to restart into it."
- **UC-U5 — Offline.** No notice, no error popup. Settings says "Couldn't reach GitHub", Check now retries.

## User Stories

- As a user, I want new versions to arrive by themselves, so that I never reinstall by hand.
- As a user, I want to choose when the app restarts, so that an update never interrupts a focus session.
- As the maintainer, I want publishing a GitHub release to be the one switch that ships an update, so that I can review a build before anyone gets it.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: App updates

  Scenario: F1 — only a newer version counts
    Given the app is version 0.10.0
    When GitHub's latest release is 0.10.0
    Then the update state is "up-to-date"
    When GitHub's latest release is 0.10.1
    Then an update to 0.10.1 is found

  Scenario: F2 — Windows downloads, then offers a restart
    Given the app runs on Windows with auto-install
    When a check finds 0.11.0
    Then the state becomes "downloading" and then "ready" for 0.11.0
    And the notice offers "Restart" and "Later"

  Scenario: F2 — the same ready update is not downloaded twice
    Given 0.11.0 is ready
    When the next scheduled check finds 0.11.0 again
    Then nothing is downloaded and the state stays "ready"

  Scenario: F3 — notify-only platforms link the download
    Given the app runs on macOS
    When a check finds 0.11.0
    Then the state is "available" with the release page URL
    And nothing is downloaded

  Scenario: F6 — the CLI reads and drives the same state
    When the user runs "krnl update status --json"
    Then it prints the current update state as JSON
    When the user runs "krnl update install" and an update is ready
    Then it replies before the app restarts

  Scenario: F7 — restart saves first
    Given an update is ready
    When the install starts
    Then the window is asked to commit edits and save the camera before the app quits

  Scenario: F8 — development builds never check
    Given the app is not packaged
    Then the update state is "disabled" with reason "development build"
    And no request is made

  Scenario: F9 — a failed background check stays quiet
    Given the app is offline
    When the scheduled check fails
    Then the state is "error" with a message
    And no notice is shown
    And a later check runs on schedule
```

## Acceptance checklist

- [x] F1 — SemVer compare, drafts/pre-releases excluded (GitHub `releases/latest`; electron-updater `allowPrerelease = false`)
- [x] F2 — NSIS backend: background download, silent install + relaunch, install on quit
- [x] F3 — GitHub notify backend for macOS / Linux
- [x] F4 — status bar version item
- [x] F5 — Settings → Updates
- [x] F6 — `krnl update status|check|install|open`
- [x] F7 — flush before install; CLI reply before quit
- [x] F8 — disabled in dev / isolated data / env switch; `KRNL0_UPDATES=notify`
- [x] F9 — background errors stay out of the notice
- [ ] End-to-end on a real install — possible only once two updater-enabled releases are published (see RELEASING.md → "First release with the updater")
