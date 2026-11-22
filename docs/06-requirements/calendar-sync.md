# Calendar sync: Google Calendar, Apple Calendar and calendar links

*ADR: [Decision 64](../03-architecture/decisions.md). Builds on [one-time-events.md](one-time-events.md) (what an event is) and [server-sync.md](server-sync.md) (the KRNL0 server, clash rules F21/F22). Status: proposed, 2026-11-22. Design: canvas "KRNL0 other calendars"; the owner picked **Look A** (outlined slips: a paler card with an outline in the calendar's colour and a link mark, beside KRNL0's own solid tinted events) and **Manage A** (a card from the Calendar menu: each calendar with a switch, Add a calendar, Export .ics, Import .ics), 2026-11-22.*

The owner's other calendars show up in KRNL0, and KRNL0's events and timed tasks show up in Google Calendar and Apple Calendar (iPhone, iPad, Mac), both ways. Everything is free: no paid service, and no account beyond the owner's own Google or Apple account. It works with or without a KRNL0 server. With a server, the server keeps it running while every laptop is closed.

**Phases** (each `F#` names its phase):
- **P1:** calendar links and `.ics` files, run by the desktop.
- **P2:** Apple and CalDAV, two-way.
- **P3:** the server runs links.
- **P4:** Google, two-way.

**Built (2026-11-22):** P1, P2 and P4, on the desktop. The owner asked for the easiest setup any user can do ("I want some kind of automation"), so Add a calendar starts with a choice: **Apple (iCloud)**, **Google**, **Calendar link**, **Other account**. Signing in lists the account's calendars (all ticked), and one switch, on by default, puts KRNL0's events and planned tasks in a calendar called KRNL0 there, kept the same both ways every 2 minutes and 5 seconds after a change here. P3 (the server runs links) is next.

**After the owner's first real use (2026-11-22):**
- **Easy to find:** the Calendar menu opens with a tinted **Add your calendars** row (then **Your other calendars**), first in every view; **Settings › Calendars** shows the same card.
- **Signed-in accounts on every board:** the card lists each account (iCloud, Google) at the top with its state (shown here, both ways, synced) and **Show here** / **Manage** / **Sign in**; **Sign out** is in its calendar list and clears every board. The board's own calendars follow under **On this board**.
- **What was found:** after signing in, "Home: 1 event this year · Work: no events this year"; the card's title line counts this year's events.
- **Never looks empty by mistake:** Year marks days with outside events (their colour, a legend line); Week, Day and Month say "Nothing from Google Calendar this week · next: …" when the period has none (a click goes there).
- **Readable:** Google's main calendar is called Google Calendar (not the email); KRNL0's own two-way calendars are never offered as outside calendars.
- **Safe with sync:** a Google calendar (no change tag) is read every 5 minutes but written to the board only when its events change; a sync that was waiting on the network when the board was switched writes nothing on the other board; a save in the window syncs only when something the calendar holds changed; undo and redo keep the calendar links as they are.

### Setting up "Sign in with Google" (owner, once)

Google needs an OAuth client of the owner's Google Cloud project; without one the app says Google sign-in is not set up and offers a calendar link instead.

