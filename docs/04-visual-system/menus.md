# Menus

One standard for right-click menus, so the same thing is in the same place in every menu. Code: `src/renderer/components/ContextMenu/index.tsx` (a row with `children` opens them in place, with a way back).

## Rules

1. **Six rows at most** (not counting a caption). Everything used less often goes behind **More**.
2. **Same order everywhere:** what happened → when → its name → More → then, under a rule, the two ways out (Won't do / Archive, Delete).
3. **Same words everywhere.** "Rename" (never "Edit text"), "When…" (never "Edit time"), "Mark done" / "Done on Mon 16" / "Not done yet", "Won't do", "Delete".
4. **Delete is always last and red.** The row above it is the gentle way out (Won't do, Archive).
5. **Every row has an icon** from `ui/menuIcons.tsx`.
6. **A hint is two or three words** ("not missed", "keeps history"), or the current value ("Sun 16:05").

## The plan menu

The same from a Todo row, a board card and a Calendar block's card.

| Row | Notes |
|---|---|
| Mark done · Done on Mon 16 · Not done yet · Bring back | "Done on" when the plan's time has passed (counts on that day) |
| When… | opens the plan card |
| Rename | |
| More | Deadline…, Tag…, Track it now / Focus on it (Advanced); Show; on a card also Length…, Add note, Add next task, Add parallel task, Archive |
| Won't do | open plans only; hint "not missed" |
| Delete | |

## The habit menu

| Row | Notes |
|---|---|
| Days & time… | hint: its days and time |
| Rest today | hint "keeps streak" |
| Rename | |
| More | Color, Icon, Add note, Card on canvas |
| Archive | hint "keeps history" |
| Delete | |

## Not converted yet

- A repeating event's menu on the Calendar (8 rows).
- The menu on empty Calendar hours and on a recorded span.
