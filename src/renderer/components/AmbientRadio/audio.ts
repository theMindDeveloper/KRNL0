/**
 * AmbientRadio audio engine — Web Audio API + YouTube IFrame API.
 *
 * No audio files: every preset is synthesised from `AudioBuffer`s,
 * `OscillatorNode`s and `BiquadFilterNode`s. YouTube uses the public
 * IFrame API into a hidden 1×1 iframe (audio only).
 *
 * Each preset exposes a small set of live-tweakable parameters via
 * `setParam(key, value)`. The component owns the parameter state; the
 * engine maps keys onto the right `AudioParam` so sliders can scrub the
 * graph mid-playback without restarting any source nodes.
 *
 * AudioContext is created lazily on the first `play()` call (browser
 * autoplay policy — needs a user gesture).
 */

export type PresetId = 'dark' | 'rain' | 'fire' | 'synth' | 'white' | 'brown';

export type Params = Record<string, number>;

/** Chord library used by the synth preset. Frequencies pre-computed. */
export const CHORD_LIB: Record<string, number[]> = {
  am:   [220.00, 261.63, 329.63, 415.30, 493.88], // Am add9
  em:   [164.81, 207.65, 246.94, 311.13, 392.00], // Em add9
  dm:   [146.83, 174.61, 220.00, 277.18, 329.63], // Dm
  fmaj: [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
  g:    [196.00, 246.94, 293.66, 369.99, 440.00], // G
  cmaj: [261.63, 329.63, 392.00, 493.88, 587.33], // Cmaj9
  dmaj: [146.83, 185.00, 220.00, 277.18, 329.63], // Dmaj
};

export const CHORD_ORDER: readonly string[] = ['am', 'em', 'dm', 'fmaj', 'g', 'cmaj', 'dmaj'];

const DEFAULT_CHORDS = new Set(['am', 'em', 'dm', 'fmaj', 'g']);

/** Default parameter set per preset. Tuned for "ambient". */
export const DEFAULT_PARAMS: Record<PresetId, Params> = {
  dark:  { bass: 40, harmonics: 0.10, drift: 0.5, sub: 0.3, wobble: 0.1 },
  rain:  { softness: 800, density: 0.3, reverb: 0.75, drops: 0.13, wind: 0.2 },
  fire:  { body: 550, crackle: 0.4, roar: 0.5, spark: 2500 },
  synth: {
    changeSec: 8, brightness: 0.5, reverb: 0.6, detune: 6,
    polyphonic: 0, arpSpeed: 0.4,
    chord_am: 1, chord_em: 1, chord_dm: 1, chord_fmaj: 1, chord_g: 1,
    chord_cmaj: 0, chord_dmaj: 0,
  },
  white: { softness: 2400, tone: 0, wobble: 0 },
  brown: { depth: 700, rumble: 0.4 },
};

interface PresetHandle {
  stop: () => void;
  setParam: (key: string, value: number) => void;
}

interface YTPlayer {
  loadVideoById: (id: string) => void;
  setVolume: (v: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
}

interface YTNamespace {
  Player: new (
    elOrId: string | HTMLElement,
    opts: {
      height: string | number;
      width: string | number;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: (e: { target: YTPlayer }) => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ── Engine ────────────────────────────────────────────────────────────────
interface Layer { handle: PresetHandle; gain: GainNode }

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Map<PresetId, Layer> = new Map();

  private init(): boolean {
    if (this.ctx && this.master) return true;
    const Ctor = window.AudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    return true;
  }

  /** Start a preset as a new layer. Idempotent — re-calling with the same id
   *  does nothing if that layer is already playing. */
  playLayer(id: PresetId, params: Params, layerVolume0to1 = 0.8): void {
    if (!this.init() || !this.ctx || !this.master) return;
    if (this.layers.has(id)) return;
    const gain = this.ctx.createGain();
    gain.gain.value = layerVolume0to1;
    gain.connect(this.master);

    let handle: PresetHandle | null = null;
    switch (id) {
      case 'dark':  handle = this.playDark (this.ctx, gain, params); break;
      case 'rain':  handle = this.playRain (this.ctx, gain, params); break;
      case 'fire':  handle = this.playFire (this.ctx, gain, params); break;
      case 'synth': handle = this.playSynth(this.ctx, gain, params); break;
      case 'white': handle = this.playWhite(this.ctx, gain, params); break;
      case 'brown': handle = this.playBrown(this.ctx, gain, params); break;
    }
    if (handle) this.layers.set(id, { handle, gain });
    else { try { gain.disconnect(); } catch { /* noop */ } }
  }

  stopLayer(id: PresetId): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    try { layer.handle.stop(); } catch { /* noop */ }
    // Disconnect gain after the per-preset stop fade has had time to run
    window.setTimeout(() => { try { layer.gain.disconnect(); } catch { /* noop */ } }, 400);
    this.layers.delete(id);
  }

  stopAll(): void {
    for (const id of Array.from(this.layers.keys())) this.stopLayer(id);
  }

  setLayerVolume(id: PresetId, v0to1: number): void {
    const layer = this.layers.get(id);
    if (!layer || !this.ctx) return;
    layer.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, v0to1)), this.ctx.currentTime, 0.03);
  }

  setMasterVolume(v0to100: number): void {
    if (this.master) this.master.gain.value = v0to100 / 100;
  }

  setParam(id: PresetId, key: string, value: number): void {
    this.layers.get(id)?.handle.setParam(key, value);
  }

  isPlaying(id: PresetId): boolean {
    return this.layers.has(id);
  }

  // ── DARK ────────────────────────────────────────────────────────────────
  private playDark(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    const base = p.bass ?? 40;
    const hMix = p.harmonics ?? 0.1;
    const drift = p.drift ?? 0.5;
    const config: Array<[number, number, OscillatorType]> = [
      [base,     0.35,        'sine'    ],
      [base * 2, hMix,        'sine'    ],
      [base * 3, hMix * 0.35, 'triangle'],
    ];
    const oscs = config.map(([f, vol, type]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = vol;
      o.connect(g); g.connect(master); o.start();
      return { osc: o, gain: g };
    });
    // Sub-octave
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = base / 2;
    subGain.gain.value = (p.sub ?? 0.3) * 0.45;
    sub.connect(subGain); subGain.connect(master); sub.start();

    // Slow LFO on detune
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = drift * 2;
    lfo.connect(lfoGain);
    oscs.forEach((o) => lfoGain.connect(o.osc.detune));
    lfo.start();

    // Wobble = slow tremolo on master sum (via a gain modulated by LFO)
    const wobOsc = ctx.createOscillator();
    const wobScale = ctx.createGain();
    const wobBias = ctx.createGain();
    wobOsc.frequency.value = 0.18;
    wobScale.gain.value = (p.wobble ?? 0.1) * 0.3;
    wobBias.gain.value = 1;
    wobOsc.connect(wobScale); wobScale.connect(wobBias.gain);
    wobOsc.start();
    oscs.forEach((o) => { o.gain.disconnect(); o.gain.connect(wobBias); });
    subGain.disconnect(); subGain.connect(wobBias);
    wobBias.connect(master);

    return {
      stop: () => {
        oscs.forEach((o) => { try { o.osc.stop(); } catch { /* noop */ } });
        try { sub.stop(); } catch { /* noop */ }
        try { lfo.stop(); } catch { /* noop */ }
        try { wobOsc.stop(); } catch { /* noop */ }
      },
      setParam: (key, value) => {
        const t = ctx.currentTime;
        if (key === 'bass') {
          oscs[0]?.osc.frequency.setTargetAtTime(value,         t, 0.05);
          oscs[1]?.osc.frequency.setTargetAtTime(value * 2,     t, 0.05);
          oscs[2]?.osc.frequency.setTargetAtTime(value * 3,     t, 0.05);
          sub.frequency.setTargetAtTime(value / 2, t, 0.05);
        }
        if (key === 'harmonics') {
          oscs[1]?.gain.gain.setTargetAtTime(value,         t, 0.05);
          oscs[2]?.gain.gain.setTargetAtTime(value * 0.35,  t, 0.05);
        }
        if (key === 'drift')  lfoGain.gain.setTargetAtTime(value * 2,    t, 0.05);
        if (key === 'sub')    subGain.gain.setTargetAtTime(value * 0.45, t, 0.05);
        if (key === 'wobble') wobScale.gain.setTargetAtTime(value * 0.3, t, 0.05);
      },
    };
  }

  // ── RAIN ────────────────────────────────────────────────────────────────
  private playRain(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 'white');
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.softness ?? 800;
    lp.Q.value = 0.5;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.3;

    // Tremolo for breath
    const trem = ctx.createOscillator();
    trem.frequency.value = p.drops ?? 0.13;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.15;
    const tremBias = ctx.createGain();
    tremBias.gain.value = 1;
    trem.connect(tremGain); tremGain.connect(tremBias.gain); trem.start();

    const dry = ctx.createGain();
    dry.gain.value = (p.density ?? 0.3) * 1.6;

    const conv = ctx.createConvolver();
    conv.buffer = this.makeReverbIR(ctx, 2.8, 2);
    const wet = ctx.createGain();
    wet.gain.value = p.reverb ?? 0.75;

    src.connect(lp); lp.connect(bp); bp.connect(tremBias);
    tremBias.connect(dry); dry.connect(master);
    bp.connect(conv); conv.connect(wet); wet.connect(master);
    src.start();

    // Wind layer — separate white noise, swept lowpass, soft
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer(ctx, 'white');
    windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 400;
    windLp.Q.value = 1;
    const windGain = ctx.createGain();
    windGain.gain.value = (p.wind ?? 0.2) * 0.35;
    // Sweep LFO on wind cutoff
    const windLfo = ctx.createOscillator();
    const windLfoGain = ctx.createGain();
    windLfo.frequency.value = 0.06;
    windLfoGain.gain.value = 250;
    windLfo.connect(windLfoGain); windLfoGain.connect(windLp.frequency);
    windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(master);
    windSrc.start(); windLfo.start();

    return {
      stop: () => {
        try { src.stop(); } catch { /* noop */ }
        try { trem.stop(); } catch { /* noop */ }
        try { windSrc.stop(); } catch { /* noop */ }
        try { windLfo.stop(); } catch { /* noop */ }
      },
      setParam: (key, value) => {
        const t = ctx.currentTime;
        if (key === 'softness') lp.frequency.setTargetAtTime(value, t, 0.05);
        if (key === 'density')  dry.gain.setTargetAtTime(value * 1.6, t, 0.05);
        if (key === 'reverb')   wet.gain.setTargetAtTime(value, t, 0.05);
        if (key === 'drops')    trem.frequency.setTargetAtTime(value, t, 0.05);
        if (key === 'wind')     windGain.gain.setTargetAtTime(value * 0.35, t, 0.05);
      },
    };
  }

  // ── FIRE ────────────────────────────────────────────────────────────────
  private playFire(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    // Brown noise bed (the "roar")
    const bedSrc = ctx.createBufferSource();
    bedSrc.buffer = this.noiseBuffer(ctx, 'brown');
    bedSrc.loop = true;
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = 'lowpass';
    bedLp.frequency.value = p.body ?? 550;
    const bedGain = ctx.createGain();
    bedGain.gain.value = (p.roar ?? 0.5) * 0.85;
    bedSrc.connect(bedLp); bedLp.connect(bedGain); bedGain.connect(master);
    bedSrc.start();

    // Crackle generator: short noise bursts scheduled at random.
    // Live-tweakable without regenerating the underlying buffer.
    const crackleBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
    const cd = crackleBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 2);
    }

    let crackleAmount = p.crackle ?? 0.4;
    let sparkFreq    = p.spark   ?? 2500;
    let alive = true;
    let timer: number | null = null;

    const tick = () => {
      if (!alive) return;
      if (crackleAmount > 0.02) {
        const burst = ctx.createBufferSource();
        burst.buffer = crackleBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = sparkFreq + (Math.random() - 0.5) * sparkFreq * 0.4;
        filt.Q.value = 4 + Math.random() * 4;
        const g = ctx.createGain();
        g.gain.value = crackleAmount * 0.35;
        burst.connect(filt); filt.connect(g); g.connect(master);
        burst.start();
      }
      const rate = 0.4 + crackleAmount * 6;
      const nextDelay = Math.max(30, (Math.random() * 1000) / rate);
      timer = window.setTimeout(tick, nextDelay);
    };
    timer = window.setTimeout(tick, 100);

    return {
      stop: () => {
        alive = false;
        if (timer !== null) clearTimeout(timer);
        try { bedSrc.stop(); } catch { /* noop */ }
      },
      setParam: (key, value) => {
        const t = ctx.currentTime;
        if (key === 'body')    bedLp.frequency.setTargetAtTime(value, t, 0.05);
        if (key === 'crackle') crackleAmount = value;
        if (key === 'roar')    bedGain.gain.setTargetAtTime(value * 0.85, t, 0.05);
        if (key === 'spark')   sparkFreq = value;
      },
    };
  }

  // ── SYNTH ───────────────────────────────────────────────────────────────
  private playSynth(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    // Mutable params tracked in closure so setParam can update them.
    const params: Params = { ...p };

    const enabledNames = (): string[] => {
      const enabled = CHORD_ORDER.filter((n) => (params[`chord_${n}`] ?? 0) > 0.5);
      if (enabled.length > 0) return enabled;
      // Fallback to default set if user disables everything
      return CHORD_ORDER.filter((n) => DEFAULT_CHORDS.has(n));
    };

    const firstName = enabledNames()[0] ?? 'am';
    const firstChord = CHORD_LIB[firstName] ?? CHORD_LIB.am!;

    // 5-voice chord pad
    const oscs = firstChord.map((f) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * (p.detune ?? 6);
      g.gain.value = 0;
      o.connect(g); o.start();
      return { osc: o, gain: g };
    });

    // Brightness filter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200 + (p.brightness ?? 0.5) * 2400;
    oscs.forEach((o) => o.gain.connect(lp));

    // Reverb send
    const conv = ctx.createConvolver();
    conv.buffer = this.makeReverbIR(ctx, 4, 1.5);
    const wet = ctx.createGain();
    wet.gain.value = p.reverb ?? 0.6;
    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    lp.connect(dry); dry.connect(master);
    lp.connect(conv); conv.connect(wet); wet.connect(master);

    // Shimmer LFO on detune
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = Math.max(2, (p.detune ?? 6) * 0.7);
    lfo.connect(lfoGain);
    oscs.forEach((o) => lfoGain.connect(o.osc.detune));
    lfo.start();

    // Fade pad in
    const now0 = ctx.currentTime;
    oscs.forEach((o) => o.gain.gain.setTargetAtTime(0.06, now0, 0.8));

    // Polyphonic arpeggio — always-on, gated by polyGain.
    const arpOsc = ctx.createOscillator();
    arpOsc.type = 'triangle';
    arpOsc.frequency.value = firstChord[0] ?? 220;
    const arpEnv = ctx.createGain();
    arpEnv.gain.value = 0;
    const polyGain = ctx.createGain();
    polyGain.gain.value = (p.polyphonic ?? 0) > 0.5 ? 1 : 0;
    arpOsc.connect(arpEnv); arpEnv.connect(polyGain); polyGain.connect(lp);
    arpOsc.start();

    let curChordNotes = firstChord.slice();
    let chordCycleIdx = 0;
    let arpIdx = 0;
    let alive = true;
    let chordTimer: number | null = null;
    let arpTimer: number | null = null;

    const advanceChord = () => {
      if (!alive) return;
      const enabled = enabledNames();
      chordCycleIdx = (chordCycleIdx + 1) % enabled.length;
      const next = CHORD_LIB[enabled[chordCycleIdx]!] ?? firstChord;
      curChordNotes = next.slice();
      const t = ctx.currentTime;
      oscs.forEach((o, i) => {
        const target = next[i];
        if (target !== undefined) o.osc.frequency.setTargetAtTime(target, t, 0.7);
      });
      chordTimer = window.setTimeout(advanceChord, (params.changeSec ?? 8) * 1000);
    };
    chordTimer = window.setTimeout(advanceChord, (params.changeSec ?? 8) * 1000);

    const arpTick = () => {
      if (!alive) return;
      const speed = params.arpSpeed ?? 0.4;
      const note = curChordNotes[arpIdx % curChordNotes.length] ?? 220;
      const t = ctx.currentTime;
      arpOsc.frequency.setTargetAtTime(note, t, 0.005);
      arpEnv.gain.cancelScheduledValues(t);
      arpEnv.gain.setValueAtTime(0, t);
      arpEnv.gain.linearRampToValueAtTime(0.12, t + 0.015);
      arpEnv.gain.exponentialRampToValueAtTime(0.001, t + Math.min(speed * 0.9, 0.55));
      arpIdx++;
      arpTimer = window.setTimeout(arpTick, speed * 1000);
    };
    arpTimer = window.setTimeout(arpTick, 500);

    return {
      stop: () => {
        alive = false;
        if (chordTimer !== null) clearTimeout(chordTimer);
        if (arpTimer   !== null) clearTimeout(arpTimer);
        const t = ctx.currentTime;
        oscs.forEach((o) => o.gain.gain.setTargetAtTime(0, t, 0.1));
        polyGain.gain.setTargetAtTime(0, t, 0.05);
        window.setTimeout(() => {
          oscs.forEach((o) => { try { o.osc.stop(); } catch { /* noop */ } });
          try { lfo.stop(); } catch { /* noop */ }
          try { arpOsc.stop(); } catch { /* noop */ }
        }, 250);
      },
      setParam: (key, value) => {
        params[key] = value;
        const t = ctx.currentTime;
        if (key === 'brightness') lp.frequency.setTargetAtTime(1200 + value * 2400, t, 0.05);
        if (key === 'reverb')     wet.gain.setTargetAtTime(value, t, 0.05);
        if (key === 'detune') {
          oscs.forEach((o) => o.osc.detune.setTargetAtTime((Math.random() - 0.5) * value, t, 0.1));
          lfoGain.gain.setTargetAtTime(Math.max(2, value * 0.7), t, 0.1);
        }
        if (key === 'polyphonic') polyGain.gain.setTargetAtTime(value > 0.5 ? 1 : 0, t, 0.05);
        // changeSec, arpSpeed, chord_* read live from `params` on next tick
      },
    };
  }

  // ── WHITE ───────────────────────────────────────────────────────────────
  private playWhite(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 'white');
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.softness ?? 2400;
    lp.Q.value = 0.5;
    // Tone shelf
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 1500;
    shelf.gain.value = (p.tone ?? 0) * 12;
    // Wobble tremolo
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.25;
    const wobScale = ctx.createGain();
    wobScale.gain.value = (p.wobble ?? 0) * 0.4;
    const wobBias = ctx.createGain();
    wobBias.gain.value = 1;
    wob.connect(wobScale); wobScale.connect(wobBias.gain); wob.start();
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(lp); lp.connect(shelf); shelf.connect(wobBias); wobBias.connect(g); g.connect(master); src.start();
    return {
      stop: () => {
        try { src.stop(); } catch { /* noop */ }
        try { wob.stop(); } catch { /* noop */ }
      },
      setParam: (key, value) => {
        const t = ctx.currentTime;
        if (key === 'softness') lp.frequency.setTargetAtTime(value, t, 0.05);
        if (key === 'tone')     shelf.gain.setTargetAtTime(value * 12, t, 0.05);
        if (key === 'wobble')   wobScale.gain.setTargetAtTime(value * 0.4, t, 0.05);
      },
    };
  }

  // ── BROWN ───────────────────────────────────────────────────────────────
  private playBrown(ctx: AudioContext, master: GainNode, p: Params): PresetHandle {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 'brown');
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.depth ?? 700;
    // Sub-bass boost via lowshelf
    const sub = ctx.createBiquadFilter();
    sub.type = 'lowshelf';
    sub.frequency.value = 90;
    sub.gain.value = (p.rumble ?? 0.4) * 12;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(lp); lp.connect(sub); sub.connect(g); g.connect(master); src.start();
    return {
      stop: () => { try { src.stop(); } catch { /* noop */ } },
      setParam: (key, value) => {
        const t = ctx.currentTime;
        if (key === 'depth')  lp.frequency.setTargetAtTime(value, t, 0.05);
        if (key === 'rumble') sub.gain.setTargetAtTime(value * 12, t, 0.05);
      },
    };
  }

  // ── DSP helpers ─────────────────────────────────────────────────────────
  private noiseBuffer(ctx: AudioContext, type: 'white' | 'brown'): AudioBuffer {
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') {
        d[i] = w;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private makeReverbIR(ctx: AudioContext, duration = 2.5, decay = 2): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  }
}

