# Microsoft Store distribution

A second way to install KRNL0 on Windows, next to the GitHub installer. Branch `feat/microsoft-store`. Status: **in progress** (code ready, package not yet built and tested on a signed install, Store account not yet created).

## Functional Requirements

- **F1** `npm run package:store` builds a Store package (`.appx`) with `electron-builder.store.json`, which extends `electron-builder.json` and has no publish target. The GitHub release build is unchanged.
- **F2** A Store package never runs the GitHub updater. `chooseBackend` returns `disabled` ("updated by the Microsoft Store") when Electron reports `process.windowsStore`. The Store updates the app.
- **F3** Direct installs (NSIS, dmg, AppImage) keep updating exactly as in Decision 36.
- **F4** The Store package carries the same version as `package.json` and is submitted for the same release.
- **F5** Terminal node (node-pty), the bundled `claude/` and `bin/` files, and the board folder (`~/Documents/krnl0`) work inside the Store package.

## Non-Functional Requirements

- **NF1** Microsoft signs Store packages; no code-signing certificate is bought.
- **NF2** The package identity values come from Partner Center and are not guessed (placeholders in `electron-builder.store.json` must be replaced before a real build).

## Use Cases

- **UC-K1** A user installs KRNL0 from the Microsoft Store and gets updates through the Store.
- **UC-K2** A user installs from GitHub as before and gets in-app updates.

## Gherkin Scenarios (ATDD)

```
Feature: Store builds do not self-update
  Scenario: F2 — packaged Store build
    Given the app runs as a Microsoft Store package
    When the updater starts
    Then updates are disabled with the reason "updated by the Microsoft Store"

  Scenario: F3 — normal Windows installer
    Given a packaged Windows build that is not a Store package
    When the updater starts
    Then the NSIS updater is used
```

F2 and F3 are covered in `tests/unit/main/updater.backends.test.ts`.

## Still to do

- [x] Partner Center developer account (individual, free at sign-up on 2026-11-22), identity verified by the owner.
- [x] App name "KRNL0" reserved (Store ID 9NP2NNSWW7QQ). **Submit within 3 months (by 2027-02-22) or the name is released.**
- [x] Identity name, publisher id and publisher display name are in `electron-builder.store.json`.
- [x] Build the `.appx` (`npm run package:store`): built `KRNL0-Store-0.15.0.appx` (75 MB); manifest checked (identity, version `0.15.0.0`, `runFullTrust`). node-pty's native files and `OpenConsole.exe` are unpacked outside the asar, as needed. On the dev PC the cached `makeappx.exe` was broken by stale files; a clean tool folder fixes it (see RELEASING.md).
- [ ] Install the package locally (test signing, F5): terminal, board folder, CLI.
- [ ] Store listing: description, screenshots, age rating, privacy policy URL.
- [x] Store step added to `docs/releases/RELEASING.md` (train step 12 + "Microsoft Store build" section) and AGENTS.md rule 11.
- [ ] Add a Store line to `scripts/release.mjs` (`npm run release -- status`) so the train reminds the agent.
- [ ] Rebuild the package from the final tag of the owner's big update; it must be that version, not 0.15.0.

## Audit: what could break in a Store package

Checked in code (2026-11-22):

| Area | Finding |
|---|---|
| Board folder `~/Documents/krnl0` | Not redirected by MSIX (only AppData is). OK. |
| `krnl` CLI | Works only inside KRNL0's own terminal through env vars and a named pipe (`\.\pipe\krnl0-<pid>`), no files on disk. OK. |
| Terminal (node-pty) | Native files and `OpenConsole.exe` ship unpacked. Needs a real run on a signed install (still to test). |
| Updater | Off in Store builds (F2). Reason text: "this copy is updated by the Microsoft Store". |
| Windows app id (AUMID) | **Fixed:** `setAppUserModelId` is skipped in a Store package (it would clash with the package identity and split the taskbar icon and notifications). |
| User data (`app.getPath('userData')`) | Lives under AppData, so MSIX keeps it in a private per-app folder. Fine for the app; other programs cannot read it. |
| Store policy | Needs a privacy policy URL (the app talks to the owner's sync server), an age rating, and screenshots. No in-app update or download prompts in the Store build. |
