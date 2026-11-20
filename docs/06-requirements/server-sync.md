# Sync with your own KRNL0 server (desktop app and website)

*ADR: [Decision 51](../03-architecture/decisions.md). Server: [theMindDeveloper/krnl0-server](https://github.com/theMindDeveloper/krnl0-server) — its `docs/architecture/sync.md` is the state machine and failure table this doc relies on, `protocol.md` the wire format.*

The owner runs a KRNL0 server at home. The desktop app on every computer and the website (any browser, phones included) share the same boards, in near real time, through it. Sync is off until the owner connects a server; without one, nothing in the app changes.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Connect.** Settings › Sync › **Connect to a server**: the address, then the server's fingerprint shown in full ("Does it match `krnl0 fingerprint` on your server?"), then the owner password (and 2FA code). The app pairs, stores its device token in the OS keychain (Electron `safeStorage`), and pins the server's CA. CLI: `krnl sync connect <address>`, `krnl sync status`, `krnl sync disconnect`. |
| F2 | **What syncs.** Every board (its plans, habits, calendar, timer, notes, drawings), the list of boards, the time log and images/media. **Not** synced, because they belong to one device: the viewport (pan and zoom), Station/Canvas layout and window sizes, which board is open, and app preferences. |
| F3 | **Near real time.** A change reaches every other connected device in under a second on a home network: uploads 300 ms after the last edit, other devices are told over the WebSocket at once. |
| F4 | **Never lose an edit.** Edits made at the same time on two devices both survive when they touch different things (merge per item and per field, the app's `boardMerge`). When both changed the very same value, the first to reach the server wins and the other device's value stays one undo step away. |
| F5 | **Offline.** Without the server everything keeps working. Changes are kept (on disk on desktop, in the browser's storage on the web) and sent when the server is back. Changes made with the `krnl` CLI while the app was closed are sent on the next start. |
| F6 | **Status.** The top bar shows one chip: *synced* · *syncing* · *offline — changes kept* · *sync paused — tap to retry* · *update KRNL0* · *signed out — connect again*. The status bar shows the last sync time and the number of devices. `krnl sync status` prints the same. |
| F7 | **Board list.** Creating, renaming or deleting a board on one device reaches the others. A board deleted elsewhere is moved to `boards/.deleted/` here (kept, never destroyed); if it was open, this device first switches to another board. |
| F8 | **Time log.** Every entry reaches every device once (UUID dedupe); analytics show the same numbers everywhere. |
| F9 | **Images and media.** New files upload before the board that uses them; files from other devices download on first display. |
| F10 | **Clocks.** Each device measures its clock against the server's. A difference over 5 seconds shows "This device's clock is off by N s" in Settings › Sync (timers use wall time). Merges never depend on clocks. |
| F11 | **Too old.** If a board was saved by a newer KRNL0, this device stops uploading it and says "Update KRNL0 to keep syncing this board". |
| F12 | **Revoked.** If the device is revoked or the password changes, sync stops, local data stays, and the app asks to connect again. |
| F13 | **Website.** The KRNL0 web build (served by the server) runs the same sync core in the browser. On a phone it uses the phone layout (Today, Calendar, Habits, Canvas tabs); on a tablet the rail layout; on a desktop browser the Station and Canvas. Terminal, AI orb, floating timer and voice are desktop-only and hidden on the web. |
| F14 | **A tutorial.** `krnl tour start sync` walks through connecting a server, the status chip and what syncs. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | One merge system: the sync engine merges with `src/shared/boardMerge.ts`, the same as CLI writes. |
| NF2 | The sync core (`src/shared/sync/`) has no Node or Electron imports; desktop and web inject storage and transport. |
| NF3 | No deadlocks: no lock is ever held across a network call; at most one upload per document in flight. |
| NF4 | No loops: notices carrying this device's own connection id are ignored; uploads compare a stable hash of the migrated, per-device-stripped board, so `savedAt` or migration reshaping never re-upload; conflicts stop after 8 merges in a row with a visible "sync paused". |
| NF5 | Bodies are gzip-compressed; a notice is a few bytes; images never travel with boards. |
| NF6 | Device token stored with `safeStorage`; never written in plain text; never logged. |
| NF7 | A simulation suite runs N clients against a real server with dropped connections, delays, concurrent edits, long offline edits, a server restart mid-write and clock skew, and asserts that every client ends with the same board. |

## Use Cases

- **UC-S1:** The owner connects the desktop app at home to the server; the board appears on their phone's browser a second later.
- **UC-S2:** On the train (offline) they tick two plans on the laptop; at home the laptop reconnects and the phone shows both ticks.
- **UC-S3:** They drag a task on the desktop while ticking a habit on the phone; both changes survive.
- **UC-S4:** The AI in the desktop terminal adds a plan with `krnl task add`; the phone shows it within a second.
- **UC-S5:** They delete the board "Side project" on the laptop; the desktop at the office moves it to `.deleted` and stays on "Main".
- **UC-S6:** The laptop is stolen; they run `krnl0 devices revoke`; the laptop's next sync is refused and says so.

## User Stories

- As an owner, I want my board on every device without thinking about it.
- As an owner, I want to keep working offline and trust that nothing is lost.
- As an owner, I want to see at a glance whether my devices are in sync.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Different edits on two devices (F4)
  Given devices A and B are synced on revision 5
  When A ticks "Gym" and B renames "Read chapter 4" before either syncs
  Then both reach the server and both devices show "Gym" ticked and the new name

Feature: Same value on two devices (F4)
  Given devices A and B are synced
  When A sets the task title to "X" and B to "Y", and A reaches the server first
  Then every device shows "X"

Feature: Offline (F5)
  Given device A is offline with two local changes
  When the server becomes reachable
  Then A uploads both on top of the newest server revision and B shows them

Feature: Per-device keys (F2)
  When A pans the canvas
  Then nothing is uploaded and B's viewport does not move

Feature: No loops (NF4)
  When a remote change is applied on A
  Then A does not upload it back

Feature: Too old (F11)
  Given the server's board has schemaVersion 3 and A supports 2
  Then A does not upload it and shows "Update KRNL0"

Feature: Board deleted elsewhere (F7)
  Given A has board "Side" open and B deletes it
  Then A switches to another board and keeps "Side" in boards/.deleted/
```