export const audioEngine = new AudioEngine();

// ── YouTube IFrame API ────────────────────────────────────────────────────
let ytPlayer: YTPlayer | null = null;

export function loadYTScript(): void {
  if (document.getElementById('krnl0-yt-api')) return;
  const s = document.createElement('script');
  s.id = 'krnl0-yt-api';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

export function extractYouTubeId(str: string): string | null {
  const s = str.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? (m[1] ?? null) : null;
}

export function loadYouTubeVideo(videoId: string, volume0to100: number, mountId: string): void {
  const apply = (YT: YTNamespace) => {
    if (ytPlayer) {
      ytPlayer.loadVideoById(videoId);
      ytPlayer.setVolume(volume0to100);
      return;
    }
    ytPlayer = new YT.Player(mountId, {
      height: '1', width: '1', videoId,
      playerVars: { autoplay: 1, controls: 0, playsinline: 1 },
      events: {
        onReady: (e) => { e.target.setVolume(volume0to100); e.target.playVideo(); },
      },
    });
  };

  if (window.YT?.Player) { apply(window.YT); return; }
  let tries = 0;
  const iv = window.setInterval(() => {
    if (window.YT?.Player) {
      window.clearInterval(iv);
      apply(window.YT);
    } else if (++tries > 60) {
      window.clearInterval(iv);
    }
  }, 200);
}

export function ytPlay():  void { ytPlayer?.playVideo(); }
export function ytPause(): void { ytPlayer?.pauseVideo(); }
export function ytStop():  void { try { ytPlayer?.stopVideo(); } catch { /* noop */ } }
export function ytSetVolume(v: number): void { try { ytPlayer?.setVolume(v); } catch { /* noop */ } }
