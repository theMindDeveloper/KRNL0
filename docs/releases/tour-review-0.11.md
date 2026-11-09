# Tours: review before re-recording (0.11)

Every tour was walked in the app in **Easy**, **Advanced · Pomo** and **Advanced · Observe**, on a **new (empty) board** and a **full board**, and every line was checked against what that mode really shows. Nothing is recorded or published until you OK it.

## What was wrong, and the fix

| # | Where | What was wrong | Fix |
|---|---|---|---|
| 1 | Your first day (both modes) | Said the plan card has "a reminder". The reminder only appears once the plan has a time. | "Once it has a time, you can add a reminder." |
| 2 | Pomo tour, every `{pomo}` line | Called the timer "Pomo" everywhere in Advanced, also with **Observe**; the tour was titled "Pomo" in Easy, where the window is **Record**. | The name follows the window: Record (Easy), Pomo, Observe. Titles in the orb menu and Help, badges, card text and voice. |
| 3 | Welcome | Badge "POMO · RECORD" in both modes. | Shows the mode's own name. |
| 4 | Your first day | "Recorded time sits **under** the plan". It sits in the thin strip at the left of the day (the Calendar tour says so). | "Next to the plan, in the thin strip at the left of today." |
| 5 | Analytics in Easy | Easy never links recorded time to a task, so **Time per task** showed one "untagged" row, and tags (Easy has none). The tour said "Below: time per tag". | **Decision for you:** Time per task is hidden in Easy (like Planned vs spent and Time by tag). Easy's Analytics tour shows the **Hours** page instead; Welcome says "per day and per hour". |
| 6 | Board tour | "Right-click a card → Show": Show is only there for plans with a day. | Says so. |
| 7 | **New board** (Welcome, Clock, Calendar, Analytics, Board, Easy & Advanced, Staying on track) | Pointed at Clock wedges, recorded time, plans, tags, habit and event cards that a new user doesn't have yet. | **Tutorial examples** (your idea): only what's missing is added: "Example: Read chapter 3" today at the next hour, 40 min recorded today, "Example: Walk" (3 days done), "Example: Class". The card says "I added examples… they go when the tour ends". Always removed at the end, never counted in Analytics. |
| 8 | Board, Habits, Repeating events | A habit or event card off screen was never brought into view: the ring pointed at nothing. | The camera goes to the card. |
| 9 | Any tour with a practice habit | "Remove them" removed the habit but left its card on the board. | The card goes too. |
| 10 | Voice, everywhere | 39 "[Brief pause]", a mood tag on almost every line, trailing "..." — the voice drops at the end. The orb's "Aha." / "Aha..." falls. | All tags, pauses and trailing dots removed. Lines end on "." "!" or "?". Orb "Aha" → your pick from the samples. |
| 11 | Calendar header | The **+** was 20 px tall, **Repeating** 22 px. | Both 22 px. **Question:** your "…r 2" screenshot — is it the week label being cut short by the buttons? (In Advanced at narrow width it shrinks to "N…".) |

## Still to do, after your OK

1. You pick the voice: **A/B/C** for the orb's "Aha", **2 (natural)** or **3 (steadier)** for the tours.
2. Re-record every tour line and the orb lines in that style; transcribe every clip back and compare.
3. Tests, typecheck, build; walk all tours again in the three modes.
4. The 0.11.0 draft on GitHub was built from the old tours. It is **not published**. After your OK: delete that draft and its tag, merge the fixes, tag again, and publish **only when you say OK**.

---

# Tour scripts, as each user meets them

## first-day

### Easy — “Your first day”

1. **Card:** Let's plan one real thing and do it together. It takes about 4 minutes. Next (or Enter) goes on, Esc stops.
   **Voice:** Hi! Let's plan one real thing and actually do it, together. It takes about four minutes. Press Next or Enter to go on, and Escape whenever you want to stop.
2. **Card:** Add something you'll do today: click add a plan and type it. A card shows its day, time and length — pick any if you like, then press Enter to add it.
   **Voice:** First, add something you'll do today. Click "add a plan" and type it. A small card shows its day, its time and how long it takes. Pick any of them if you like, then press Enter to add it.
3. **Card:** The calendar icon on a row opens its plan card: a day (or any time), a time and how long. Once it has a time, you can add a reminder. Right-click → When… opens it too.
   **Voice:** See the little calendar icon on the row? It opens the plan card, with the day, the time and how long it takes. Once it has a time, you can add a reminder too. You can also right-click the row and choose "When".
4. **Card:** That card on the board is the same task. Tick it here or in the list — both stay in step.
   **Voice:** And that card on the board is the very same task! Tick it here or in the list, and they always stay in step.
5. **Card:** Now plan it: drag the task from the Todo onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
   **Voice:** Now let's plan it! Drag the task from your Todo list onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
6. **Card:** Your plan is on the Clock too, around the edge. Every window shows the same day.
   **Voice:** There it is, on the Clock too, around the edge. Every window shows the same day.
7. **Card:** When you start working, press START. The Record timer records what you really do.
   **Voice:** When you start working, press "Start". The Record timer records what you really do.
8. **Card:** Need a pause? BREAK. Your work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press "Break". Your work so far is saved, and the break is timed on its own.
9. **Card:** Back? BACK TO WORK.
   **Voice:** Back already? Press "Back to work"!
10. **Card:** Finished for now? STOP. Break = pause and come back; Stop = done for now, saved.
   **Voice:** Finished for now? Press "Stop". Break means you pause and come back. Stop means you're done for now, and it's saved.
11. **Card:** Your recorded time sits next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
   **Voice:** Look at the Calendar. Your recorded time sits right next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
12. **Card:** Done with it? Tick it.
   **Voice:** Done with it? Then tick it off, right there in the list!
13. **Card:** One last thing: add a habit you want to keep (reading, a walk…). A card opens with every day, any time — press Enter to add it.
   **Voice:** One last thing! Add a habit you want to keep, like reading or a walk. A card opens with every day, at any time. Press Enter to add it.
14. **Card:** Did it today? Click today's square.
   **Voice:** Did it today? Then click today's square!
15. **Card:** Every evening ends like this: what you did today, in one card. Close it when you're ready.
   **Voice:** Every evening ends like this: what you did today, in one card. Close it whenever you're ready.
16. **Card:** You're in Easy mode: plan it, do it, see how it went. Give it a few days. When it feels easy, try Advanced: tags and time by tag, focus sessions, naming what you recorded, planned vs spent, deadlines and weekly goals, the terminal and AI. Switch here any time: Settings → Mode.
   **Voice:** You're in Easy mode: plan it, do it, see how it went. Give it a few days. When it feels easy, try Advanced! It adds tags and time by tag, focus sessions, naming what you recorded, planned versus spent, deadlines and weekly goals, and the terminal and AI. You can switch here any time: Settings, then Mode.
