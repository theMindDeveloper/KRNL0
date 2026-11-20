# Updating your KRNL0 server from the app, and releases that keep both in step

*ADR: [Decision 52](../03-architecture/decisions.md). Server side: [theMindDeveloper/krnl0-server](https://github.com/theMindDeveloper/krnl0-server) `docs/requirements/server.md` F24–F32 and its Decisions S12–S13.*

The desktop app updates itself; the server does not. The website a server serves is the KRNL0 version built into that server release. This doc makes the server as easy to keep current as the app: the app tells the owner when the server has a new version, updates it with one click when the server can, and every KRNL0 release prepares the matching server release.

## How versions relate (the mental model)

- **The server stores boards sealed.** It reads only a board's format number (`schemaVersion`). Most app releases add features without changing the format; they need no server update to keep syncing.
- **The website is a copy inside the server.** A phone sees the newer features only after the server is updated.
- **Board format changes** (rare): the newer board is never overwritten by an older KRNL0; the older website stops syncing that board and says "update needed".
- **Protocol changes** (very rare): sync pauses with "update the server" or "update KRNL0"; edits wait on each device.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Notice.** When the connected server reports a newer server release (`GET /api/v1/server` → `update.available`), the app and the website show it in the place the owner picks from the drafts (*Update A*: the saved badge's menu; *Update B*: Settings › Server), with the current and new version and a link to the notes. Nothing appears for a server that is up to date or when sync is off. |
| F2 | **One click.** When the server reports `update.channel = 'one-click'`, the notice has **Update server**: the owner types the server password (and the 2FA code when on), the app sends `POST /api/v1/server/update`, and shows the steps (backup, download and signature, restarting, back online). Sync pauses meanwhile; edits wait and go when the server is back. |
| F3 | **Result.** Done: the new version and "saved · synced". Failed or rolled back: the server's plain reason, "Nothing was lost", Try again and Report it. |
| F4 | **Command instead.** When the server can't update itself (`channel = 'command'`: plain `docker run`, a pinned version, an install without the helper, a 0.1.0 server), the notice shows the one command to run on the server with a Copy button. 0.1.0 servers report no channel; the app treats them as `command` with the Docker one-command installer. |
| F5 | **Update KRNL0 first.** When the newest server release needs a newer KRNL0 (`update.minApp` above this app's version), the notice says so before the owner updates, offers **Update KRNL0** (the app's own updater) and still allows "Update server anyway". |
| F6 | **At night.** A switch "Update by itself at night" (off unless the owner turns it on) sends `PUT /api/v1/server/update/auto` with the password. After a night update, one line says "Updated last night to X" for a day. |
| F7 | **Owner only.** The update and the switch need the server password every time; a stolen session or device token alone can't start an update. Login limits apply on the server. |
| F8 | **CLI.** `krnl server status` (versions, how it updates, the job), `krnl server update` (opens the update sheet; the password is never typed into the terminal). |
| F9 | **An older KRNL0 keeps what it doesn't know.** Loading, editing and saving a board keeps fields, items and window kinds it has never seen, so a website one version behind never deletes what a newer app added (merge reads a missing key as deleted). Tested on the real store actions (`tests/unit/shared/sync/unknownFields.test.ts`). A window kind it doesn't know shows as a quiet card "Made in a newer KRNL0", never a crash. |
| F10 | **Release train.** `npm run release` (scripts/release.mjs) walks the whole release: release PR, tag, CI, draft checks, Publish (after the owner's OK), then starts the server's `follow-krnl0.yml`, which opens the matching server release PR. [docs/releases/RELEASING.md](../releases/RELEASING.md) lists every step for any agent. No paid GitHub feature. |
| F11 | **A tutorial step.** The *Saved and synced* tour shows where server updates appear, with voice. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | The password is sent only to the connected, pinned server over its encrypted connection and never stored. |
| NF2 | The notice never blocks work: no modal on start, no badge colour change for an update alone (a small dot). |
| NF3 | A server that does not answer `update` (older) is handled without errors. |

## Use Cases

- **UC-U1:** The owner sees "server 0.2.0 is out", clicks Update server, types the password, and a minute later the badge is back to "saved · synced" on 0.2.0.
- **UC-U2:** The update fails to start; the server is back on 0.1.0, the app says "Nothing was lost" with the reason.
- **UC-U3:** The server runs plain `docker run`; the app shows the one-command installer to copy. After running it once, updates are one click.
- **UC-U4:** KRNL0 0.15 is published; the release script starts the server's follow workflow, a server release PR appears, the owner merges it and presses Publish; updaters pick it up.

## User Stories

- As an owner, I want to see in the app when my server has an update, so that I never have to check.
- As an owner, I want to update my server with one click and my password, so that keeping it current is as easy as the app.
- As an owner, I want to be told when my computers need a newer KRNL0 first, so that nothing stops syncing by surprise.
- As the developer, I want one script and one guide for a release, so that every release updates the app, the server and the website the same way.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Notice (F1)
  Scenario: Server behind
    Given the connected server reports update.available with latest 0.2.0
    Then the update appears with "0.2.0" in the chosen place
  Scenario: Server up to date or older than the field
    Given the server reports no update or no update field
    Then nothing appears and nothing fails

Feature: One click (F2, F3, F7)
  Scenario: Update succeeds
    Given update.channel is one-click
    When the owner types the password and presses Update server
    Then the app sends the update and shows the steps until the server reports done
  Scenario: Wrong password
    Then the app shows "Wrong password" and the server is not updated
  Scenario: Rolled back
    Given the server reports the job rolled back with a reason
    Then the app shows "Nothing was lost" and the reason

Feature: Command instead (F4)
  Scenario: Plain docker run
    Given update.channel is command with a command
    Then the app shows that command with Copy and no Update button

Feature: Update KRNL0 first (F5)
  Scenario: Server needs a newer app
    Given update.minApp is above this app's version
    Then the notice offers Update KRNL0 first and Update server anyway

Feature: An older KRNL0 keeps what it doesn't know (F9)
  Scenario: Edits keep unknown details
    Given a board with fields, items and a window kind this KRNL0 does not know
    When the owner ticks, renames, adds and moves things
    Then every unknown field, item field and window is still in the saved board
```
