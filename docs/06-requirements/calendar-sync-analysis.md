# Calendar sync — what it changes in KRNL0, state by state (audit, 2026-11-22)

*For Decision 64 and [calendar-sync.md](calendar-sync.md). The owner asked, before the release: "do a deep analysis into what the new update has introduced to the system, and if it has introduced any problems". This is that analysis: every kind of item × every action × every place a change can come from, what happens on the board, in Google and in iCloud, and how each line is covered.*

**Coverage key:** **T** = a test (named) · **F** = fake account only (the two-way engine is tested against an in-memory calendar; real Google and iCloud have been used by the owner for sign-in and reading, not yet for every two-way path) · **R** = reasoned from the code, no test.

## 1. What the update adds to a board

| Part | Where it lives | Who writes it | Synced through the KRNL0 server |
|---|---|---|---|
| `calendarLinks` (each other calendar: name, colour, on/off, state, its events; the two-way calendar's matching list `map` and `rev`) | `board.json`, top level | the runner device only (main process), and `krnl cal …` | yes, like the rest of the board (merged item by item) |
| An event's `place` and `icsUid` | the event (a routine habit) | sync, import | yes |
| Sign-ins (app password, Google refresh token), link addresses, the device id, the last `rev` written | `calendar-links.json` in the app's data folder, sealed by the OS keychain | the device | **never** |
| The Calendar's `linked` layer | the Calendar's state | the Calendar menu, `krnl cal layers` | yes |

Nothing else of the board changes shape. No schema bump; an older KRNL0 keeps the new fields as they are (it spreads what it does not know).

## 2. What goes out, and what comes in

**Out to the two-way "KRNL0" calendar** (iCloud or Google; one per board): events, once or repeating (repeat every day, weekdays or on chosen weekdays; skipped days; one day moved to another time; place; length), and tasks that have a time and are not done. **Never:** habits (ticked things), day-only plans and deadlines, recorded time, notes, archived events, a repeating event with no day ticked.

**In from it:** changes to those, and entries made in that calendar on the phone, which become **events** (never tasks). Repeats KRNL0 cannot store (monthly, every second week, a count) and all-day entries stay read-only.

**Read-only calendars** (calendar links, an account's other calendars): their events are drawn on the Calendar (Week, Day, the narrow list, Month, Year, the phone's Today) and never written anywhere.

## 3. Events (once or repeating)

| Action | Made in | Board | KRNL0 calendar (phone) | Cover |
|---|---|---|---|---|
| Create | window / CLI | added | created within ~5 s (window) or 2 min (CLI) | T `calendarAccounts` (sign-in, Dentist goes out) |
| Create | phone (in the KRNL0 calendar) | new event (never a task), its UID kept | — | T `calendarAccounts` (Haircut) |
| Move / resize / rename / place | window | changed | updated | T `mirror` (changed here → sent), F |
| Move / rename / place | phone | changed; **the note is never touched** (place is its own field) | — | T `mirror`, T `calendarSafety` (note kept) |
| Move one day of a repeat | window | that day moved | iCloud: a changed occurrence; Google: that instance patched (a failure leaves that day as it was) | T `mirror` (round trip), F; Google instance path **R** |
| Move one day to another time | phone | that day moved | — | T `krnlIcs`, F |
| Move one day to **another day** | phone | that day skipped (KRNL0 has no "moved to another day") | — | R, documented |
| Skip one day | either side | that day skipped | EXDATE / cancelled instance | T `mirror`, F |
| End after a day | window | `endsOn` | UNTIL | T `krnlIcs`, F |
| Delete / archive | window | gone | deleted (unless it was changed on the phone since: then it comes back to the board — an edit beats a delete) | T `mirror` |
| Delete | phone | deleted (unless changed in KRNL0 since: then it goes back out) | — | T `calendarAccounts`, T `mirror` |
| Changed on both sides between two syncs | — | the phone's version | the phone's version | T `mirror` (both changed) |
| Made monthly on the phone | phone | the KRNL0 event leaves; the entry shows read-only | — | T `mirror` (F11) |
| Its canvas card | — | a card whose event was deleted by sync removes itself (existing rule) | — | R |

## 4. Tasks (plans with a time)

| Action | Made in | Board | KRNL0 calendar | Cover |
|---|---|---|---|---|
| Give a time / move / resize / rename | window, CLI | — | created / updated | T `mirror`, F |
| Done, Won't do, time taken off, deleted | window | — | deleted | R (not in the outgoing set → deleted) |
| Undone, rescheduled again | window | — | created again (Google: a deleted UID is revived, not refused) | T `googleRevive` |
| Moved / renamed on the phone | phone | time, length, name follow (through `krnl task` functions: the Todo row follows) | — | R (same functions as the CLI), F |
| Copy deleted on the phone | phone | the task loses its time; **stays in Todo** | — | T `mirror` |
| Made repeating on the phone | phone | stays one time (a task never repeats); the next sync sends it back as one time | — | R |
| Day-only plan, deadline, subtask | — | not sent | — | R |

## 5. Habits, recorded time, the rest

Habits (things you tick), streaks, the time log, Pomo sessions, notes, drawings and canvases are not read or written by calendar sync. Analytics count no outside event (they are not plans; routines were already excluded). Reminders: an event changed from the phone keeps its reminder setting (the event's other fields are kept). **Cover:** R; the full suite (312 files) passes unchanged.

## 6. Boards

| Situation | What happens | Cover |
|---|---|---|
| Calendars are per board | each board shows its own; the card lists **signed-in accounts on every board** (Show here) | R, owner-tested |
| Several boards send | each to its own calendar, "KRNL0 · Board name" | R |
| **Two boards with the same name** | the second gets "KRNL0 · Name (2)": they never share one (sharing would delete each other's items) | T `calendarSafety` |
| **Board switched while a sync waits on the network** | nothing of it is written on the other board | T `calendarAccounts` |
| **Board switched just before a sync starts** | the sync does nothing (it would have compared one board with another board's calendar: deletes) | T `calendarSafety` |
| New board, board deleted | links not copied; a deleted board's KRNL0 calendar stays in the account | R |
| **Board restored** (backup, `krnl board load`, a server restore) | its matching list is behind (`rev`): matching starts over by UID and content, so nothing restored is deleted; entries made after the backup go | T `calendarSafety` |
| Undo / redo in the window | the calendar links stay as they are (rolling them back would make the next sync redo or undo calendar changes) | T `undoKeepsCalendarLinks` |

## 7. Devices and the KRNL0 server

| Situation | What happens | Cover |
|---|---|---|
| One runner per calendar | the device that signed in (it holds the sign-in) runs it; others show "checked on <device>" | T `calendarLinks` (F14) |
| **The same account signed in on a second computer** (one board through the server) | one sign-in per account per device; the board never gets a second two-way calendar or a calendar twice ("kept in step by <device>") | T `calendarSafety` |
| Board sync with the server | `calendarLinks` merges item by item; only the runner changes it (others only switch on/off or rename) | R (boardMerge, Decision 51) |
| Runner writes | through the CLI's save path: the server sync hears it, the window merges it (Decision 34) | R |
| How often the board changes | only when what it shows changes (Google has no change tag: read every 5 min, written only when its events change); a save that changes nothing the calendar holds makes no call | T `calendarAccounts` (NF7) |
| Phone website | shows outside events and events from the phone; cannot sign in (says so) | R, web build checked (no desktop-only code in it) |
| Server running the sync (P3) | **not built**: with the laptop closed, phone and KRNL0 catch up when the app opens | — |

## 8. Failures

| Situation | What happens | Cover |
|---|---|---|
| No internet / server error | 3 failures in a row → "no answer"; events stay | T `calendarLinks` |
| Sign-in revoked (app password deleted, Google 7-day testing expiry) | "Sign in again"; nothing deleted | T `calendarAccounts` |
| **One item refused** by the calendar | the others go on; that one is tried again next time | T `calendarSafety` |
| Normal Apple ID password pasted | refused before Apple is asked, with the reason | T `calendarAccounts` |
| Google's sharing page pasted as a link | says which address to copy | T `calendarLinks` |
| Two-way calendar removed in the account | the next sync fails with "no answer"; Remove the link and add it again | R |

## 9. Problems found by this audit, and fixed

1. **A sync that started right after a board switch** compared the new board with the old board's calendar: it would delete the old board's events on the phone and push the new board's there. Now it does nothing. *(critical)*
2. **The same account on a second computer** made a second two-way calendar for the same board (two runners), and could show a calendar twice. Accounts now match by kind + email. *(high)*
3. **A restored board** would delete the events it restored. Now its matching list is not trusted (`rev`). *(high)*
4. **Turning "both ways" off and on** brought back KRNL0's deleted items, finished tasks as events. Entries made by KRNL0 that match nothing are removed. *(high)*
5. **A place changed on the phone overwrote the event's note.** Events have their own `place` now. *(high: data loss)*
6. **One refused item stopped every sync** for that calendar. *(medium)*
7. **Two boards with the same name** shared one calendar. *(medium)*
8. **Read-only entries of the two-way calendar** were unsorted, so the Week view skipped some. *(medium)*
9. **A weekly event with no day** wrote an invalid rule. *(medium)*
10. Google: a re-made event whose UID Google kept as deleted would be refused forever; now revived. *(medium)*
11. Spaces, lengths under 5 minutes and a creation date near midnight made one sync bounce; the window did not always reload after the phone changed a task. *(low)*
12. Earlier the same day: Google calendars rewrote the board every 5 minutes; a board switch during a sync wrote on the other board; every save made a Google call; undo rolled the links back; the save handler loaded the calendar libraries at start. *(fixed)*

## 10. Known limits (not bugs, said plainly)

- A day moved to **another day** on the phone becomes a skipped day in KRNL0.
- A clash on the very same event within one sync (2 minutes) goes to the phone's version.
- A place set from the phone shows on the Calendar's blocks and the phone's Today; the event card and the canvas card do not show or edit it yet.
- Outside events are not on the Clock.
- Google sign-in is in "Testing" (one test user, signed out every 7 days) until there is a privacy page and the app is published.
- Every two-way path is verified against a fake calendar; real Google and iCloud have been used for sign-in and reading. Section 11 is the real-account check.

## 11. Check with the real Google account (owner, 10 minutes)

On the board that shows Google Calendar (hrthtrh), with "both ways" on:

| # | Do | Expect |
|---|---|---|
| 1 | Add an event in KRNL0 for tomorrow 10:00 | within ~5 s it is in the "KRNL0 · hrthtrh" calendar on the phone |
| 2 | Move it to 11:00 in Google Calendar on the phone | within 2 min it is at 11:00 in KRNL0 |
| 3 | Add an event in that calendar on the phone | within 2 min it is a KRNL0 event (not in Todo) |
| 4 | Give a Todo plan a time | it shows in the phone's KRNL0 calendar; tick it done → it leaves the phone |
| 5 | Make a weekly event; move one week's to another time in KRNL0 | that one week moves on the phone, the others stay |
| 6 | Delete the event from step 1 in KRNL0 | it leaves the phone |
| 7 | Delete the phone's event from step 3 on the phone | it leaves KRNL0 |
| 8 | Change the same event on both sides within a minute | after 2 min both show the phone's version |
| 9 | Calendars › turn "Put KRNL0 on your phone" off, then on | nothing old comes back as an event |
| 10 | Switch to Main while an edit is syncing, then back | Main shows nothing of hrthtrh's calendar |