17. **Card:** That's the whole loop. Each window has a short tour in my menu.
   **Voice:** And that's the whole loop! Every window has its own short tour. You'll find them all in my menu.

### Advanced · Pomo — “Your first day”

1. **Card:** Let's plan one real thing and do it together. It takes about 4 minutes. Next (or Enter) goes on, Esc stops.
   **Voice:** Hi! Let's plan one real thing and actually do it, together. It takes about four minutes. Press Next or Enter to go on, and Escape whenever you want to stop.
2. **Card:** Add something you'll do today: click add a plan and type it. A card shows its day, time and length — pick any if you like, then press Enter to add it.
   **Voice:** First, add something you'll do today. Click "add a plan" and type it. A small card shows its day, its time and how long it takes. Pick any of them if you like, then press Enter to add it.
3. **Card:** The calendar icon on a row opens its plan card: a day (or any time), a time and how long. Once it has a time, you can add a reminder. Right-click → When… opens it too.
   **Voice:** See the little calendar icon on the row? It opens the plan card, with the day, the time and how long it takes. Once it has a time, you can add a reminder too. You can also right-click the row and choose "When".
4. **Card:** That card on the board is the same task. Tick it here or in the list — both stay in step.
   **Voice:** And that card on the board is the very same task! Tick it here or in the list, and they always stay in step.
5. **Card:** Now plan it: drag the task from the Todo onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
   **Voice:** Now let's plan it! Drag the task from your Todo list onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
6. **Card:** Your plan is on the Clock too, around the edge. Every window shows the same day.
   **Voice:** There it is, on the Clock too, around the edge. Every window shows the same day.
7. **Card:** When you start working, press START. The Pomo timer records what you really do.
   **Voice:** When you start working, press "Start". The Pomo timer records what you really do.
8. **Card:** Need a pause? Press the break button (the cup next to PAUSE). Your work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press the break button, the cup next to Pause. Your work so far is saved, and the break is timed on its own.
9. **Card:** Back? END BREAK saves the break; the timer waits for your next session. The ■ button stops a session any time.
   **Voice:** Back already? Press "End break". The break is saved, and the timer waits for your next session.
10. **Card:** Your recorded time sits next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
   **Voice:** Look at the Calendar. Your recorded time sits right next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
11. **Card:** Done with it? Tick it.
   **Voice:** Done with it? Then tick it off, right there in the list!
12. **Card:** One last thing: add a habit you want to keep (reading, a walk…). A card opens with every day, any time — press Enter to add it.
   **Voice:** One last thing! Add a habit you want to keep, like reading or a walk. A card opens with every day, at any time. Press Enter to add it.
13. **Card:** Did it today? Click today's square.
   **Voice:** Did it today? Then click today's square!
14. **Card:** Every evening ends like this: what you did today, in one card. Close it when you're ready.
   **Voice:** Every evening ends like this: what you did today, in one card. Close it whenever you're ready.
15. **Card:** That's the whole loop. Each window has a short tour in my menu.
   **Voice:** And that's the whole loop! Every window has its own short tour. You'll find them all in my menu.

### Advanced · Observe — “Your first day”

1. **Card:** Let's plan one real thing and do it together. It takes about 4 minutes. Next (or Enter) goes on, Esc stops.
   **Voice:** Hi! Let's plan one real thing and actually do it, together. It takes about four minutes. Press Next or Enter to go on, and Escape whenever you want to stop.
2. **Card:** Add something you'll do today: click add a plan and type it. A card shows its day, time and length — pick any if you like, then press Enter to add it.
   **Voice:** First, add something you'll do today. Click "add a plan" and type it. A small card shows its day, its time and how long it takes. Pick any of them if you like, then press Enter to add it.
3. **Card:** The calendar icon on a row opens its plan card: a day (or any time), a time and how long. Once it has a time, you can add a reminder. Right-click → When… opens it too.
   **Voice:** See the little calendar icon on the row? It opens the plan card, with the day, the time and how long it takes. Once it has a time, you can add a reminder too. You can also right-click the row and choose "When".
4. **Card:** That card on the board is the same task. Tick it here or in the list — both stay in step.
   **Voice:** And that card on the board is the very same task! Tick it here or in the list, and they always stay in step.
5. **Card:** Now plan it: drag the task from the Todo onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
   **Voice:** Now let's plan it! Drag the task from your Todo list onto today in the Calendar, at a time later than now. Or open its card and pick a time today.
6. **Card:** Your plan is on the Clock too, around the edge. Every window shows the same day.
   **Voice:** There it is, on the Clock too, around the edge. Every window shows the same day.
7. **Card:** When you start working, press START. The Observe timer records what you really do.
   **Voice:** When you start working, press "Start". The Observe timer records what you really do.
8. **Card:** Need a pause? BREAK. Your work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press "Break". Your work so far is saved, and the break is timed on its own.
9. **Card:** Back? BACK TO WORK.
   **Voice:** Back already? Press "Back to work"!
10. **Card:** Finished for now? STOP. Break = pause and come back; Stop = done for now, saved.
   **Voice:** Finished for now? Press "Stop". Break means you pause and come back. Stop means you're done for now, and it's saved.
11. **Card:** Your recorded time sits next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
   **Voice:** Look at the Calendar. Your recorded time sits right next to the plan, in the thin strip at the left of today. That's how you see how the day really went.
12. **Card:** Done with it? Tick it.
   **Voice:** Done with it? Then tick it off, right there in the list!
13. **Card:** One last thing: add a habit you want to keep (reading, a walk…). A card opens with every day, any time — press Enter to add it.
   **Voice:** One last thing! Add a habit you want to keep, like reading or a walk. A card opens with every day, at any time. Press Enter to add it.
14. **Card:** Did it today? Click today's square.
   **Voice:** Did it today? Then click today's square!
15. **Card:** Every evening ends like this: what you did today, in one card. Close it when you're ready.
   **Voice:** Every evening ends like this: what you did today, in one card. Close it whenever you're ready.
16. **Card:** That's the whole loop. Each window has a short tour in my menu.
   **Voice:** And that's the whole loop! Every window has its own short tour. You'll find them all in my menu.

## welcome

### Easy — “Welcome tour”

1. **Card:** Hi — I'm your guide. KRNL0 is one board with a window for each part of your day. Press Next (or Enter) to go on, Esc to stop any time.
   **Voice:** Hi, I'm your guide! This app is one board, with a window for each part of your day. Press Next or Enter to go on, and Escape to stop at any time.
