# UI sound credits

KRNL0's UI sounds come from three free libraries (docs/06-requirements/ui-sounds.md).

| Folder | Sounds | By | Source | Licence |
|---|---|---|---|---|
| `snd01/` | SND01 "Sine" sprite (`audioSprite.mp3`, `audioSprite.json`) | Yasuhiro Tsuchiya, SND (Dentsu Customer Experience Creative Center) | https://snd.dev · npm `snd-lib@1.2.4` | Free for commercial and non-commercial use; copyright stays with the sound designer. See https://snd.dev for the terms. |
| `zen/` | Zen pack: press, drop, start, pause, play, stop, achievement, complete, uncheck, check, delete, success, snap, drag-start, close, open, level-up, streak, error, warning, progress-step, cancel, select, toggle-on, toggle-off, swipe, release, send | Romain Simon, UI SFX | https://github.com/romainsimon/uisfx · npm `uisfx@0.4.0` | CC0 1.0 (see `zen/LICENSE.txt`) |
| `crisp/` | click_soft_01, click_wood_01, menu_open, menu_close, toggle_on, toggle_off, confirm_01, achievement, coin_ping_01, gem_01, pop_down_01, pop_up_01, cancel_01, error_01, level_up, notification_03, hover_soft_01, text_blip_mid_01, purchase, typing_01 | Anipixels | https://github.com/Anipixels/crisp-ui-sounds-free (commit a763e26) | CC BY 4.0 (see `crisp/LICENSE.txt`) |

Required credit for Crisp (CC BY 4.0), shown in Settings → Sounds when Crisp is picked:

> Crisp UI Sounds Free by Anipixels — https://anipixels.itch.io/crisp-ui

The files are unmodified; pitch and timing are set at playback (`soundPacks.ts` phrases).
