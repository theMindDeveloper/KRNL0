// UI sound packs (docs/06-requirements/ui-sounds.md). Pure data: what each
// pack plays for each moment. The audio files live in ./packs/<id>/ and their
// credits in ./packs/CREDITS.md.
//
// A moment is a short PHRASE, not one clip: a few hits with their own timing,
// pitch (playback rate) and level. Moments that sit next to each other differ
// in at least two of: number of hits, rhythm, direction (rising = in / go,
// falling = out / end) and weight. So Start is a "tick, tick, tick, GO"
// count-in, Stop a heavy falling double clunk, Break a soft settle down,
// Delete a whoosh away, Done a rising sparkle.

export const SOUND_MOMENTS = [
  'add', 'plan', 'start', 'pause', 'resume', 'break', 'stop',
  'sessionDone', 'done', 'reopen', 'habit', 'unhabit', 'delete',
] as const;
export type SoundMoment = (typeof SOUND_MOMENTS)[number];

/** Labels for the Settings "try every sound" row and the CLI. */
export const MOMENT_LABELS: Record<SoundMoment, string> = {
  add: 'Add', plan: 'Plan', start: 'Start', pause: 'Pause', resume: 'Resume', break: 'Break', stop: 'Stop',
  sessionDone: 'Session done', done: 'Task done', reopen: 'Reopen', habit: 'Habit', unhabit: 'Un-tick habit', delete: 'Delete',
};

export const SOUND_PACK_IDS = ['snd01', 'zen', 'crisp'] as const;
export type SoundPackId = (typeof SOUND_PACK_IDS)[number];
export const DEFAULT_SOUND_PACK: SoundPackId = 'snd01';

/** One hit of a phrase: a sound, when (ms after the first), its pitch and level. */
export interface SoundStep {
  s: string;
  at?: number;
  /** Playback rate: 1 = as recorded; > 1 higher and shorter, < 1 lower and longer. */
  rate?: number;
  /** 0..1, multiplied with the volume. */
  gain?: number;
}
export type SoundPhrase = readonly SoundStep[];

export interface SoundPack {
  id: SoundPackId;
  name: string;
  /** One line for Settings. */
  feel: string;
  /** Credit line shown in Settings (Crisp's CC BY needs it). */
  credit: string;
  /** 'sprite': one file + a spritemap (SND). 'files': one file per sound. */
  format: 'sprite' | 'files';
  /** File extension for 'files' packs. */
  ext: 'mp3' | 'ogg';
  phrases: Record<SoundMoment, SoundPhrase>;
}

/** "tick, tick, tick, GO": three even count-in ticks, then the start. */
const countIn = (tick: string, go: SoundStep[], rate = 1): SoundStep[] => [
  { s: tick, at: 0, rate, gain: 0.55 },
  { s: tick, at: 170, rate, gain: 0.6 },
  { s: tick, at: 340, rate, gain: 0.65 },
  ...go.map((g) => ({ ...g, at: 520 + (g.at ?? 0) })),
];