2. **Card:** Record records what you actually do. Start it when you begin, stop it when you finish — only recorded time counts as time spent.
   **Voice:** The Record timer records what you actually do. Start it when you begin, and stop it when you finish. Only recorded time counts as time spent.
3. **Card:** Todo is your list of plans. Each one can have a when: a day and a time, or just a day.
   **Voice:** Todo is your list of plans. Each one can have a when: a day and a time, or just a day.
4. **Card:** Calendar is your plan: drag plans onto it, or double-click empty hours to add one. Classes and shifts are repeating events here. Recorded time sits next to the plan.
   **Voice:** The Calendar is your plan. Drag plans onto it, or double-click empty hours to add one. Classes and shifts live here as repeating events, and your recorded time sits right next to the plan.
5. **Card:** Clock shows today on a dial — the plan around the edge, what you did as coloured wedges.
   **Voice:** The Clock shows today on a dial: the plan around the edge, and what you did as coloured wedges.
6. **Card:** Habits are the things you want to do regularly. Tick them off each day.
   **Voice:** Habits are the things you want to do regularly. Tick them off each day!
7. **Card:** Analytics answers "where did my time go" — per day and per hour.
   **Voice:** Analytics answers one question: where did my time go? Per day, and per hour.
8. **Card:** You're in Easy mode. Switch here in Settings → Mode — Advanced connects tasks, categories and focus. The Easy and Advanced tour shows the difference.
   **Voice:** You're in Easy mode. You can switch here: Settings, then Mode. Advanced connects tasks, categories and focus, and the Easy and Advanced tour shows you the difference.
9. **Card:** And this is me. Ask me anything: I answer with Claude Code and can change your board for you. My menu also has a short tour of each window.
   **Voice:** And this is me! Ask me anything. I answer with Claude Code, and I can change your board for you. My menu also has a short tour of each window.

### Advanced · Pomo — “Welcome tour”

1. **Card:** Hi — I'm your guide. KRNL0 is one board with a window for each part of your day. Press Next (or Enter) to go on, Esc to stop any time.
   **Voice:** Hi, I'm your guide! This app is one board, with a window for each part of your day. Press Next or Enter to go on, and Escape to stop at any time.
2. **Card:** Pomo records what you actually do. Start it when you begin, stop it when you finish — only recorded time counts as time spent.
   **Voice:** The Pomo timer records what you actually do. Start it when you begin, and stop it when you finish. Only recorded time counts as time spent.
3. **Card:** Todo is your list of plans. Each one can have a when (a day and a time, or just a day), a deadline, and shows the time you really spent on it.
   **Voice:** Todo is your list of plans. Each one can have a when, a day and a time or just a day. It can have a deadline, and it shows the time you really spent on it.
4. **Card:** Calendar is your plan: drag plans onto it, or double-click empty hours to add one. Classes and shifts are repeating events here. Recorded time sits next to the plan.
   **Voice:** The Calendar is your plan. Drag plans onto it, or double-click empty hours to add one. Classes and shifts live here as repeating events, and your recorded time sits right next to the plan.
5. **Card:** Clock shows today on a dial — the plan around the edge, what you did as coloured wedges.
   **Voice:** The Clock shows today on a dial: the plan around the edge, and what you did as coloured wedges.
6. **Card:** Habits are the things you want to do regularly. Tick them off each day.
   **Voice:** Habits are the things you want to do regularly. Tick them off each day!
7. **Card:** Analytics answers "where did my time go" — per day and per task.
   **Voice:** Analytics answers one question: where did my time go? Per day, and per task.
8. **Card:** The Terminal runs a real shell. Every part of KRNL0 has a krnl command, and Claude Code can work on your board from here.
   **Voice:** The Terminal runs a real shell. Every part of the app has a kernel command, and Claude Code can work on your board from here.
9. **Card:** You're in Advanced mode. Switch here in Settings → Mode — Advanced connects tasks, categories and focus. The Easy and Advanced tour shows the difference.
   **Voice:** You're in Advanced mode. You can switch here: Settings, then Mode. Advanced connects tasks, categories and focus, and the Easy and Advanced tour shows you the difference.
10. **Card:** And this is me. Ask me anything: I answer with Claude Code and can change your board for you. My menu also has a short tour of each window.
   **Voice:** And this is me! Ask me anything. I answer with Claude Code, and I can change your board for you. My menu also has a short tour of each window.

### Advanced · Observe — “Welcome tour”

1. **Card:** Hi — I'm your guide. KRNL0 is one board with a window for each part of your day. Press Next (or Enter) to go on, Esc to stop any time.
   **Voice:** Hi, I'm your guide! This app is one board, with a window for each part of your day. Press Next or Enter to go on, and Escape to stop at any time.
2. **Card:** Observe records what you actually do. Start it when you begin, stop it when you finish — only recorded time counts as time spent.
   **Voice:** The Observe timer records what you actually do. Start it when you begin, and stop it when you finish. Only recorded time counts as time spent.
3. **Card:** Todo is your list of plans. Each one can have a when (a day and a time, or just a day), a deadline, and shows the time you really spent on it.
   **Voice:** Todo is your list of plans. Each one can have a when, a day and a time or just a day. It can have a deadline, and it shows the time you really spent on it.
4. **Card:** Calendar is your plan: drag plans onto it, or double-click empty hours to add one. Classes and shifts are repeating events here. Recorded time sits next to the plan.
   **Voice:** The Calendar is your plan. Drag plans onto it, or double-click empty hours to add one. Classes and shifts live here as repeating events, and your recorded time sits right next to the plan.
5. **Card:** Clock shows today on a dial — the plan around the edge, what you did as coloured wedges.
   **Voice:** The Clock shows today on a dial: the plan around the edge, and what you did as coloured wedges.
6. **Card:** Habits are the things you want to do regularly. Tick them off each day.
   **Voice:** Habits are the things you want to do regularly. Tick them off each day!
7. **Card:** Analytics answers "where did my time go" — per day and per task.
   **Voice:** Analytics answers one question: where did my time go? Per day, and per task.
8. **Card:** The Terminal runs a real shell. Every part of KRNL0 has a krnl command, and Claude Code can work on your board from here.
   **Voice:** The Terminal runs a real shell. Every part of the app has a kernel command, and Claude Code can work on your board from here.
9. **Card:** You're in Advanced mode. Switch here in Settings → Mode — Advanced connects tasks, categories and focus. The Easy and Advanced tour shows the difference.
   **Voice:** You're in Advanced mode. You can switch here: Settings, then Mode. Advanced connects tasks, categories and focus, and the Easy and Advanced tour shows you the difference.
