# Engagement, sound and onboarding — research

*Research only, 2026-11-06. Nothing here is built yet. When an item is picked, it gets a requirements doc in `docs/06-requirements/` and, if it changes a contract, an ADR.*

Companion page to listen to the sound sets: [`sound-audition.html`](sound-audition.html) (also published as a private artifact).

---

## 1. Summary

KRNL0 already records everything a reward system needs: finished tasks, recorded time, breaks, habit ticks, streaks, plan vs. reality. What's missing is the **moment**. Today, ticking a task, stopping a session or keeping a streak alive makes almost no sound and no motion, and it never ends in a "your day" summary. Some moments even end on a penalty (a finished task shows "+28m OVER" in the colour reserved for delete/stop).

The research points one way: **celebrate progress, give feedback that informs instead of paying out points, never punish, and close the day.** It warns against points, XP, levels and leaderboards.

The best news is cost. Much of this is already in the repo and unused:

| Already there | State |
|---|---|
| 24 recorded voice reactions ("done, one less thing", "good session", "break time, stand up", "7 in a row", "you're cooking", "new day, let's go") in `Assistant/audio/proactive/` | **Never played** except a few in the greeting. No engine calls them. |
| `sfxEngine` | Plays one file (startup). Stops the current clip when a new one starts, has no volume and can't layer. |
| Tour engine with "wait for the real action" (`newTask`, `taskScheduled`, `pomoRunning`, `pomoOnBreak`, `pomoStopped`, `taskDone`, `habitTicked`) | Used by 9 short tours, one per window. None shows how the windows **connect**. |
| `summarizeAnalytics()` writes plain-language sentences ("In the last 7 days you finished 12 tasks and focused 9h…") | Shown only inside the Analytics window. |
| Schedule-aware habit streaks; back-filling past days is allowed (habit F14) | Streaks show as "▲ N day streak", with no milestones and no "best streak". |
| Frame budget (#197) | Infinite animations are throttled; **one-shot** animations are exempt, so short celebrations cost nothing at rest. |

### Top 5, ranked by evidence × fit × cost

| # | What | Why | Cost |
|---|---|---|---|
| 1 | **Sounds on the key moments.** Three packs (SND01 default, Zen, Crisp), Settings switch and volume, `krnl sound …` command. **Done.** Voice reactions were dropped. | Strongest felt change for the least work. | S–M |
| 2 | **"Your first day" tour.** One story that walks the whole loop: add a to-do → plan it → see it on the Clock → Start → Break → Back → Stop → tick → recap. Offered on a fresh board; the orb's first click starts it. | Fixes the biggest confusion: every part is explained but the links aren't. | M |
| 3 | **Finishing feels good and never punishes.** One-shot check animation + sound, the finished card shrinks for the day and leaves the board overnight (see the Done/overnight proposal), overrun shown neutrally once a task is done. | Progress is the strongest daily motivator; setbacks weigh 2–3× more than wins. | M |
| 4 | **Close the day.** A short recap when the last planned task is done or at a chosen hour; "yesterday you…" line the next morning; a weekly look-back on Monday. | Peak-end rule; fresh-start effect. Reuses `summarizeAnalytics`. | M |
| 5 | **Habit streaks that forgive.** Climbing note per streak day, milestones at 7/30/100, "best streak" kept forever, "Missed yesterday? Tick it if you did it" instead of a silent reset. | Broken streaks make people quit; repairable ones much less. | S–M |

---

## 2. What the research says

Graded by how much it should steer us: **strong** = replicated or large field data; **mixed** = real but small or unstable; **weak** = plausible, little direct evidence.

| Finding | Evidence | What it means for KRNL0 |
|---|---|---|
| **Progress on meaningful work is the strongest daily motivator.** Small wins count; setbacks hurt 2–3× more than progress helps. (Amabile & Kramer, *The Progress Principle*, ~12,000 diary entries from 238 people) | Strong for the "small wins" core; the 2–3× figure comes from the authors' own summaries | Make every tick visible and felt. Remove setback signals that aren't needed (rust "+OVER" on a finished task, "missed" with no way to recover). |
| **Effort speeds up near a goal**, and even made-up progress helps (coffee card with 2 of 12 stamps pre-filled finished faster). (Kivetz, Urminsky & Zheng 2006) | Strong (field studies) | Show "3 of 5 done today" and a filling ring. Count the first action of the day so progress never starts at zero. |
| **A visible streak raises engagement; a broken streak lowers it below "no streak"**, worse when people blame themselves, much softer when the streak can be repaired. People who broke a language streak often switched language instead of restarting. (Silverman & Barasch 2023, 7 studies) | Strong | Streaks need a repair path and a kept "best streak". Never send loss-framed nags ("you'll lose your streak!"). |
| **Expected, tangible rewards reduce intrinsic motivation**; informational feedback doesn't. (Deci, Koestner & Ryan 1999, 128 studies) | Strong | No points, coins or unlocks per task. Celebrations should *inform* ("4 done, 3h focused"), not *pay*. |
| **Gamification works on average, but effects on motivation and behaviour are small and unstable**; story and collaboration help. (Sailer & Homner 2020) | Mixed | Don't bet the roadmap on game systems. Use the light, felt parts (feedback, progress, closure), not the heavy ones. |
| **People judge an experience by its peak and its end** (peak-end rule, Kahneman et al. 1993). | Strong (lab) | End each day and each session on a good note: a recap, a resolving sound. Today a day just stops. |
| **New beginnings boost goal starts** (Mondays, month starts: "fresh start effect", Dai, Milkman & Riis 2014). | Strong (field) | Weekly look-back on Monday, "new day, let's go" in the morning. A broken streak gets a fresh start, not a red zero. |
| **Novelty wears off**: game elements lose effect over weeks (Koivisto & Hamari 2014). | Mixed | Keep sounds subtle and voice lines varied and rare; anything shown every time must be cheap to ignore. |
| Duolingo's streak freeze "cut churn by 21%" | **Weak.** The source is unverified | Don't cite it. The Silverman & Barasch result (repair softens the hit) is enough. |

### The design rules this gives us

1. **Celebrate the act, not a score.** Feedback says what you did, never "+10 XP".
2. **Big moments get big feedback, small ones small.** A tick is two notes; a finished day is a chord and a recap.
3. **Never punish, always offer the next step.** Overrun becomes information; "missed" comes with "replan".
4. **Close loops**: every session, every day, every week.
5. **Rare and quiet.** No sound on hover or typing; voice reactions at most every few minutes; everything can be turned off.
6. **Works in Easy.** Easy is the default for new boards, so nothing here may need tags, links or questions.
7. **KRNL0's own rules hold.** Only one-shot animation (frame budget), reduced-motion respected, rust stays for stop/delete only, no left accent bars, no native pickers, a `krnl` command for every setting.

### Don't build

| Idea | Why not |
|---|---|
| Points / XP per task | Rewards splitting work into tiny tasks; tangible rewards undermine motivation (Deci et al.). |
| Levels, badges for everything | Novelty wears off; adds a system to learn, against Easy mode. |
| Leaderboards / social comparison | KRNL0 is single-user and local; comparison demotivates the people who need help most. |
| "Don't lose your streak!" notifications | Loss framing; broken streaks already cost engagement. |
| Random loot, spin wheels, surprise boxes | Slot-machine mechanics in a productivity tool; erodes trust. |
| Sound on every click or hover | Becomes noise within a day; people mute everything, including the good sounds. |
| Reviving the old voice tutorial (`tut1_*`) | It teaches Pomodoro-first, double-click-to-link and "it turned green", all replaced by Decision 31 / Easy mode. |

---

## 3. Feature by feature

Each part: what happens today, what to add (motion, sound, voice), how it ties into the rest and Analytics. "Easy" notes where Easy mode needs a different version.

### Todo
- **Today:** tick → row moves to Done (N). No sound, no motion.
- **Add:** a one-shot check (box fills, short scale pop, ~250 ms), the **done** sound, a voice reaction about one tick in four ("done, one less thing", "perfect"). Header shows **"3 of 5 done today"** with a thin fill (goal gradient). The first task of the day plays "first one in, day started".
- **Ties in:** the same tick shrinks the canvas card and fades the Clock arc at the same moment, so the user *sees* that it's one task in three places.

### Task card (canvas)
- **Today:** stays full size, struck through, forever. A finished task over its estimate shows **"+28m OVER" in rust** (the colour reserved for delete/stop).
- **Add:** on done, the card shrinks to a compact "done" chip for the rest of the day and leaves the canvas overnight (data kept, "show finished" switch). For finished tasks, overrun is shown neutrally: **"took 1h 28 · planned 1h"** in plain ink. Estimate accuracy goes to Analytics ("tasks take ×1.3 your estimate") where it's useful, not on the reward moment.

### Calendar
- **Today:** dragging a task onto a time plans it; planned blocks that pass while open are "missed".
- **Add:** a soft "placed" sound and a quick settle on drop. A **missed** block gets a one-click **Replan** (next free slot) instead of only a label. Replanning is normal planning, not failure.

### Clock
- **Today:** plan around the edge, recorded wedges on the face, a week of small clocks.
- **Add:** the Clock is already a **progress ring for the day**, so use it. When a session stops, the new wedge draws in once (one-shot sweep). When every planned task is done, the dial gets a closing ring and the **day complete** chord. In the week view, completed days carry a small mark: a streak you can see without a number.

### Pomo (recording)
- **Today:** START/BREAK/STOP are silent; a pomodoro threshold fires an OS notification.
- **Add:** sounds for **start** (rising), **break** (slow falling "exhale"), **back to work**, **stop** (resolving). The voice clips "break time, stand up" and "break almost up" already exist. On stop, a small "+50m" floats from the Pomo toward the Clock (one-shot), which teaches where recorded time goes.
- **Easy:** in Easy, recorded time isn't linked to tasks, so a user who starts while "Write report" is planned sees the task still at 0 tracked. Option to discuss (needs an ADR): in Easy, show **"worked during its block: 45m"** on a planned task, from time overlap only, with no link stored.

### Habits
- **Today:** tick a square; "▲ N day streak"; back-fill allowed.
- **Add:** a tick sound that **gets a little heavier each streak day** (audition page), milestones at 7 / 30 / 100 (the "7 in a row" clip exists), **best streak** shown next to current, and when yesterday is empty: "Missed yesterday? Tick it if you did" (uses the existing back-fill). A broken streak shows "Best 12 · start again", never a red 0.

### Analytics
- **Today:** good charts and a plain-language summary, inside the Analytics window.
- **Add:** a **day recap** card (also used by the closing moment): tasks done, time focused, breaks, habits kept, one sentence from `summarizeAnalytics`. **Personal bests** stated as information ("your most focused Tuesday so far"). A **Monday look-back** for the week. Easy shows the same minus tag pages.

### The orb (voice)
- **Today:** greets on open; tours on request.
- **Add:** a small **reaction engine**: event → pick a clip from a pool → play if voice reactions are on, nothing played in the last ~3 min, no tour running and not in a call to `krnl`. The personality is already right ("it's late. tomorrow exists.").

### Terminal / CLI (hard rule 8)
`krnl sound on|off|volume <0-1>|set <kit>|test <moment>`, `krnl voice reactions on|off`, `krnl recap today|yesterday|week [--json]`, `krnl tour start first-day`. The CLI never plays celebrations itself; the open window reacts to the board change, so the AI terminal triggers the same feedback a click does.

---

## 4. A first day, step by step

**Sam** is a student who installs KRNL0 on a Sunday evening to plan Monday. Easy mode (the default). Points where Sam would get stuck are marked **C1, C2…**, each with the fix.

| Time | Sam does | What happens today | Confusion | Fix |
|---|---|---|---|---|
| Sun 21:00 | Opens KRNL0 | Board with Pomo, Todo, Calendar, Clock, Habits, Analytics. Orb: "Click me for a tour." | — | — |
| 21:00 | Clicks the orb | Orb says a random "sup." / "yeah." and opens a menu: a "claude code" button and **nine** tutorials. | **C1** The promised tour doesn't start; Sam must pick one of nine. **C2** No tutorial shows how the parts work together. | First click on a fresh board starts **Your first day**. The menu lists it first as "Start here". |
| 21:02 | Adds "Write report" in Todo, presses Enter | Asked to type minutes "or just Enter again". A task card also appears on the canvas. | **C3** Two copies of the task? Which is real? **C4** Minutes of what: estimate? deadline? | Tour step: "This card is the same task, on your board." Estimate field shows "how long? (min)" with 15 / 30 / 60 chips. |
| 21:04 | Wants it at 9:00 tomorrow | Must drag the row onto the Calendar grid. | **C5** Nothing on the row says "plan this"; drag is invisible until taught. | Tour teaches the drag; add a visible **Plan** action on the row (opens the app's own time picker). |
| 21:05 | Looks at the Clock | The 9:00 block is on the Clock edge already. | — (nice moment, but silent) | "Placed" sound; the arc draws in once. |
| 21:06 | Adds habit "Read" | Works. | — | — |
| Mon 09:00 | Presses START on the Pomo | Timer counts up. | **C6** It's called "Pomo" but in Easy it's a stopwatch; "Pomo" means nothing to a newcomer. | In Easy, title it **Record** (or "Timer"); keep "Pomo" in Advanced. |
| 09:50 | Coffee | — | **C7** Break or Stop? Which keeps my time? | Tour explains: **Break** = pause and come back; **Stop** = done for now, saved. Distinct sounds make the difference audible. |
| 10:40 | Stops, ticks "Write report" | Row moves to Done. The card stays on the canvas. Task shows tracked 0 (Easy doesn't link). | **C8** "I worked 1h 30 on it, why 0?" **C9** Silent tick; nothing celebrates. | Tour shows recorded time **under the plan** on Clock/Calendar. Optional Easy overlap credit (§3 Pomo). Done sound + animation + voice. |
| 14:00 | Gym block passes; Sam was in a lecture | Block reads "missed". | **C10** Feels like failure, no way forward. | **Replan** button; soft wording. |
| Advanced user | Same tick on a task that ran long | "+28m OVER" in rust on the finished card. | **C11** The reward moment ends on a penalty. | Neutral "took 1h 28 · planned 1h" once done. |
| Tue 09:00 | Opens the app | Yesterday's done card still on the canvas; Todo shows Done and Archive. | **C12** Done vs Archive? Will cards pile up? | Done/overnight lifecycle: one **Done** list by day; cards leave overnight; morning line "Yesterday you finished 3 tasks · 2h 10m". |
| Any evening | Finishes the last task | Nothing marks the end of the day. | **C13** No closure, no reason to come back tomorrow. | Day recap + "day complete" chord. |

---

## 5. The new tutorial: "Your first day"

One tour, about 4 minutes, that does the whole loop with the user's **own** task. It reuses the tour engine (spotlight, waiting steps, Skip, Esc). Needs one new tour definition, a recap step, and the orb change from C1. Offered automatically on a fresh board, always available as "Start here".

| # | Window | Card says (short) | Waits for | Teaches |
|---|---|---|---|---|
| 1 | — | "Let's plan one real thing and do it together. Takes about 4 minutes." | Next | The promise |
| 2 | Todo | "Add something you'll do today. Type it, press **Enter**." | `newTask` | Adding |
| 3 | Todo | "How long do you think it takes? Type minutes, or pick 30." | estimate set / Next | Estimate = guess |
| 4 | Canvas | "That card is the **same task**, on your board." | Next | C3 |
| 5 | Calendar | "Drag it onto a time today. Now is fine." | `taskScheduled` | Planning (C5) |
| 6 | Clock | "Your plan is on the Clock now, around the edge." | Next | Plan shows everywhere |
| 7 | Pomo | "When you start, press **START**. It records what you really do." | `pomoRunning` | Recording |
| 8 | Pomo | "Need a pause? **BREAK**. Your work so far is saved." | `pomoOnBreak` | Break (C7) |
| 9 | Pomo | "Back? **BACK TO WORK**." | `!pomoOnBreak` | |
| 10 | Pomo | "Finished for now? **STOP**." | `pomoStopped` | Stop vs break |
| 11 | Clock / Calendar | "Your recorded time sits **under the plan**. That's how you see how the day really went." | Next | Plan vs reality (C8) |
| 12 | Todo | "Done? **Tick it.**" (done sound and animation play) | `taskDone` | The reward |
| 13 | Habits | "One last thing: add a habit you want to keep, and tick today." | `habitAdded` → `habitTicked` | Habits + streak |
| 14 | Recap | The day-recap card with the real numbers. "Every evening ends like this." | Next | Closure (C13) |
| 15 | Orb | "That's the loop. Each window has a short tour in my menu." | End | Where help lives |

Notes:
- Steps 7–10 can run with seconds-long spans; spans under 10 s aren't recorded (pomo F19), so step 10 should say "a short test is fine; very short ones aren't kept" or the tour can wait ~12 s before showing STOP.
- Advanced users get the same tour plus one step: "In Advanced, the time can count toward the task: pick it under **What am I doing**."
- Voice: the guide card can play existing clips at natural points ("creating new task", "starting the task", "break time, stand up", "good job") when voice is on.

---

## 6. Sound design

**Decision (2026-11-06): three free designer kits, shipped.** After the rounds below, the maintainer picked by ear on [free-kits.html](free-kits.html), which plays 12 free kits side by side on KRNL0's moments: **SND01 · Sine** (snd.dev, default), **Zen** (UI SFX, CC0) and **Crisp** (Anipixels, CC BY 4.0) are the app's three packs. Generated sounds, Kenney recordings and the "Industrial"/"Mechanical" kits were rejected. Built as [ui-sounds.md](../06-requirements/ui-sounds.md): Web Audio engine, Settings → Sounds (on/off, volume, pack), `krnl sound …`.

**Voice reactions: dropped** by the maintainer (2026-11-06). The 24 recorded lines stay unused; the Top 5 item 1 is sounds only.

**Round 5: real recordings.** Generated sounds were rejected as a whole ("they all trash"). The [mixer](sound-mixer.html) now uses 150 takes from four free **CC0** Kenney packs (Casino Audio, RPG Audio, Impact Sounds, UI Audio): wood impacts, poker chips, switches, books, leather, cards. Each moment layers up to three recordings, shaped by shared theme tone (low boost, top cut, saturation, room) and per-layer level, pitch, delay, tone and reverse. Each play picks a random real take for natural variation. The exported settings are the spec for rendering the app's sound files. The rounds below are kept for the record.

**Brief (maintainer, 2026-11-06):** tactile, warm and cozy, with texture. A deep **thock** with some **clicky texture** on top; mid-range, not too high, not flat. Three earlier rounds were rejected: instrument tones, paper foley, and plain single-layer "thock" knocks. The last one failed because every set was one smooth sine knock that only changed pitch, so all sets and all moments sounded alike.

**How a tactile sound is built (analysis).** A real press is several layers in the first ~200 ms:

| Layer | Time | Frequency | Job |
|---|---|---|---|
| Click | 0–6 ms | 1.5–4 kHz, noise | the tactile edge |
| Thock body | 2–90 ms | 120–400 Hz, pitch falls ~1 octave in 15 ms | weight, depth |
| Material ring | 3–60 ms | 400–1500 Hz resonant modes | wood / plastic / ceramic identity |
| Texture | 0–200 ms | micro-clicks, rattle, crackle | different on every hit |
| Room | 10–250 ms | short, damped | warmth without echo |

Warmth = cut above ~6 kHz, a little 2nd-harmonic saturation, a short damped room. Texture = noise-based click, material modes, and per-hit variation (±2–3% pitch, level, stereo). Measuring the first build showed the body peaking ~17 dB over the click and 22–30 dB over the material ring, which explains "they all sound the same". The engine now renders each layer offline once and normalises it, so each theme's mix really applies. Measured result: spectral centroid ranges from ~120 Hz (Felt & Leather) to ~1.5 kHz (Rangefinder).

**Round 4: pick a theme first, then design moments inside it.** The [audition page](sound-audition.html) (Tone.js) has 12 themes on a thock↔click / warm↔bright map, a live waveform and spectrum, a fixed comparison phrase, a typing burst, and a shortlist: Felt & Leather, Vinyl Lounge, Walnut Desk, Rubber Dome, Cream Keys, Bamboo, Tape Deck, Abacus, Ceramic Café, River Stones, Typewriter Study, Rangefinder.

Inside the chosen theme, each moment gets its own **gesture**, differing from its neighbours in at least two of: number of hits, rhythm, layers, weight, direction (press in vs. let go). For example: Start = latch in (click-click → body); Break = latch out (body → soft click, more room); Done = press plus a bright material ring (the only moment that rings); Reopen = muffled body, no click; Habit = richer as the streak grows (click → + ring → + rattle); Day complete = press, press, big, with the room opening up.

Ways to ship the chosen theme:

| Option | Licence / cost | Fit |
|---|---|---|
| **Generated** with Tone.js (audition page); in the app either as code or rendered once to files | ours (Tone.js is MIT) | Tunable live; per-hit variation is built in. |
| **Record our own** (thocky keyboard, wooden desk, wooden spoon on a board; 15–20 clips) | ours | Most authentic and unique; needs a quiet room and light editing. |
| **JDSherbert · Wooden UI SFX Pack** | pay what you want, licence PDF included | Small, on-theme. |
| **Stormwave · Wooden Interface Sound Effects** (51 sounds) | royalty-free, from $1.99 | Close to "deep wood"; check bundling terms. |
| **Mechvibes** keyboard packs | app MIT, pack licences vary | Real keyboards; many copy commercial boards, so only packs with a clear licence. |
| **Sonniss GDC bundles** | free, commercial use, no credit; no AI training | Pro wood hits, buried in many GB. |

UI kits (SND, UI SFX, soundcn, Kenney) were reviewed and dropped: mostly electronic tones and clicks. Playback libraries (use-sound, Howler) aren't needed.

Engine work either way: move `sfxEngine` to Web Audio (decoded buffers, a gain node for volume, short sounds may overlap, effects duck under the voice), add a `sound` settings block, a `krnl sound` command, and one map of *moment → sound*. Files stay in the app bundle (nothing fetched at runtime, like theme fonts).

---

## 7. Suggested order

| Phase | Items | Why first |
|---|---|---|
| **A** | Sound engine + chosen set + Settings/CLI (**done**; voice reactions dropped) | Cheapest, most felt, and every later item uses it |
| **B** | Done moment (animation, shrinking card, neutral overrun), Done/overnight lifecycle | Fixes C9, C11, C12 together |
| **C** | Day recap + morning line + Monday look-back | Needed by the tour's last step |
| **D** | "Your first day" tour + orb first-click + Easy title "Record" + estimate chips + Plan action | Teaches the finished loop, so it comes after A–C |
| **E** | Habit streak upgrade; Clock day ring and week marks; Replan on missed blocks | Polish on top |
| **Discuss** | Easy overlap credit ("worked during its block") | Changes what Easy shows; needs an ADR |

Each phase follows Workflow A (requirements doc → ADR if needed → build → tests → HISTORY).

---

## Sources

- Amabile & Kramer, *The Progress Principle*: [HBS Working Knowledge](https://hbswk.hbs.edu/item/6685.html), [AMA interview](https://www.amanet.org/articles/the-worth-of-small-wins-teresa-amabile-and-steven-kramer-on-the-progress-principle/)
- Kivetz, Urminsky & Zheng (2006), *The Goal-Gradient Hypothesis Resurrected*, JMR 43: [Columbia PDF](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)
- Silverman & Barasch (2023), *On or Off Track: How (Broken) Streaks Affect Consumer Decisions*, JCR: [CU Boulder summary](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions), [CU news](https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch)
- Deci, Koestner & Ryan (1999), meta-analysis of 128 studies, Psychological Bulletin 125: [PDF](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf), [2001 follow-up](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)
- Sailer & Homner (2020), *The Gamification of Learning: a Meta-analysis*, Educ. Psych. Review 32: [Augsburg repository](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)
- Duolingo streak claims (unverified, not relied on): [Lenny's Newsletter episode](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)
- Peak-end rule (Kahneman et al. 1993), fresh-start effect (Dai, Milkman & Riis 2014), novelty effect (Koivisto & Hamari 2014): standard references, cited from memory, not re-checked for this note.
- Thock / wood sounds: [JDSherbert Wooden UI SFX Pack](https://jdsherbert.itch.io/wooden-ui-sfx-pack), [Stormwave Wooden Interface Sound Effects](https://stormwave-audio.itch.io/wooden-interface-sound-effects-pack), [Mechvibes](https://mechvibes.com/), [Sonniss GDC bundle coverage](https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/)
- UI sound kits reviewed and dropped: [snd-lib](https://www.npmjs.com/package/snd-lib), [uisfx](https://github.com/romainsimon/uisfx), [soundcn](https://www.mintlify.com/kapishdima/soundcn/introduction), [Kenney Interface Sounds](https://opengameart.org/content/interface-sounds), [use-sound](https://github.com/joshwcomeau/use-sound)
