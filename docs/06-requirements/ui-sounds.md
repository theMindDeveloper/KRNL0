# UI sounds (sound packs)

Short sounds that confirm what just happened: a task added, the timer started, a task done. One sound family plays at a time (a "pack"). The user picks the pack, the volume, or turns sounds off, in Settings and from the `sys` CLI.

Background research: [docs/research/engagement-and-onboarding.md](../research/engagement-and-onboarding.md) (sound design section). The packs were chosen by ear on `docs/research/free-kits.html`.

## Packs

| Id | Name | Made by | Licence | Files |
|---|---|---|---|---|
| `snd01` (default) | SND01 · Sine | Yasuhiro Tsuchiya, [snd.dev](https://snd.dev) | Free for commercial and non-commercial use; the designer keeps the copyright | one sprite (`audioSprite.mp3` + `.json`) |
| `zen` | Zen | Romain Simon, [UI SFX](https://github.com/romainsimon/uisfx) | CC0 1.0 | one `.mp3` per cue |
| `crisp` | Crisp | Anipixels, [Crisp UI Sounds Free](https://github.com/Anipixels/crisp-ui-sounds-free) | CC BY 4.0, credit required | one `.ogg` per cue |

The credits live in `src/renderer/sfx/packs/CREDITS.md` and in Settings → Sounds.

## Moments

Each moment is a short **phrase** (`soundPacks.ts`): a few hits with their own timing, pitch and level. Neighbouring moments differ in at least two of: number of hits, rhythm, direction (rising = in / go, falling = out / end), weight. Start is a count-in (three ticks at 0 / 170 / 340 ms, then the go at 520 ms); Stop is a heavy falling double clunk; Break settles down low; Delete whooshes away; Done is a press with a rising sparkle; Habit is a two-note step up. The table below names each phrase's main sound. Settings → Sounds has a ▸ button per moment to hear them all.

| Moment | When | SND01 | Zen | Crisp |
|---|---|---|---|---|
| `add` | A to-do, task, subtask or next task is added | tap_01 | press | click_soft_01 |
| `plan` | A task gets a time on the Calendar or Clock | swipe_02 | drop | click_wood_01 |
| `start` | The timer starts | transition_up | start | menu_open |
| `pause` | The timer pauses | toggle_off | pause | toggle_off |
| `resume` | The timer resumes, or a break ends | toggle_on | play | toggle_on |
| `break` | A break starts | transition_down | pause | menu_close |
| `stop` | The timer stops (session saved) | button | stop | confirm_01 |
| `sessionDone` | A pomodoro reaches its length | celebration | achievement | achievement |
| `done` | A task or to-do is ticked done | select | complete | coin_ping_01 |
| `reopen` | A done task is un-ticked | toggle_off | uncheck | toggle_off |
| `habit` | A habit is checked in | tap_03 | check | gem_01 |
| `unhabit` | A habit check-in is removed | toggle_off | uncheck | toggle_off |
| `delete` | A task, to-do or habit is removed | swipe_05 | delete | pop_down_01 |

## Functional Requirements

- **F1** The app ships three packs: `snd01`, `zen`, `crisp`. `snd01` is the default for a new install.
- **F2** Each moment in the table above plays its pack's sound when the user does that action in the UI.
- **F3** The moment is read from what changed on the board (done count, habit check-ins, timer status, item count, schedules), not from the command name, so every UI path that does the same thing sounds the same.
- **F4** Settings → Sounds has: sound on/off, a volume slider (0–100), and one button per pack. Choosing a pack plays a sample, so the user hears it at once.
- **F5** Pack, volume and on/off persist across restarts (per install, `localStorage`, like the theme). They are not board data.
- **F6** With sounds off, or at volume 0, nothing plays and no audio is decoded.
- **F7** `sys sound status | pack <id> | volume <0-100> | on | off | play <moment> | list` reads and sets the same settings from the CLI (renderer required, exit 2 without one). Settings → Sounds shows what the CLI set.
- **F8** The same moment does not play twice within 80 ms (a bulk action makes one sound, not a burst).

## Non-Functional Requirements

- **NF1** No sound blocks or delays the action: playback is fire-and-forget, errors are swallowed.
- **NF2** Sounds are decoded on first use and cached; no frame does audio work (render-frame budget, #197).
- **NF3** Packs are bundled with the app (no network at runtime).
- **NF4** Crisp's CC BY credit is shown in Settings → Sounds and kept in `CREDITS.md`.

## Use Cases

- **UC-S1** The user ticks a task done and hears a short confirmation.
- **UC-S2** The user opens Settings, picks Zen, hears a sample, and from then on hears Zen.
- **UC-S3** The user turns sounds off while on a call; nothing plays until they turn sounds on again.
- **UC-S4** The assistant runs `sys sound volume 30` because the user asked for quieter sounds.

## User Stories

- As a user, I want a small sound when I finish something, so finishing feels good.
- As a user, I want to pick a sound style I like, or turn sounds off.
- As the in-app assistant, I want to change sound settings from the CLI.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Sound packs

  Scenario: F1 default pack
    Given a fresh install
    Then the sound pack is "snd01" and sounds are on

  Scenario: F2/F3 task done plays the done sound
    Given a task that is not done
    When the user ticks it done
    Then the "done" moment plays

  Scenario: F3 un-ticking plays reopen, not done
    Given a task that is done
    When the user un-ticks it
    Then the "reopen" moment plays

  Scenario: F4 picking a pack plays a sample
    When the user picks "Zen" in Settings
    Then the pack is "zen" and a sample plays

  Scenario: F5 settings persist
    Given the user picked "crisp" at volume 40
    When the app restarts
    Then the pack is "crisp" and the volume is 40

  Scenario: F6 muted plays nothing
    Given sounds are off
    When the user ticks a task done
    Then nothing plays

  Scenario: F7 CLI sets the pack
    When the CLI runs "sound pack zen"
    Then the pack is "zen"

  Scenario: F8 no double play
    When the "add" moment is triggered twice within 80 ms
    Then it plays once
```

- [x] F1 · [x] F2 · [x] F3 · [ ] F4 (built; not yet checked by hand in the app) · [x] F5 · [x] F6 · [x] F7 · [x] F8 — `tests/unit/renderer/uiSounds.test.ts`