10. **Card:** And this is me. Ask me anything: I answer with Claude Code and can change your board for you. My menu also has a short tour of each window.
   **Voice:** And this is me! Ask me anything. I answer with Claude Code, and I can change your board for you. My menu also has a short tour of each window.

## pomo

### Easy — “Record — your timer”

1. **Card:** The Record timer records what you really do. Let's record a short session together — it takes a few seconds.
   **Voice:** The Record timer records what you really do. Let's record a short session together. It only takes a few seconds!
2. **Card:** Press START.
   **Voice:** Press "Start"!
3. **Card:** It's running. Started by mistake? Hold the trash icon and nothing is saved. Don't do it now.
   **Voice:** It's running! Started it by mistake? Hold the trash icon, and nothing is saved. Don't do it now, though.
4. **Card:** Need a pause? Press BREAK — the work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press "Break". The work so far is saved, and the break is timed on its own.
5. **Card:** Back from the break? Press BACK TO WORK.
   **Voice:** Back from the break? Press "Back to work"!
6. **Card:** Now press STOP. Your work and your break are saved and show on the Calendar and the Clock.
   **Voice:** Now press "Stop". Your work and your break are saved, and they show on the Calendar and the Clock.
7. **Card:** Forgot to press Start earlier? Right-click an empty time on the Calendar and choose Log time here… to add work you did but didn't record.
   **Voice:** Forgot to press Start earlier? No problem! Right-click an empty time on the Calendar, and choose "Log time here".
8. **Card:** Every recorded session is listed here — open it to check one or delete a misclick.
   **Voice:** Every recorded session is listed here. Open it to check one, or to delete a misclick.

### Advanced · Pomo — “Pomo — your timer”

1. **Card:** The Pomo timer records what you really do. Let's record a short session together — it takes a few seconds.
   **Voice:** The Pomo timer records what you really do. Let's record a short session together. It only takes a few seconds!
2. **Card:** Pick which task the session is for — its time then counts toward that task. Optional.
   **Voice:** Pick which task this session is for, and its time counts toward that task. It's optional.
3. **Card:** Press START.
   **Voice:** Press "Start"!
4. **Card:** Need a pause? Press the break button (the cup next to PAUSE) — the work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press the break button, the cup next to Pause. The work so far is saved, and the break is timed on its own.
5. **Card:** Back? Press END BREAK. Work and break are saved and show on the Calendar and the Clock. ■ stops a session any time; PAUSE holds it.
   **Voice:** Back? Press "End break". Work and break are saved, and show on the Calendar and the Clock. The square button stops a session at any time, and Pause holds it.
6. **Card:** Forgot to press Start earlier? Right-click an empty time on the Calendar and choose Log time here… to add work you did but didn't record.
   **Voice:** Forgot to press Start earlier? No problem! Right-click an empty time on the Calendar, and choose "Log time here".
7. **Card:** Every recorded session is listed here — open it to check one or delete a misclick.
   **Voice:** Every recorded session is listed here. Open it to check one, or to delete a misclick.

### Advanced · Observe — “Observe — your timer”

1. **Card:** The Observe timer records what you really do. Let's record a short session together — it takes a few seconds.
   **Voice:** The Observe timer records what you really do. Let's record a short session together. It only takes a few seconds!
2. **Card:** Here you say what you are doing: pick a task, or a category like "Code" — the time then counts toward it.
   **Voice:** Here you say what you're doing. Pick a task, or a category like Code, and the time counts toward it.
3. **Card:** Press START.
   **Voice:** Press "Start"!
4. **Card:** It's running. Started by mistake? Hold the trash icon and nothing is saved. Don't do it now.
   **Voice:** It's running! Started it by mistake? Hold the trash icon, and nothing is saved. Don't do it now, though.
5. **Card:** Need a pause? Press BREAK — the work so far is saved, and the break is timed on its own.
   **Voice:** Need a pause? Press "Break". The work so far is saved, and the break is timed on its own.
6. **Card:** Back from the break? Press BACK TO WORK.
   **Voice:** Back from the break? Press "Back to work"!
7. **Card:** Now press STOP. Your work and your break are saved and show on the Calendar and the Clock.
   **Voice:** Now press "Stop". Your work and your break are saved, and they show on the Calendar and the Clock.
8. **Card:** Forgot to press Start earlier? Right-click an empty time on the Calendar and choose Log time here… to add work you did but didn't record.
   **Voice:** Forgot to press Start earlier? No problem! Right-click an empty time on the Calendar, and choose "Log time here".
9. **Card:** Every recorded session is listed here — open it to check one or delete a misclick.
   **Voice:** Every recorded session is listed here. Open it to check one, or to delete a misclick.

## todo

### Easy — “Todo — your tasks”

1. **Card:** This is your list. Let's add a task.
   **Voice:** This is your list. Let's add a task!
2. **Card:** Click add a plan at the bottom and type a name. A card shows its day, time and length — pick any if you like, then press Enter to add it.
   **Voice:** Click "add a plan" at the bottom, and type a name. A card shows its day, time and length. Pick any if you like, then press Enter to add it.
3. **Card:** Faster: say when as you type. Gym tomorrow 18:00 1h goes straight onto the Calendar; Pay rent fri is on Friday at any time. The card above the field shows what Enter will do.
   **Voice:** Faster: say when as you type. "Gym tomorrow at six in the evening, one hour" goes straight onto the Calendar, and "Pay rent Friday" lands on Friday, at any time. The card above the field shows what Enter will do.
4. **Card:** Change it later from its plan card: click the calendar icon on the row (or right-click → When…). The same card opens when you click its block on the Calendar.
   **Voice:** Change it later from its plan card: click the calendar icon on the row, or right-click, then "When". The same card opens when you click its block on the Calendar.
5. **Card:** Done? Tick the box.
   **Voice:** Done? Then tick the little box on its row!
6. **Card:** Done tasks fold into Done today. The next day they leave the list — their recorded time stays in Analytics. Untick to reopen.
   **Voice:** Done tasks fold into "Done today". The next day they leave the list, and their recorded time stays in Analytics. Untick one to reopen it.

### Advanced · Pomo = Advanced · Observe — “Todo — your tasks”

1. **Card:** This is your list. Let's add a task.
   **Voice:** This is your list. Let's add a task!
2. **Card:** Click add a plan at the bottom and type a name. A card shows its day, time and length — pick any if you like, then press Enter to add it.
   **Voice:** Click "add a plan" at the bottom, and type a name. A card shows its day, time and length. Pick any if you like, then press Enter to add it.