export const SOUND_PACKS: Record<SoundPackId, SoundPack> = {
  snd01: {
    id: 'snd01', name: 'SND01 · Sine', feel: 'Clean and soft', format: 'sprite', ext: 'mp3',
    credit: 'SND01 "Sine" by Yasuhiro Tsuchiya, snd.dev',
    phrases: {
      // light "pop-pop", rising
      add: [{ s: 'tap_01' }, { s: 'tap_02', at: 70, rate: 1.26, gain: 0.8 }],
      // slide, then land
      plan: [{ s: 'swipe_02', gain: 0.8 }, { s: 'tap_03', at: 150, rate: 1.12 }],
      // count-in, then a bright rise
      start: countIn('tap_04', [{ s: 'transition_up' }, { s: 'select', at: 40, rate: 1.26, gain: 0.7 }], 0.84),
      // one soft step down
      pause: [{ s: 'toggle_off', rate: 0.94, gain: 0.8 }],
      // step up, then lift
      resume: [{ s: 'toggle_on' }, { s: 'transition_up', at: 90, rate: 1.12, gain: 0.7 }],
      // exhale and settle low
      break: [{ s: 'transition_down', rate: 0.84 }, { s: 'tap_05', at: 230, rate: 0.67, gain: 0.7 }],
      // heavy, falling double clunk: closing
      stop: [{ s: 'button', rate: 0.8 }, { s: 'toggle_off', at: 120, rate: 0.7 }],
      sessionDone: [{ s: 'celebration' }],
      // the reward: a press and a rising sparkle
      done: [{ s: 'select' }, { s: 'tap_02', at: 90, rate: 1.5, gain: 0.7 }, { s: 'tap_02', at: 170, rate: 2, gain: 0.55 }],
      reopen: [{ s: 'toggle_off', gain: 0.8 }],
      // two-note step up
      habit: [{ s: 'tap_03' }, { s: 'tap_03', at: 85, rate: 1.33 }],
      unhabit: [{ s: 'tap_03', rate: 0.8, gain: 0.8 }],
      // whoosh away and thud
      delete: [{ s: 'swipe_05', rate: 0.72 }, { s: 'disabled', at: 130, rate: 0.8, gain: 0.7 }],
    },
  },
  zen: {
    id: 'zen', name: 'Zen', feel: 'Pure tones, dry wood', format: 'files', ext: 'mp3',
    credit: 'Zen pack from UI SFX by Romain Simon (CC0)',
    phrases: {
      add: [{ s: 'press' }, { s: 'press', at: 70, rate: 1.26, gain: 0.8 }],
      plan: [{ s: 'drag-start', gain: 0.8 }, { s: 'drop', at: 160 }],
      start: countIn('progress-step', [{ s: 'start' }], 0.9),
      pause: [{ s: 'pause' }],
      resume: [{ s: 'play' }, { s: 'toggle-on', at: 80, rate: 1.12, gain: 0.7 }],
      break: [{ s: 'pause', rate: 0.8 }, { s: 'release', at: 220, rate: 0.7, gain: 0.7 }],
      stop: [{ s: 'stop', rate: 0.85 }, { s: 'close', at: 130, rate: 0.75 }],
      sessionDone: [{ s: 'achievement' }],
      done: [{ s: 'complete' }, { s: 'success', at: 140, rate: 1.12, gain: 0.6 }],
      reopen: [{ s: 'uncheck' }],
      habit: [{ s: 'check' }, { s: 'check', at: 85, rate: 1.33 }],
      unhabit: [{ s: 'uncheck', rate: 0.8 }],
      delete: [{ s: 'swipe', rate: 0.75 }, { s: 'delete', at: 120, rate: 0.85 }],
    },
  },
  crisp: {
    id: 'crisp', name: 'Crisp', feel: 'Small and crisp', format: 'files', ext: 'ogg',
    credit: 'Crisp UI Sounds Free by Anipixels (CC BY 4.0), anipixels.itch.io/crisp-ui',
    phrases: {
      add: [{ s: 'click_soft_01' }, { s: 'pop_up_01', at: 60, rate: 1.2, gain: 0.7 }],
      plan: [{ s: 'hover_soft_01', gain: 0.8 }, { s: 'click_wood_01', at: 150 }],
      start: countIn('text_blip_mid_01', [{ s: 'menu_open' }, { s: 'toggle_on', at: 60, rate: 1.26, gain: 0.7 }], 0.9),
      pause: [{ s: 'toggle_off' }],
      resume: [{ s: 'toggle_on' }, { s: 'menu_open', at: 80, rate: 1.12, gain: 0.7 }],
      break: [{ s: 'menu_close', rate: 0.84 }, { s: 'pop_down_01', at: 220, rate: 0.7, gain: 0.7 }],
      stop: [{ s: 'confirm_01', rate: 0.8 }, { s: 'click_wood_01', at: 130, rate: 0.7 }],
      sessionDone: [{ s: 'level_up' }],
      done: [{ s: 'coin_ping_01' }, { s: 'gem_01', at: 120, rate: 1.12, gain: 0.6 }],
      reopen: [{ s: 'toggle_off' }],
      habit: [{ s: 'gem_01' }, { s: 'gem_01', at: 85, rate: 1.33, gain: 0.8 }],
      unhabit: [{ s: 'toggle_off', rate: 0.8 }],
      delete: [{ s: 'pop_down_01', rate: 0.8 }, { s: 'cancel_01', at: 110, rate: 0.8, gain: 0.7 }],
    },
  },
};

export const isSoundPackId = (v: unknown): v is SoundPackId =>
  typeof v === 'string' && (SOUND_PACK_IDS as readonly string[]).includes(v);

export const isSoundMoment = (v: unknown): v is SoundMoment =>
  typeof v === 'string' && (SOUND_MOMENTS as readonly string[]).includes(v);

/** SND sprites: play [start, start + max(end - start, 0.1)), as snd-lib does. */
export function spriteWindow(entry: { start: number; end: number }): { offset: number; duration: number } {
  return { offset: entry.start, duration: Math.max(entry.end - entry.start, 0.1) };
}