1. console.cloud.google.com, a project (for example "KRNL0"), **APIs & Services › Library**: enable **Google Calendar API**.
2. **OAuth consent screen**: External, app name KRNL0, the owner's email, scopes `openid`, `email`, `.../auth/calendar.calendarlist.readonly`, `.../auth/calendar.events.readonly`, `.../auth/calendar.app.created` (the narrowest that works: read the owner's calendars, change only the ones KRNL0 makes). Publishing status **In production** (in Testing, Google's tokens expire after 7 days). Until Google reviews the app, sign-in shows "Google hasn't verified this app" and at most 100 accounts can link; the review (free) needs a privacy policy, a homepage (the KRNL0 website) and a short video.
3. **Credentials › Create credentials › OAuth client ID › Desktop app**. Its client ID and secret go in the repository's GitHub secrets `KRNL0_GOOGLE_CLIENT_ID` and `KRNL0_GOOGLE_CLIENT_SECRET` (the release build reads them), or the same environment variables for `npm run dev`. For an installed app Google treats the secret as not secret.

## Functional Requirements

| # | Phase | Requirement |
|---|---|---|
| F1 | P1 | **Where it lives (Manage A).** Calendar window menu › **Other calendars…** opens a card in the add-card standard (330 px). It lists this board's calendars, each with its colour, name, provider and last check ("Google · checked 2 min ago") and a switch that shows or hides it; a click on one opens its details (name, colour, Check now, Remove). Under the list: **Add a calendar**, then **Export .ics** and **Import .ics**. It works in Easy mode, in Free (the zoomed canvas window) and in every Station layout. |
| F2 | P1 | **Calendar link (read-only).** **Add a calendar › Calendar link**: paste an ICS address (`https://`, `webcal://` or `.ics`). The sheet shows how to find Google's "Secret address in iCal format" and an iCloud public calendar link. KRNL0 checks the link every 15 minutes and on **Check now**, sending `ETag` / `If-Modified-Since`. No sign-in. |
| F3 | P1 | **How linked events look (Look A).** A paler card (the window's own background, a 6% tint) with a 1 px outline in the calendar's colour, its name in that colour mixed with ink, the time and the calendar's name ("16:00–17:00 · Work") and a link mark in the top-right corner. Events from a read-only calendar are drawn as events (Decision 62: no tick box, never "Missed", not counted in plan-vs-actual, not a timer target) on their own Calendar layer, **Other calendars**, which can be turned off like the others. They take part in shared lanes (Decision 61). Their info card says where they come from ("Google · Work"). They cannot be dragged, resized or edited; the card offers **Copy to KRNL0**, which makes a normal KRNL0 event. |
| F4 | P1 | **Repeats from outside.** Repeat rules of any kind (`RRULE`, `EXDATE`, changed occurrences) are expanded for what is shown, a year ahead and a year back. An all-day event is a chip in the Calendar's **ANY TIME** strip under the day names (Week and Day views; a chip in Month), never in the hours: the strip that already holds plans with a day and no time (one place for "that day, no hour", owner's rule: unify, don't add). |
| F5 | P1 | **Export and import a file.** Calendar menu › **Export .ics** saves this board's events and timed tasks as one `.ics` file. **Import .ics** adds a file's events as KRNL0 events (once or repeating). Repeats KRNL0 cannot express are added as one-time events, one per occurrence in the next year. Importing the same file twice adds nothing new (`UID` matching). |
| F6 | P2 | **Link Apple (two-way).** **Add a calendar › Apple (iCloud)**: the Apple ID email and an app-specific password, with three short steps and a button that opens account.apple.com. Pasting the password signs in at once. A normal Apple ID password is refused before Apple is asked (it does not look like abcd-efgh-ijkl-mnop), with a plain explanation. After signing in, every calendar of the account is listed and ticked; Done shows them. KRNL0 creates a calendar named "KRNL0" in iCloud ("KRNL0 · <board>" when there are several boards) and syncs with it both ways. The owner's other iCloud calendars can be ticked to show them read-only (F3). |
| F7 | P2 | **Any CalDAV calendar.** **Add a calendar › Other (CalDAV)**: server address, user name and password. Same behaviour as F6 (Nextcloud, Fastmail and others). |
| F8 | P4 | **Link Google (two-way).** **Add a calendar › Google**: the browser opens Google's sign-in, and Google sends the owner back to the app. KRNL0 creates its "KRNL0" calendar and syncs with it both ways. Other Google calendars can be shown read-only (F3), or added by their secret ICS address (F2) when the scope does not allow reading them. |
| F9 | P2 | **What goes out.** Every event (once or repeating, with its skipped and moved days, its place and its reminder) and every task that has a time (`scheduledFor`, its length). A task's copy is named like the task. Habits, the timer, the time log and notes never go out. A task that loses its time, is done, is dropped or is deleted is removed from the KRNL0 calendar. |
| F10 | P2 | **What comes in.** A change in the KRNL0 calendar comes back: moved, resized, renamed, a new place, deleted. A new event made in the KRNL0 calendar on the phone becomes a KRNL0 event, never a task (Decision 62). Changing a task's copy changes the task's time, length or name. Deleting a task's copy takes the task off the Calendar and keeps it in Todo. |
| F11 | P2 | **Repeats KRNL0 cannot express.** An event made in the KRNL0 calendar with such a repeat (monthly, every second week, a set count) is shown like F3, read-only, with "Edit it in Google" (or Apple) on its card. KRNL0 never rewrites its rule. |
| F12 | P2 | **Clashes.** When the same value changed on both sides since the last sync, the later edit wins: the provider's change time against KRNL0's edit stamp in server time (server-sync F21). When one side deleted an item and the other changed it, the item stays with the change (F22). Nothing is shown about it. |
| F13 | P2 | **How fast.** A KRNL0 change made in the window reaches the provider about 5 seconds after it is saved; a change from the terminal within 2 minutes. Provider changes are fetched every 2 minutes (read-only calendars of an account every 5) (incremental: Google's sync token, CalDAV's sync token or ctag) and on **Check now**. |
| F14 | P2 | **One runner per link.** Each link has exactly one runner: the KRNL0 server when one is connected and supports calendar sync, otherwise the desktop that made the link. Another device never runs it, not even while the runner is offline. The sheet shows the runner ("Kept in sync by your KRNL0 server" / "…by this computer while KRNL0 is open" / "…by <device>"). |
| F15 | P3 | **The server runs links.** With a server that supports it, every link is run by the server, also while all desktops are closed. A change made on the phone website reaches Google or Apple, and the reverse, with no desktop open. |
| F16 | P3 | **Handover.** Connecting a server moves every link to the server, with its secret, over the pinned connection. Disconnecting the server moves links back to this desktop, if it holds the secret; links it cannot run ask to be linked again. Nothing is sent twice and nothing is shown about the move. |
| F17 | P3 | **Linking on the website.** With a server, Apple, CalDAV and calendar links can be added on the website (and the phone) too; the server runs them. Google is linked from a desktop app (F8) and then runs on the server. |
| F18 | P2 | **Time zones.** A link remembers the time zone of the device that made it, and events are sent in that zone. A server running in UTC never shifts the owner's times. Changing the zone in the sheet changes it for every later sync. |
| F19 | P2 | **When the owner must act.** Only states that need the owner show, on that link in the sheet: "Apple no longer accepts this password: make a new app-specific password", "Google sign-in expired: sign in again", "This link no longer answers". Retries and other technical details are never shown. |
| F20 | P2 | **Unlink.** **Remove** on a link stops it and deletes its secret everywhere. KRNL0's own events stay in KRNL0. The "KRNL0" calendar stays in Google or Apple (the sheet says so), and read-only events disappear from the Calendar. |
| F21 | P1 | **CLI** (hard rule 8): `krnl cal link ics <url> [--name <n>] [--color <c>]` · `krnl cal link check <url> [--json]` (reads it without adding: the card's "Found" step) · `krnl cal link set <link> [--name …] [--color …] [--show\|--hide]` · `krnl cal links [--json]` (each link, where it is checked, last check, events) · `krnl cal sync [<link>]` · `krnl cal unlink <link>` · `krnl cal export [--out <file>]` · `krnl cal import <file> [--dry-run] [--json]` · `krnl cal layers linked on\|off`. |
| F21b | P2/P4 | **CLI, accounts:** `krnl cal link apple --user <apple-id> --password <app-password>` · `krnl cal link caldav <server> --user <u> --password <p>` · `krnl cal link google` (opens the browser), each `[--calendars "Work,Family"] [--no-send]` · `krnl cal signout <account>`. In the terminal the password is on the command line (it shows in shell history); the window's card never puts it there (its own IPC call). |
| F22 | P1 | **A tutorial.** Help › Tutorials › **Your other calendars** (`krnl tour start calendars`): add a calendar link, see its events on their layer, and (once P2 is in) link Apple and see an event made on the Calendar appear in the KRNL0 calendar. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | **One engine.** `src/shared/calsync/` has no Node or Electron imports. The desktop (main process) and the server (headless device) inject network access, the secret store, the clock and board access. Board changes go through the store and `krnl` commands, never by writing `board.json` (hard rule 5). |
| NF2 | **Free and open.** No paid service. Libraries are open source: `tsdav` (CalDAV), `ical.js` (parse and expand), `ical-generator` (write). Google is reached through its free public API with the owner's own Google Cloud project. |
| NF3 | **Secrets.** A calendar link's address (Google's secret address works like a password), app-specific passwords, CalDAV passwords and Google refresh tokens are stored with `safeStorage` on the desktop and encrypted in the server's data folder. They are never in `board.json`, never synced, never logged, never in a URL, and never sent anywhere but their provider and, once, from the app to its own pinned server (F16). |
| NF4 | **Additive data.** A board gets an optional `calendarLinks` list (provider, remote calendar, runner, time zone, and per item: remote id, version tag, hash of what was sent). No schema bump and no migration. An older KRNL0 keeps the field unchanged (Decision 52, point 2). `boardMerge` merges it like any id-keyed list. |
| NF5 | **No duplicates.** An item is created in the provider only when it has no remote id in the matching list. Creates send a stable `UID` derived from the KRNL0 id, so a retry after a timeout finds the event instead of making a second one. |
| NF6 | **No loops.** A change that came from the provider is not sent back to it: the hash of what was last sent or received is compared first. |
| NF7 | **Light on the board.** The runner writes the board only when something changed (no write per check). One check of an unchanged Google or CalDAV calendar is one small request. |
| NF8 | **Rate limits.** Provider errors that say "slow down" (Google 403/429, CalDAV 503) back off up to 30 minutes, then retry. Nothing is lost while backing off. |
| NF9 | **Tested against real formats.** The ICS and CalDAV code is tested on recorded responses from Google, iCloud and Nextcloud (repeats, exceptions, all-day events, time zones, daylight-saving changes). A simulation runs the engine against a fake provider with dropped connections, timeouts after a create, and edits on both sides. |

## Edge cases

| Situation | What happens |
|---|---|
| The server is offline for an hour | Its links wait; no desktop takes over (F14). KRNL0 and provider changes are kept on both sides and merged when it is back. |
| The server is older than the app and has no calendar sync | The desktop keeps running its links (F14) until the server updates; then they move silently (F16). |
| Two desktops without a server link the same Google account | Each board makes its own "KRNL0 · <board>" calendar; they never write into each other's. |
| A create times out but reached Google | The retry sends the same `UID` (NF5) and finds the event; no duplicate. |
| The owner deletes the whole "KRNL0" calendar in Google | The link reports "This calendar was removed" with **Make it again** (sends every item again) or **Remove link** (F19). KRNL0's events stay. |
| The owner changes their Apple ID password | Apple revokes all app-specific passwords. The link asks for a new one (F19); nothing is deleted. |
| A Google project left in "Testing" | Tokens expire after 7 days and the link asks to sign in again (F19). The owner's project is kept "In production" (Decision 64). |
| The device moves to another time zone | Events keep the link's zone (F18). The owner can change it in the sheet. |
| Daylight-saving change | Events are sent with a time-zone id, never as fixed UTC offsets, so a weekly 10:00 stays 10:00 after the change. |
| An event repeats in KRNL0 and one day is moved | It goes out as a repeat plus one changed occurrence (`RECURRENCE-ID`), and comes back the same way. |
| An all-day event in a read-only calendar | A chip in the ANY TIME strip (F4). All-day events in the KRNL0 calendar come in as read-only until KRNL0 has all-day events of its own. |
| A very large external calendar (years of events) | Only a year back and a year ahead are expanded (F4). |
| The ICS address is wrong or private | "This link no longer answers" (F19) after 3 failed checks in a row. |

## Use Cases

- **UC-C1 See the work calendar.** The owner pastes their Google work calendar's secret ICS address. Within a minute, Monday's meetings appear on KRNL0's Calendar on the Other calendars layer, and they plan their tasks around them.
- **UC-C2 Appointments on the iPhone.** The owner links Apple with an app-specific password and adds "Dentist fri 15:00 1h" on the KRNL0 Calendar. A few seconds later it is in the "KRNL0" calendar on their iPhone.
- **UC-C3 Moved on the phone.** On the bus they move "Dentist" to 16:00 in Apple Calendar. Within 2 minutes KRNL0 shows it at 16:00.
- **UC-C4 Laptop closed.** They have a KRNL0 server at home. With every laptop shut, they add an event on the phone website; it reaches Google Calendar through the server.
- **UC-C5 First a laptop, then a server.** They linked Google on the laptop last month and install a KRNL0 server today. After connecting, the server keeps Google in sync, and no event appears twice.
- **UC-C6 From the terminal.** The AI in the terminal runs `krnl cal links` to see what is linked, and `krnl cal sync` after adding an event.

## User Stories

- As an owner, I want my work and family calendars on the KRNL0 Calendar, so I plan my day around what is already fixed.
- As an owner, I want my KRNL0 events and planned tasks on my phone's calendar, without paying for anything.
- As an owner with a KRNL0 server, I want sync to keep running while my laptop is closed.
- As an owner without a server, I want it to work from the app alone.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Calendar link (F2, F3)
  Scenario: A read-only calendar appears on its layer
    Given an ICS address with the event "Team call" on Monday 23 Nov 2026 at 10:00 for 30 minutes
    When I add it as a calendar link named "Work"
    Then Monday 23 Nov shows "Team call" from 10:00 to 10:30 as an event on the Other calendars layer
    And its info card says "Work"
    And it cannot be dragged
    And Todo has no "Team call" row

  Scenario: The layer can be hidden
    When I turn off the Other calendars layer
    Then "Team call" is not drawn

Feature: Repeats from outside (F4)
  Scenario: A monthly repeat is shown
    Given a linked event "Rent" on the first day of every month
    Then 1 Dec 2026 and 1 Jan 2027 show "Rent"

Feature: Export and import (F5)
  Scenario: Importing the same file twice
    Given a file with the events "Exam" and "Choir"
    When I import it twice
    Then the Calendar has one "Exam" and one "Choir"

Feature: Apple two-way (F6, F9, F10)
  Scenario: A KRNL0 event reaches iCloud
    Given Apple is linked
    When I add the event "Dentist" on Friday 27 Nov at 15:00 for 1h
    Then within 5 seconds the "KRNL0" calendar in iCloud has "Dentist" on 27 Nov 15:00–16:00

  Scenario: A move on the phone comes back
    Given "Dentist" is in both
    When it is moved to 16:00 in iCloud
    Then within 2 minutes KRNL0 shows "Dentist" at 16:00

  Scenario: A new event made on the phone is an event
    When "Haircut" is added to the "KRNL0" calendar in iCloud
    Then KRNL0 shows "Haircut" as an event
    And Todo has no "Haircut" row

  Scenario: Deleting a task's copy keeps the task
    Given the task "Write report" is planned for Thursday 14:00 and is in iCloud
    When its copy is deleted in iCloud
    Then "Write report" is in Todo without a time

Feature: Clashes (F12)
  Scenario: The later edit wins
    Given "Dentist" is at 15:00 on both sides and the runner is offline
    When it is moved to 16:00 in KRNL0 at 9:00 and to 17:00 in iCloud at 10:00
    Then after the next sync both show 17:00

  Scenario: An edit beats a delete
    Given "Choir" is in both and the runner is offline
    When it is deleted in iCloud and renamed "Choir 19:30" in KRNL0
    Then after the next sync both have "Choir 19:30"

Feature: One runner (F14, F15, F16)
  Scenario: The server runs links when it can
    Given a server that supports calendar sync is connected
    Then every link says "Kept in sync by your KRNL0 server"

  Scenario: No takeover while the server is down
    Given the server runs the Apple link and goes offline
    When I add "Exam" on the desktop
    Then the desktop does not send it to iCloud
    And when the server is back, iCloud gets "Exam" once

  Scenario: Handover sends nothing twice
    Given the desktop has run the Google link with 40 events
    When I connect a server that supports calendar sync
    Then the server runs the link
    And the "KRNL0" calendar in Google still has 40 events

Feature: Time zones (F18)
  Scenario: A server in UTC keeps the owner's times
    Given the link was made on a computer in Europe/Berlin and the server runs in UTC
    When the server sends the event "Exam" at 09:00
    Then Google shows "Exam" at 09:00 Berlin time

Feature: When the owner must act (F19)
  Scenario: Apple password revoked
    Given iCloud answers 401 for the Apple link
    Then the link reads "Apple no longer accepts this password: make a new app-specific password"
    And no KRNL0 event is deleted

Feature: CLI (F21)
  Scenario: List links from the terminal
    Given an Apple link and a calendar link "Work"
    When I run krnl cal links
    Then it prints both with their runner, last check and state
```