3. **Card:** Faster: say when as you type. Gym tomorrow 18:00 1h goes straight onto the Calendar; Pay rent fri is on Friday at any time; by sat gives it a deadline. The card above the field shows what Enter will do.
   **Voice:** Faster: say when as you type. "Gym tomorrow at six in the evening, one hour" goes straight onto the Calendar. "Pay rent Friday" lands on Friday, at any time. And "by Saturday" gives it a deadline. The card above the field shows what Enter will do.
4. **Card:** Change it later from its plan card: click the calendar icon on the row (or right-click → When…). The same card opens when you click its block on the Calendar.
   **Voice:** Change it later from its plan card: click the calendar icon on the row, or right-click, then "When". The same card opens when you click its block on the Calendar.
5. **Card:** The tag (Code, Study…) groups time in Analytics. Click it to change it.
   **Voice:** The tag, like Code or Study, groups your time in Analytics. Click it to change it.
6. **Card:** Done? Tick the box.
   **Voice:** Done? Then tick the little box on its row!
7. **Card:** Done tasks fold into Done today. The next day they leave the list — their recorded time stays in Analytics. Untick to reopen.
   **Voice:** Done tasks fold into "Done today". The next day they leave the list, and their recorded time stays in Analytics. Untick one to reopen it.

## calendar

### Easy — “Calendar — plan vs reality”

1. **Card:** The Calendar holds your plan (blocks) and what really happened (the thin track at the left of each day).
   **Voice:** The Calendar holds your plan, the blocks, and what really happened: the thin track at the left of each day.
2. **Card:** Drag a plan from the Todo onto a time here to plan it.
   **Voice:** Drag a plan from the Todo onto a time here, to plan it.
3. **Card:** On a day but no set time? Drop it in the ANY TIME strip under the day names. Drag it into the hours later to give it a time.
   **Voice:** On a day, but no set time? Drop it in the "any time" strip under the day names, and drag it into the hours later to give it a time.
4. **Card:** Double-click empty hours — or this + — to add a plan right on the Calendar. Repeating, next to it, adds a class or a shift that comes back every week.
   **Voice:** Double-click empty hours, or press this plus, to add a plan right on the Calendar. "Repeating", next to it, adds a class or a shift that comes back every week.
5. **Card:** Click a plan to open its card: move it to another day or any time, change how long, set a reminder, mark it done or delete it.
   **Voice:** Click a plan to open its card. Move it to another day or to any time, change how long it takes, set a reminder, mark it done, or delete it.
6. **Card:** The thin track at the left of each day fills with recorded time. Click a filled stretch to see it; double-click its start or end time to fix it.
   **Voice:** The thin track at the left of each day fills with recorded time. Click a filled stretch to see it, and double-click its start or end time to fix it.
7. **Card:** Forgot to record something? Right-click an empty time and choose Log time here…
   **Voice:** Forgot to record something? Right-click an empty time, and choose "Log time here".

### Advanced · Pomo = Advanced · Observe — “Calendar — plan vs reality”

1. **Card:** The Calendar holds your plan (blocks) and what really happened (the thin track at the left of each day).
   **Voice:** The Calendar holds your plan, the blocks, and what really happened: the thin track at the left of each day.
2. **Card:** Drag a plan from the Todo onto a time here to plan it.
   **Voice:** Drag a plan from the Todo onto a time here, to plan it.
3. **Card:** On a day but no set time? Drop it in the ANY TIME strip under the day names. Drag it into the hours later to give it a time. A dashed flag there is a deadline.
   **Voice:** On a day, but no set time? Drop it in the "any time" strip under the day names, and drag it into the hours later to give it a time. A dashed flag there is a deadline.
4. **Card:** Double-click empty hours — or this + — to add a plan right on the Calendar. Repeating, next to it, adds a class or a shift that comes back every week.
   **Voice:** Double-click empty hours, or press this plus, to add a plan right on the Calendar. "Repeating", next to it, adds a class or a shift that comes back every week.
5. **Card:** Click a plan to open its card: move it to another day or any time, change how long, set a reminder, mark it done or delete it.
   **Voice:** Click a plan to open its card. Move it to another day or to any time, change how long it takes, set a reminder, mark it done, or delete it.
6. **Card:** Once you work on it, the planned block says how it went: "started 20m late", "+30m over".
   **Voice:** Once you work on it, the planned block tells you how it went: "started twenty minutes late", or "thirty minutes over".
7. **Card:** The thin track at the left of each day fills with recorded time. Click a filled stretch to see it; double-click its start or end time to fix it.
   **Voice:** The thin track at the left of each day fills with recorded time. Click a filled stretch to see it, and double-click its start or end time to fix it.
8. **Card:** Forgot to record something? Right-click an empty time and choose Log time here…
   **Voice:** Forgot to record something? Right-click an empty time, and choose "Log time here".

## clock

### Easy = Advanced · Pomo = Advanced · Observe — “Clock — today at a glance”

1. **Card:** The Clock shows today. Planned tasks run around the edge; recorded work fills the face.
   **Voice:** The Clock shows today. Planned tasks run around the edge, and recorded work fills the face.
2. **Card:** Click a coloured wedge to see that session — or right-click empty time to log time there.
   **Voice:** Click a coloured wedge to see that session, or right-click empty time to log time there.
3. **Card:** Press WEEK to see your last 7 days as clocks.
   **Voice:** Press "Week" to see your last seven days as clocks!
4. **Card:** Each clock is a day: morning inside, afternoon in the outer ring. Only today moves. Click a day to open it.
   **Voice:** Each clock is a day: the morning inside, the afternoon in the outer ring. Only today moves. Click a day to open it.

## habits

### Easy — “Habits”

1. **Card:** Habits are things you want to do regularly — reading, exercise, a weekly review.
   **Voice:** Habits are the things you want to do regularly, like reading, exercise or a weekly review.
2. **Card:** Click add a habit, type one. A card opens: every day, any time unless you pick days or a time. Press Enter to add it.
   **Voice:** Click "add a habit" and type one. A card opens: every day, at any time, unless you pick days or a time. Press Enter to add it.
3. **Card:** Did it today? Click today's square.
   **Voice:** Did it today? Then click today's square!
4. **Card:** Your habit also has a card on the board: its week, and today’s square is the button. Click it to tick today.
   **Voice:** Your habit also has a card on the board. It shows the week, and today's square is the button. Click it to tick today!
5. **Card:** Right-click a habit: Days & time… changes its days and time; Rest today keeps a streak on a sick day; rename, recolour or archive it below.
   **Voice:** Right-click a habit. "Days and time" changes when it happens, and "Rest today" keeps your streak on a sick day. Below, you can rename, recolour or archive it.

