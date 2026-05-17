# Skill: Habit lifecycle (color, icon, note, rename, schedule, pin, archive)

Use this when the user says something like:
- "Rename meditation to morning sit"
- "Change the meditation color to cyan"
- "Pin my exercise habit to the canvas"
- "Schedule meditation for 7am every weekday"
- "Archive the running habit, I haven't done it in months"
- "Add a note to the writing habit"
- "Show me everything about meditation"

---

## Mental model

A habit lives inside the mother HabitNode. Each habit:

```ts
{
  id: string                  // uuid
  name: string
  createdAt: string           // ISO
  log: string[]               // ['2026-05-17', ...] — sparse YYYY-MM-DD checkins, sorted desc, unique
  archived: boolean           // archived habits hidden from grid
  color: HabitColor           // acid | rust | cyan | plum | spine | ink | amber | rose | teal | lilac | sand | moss
  icon?: string               // single grapheme (glyph or emoji)
  schedule?: HabitSchedule    // ADR 0002 — absence = unscheduled
  note?: string               // free-form
}
```

`schedule` is a discriminated union:

```ts
{ kind: 'daily';    timeOfDay: 'HH:MM'; durationMin?: number }
{ kind: 'weekly';   timeOfDay: 'HH:MM'; days: IsoDow[]; durationMin?: number }  // 1=Mon … 7=Sun
{ kind: 'weekdays'; timeOfDay: 'HH:MM'; durationMin?: number }                   // Mon–Fri
```

Refs accept `id`, ≥4-char id prefix, or exact-name (case-insensitive). Ambiguous names list the matches.

---

## CRUD

```bash
# Create + read
krnl habit add "meditation"
krnl habit list [--json]
krnl habit show meditation --json          # full record incl. log + schedule + note

# Identity
krnl habit rename meditation "morning sit"

# Visual
krnl habit color meditation cyan           # acid|rust|cyan|plum|spine|ink|amber|rose|teal|lilac|sand|moss
krnl habit icon meditation 🧘              # single grapheme
krnl habit icon meditation --clear         # falls back to round-robin glyph

# Notes
krnl habit note meditation "breath count, 10 min minimum"
krnl habit note meditation --clear

# Schedule (pick one)
krnl habit schedule meditation --daily --at 07:00 --duration 15
krnl habit schedule meditation --weekly --days 1,3,5 --at 07:00 --duration 15
krnl habit schedule meditation --weekdays --at 07:00 --duration 15
krnl habit unschedule meditation

# Check-in
krnl habit done meditation                 # marks today
krnl habit done meditation --date 2026-05-15   # back-fill
krnl habit streak meditation

# Lifecycle end
krnl habit archive meditation              # hide from grid
krnl habit remove meditation               # hard-delete

# Canvas surface
krnl habit pin meditation                  # spawn a habit.lane node (renderer-required)
krnl habit unpin meditation                # remove the lane node
krnl habit view week|month|year            # change the displayed grid range
```

---

## Schedule parsing — strict rules

`--weekly` REQUIRES `--days <csv>` where each token is an ISO day-of-week integer (1=Mon … 7=Sun).

**Accepted:**
- `--days 1,2,3` (Mon, Tue, Wed)
- `--days 7` (Sun only)
- `--days 1,1,2` (duplicates tolerated — deduped + sorted by the handler)

**Rejected with exit 1:**
- `--days mon,tue` (string names)
- `--days monday,friday` (string names)
- `--days 0,7` (0 out of range)
- `--days 1,8` (8 out of range)
- `--days 1,` (trailing comma → empty token)
- `--days ,1` (leading comma)
- `--days "1, 2, 3"` (whitespace tokens)

`--at HH:MM` must match `^(?:[01]\d|2[0-3]):[0-5]\d$`. Examples:

- ✅ `--at 07:00`, `--at 23:59`, `--at 00:00`
- ❌ `--at 7am`, `--at 7:00`, `--at 25:00`, `--at 7:5`

---

## Pin = lane (UI gesture mirror)

The UI's right-click "Pin as lane" on a habit creates a `habit.lane` child node on the canvas. This is the CLI peer:

```bash
krnl habit pin meditation                  # creates habit.lane node, requires renderer
krnl habit unpin meditation                # removes the lane node
```

Both exit 2 if no renderer is attached — the spawn logic lives in `commandDispatch.ts` and is single-sourced there. Don't try to fake it via file writes.

Once a lane exists, you can wire it to tasks with `krnl edge add` (visual only — won't auto-fire today; see `skills/wire-edge.md`).

---

## Drag-drop habit → calendar (UI gesture)

The UI lets the user drag a habit onto the calendar and choose "every day / same weekday / weekdays only" + duration + time of day. The CLI equivalent is a `habit schedule` call with the appropriate kind. There is **no single `krnl habit drop-into-calendar` command** — emulate the dialog by picking the right schedule kind:

| User says                                       | Command                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| "every day at 7am"                              | `krnl habit schedule <ref> --daily --at 07:00 --duration <N>`     |
| "Mondays and Wednesdays at 7am"                 | `krnl habit schedule <ref> --weekly --days 1,3 --at 07:00`        |
| "every weekday at 7am"                          | `krnl habit schedule <ref> --weekdays --at 07:00 --duration <N>`  |
| "every Sunday at 9am"                           | `krnl habit schedule <ref> --weekly --days 7 --at 09:00`          |

`--duration <N>` is optional. When omitted, the calendar uses a default block height.

---

## Common pitfalls

- **Names are case-insensitive for matching but preserved on write.** `krnl habit rename meditation "Morning Sit"` stores the capitalized form; future refs `morning sit` still match.
- **Removing a scheduled habit** clears the schedule too (cascade). If the user wants to keep history but stop tracking, prefer `archive`.
- **Color names are fixed.** Custom hex colors are not supported. The 12-palette is the universe.
- **Icon must be a single grapheme.** Emoji is fine. Multi-character strings are stored but render messily — discourage.
- **Empty / whitespace `note`** clears the note (`habitSetNote` semantics). To set a literal whitespace note, you can't.

---

## Reply templates

- "Renamed to 'morning sit'."
- "Cyan color, meditation glyph set."
- "Scheduled meditation for 7am Mon/Wed/Fri, 15 minutes each."
- "Meditation lane pinned."
- "Archived running — still in history but hidden from the grid."
- "I see 'meditation' and 'meditate' — which one?"

---

## Anti-patterns

- ❌ `--weekly --days mon,tue` → rejected. Use integers.
- ❌ Setting both `--daily` and `--weekly` in one call → undefined; the parser picks one.
- ❌ Pinning a habit while the app is closed → exit 2. Tell the user to open the app.
- ❌ Hex colors. Stick to the 12 palette names.
- ❌ Promising automatic check-in when a wired task completes. Edges don't auto-fire yet — see `skills/wire-edge.md`.
