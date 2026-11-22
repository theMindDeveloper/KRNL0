# KRNL0 marketing videos

Instagram Reels (1080×1920, 30 fps) built from code, using footage of the **real KRNL0 app** and the
look of the redesigned website: one colour per hour of the day, huge ghost clock digits, Geist
headlines, JetBrains Mono time chips, and the coloured K·R·N·L·0 tiles.

| Folder | Tool | What it makes |
| --- | --- | --- |
| [`reels/`](reels/) | [Remotion](https://remotion.dev) (React) | **Reel A**, ~29 s: a walk through one day (Plan → Calendar → Focus → Habits → Canvas → end card), each section showing the real app doing the thing |
| [`teaser/`](teaser/) | [HyperFrames](https://hyperframes.heygen.com) (HTML + GSAP) | **Reel B**, ~15 s: kinetic slot-machine words, the KRNL0 cube built in 3D, a deck of real app windows, the end card |

Both are silent for now; the voiceover (ElevenLabs) and captions come next.

## 1. Install the agent skills (once per machine)

`.claude/` is gitignored in this repo, so the skills are installed per machine. From the repo root:

```bash
npx skills add remotion-dev/skills --agent claude-code --yes      # 12 Remotion skills
npx skills add heygen-com/hyperframes --agent claude-code --yes   # 10 HyperFrames skills
```

They land in `.claude/skills/`. Claude Code picks them up in the next session (`/remotion-best-practices`, `/hyperframes`, …).

## 2. Film the app (Reel A's footage)

The footage is real: Playwright drives the KRNL0 renderer in a browser, types plans, ticks habits and
starts the timer, and saves every frame. It is not committed (≈55 MB); regenerate it:

```bash
# terminal 1, repo root: the browser preview of the app (port 5201)
npx vite --config vite.preview.config.ts

# terminal 2
cd marketing/reels
npm i
npm i -D playwright && npx playwright install chromium   # first time only
npm run capture                # all shots; or: npm run capture -- cal,habit
```

`scripts/capture/board.js` is the board it films: a calm day (four plans, three habits, a launch frame
with sticky notes) injected through the preview bridge — no app code is changed. The canvas is
the Free canvas, the calendar is the Day view zoomed in, and each shot frames one window.

## 3. Preview and render

```bash
cd marketing/reels
npm run studio                 # Remotion Studio, edit live
npm run render                 # → out/krnl0-reel-a.mp4

cd ../teaser
npx hyperframes preview        # HyperFrames Studio
npx hyperframes check          # lint, layout, safe zones, contrast
npx hyperframes render --quality delivery -o out/krnl0-reel-b.mp4
```

On a machine that cannot download Remotion's browser, set `REMOTION_BROWSER` to a Chrome binary.
Fonts and GSAP are bundled in the projects, so renders need no network.

## Next: voiceover

With an ElevenLabs key and voice ID: generate the line per scene with timestamps, place it as
`<Audio>` in Remotion (or `<audio>` in HyperFrames), and draw word-timed captions from the
timestamps (`@remotion/captions`, already installed).