### Advanced · Pomo = Advanced · Observe — “Habits”

1. **Card:** Habits are things you want to do regularly — reading, exercise, a weekly review.
   **Voice:** Habits are the things you want to do regularly, like reading, exercise or a weekly review.
2. **Card:** Click add a habit, type one. A card opens: every day, any time unless you pick days, times a week, a time or a goal (8 glasses). Press Enter to add it.
   **Voice:** Click "add a habit" and type one. A card opens: every day, at any time, unless you pick days, times a week, a time, or a goal, like eight glasses. Press Enter to add it.
3. **Card:** Did it today? Click today's square.
   **Voice:** Did it today? Then click today's square!
4. **Card:** Your habit also has a card on the board: its week, and today’s square is the button. Click it to tick today.
   **Voice:** Your habit also has a card on the board. It shows the week, and today's square is the button. Click it to tick today!
5. **Card:** Right-click a habit: Days & time… changes its days and time; Rest today keeps a streak on a sick day; rename, recolour or archive it below.
   **Voice:** Right-click a habit. "Days and time" changes when it happens, and "Rest today" keeps your streak on a sick day. Below, you can rename, recolour or archive it.

## routines

### Easy — “Repeating events”

1. **Card:** A class, a work shift, a weekly call: a repeating event. It sits on your Calendar every week and is never ticked or "missed". Habits are the things you tick.
   **Voice:** A class, a work shift, a weekly call: that's a repeating event. It sits on your Calendar every week, and it's never ticked or missed. Habits are the things you tick.
2. **Card:** Press Repeating in the Calendar's header (or double-click empty hours and pick Repeats). Name it Class, pick its days and time, press Enter.
   **Voice:** Press "Repeating" in the Calendar's header, or double-click empty hours and pick "Repeats". Name it Class, pick its days and time, and press Enter.
3. **Card:** It has a card on the board too. It is never ticked: its page shows the next date, with Skip this one and Show on the Calendar.
   **Voice:** It has a card on the board too! It's never ticked: its page shows the next date, with "Skip this one", and "Show" on the Calendar.
4. **Card:** It is a hatched band every week; your plans sit on top. The list button in the header shows all your repeating events.
   **Voice:** On the Calendar it's a hatched band, every week, with your plans on top. The list button in the header shows all your repeating events.
5. **Card:** No class next time? Click the band and choose Skip this one. Only that day changes.
   **Voice:** No class next time? Click the band, and choose "Skip this one". Only that day changes.
6. **Card:** Semester over? Click the band and choose End after this day: the days before stay. Restart is in the events list.
   **Voice:** Semester over? Click the band and choose "End after this day". The days before it stay, and "Restart" is in the events list.

### Advanced · Pomo = Advanced · Observe — “Repeating events”

1. **Card:** A class, a work shift, a weekly call: a repeating event. It sits on your Calendar every week and is never ticked or "missed". Habits are the things you tick.
   **Voice:** A class, a work shift, a weekly call: that's a repeating event. It sits on your Calendar every week, and it's never ticked or missed. Habits are the things you tick.
2. **Card:** Press Repeating in the Calendar's header (or double-click empty hours and pick Repeats). Name it Class, pick its days and time, press Enter.
   **Voice:** Press "Repeating" in the Calendar's header, or double-click empty hours and pick "Repeats". Name it Class, pick its days and time, and press Enter.
3. **Card:** It has a card on the board too. It is never ticked: its page shows the next date, with Skip this one and Show on the Calendar.
   **Voice:** It has a card on the board too! It's never ticked: its page shows the next date, with "Skip this one", and "Show" on the Calendar.
4. **Card:** It is a hatched band every week; your plans sit on top. The Events switch hides them, and the list button in the header shows them all.
   **Voice:** On the Calendar it's a hatched band, every week, with your plans on top. The "Events" switch hides them, and the list button in the header shows them all.
5. **Card:** No class next time? Click the band and choose Skip this one. Only that day changes.
   **Voice:** No class next time? Click the band, and choose "Skip this one". Only that day changes.
6. **Card:** Semester over? Click the band and choose End after this day: the days before stay. Restart is in the events list.
   **Voice:** Semester over? Click the band and choose "End after this day". The days before it stay, and "Restart" is in the events list.

## on-track

### Easy — “Staying on track”

1. **Card:** Not every week goes to plan. Three things keep you on track without lying to the app: rest days, reminders and Won’t do.
   **Voice:** Not every week goes to plan, and that's fine! Three things keep you on track without lying to the app: rest days, reminders, and "Won't do".
2. **Card:** Sick or away? Right-click a habit you have not done today and choose Rest today. A rest day never breaks a streak — it shows as a quiet hatch.
   **Voice:** Sick or away? Right-click a habit you haven't done today, and choose "Rest today". A rest day never breaks a streak. It shows as a quiet hatch.
3. **Card:** Want a nudge? Right-click a row, choose When…, give it a time and set a Reminder. A notification comes before it starts, even with the window closed.
   **Voice:** Want a nudge? Right-click a row, choose "When", give it a time, and set a reminder. A notification comes before it starts, even with the window closed!
4. **Card:** Not doing something any more? Won't do takes it off your list and the Calendar — not done and not missed. UNDO in the notice brings it back.
   **Voice:** Not doing something any more? "Won't do" takes it off your list and the Calendar: not done, and not missed. "Undo", in the notice, brings it back.

### Advanced · Pomo = Advanced · Observe — “Staying on track”

1. **Card:** Not every week goes to plan. Four things keep you on track without lying to the app: weekly targets, rest days, deadlines and reminders.
   **Voice:** Not every week goes to plan, and that's fine! Four things keep you on track without lying to the app: weekly targets, rest days, deadlines and reminders.
2. **Card:** Right-click a habit, choose Days & time…, then Times a week — say 3. Any days count, and the streak counts weeks that reach it.
   **Voice:** Right-click a habit, choose "Days and time", then "Times a week", say three. Any days count, and the streak counts the weeks that reach it.
3. **Card:** Some habits are an amount — 8 glasses, 20 pages. In Days & time… set a Goal: each click on the day adds one, and the day counts once the goal is reached.
   **Voice:** Some habits are an amount, like eight glasses or twenty pages. In "Days and time", set a goal. Each click on the day adds one, and the day counts once the goal is reached.
4. **Card:** Sick or away? Right-click a habit you have not done today and choose Rest today. A rest day never breaks a streak — it shows as a quiet hatch.
   **Voice:** Sick or away? Right-click a habit you haven't done today, and choose "Rest today". A rest day never breaks a streak. It shows as a quiet hatch.
