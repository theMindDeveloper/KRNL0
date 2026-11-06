/// <reference types="vite/client" />
// UI sound engine (docs/06-requirements/ui-sounds.md). Web Audio, so short
// sounds start on time and can overlap; files are decoded on first use and
// cached (NF2). Playback never throws (NF1).

import { SOUND_PACKS, spriteWindow, type SoundMoment, type SoundPackId } from './soundPacks';
import { useSoundSettings } from './soundSettings';

const FILES = import.meta.glob('./packs/**/*.{mp3,ogg}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const SPRITEMAPS = import.meta.glob('./packs/*/audioSprite.json', { import: 'default', eager: true }) as Record<
  string,
  { spritemap: Record<string, { start: number; end: number }> }
>;

/** F8 — the same moment within this window plays once. */
export const REPEAT_GUARD_MS = 80;

type Ctx = AudioContext;

function fileUrl(pack: SoundPackId, name: string): string | undefined {
  return FILES[`./packs/${pack}/${name}`];
}

export interface ResolvedStep { url: string; offset: number; duration?: number; at: number; rate: number; gain: number }

/** Where one sound is: the file, and for sprites the slice to play. */
function resolveOne(pack: SoundPackId, name: string): { url: string; offset: number; duration?: number } | null {
  const p = SOUND_PACKS[pack];
  if (p.format === 'sprite') {
    const url = fileUrl(pack, 'audioSprite.mp3');
    const entry = SPRITEMAPS[`./packs/${pack}/audioSprite.json`]?.spritemap[name];
    if (!url || !entry) return null;
    const w = spriteWindow(entry);
    return { url, offset: w.offset, duration: w.duration };
  }
  const url = fileUrl(pack, `${name}.${p.ext}`);
  return url ? { url, offset: 0 } : null;
}

/** A moment's phrase, resolved to files (null when any hit is missing). */
export function resolvePhrase(pack: SoundPackId, moment: SoundMoment): ResolvedStep[] | null {
  const out: ResolvedStep[] = [];
  for (const step of SOUND_PACKS[pack].phrases[moment]) {
    const r = resolveOne(pack, step.s);
    if (!r) return null;
    out.push({ ...r, at: step.at ?? 0, rate: step.rate ?? 1, gain: step.gain ?? 1 });
  }
  return out;
}

class UiSoundEngine {
  private ctx: Ctx | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private last = new Map<SoundMoment, number>();

  private context(): Ctx | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!AC) return null;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private buffer(ctx: Ctx, url: string): Promise<AudioBuffer> {
    let b = this.buffers.get(url);
    if (!b) {
      b = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((bytes) => ctx.decodeAudioData(bytes));
      b.catch(() => this.buffers.delete(url));
      this.buffers.set(url, b);
    }
    return b;
  }

  /** Play a moment in the chosen pack (default: the current setting). */
  play(moment: SoundMoment, opts: { pack?: SoundPackId } = {}): void {
    try {
      if (Date.now() < this.quietUntil) return;
      const s = useSoundSettings.getState();
      if (!s.enabled || s.volume <= 0) return; // F6
      const now = Date.now();
      const prev = this.last.get(moment);
      if (prev !== undefined && now - prev < REPEAT_GUARD_MS) return; // F8
      this.last.set(moment, now);

      const pack = opts.pack ?? s.pack;
      const steps = resolvePhrase(pack, moment);
      const ctx = this.context();
      if (!steps || !ctx || !this.out) return;
      this.warm(ctx, pack);
      const out = this.out;
      const volume = Math.pow(s.volume / 100, 2);
      void Promise.all(steps.map((st) => this.buffer(ctx, st.url)))
        .then((bufs) => {
          const t0 = ctx.currentTime + 0.005;
          steps.forEach((st, k) => {
            const src = ctx.createBufferSource();
            src.buffer = bufs[k]!;
            src.playbackRate.value = st.rate;
            const g = ctx.createGain();
            g.gain.value = volume * st.gain;
            src.connect(g).connect(out);
            src.onended = () => { src.disconnect(); g.disconnect(); };
            const when = t0 + st.at / 1000;
            if (st.duration !== undefined) src.start(when, st.offset, st.duration);
            else src.start(when, st.offset);
          });
        })
        .catch(() => { /* NF1: a sound never breaks an action */ });
    } catch {
      /* NF1 */
    }
  }

  private warmed = new Set<SoundPackId>();
  /** After a pack's first sound, decode the rest of it so later sounds start at once. */
  private warm(ctx: Ctx, pack: SoundPackId): void {
    if (this.warmed.has(pack)) return;
    this.warmed.add(pack);
    for (const m of Object.keys(SOUND_PACKS[pack].phrases) as SoundMoment[]) {
      for (const st of resolvePhrase(pack, m) ?? []) void this.buffer(ctx, st.url).catch(() => {});
    }
  }

  private quietUntil = 0;
  /** Play nothing for `ms` (demo data being seeded). */
  quiet(ms: number): void {
    this.quietUntil = Date.now() + ms;
  }

  /** Test seam: forget the repeat guard. */
  resetGuard(): void {
    this.last.clear();
  }
}

export const uiSounds = new UiSoundEngine();