5. **Card:** When you do it and when it must be done can differ. Right-click a Todo row and choose Deadline… — the row shows a flag, the Calendar a dashed flag on that day in its ANY TIME strip, and the Clock lists it.
   **Voice:** When you do something and when it must be done can differ. Right-click a Todo row and choose "Deadline". The row shows a flag, the Calendar a dashed flag on that day, and the Clock lists it.
6. **Card:** Want a nudge? Right-click a row, choose When…, give it a time and set a Reminder. A notification comes before it starts, even with the window closed.
   **Voice:** Want a nudge? Right-click a row, choose "When", give it a time, and set a reminder. A notification comes before it starts, even with the window closed!
7. **Card:** Not doing something any more? Won't do takes it off your list and the Calendar — not done and not missed. UNDO in the notice brings it back.
   **Voice:** Not doing something any more? "Won't do" takes it off your list and the Calendar: not done, and not missed. "Undo", in the notice, brings it back.

## analytics

### Easy — “Analytics — where the time went”

1. **Card:** Analytics turns your recorded time into answers.
   **Voice:** Analytics turns your recorded time into answers!
2. **Card:** Each icon is a page — summary, activity, hours, and more. The name shows next to them.
   **Voice:** Each icon is a page: summary, activity, hours, and more. The name shows next to them.
3. **Card:** Open the Hours page.
   **Voice:** Open the "Hours" page.
4. **Card:** Every row is a day of the week, every column an hour: the stronger the colour, the more you recorded then. It shows when you usually work.
   **Voice:** Every row is a day of the week, and every column an hour. The stronger the colour, the more you recorded then. It shows when you usually work.
5. **Card:** Advanced mode adds three pages: Planned vs spent, Time by tag and Time per task. Switch here, in Settings → Mode.
   **Voice:** Advanced mode adds three pages: "Planned versus spent", "Time by tag" and "Time per task". You can switch here: Settings, then Mode.

### Advanced · Pomo = Advanced · Observe — “Analytics — where the time went”

1. **Card:** Analytics turns your recorded time into answers.
   **Voice:** Analytics turns your recorded time into answers!
2. **Card:** Each icon is a page — summary, activity, hours, time per task, and more. The name shows next to them.
   **Voice:** Each icon is a page: summary, activity, hours, time per task, and more. The name shows next to them.
3. **Card:** Open the Time per task page.
   **Voice:** Open the "Time per task" page.
4. **Card:** Every row is a task in its own colour, every square a day with the minutes in it. On the right: worked / planned. Below: time per tag.
   **Voice:** Every row is a task, in its own colour, and every square is a day, with the minutes in it. On the right: worked, over planned. Below: time per tag.
5. **Card:** Planned vs spent puts each task’s estimate next to the time you really spent.
   **Voice:** "Planned versus spent" puts each task's estimate next to the time you really spent.

## modes

### Easy — “Easy and Advanced”

1. **Card:** KRNL0 has two modes on the same board and the same data — only what you see changes. You're in Easy mode right now.
   **Voice:** The app has two modes, on the same board, with the same data. Only what you see changes. You're in Easy mode right now.
2. **Card:** This is where you switch: Settings → Mode. Easy keeps it simple. Advanced connects tasks, categories and focus. Let me show you both.
   **Voice:** This is where you switch: Settings, then Mode. Easy keeps it simple. Advanced connects tasks, categories and focus. Let me show you both!
3. **Card:** In Easy, the timer is called Record: a plain stopwatch with Start, Break, Stop. Nothing to set up, nothing to name.
   **Voice:** In Easy, the timer is called Record: a plain stopwatch, with Start, Break and Stop. Nothing to set up, nothing to name.
4. **Card:** I've switched to Advanced — this switch appeared. POMO gives classic 25-minute sessions with breaks; OBSERVE keeps the stopwatch.
   **Voice:** I've switched to Advanced, and this switch appeared! Pomo gives you classic twenty-five minute sessions with breaks. Observe keeps the stopwatch.
5. **Card:** Recorded sessions can be named: give each one a task or a category, so you know what the time was for.
   **Voice:** Recorded sessions can be named. Give each one a task or a category, so you know what the time was for.
6. **Card:** Tasks get tags (Code, Study…). Right-click a plan for Focus on it.
   **Voice:** Tasks get tags, like Code or Study. And right-click a plan for "Focus on it".
7. **Card:** Plans get deadlines ("by Friday"), and cards can be chained: a card's Add next plans what comes after, and wires show the order.
   **Voice:** Plans get deadlines, like "by Friday", and cards can be chained. A card's "Add next" plans what comes after, and wires show the order.
8. **Card:** The Calendar gets layers — show or hide recorded time, habits and events — and a zoom for the hours.
   **Voice:** The Calendar gets layers: show or hide recorded time, habits and events, and a zoom for the hours.
9. **Card:** And the board grows: several canvases, frames to group cards, the Terminal with Claude Code, and weekly targets and goals for habits.
   **Voice:** And the board grows: several canvases, frames to group cards, the Terminal with Claude Code, and weekly targets and goals for your habits!
10. **Card:** Planned vs spent: each task’s estimate next to the time you really spent on it.
   **Voice:** "Planned versus spent": each task's estimate, next to the time you really spent on it.
11. **Card:** Time by tag: where your hours went — Code, Study, Health…
   **Voice:** "Time by tag": where your hours went. Code, study, health, and more.
12. **Card:** Back in Easy — those pages are gone. The overview stays: planned, worked, breaks, tasks done, habits.
   **Voice:** Back in Easy, those pages are gone. The overview stays: planned, worked, breaks, tasks done, and habits.
13. **Card:** Which one do you want? You can come back here any time — Settings → Mode.
   **Voice:** So, which one do you want? You can come back here any time: Settings, then Mode.

### Advanced · Pomo = Advanced · Observe — “Easy and Advanced”

1. **Card:** KRNL0 has two modes on the same board and the same data — only what you see changes. You're in Advanced mode right now.
   **Voice:** The app has two modes, on the same board, with the same data. Only what you see changes. You're in Advanced mode right now.
2. **Card:** This is where you switch: Settings → Mode. Easy keeps it simple. Advanced connects tasks, categories and focus. Let me show you both.
   **Voice:** This is where you switch: Settings, then Mode. Easy keeps it simple. Advanced connects tasks, categories and focus. Let me show you both!
3. **Card:** In Easy, the timer is called Record: a plain stopwatch with Start, Break, Stop. Nothing to set up, nothing to name.
   **Voice:** In Easy, the timer is called Record: a plain stopwatch, with Start, Break and Stop. Nothing to set up, nothing to name.
4. **Card:** I've switched to Advanced — this switch appeared. POMO gives classic 25-minute sessions with breaks; OBSERVE keeps the stopwatch.
   **Voice:** I've switched to Advanced, and this switch appeared! Pomo gives you classic twenty-five minute sessions with breaks. Observe keeps the stopwatch.
5. **Card:** Recorded sessions can be named: give each one a task or a category, so you know what the time was for.
   **Voice:** Recorded sessions can be named. Give each one a task or a category, so you know what the time was for.
6. **Card:** Tasks get tags (Code, Study…). Right-click a plan for Focus on it.
   **Voice:** Tasks get tags, like Code or Study. And right-click a plan for "Focus on it".
7. **Card:** Plans get deadlines ("by Friday"), and cards can be chained: a card's Add next plans what comes after, and wires show the order.
   **Voice:** Plans get deadlines, like "by Friday", and cards can be chained. A card's "Add next" plans what comes after, and wires show the order.
8. **Card:** The Calendar gets layers — show or hide recorded time, habits and events — and a zoom for the hours.
   **Voice:** The Calendar gets layers: show or hide recorded time, habits and events, and a zoom for the hours.
9. **Card:** And the board grows: several canvases, frames to group cards, the Terminal with Claude Code, and weekly targets and goals for habits.
   **Voice:** And the board grows: several canvases, frames to group cards, the Terminal with Claude Code, and weekly targets and goals for your habits!
10. **Card:** Planned vs spent: each task’s estimate next to the time you really spent on it.
   **Voice:** "Planned versus spent": each task's estimate, next to the time you really spent on it.
11. **Card:** Time by tag: where your hours went — Code, Study, Health…
   **Voice:** "Time by tag": where your hours went. Code, study, health, and more.
12. **Card:** Back in Easy — those pages are gone. The overview stays: planned, worked, breaks, tasks done, habits.
   **Voice:** Back in Easy, those pages are gone. The overview stays: planned, worked, breaks, tasks done, and habits.
13. **Card:** Which one do you want? You can come back here any time — Settings → Mode.
   **Voice:** So, which one do you want? You can come back here any time: Settings, then Mode.

## board

### Easy — “The board”

1. **Card:** This is your board. Every plan, habit and repeating event has a card here, and you can put your own notes and pictures around them.
   **Voice:** This is your board. Every plan, habit and repeating event has a card here, and you can put your own notes and pictures around them.
2. **Card:** The toolbar adds things: a text note, a sticky note, a shape, an image and the pen.
   **Voice:** The toolbar adds things: a text note, a sticky note, a shape, an image, and the pen.
3. **Card:** Add a sticky note: press this (or the key S), then type on it.
   **Voice:** Add a sticky note: press this, or the S key, then type on it.
4. **Card:** Right-click a plan’s card and choose Show (plans with a day have it): it lights up here and on the Calendar, so you always find it.
   **Voice:** Right-click a plan's card and choose "Show". It lights up here and on the Calendar, so you always find it. Plans with a day have it.
5. **Card:** Habits and repeating events have cards too. On a habit, today’s square ticks it; an event shows its next date, with Skip this one and Show.
   **Voice:** Habits and repeating events have cards too. On a habit, today's square ticks it. An event shows its next date, with "Skip this one" and "Show".
6. **Card:** Want things to line up? Settings → Canvas → Align to grid: what you move settles into a neat spot, never on top of something. Cards only, or Everything.
   **Voice:** Want things to line up? Settings, Canvas, "Align to grid". What you move settles into a neat spot, never on top of something. Cards only, or everything.
7. **Card:** That’s the board. Ask me to show something, add a note or tidy up: I can change it for you.
   **Voice:** That's the board! Ask me to show something, add a note, or tidy up. I can change it for you.

### Advanced · Pomo = Advanced · Observe — “The board”

1. **Card:** This is your board. Every plan, habit and repeating event has a card here, and you can put your own notes and pictures around them.
   **Voice:** This is your board. Every plan, habit and repeating event has a card here, and you can put your own notes and pictures around them.
2. **Card:** The toolbar adds things: a text note, a sticky note, a shape, an image, the pen and a frame to group cards.
   **Voice:** The toolbar adds things: a text note, a sticky note, a shape, an image, the pen, and a frame to group cards.
3. **Card:** Add a sticky note: press this (or the key S), then type on it.
   **Voice:** Add a sticky note: press this, or the S key, then type on it.
4. **Card:** Right-click a plan’s card and choose Show (plans with a day have it): it lights up here and on the Calendar, so you always find it.
   **Voice:** Right-click a plan's card and choose "Show". It lights up here and on the Calendar, so you always find it. Plans with a day have it.
5. **Card:** Habits and repeating events have cards too. On a habit, today’s square ticks it; an event shows its next date, with Skip this one and Show.
   **Voice:** Habits and repeating events have cards too. On a habit, today's square ticks it. An event shows its next date, with "Skip this one" and "Show".
6. **Card:** Want things to line up? Settings → Canvas → Align to grid: what you move settles into a neat spot, never on top of something. Cards only, or Everything.
   **Voice:** Want things to line up? Settings, Canvas, "Align to grid". What you move settles into a neat spot, never on top of something. Cards only, or everything.
7. **Card:** Need more room? Make another canvas here, one per project. Your windows are the same on every canvas.
   **Voice:** Need more room? Make another canvas here, one per project. Your windows are the same on every canvas.
8. **Card:** Drag from the dot on a card’s side to another card to put plans in order: the wire shows what comes next.
   **Voice:** Drag from the dot on a card's side to another card, to put plans in order. The wire shows what comes next.
9. **Card:** That’s the board. Ask me to show something, add a note or tidy up: I can change it for you.
   **Voice:** That's the board! Ask me to show something, add a note, or tidy up. I can change it for you.

## terminal

### Advanced · Pomo = Advanced · Observe — “Terminal & AI”

1. **Card:** The Terminal runs a real shell. Everything in KRNL0 can also be done with krnl commands — try krnl help.
   **Voice:** The Terminal runs a real shell. Everything in the app can also be done with kernel commands. Try "kernel help"!
2. **Card:** Click me — the orb — to open my menu.
   **Voice:** Click me, the orb, to open my menu.
3. **Card:** claude code starts Claude Code in the terminal, ready to work on your board. It runs without asking permission for each step.
   **Voice:** "Claude code" starts Claude Code in the terminal, ready to work on your board. It runs without asking permission for each step.
