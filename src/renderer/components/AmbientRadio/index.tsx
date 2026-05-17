/**
 * AmbientRadio — viewport-fixed ambient music / noise widget with layer mixing.
 *
 * Lives on the same overlay layer as the Orb (`position: fixed; zIndex: 200`).
 * Drag the header to move; release with the widget pulled at least 30px past
 * the left/right viewport edge to snap-collapse into a 14px peek tab.
 *
 * Multi-layer mixing: tap any preset chip to ADD it to the mix (tap again to
 * remove). Each active layer renders its own coloured particles into the
 * canvas — so Rain + Synth literally shows blue rain dancing with green
 * orbital trails. The active-layer panel below the chips lets you set
 * per-layer volume, focus a layer (for its settings), or remove it.
 *
 * Each preset exposes live-tweakable parameters via the gear icon. The
 * AudioEngine creates a dedicated gain node per layer so the master + per
 * layer volumes mix independently; YouTube (a separate iframe stream) is
 * treated as a layer too, with combined master×layer volume applied via
 * the YT IFrame API.
 *
 * Visual design: locked to the "Particle Field.html" reference (deep-purple
 * shell #090811, per-preset accent colour, JetBrains Mono).
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
import {
  audioEngine,
  loadYTScript,
  loadYouTubeVideo,
  extractYouTubeId,
  ytPlay,
  ytPause,
  ytStop,
  ytSetVolume,
  DEFAULT_PARAMS,
  CHORD_ORDER,
  type PresetId,
  type Params,
} from './audio';

type LayerId = PresetId | 'yt';
type ParticleMode = 'orbs' | 'fall' | 'rise' | 'orbit' | 'scatter' | 'drift';

interface Preset {
  id: LayerId;
  name: string;
  sub: string;
  col: string;
  rgb: string;
  mode: ParticleMode;
}

const PRESETS: readonly Preset[] = [
  { id: 'dark',  name: 'Dark',    sub: 'low-freq drone',  col: '#a78bfa', rgb: '167,139,250', mode: 'orbs'    },
  { id: 'rain',  name: 'Rain',    sub: 'gentle rainfall', col: '#60a5fa', rgb: '96,165,250',  mode: 'fall'    },
  { id: 'fire',  name: 'Fire',    sub: 'crackling fire',  col: '#fb923c', rgb: '251,146,60',  mode: 'rise'    },
  { id: 'synth', name: 'Synth',   sub: 'ambient synth',   col: '#c9f158', rgb: '201,241,88',  mode: 'orbit'   },
  { id: 'white', name: 'White',   sub: 'soft white',      col: '#e2e8f0', rgb: '226,232,240', mode: 'scatter' },
  { id: 'brown', name: 'Brown',   sub: 'brown noise',     col: '#f59e0b', rgb: '245,158,11',  mode: 'drift'   },
  { id: 'yt',    name: 'YouTube', sub: 'video stream',    col: '#f43f5e', rgb: '244,63,94',   mode: 'orbit'   },
];

const PRESET_BY_ID: Record<LayerId, Preset> = PRESETS.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<LayerId, Preset>);

interface SettingDef { key: string; label: string; min: number; max: number; step: number }

const SETTINGS: Record<LayerId, readonly SettingDef[]> = {
  dark:  [
    { key: 'bass',      label: 'Bass Freq',  min: 20,   max: 80,   step: 1 },
    { key: 'harmonics', label: 'Harmonics',  min: 0,    max: 0.5,  step: 0.01 },
    { key: 'sub',       label: 'Sub Octave', min: 0,    max: 1,    step: 0.02 },
    { key: 'drift',     label: 'Drift',      min: 0,    max: 2,    step: 0.05 },
    { key: 'wobble',    label: 'Wobble',     min: 0,    max: 1,    step: 0.02 },
  ],
  rain:  [
    { key: 'softness',  label: 'Softness',   min: 400,  max: 5000, step: 50 },
    { key: 'density',   label: 'Density',    min: 0.05, max: 1.5,  step: 0.05 },
    { key: 'reverb',    label: 'Reverb',     min: 0,    max: 1,    step: 0.02 },
    { key: 'drops',     label: 'Drop Rate',  min: 0.02, max: 1.0,  step: 0.01 },
    { key: 'wind',      label: 'Wind',       min: 0,    max: 1,    step: 0.02 },
  ],
  fire:  [
    { key: 'body',      label: 'Body',       min: 200,  max: 1500, step: 25 },
    { key: 'crackle',   label: 'Crackle',    min: 0,    max: 1,    step: 0.02 },
    { key: 'roar',      label: 'Roar',       min: 0,    max: 1,    step: 0.02 },
    { key: 'spark',     label: 'Spark Tone', min: 800,  max: 6000, step: 50 },
  ],
  synth: [
    { key: 'changeSec', label: 'Chord Time', min: 3,    max: 20,   step: 1 },
    { key: 'brightness',label: 'Brightness', min: 0,    max: 1,    step: 0.02 },
    { key: 'reverb',    label: 'Reverb',     min: 0,    max: 1,    step: 0.02 },
    { key: 'detune',    label: 'Detune',     min: 0,    max: 30,   step: 1 },
    { key: 'arpSpeed',  label: 'Arp Speed',  min: 0.1,  max: 2,    step: 0.05 },
  ],
  white: [
    { key: 'softness',  label: 'Softness',   min: 400,  max: 8000, step: 100 },
    { key: 'tone',      label: 'Tone',       min: -1,   max: 1,    step: 0.05 },
    { key: 'wobble',    label: 'Wobble',     min: 0,    max: 1,    step: 0.02 },
  ],
  brown: [
    { key: 'depth',     label: 'Depth',      min: 200,  max: 1500, step: 25 },
    { key: 'rumble',    label: 'Rumble',     min: 0,    max: 1,    step: 0.02 },
  ],
  yt: [],
};

const CHORD_LABELS: Record<string, string> = {
  am: 'Am', em: 'Em', dm: 'Dm', fmaj: 'Fmaj', g: 'G', cmaj: 'Cmaj', dmaj: 'Dmaj',
};

const WIDTH = 300;
const HEIGHT = 148;
const POS_KEY    = 'krnl0-ambient-radio-pos';
const PARAMS_KEY = 'krnl0-ambient-radio-params';
const STATE_KEY  = 'krnl0-ambient-radio-state';
const FAVS_KEY   = 'krnl0-ambient-radio-yt-favs';
const FAVS_MAX   = 50;
const Z = 200;
const SNAP_PAST_EDGE = 30;
const PEEK_PX = 14;

type EdgeState = 'none' | 'left' | 'right';

interface Pos { x: number; y: number }

interface Particle {
  m: ParticleMode;
  x: number; y: number;
  vx: number; vy: number;
  sz: number; op: number;
  pulse?: number;
  life?: number;
  ang?: number; r?: number; spd?: number; ocx?: number; ocy?: number;
}

interface SavedState {
  activeLayers: LayerId[];
  focusedId: LayerId;
  layerVolumes: Record<LayerId, number>;
  masterVolume: number;
}

interface YtFav {
  id: string;
  url: string;
  title: string;
  savedAt: number;
}

const DEFAULT_LAYER_VOLS: Record<LayerId, number> = {
  dark: 80, rain: 80, fire: 80, synth: 80, white: 80, brown: 80, yt: 80,
};

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' && parsed !== null &&
        'x' in parsed && 'y' in parsed &&
        typeof (parsed as { x: unknown }).x === 'number' &&
        typeof (parsed as { y: unknown }).y === 'number'
      ) {
        return { x: (parsed as Pos).x, y: (parsed as Pos).y };
      }
    }
  } catch { /* fall through */ }
  return { x: window.innerWidth - WIDTH - 20, y: 80 };
}

function savePos(p: Pos): void {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

function loadParams(): Record<PresetId, Params> {
  const base: Record<PresetId, Params> = {
    dark:  { ...DEFAULT_PARAMS.dark  },
    rain:  { ...DEFAULT_PARAMS.rain  },
    fire:  { ...DEFAULT_PARAMS.fire  },
    synth: { ...DEFAULT_PARAMS.synth },
    white: { ...DEFAULT_PARAMS.white },
    brown: { ...DEFAULT_PARAMS.brown },
  };
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        for (const id of Object.keys(base) as PresetId[]) {
          const saved = (parsed as Record<string, unknown>)[id];
          if (saved && typeof saved === 'object') {
            for (const [k, v] of Object.entries(saved)) {
              if (typeof v === 'number') base[id][k] = v;
            }
          }
        }
      }
    }
  } catch { /* fall through */ }
  return base;
}

function saveParams(p: Record<PresetId, Params>): void {
  try { localStorage.setItem(PARAMS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

function loadState(): { focusedId: LayerId; layerVolumes: Record<LayerId, number>; masterVolume: number } {
  const base = {
    focusedId: 'dark' as LayerId,
    layerVolumes: { ...DEFAULT_LAYER_VOLS },
    masterVolume: 60,
  };
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      if (parsed.focusedId && PRESET_BY_ID[parsed.focusedId]) base.focusedId = parsed.focusedId;
      if (parsed.layerVolumes && typeof parsed.layerVolumes === 'object') {
        for (const id of Object.keys(base.layerVolumes) as LayerId[]) {
          const v = (parsed.layerVolumes as Record<string, unknown>)[id];
          if (typeof v === 'number') base.layerVolumes[id] = v;
        }
      }
      if (typeof parsed.masterVolume === 'number') base.masterVolume = parsed.masterVolume;
    }
  } catch { /* fall through */ }
  return base;
}

function saveState(s: { focusedId: LayerId; layerVolumes: Record<LayerId, number>; masterVolume: number; activeLayers: LayerId[] }): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function loadFavs(): YtFav[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is YtFav =>
        f !== null && typeof f === 'object' &&
        typeof (f as YtFav).id === 'string' &&
        typeof (f as YtFav).url === 'string' &&
        typeof (f as YtFav).title === 'string' &&
        typeof (f as YtFav).savedAt === 'number'
      )
      .slice(0, FAVS_MAX);
  } catch { return []; }
}

function saveFavs(favs: YtFav[]): void {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch { /* quota */ }
}

async function fetchYtTitle(id: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) return `Video ${id}`;
    const j = await r.json() as { title?: string };
    return (typeof j.title === 'string' && j.title.length > 0) ? j.title : `Video ${id}`;
  } catch {
    return `Video ${id}`;
  }
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

function mkParticle(mode: ParticleMode): Particle {
  const x = Math.random() * WIDTH;
  const y = Math.random() * HEIGHT;
  if (mode === 'fall')    return { m: mode, x, y: Math.random() * HEIGHT, vx: (Math.random() - .5) * .4, vy: .6 + Math.random() * 1.8, sz: 1.2 + Math.random() * 1.8, op: .4 + Math.random() * .5 };
  if (mode === 'rise')    return { m: mode, x, y: HEIGHT + Math.random() * 10, vx: (Math.random() - .5) * .7, vy: -(0.8 + Math.random() * 2.2), sz: 1.5 + Math.random() * 2.5, op: .6 + Math.random() * .4, life: 1 };
  if (mode === 'orbit')   return { m: mode, x: 0, y: 0, vx: 0, vy: 0, ang: Math.random() * Math.PI * 2, r: 22 + Math.random() * 48, spd: (.008 + Math.random() * .018) * (Math.random() > .5 ? 1 : -1), ocx: 150 + (Math.random() - .5) * 50, ocy: 74 + (Math.random() - .5) * 28, sz: 1.5 + Math.random() * 2.5, op: .5 + Math.random() * .5 };
  if (mode === 'scatter') return { m: mode, x, y, vx: (Math.random() - .5) * 2.5, vy: (Math.random() - .5) * 2.5, sz: .8 + Math.random() * 1.2, op: .3 + Math.random() * .4, life: Math.random() };
  if (mode === 'drift')   return { m: mode, x, y, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .2 + .06, sz: 3 + Math.random() * 6, op: .12 + Math.random() * .22 };
  return { m: 'orbs', x, y, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, sz: 4 + Math.random() * 8, op: .1 + Math.random() * .22, pulse: Math.random() * Math.PI * 2 };
}

function particleCount(mode: ParticleMode): number {
  return ({ orbs: 30, fall: 45, rise: 32, orbit: 22, scatter: 75, drift: 25 } as Record<ParticleMode, number>)[mode];
}

// ── MiniSlider ─────────────────────────────────────────────────────────────
interface MiniSliderProps {
  value: number; min: number; max: number; step: number;
  color: string; rgb: string;
  onChange: (v: number) => void;
  testId?: string;
  compact?: boolean;
}
function MiniSlider({ value, min, max, step, color, rgb, onChange, testId, compact = false }: MiniSliderProps) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  const apply = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(Math.round(clamped * 1000) / 1000);
  }, [min, max, step, onChange]);

  const onDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setActive(true);
    apply(e.clientX);
    const onMove = (ev: MouseEvent) => apply(ev.clientX);
    const onUp = () => {
      setActive(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [apply]);

  const thumbSize = compact ? 11 : 14;

  return (
    <div
      ref={ref}
      data-testid={testId}
      onMouseDown={onDown}
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        // Generous hit area so users don't need to hit the thumb exactly
        height: compact ? 22 : 28,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    >
      <div style={{
        position: 'relative', width: '100%', height: compact ? 3 : 4,
        background: 'rgba(255,255,255,.1)', borderRadius: 2,
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${pct * 100}%`, borderRadius: 2,
          background: color,
          boxShadow: `0 0 6px rgba(${rgb},.5)`,
        }} />
        <div style={{
          position: 'absolute', top: '50%',
          left: `${pct * 100}%`,
          transform: `translate(-50%, -50%) scale(${active ? 1.25 : 1})`,
          width: thumbSize, height: thumbSize, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 10px rgba(${rgb},.8), 0 1px 3px rgba(0,0,0,.5)`,
          border: '1px solid rgba(255,255,255,.22)',
          pointerEvents: 'none',
          transition: 'transform .12s ease',
        }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function AmbientRadio() {
  const initState = loadState();

  const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(new Set());
  const [focusedId, setFocusedId] = useState<LayerId>(initState.focusedId);
  const [layerVolumes, setLayerVolumes] = useState<Record<LayerId, number>>(initState.layerVolumes);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(initState.masterVolume);

  const [edge, setEdge] = useState<EdgeState>('none');
  const [pos, setPos] = useState<Pos>(loadPos);
  const [isDragging, setIsDragging] = useState(false);
  // Visual-only hide. Keeps the YT iframe and audio engine alive so music
  // continues playing while the panel disappears (driven by the Jen bridge).
  const [hidden, setHidden] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytError, setYtError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allParams, setAllParams] = useState<Record<PresetId, Params>>(loadParams);
  const [ytFavs, setYtFavs] = useState<YtFav[]>(loadFavs);
  const [favsOpen, setFavsOpen] = useState(false);
  const [currentVidId, setCurrentVidId] = useState<string | null>(null);

  const focusedPreset = PRESET_BY_ID[focusedId] ?? PRESETS[0]!;
  const isYtFocused = focusedId === 'yt';

  // Refs the raf loop reads
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<Map<LayerId, Particle[]>>(new Map());
  const playingRef = useRef(playing);
  const focusedIdRef = useRef(focusedId);
  const activeLayersRef = useRef(activeLayers);
  const vuPhaseRef = useRef(0);
  const vuRef = useRef<HTMLDivElement | null>(null);
  // Visibility gates for the render loop — the rAF callback short-circuits
  // when the widget is collapsed (`hidden=true` → display:none) or the
  // window is in the background. Reads through refs so toggling them
  // doesn't re-create the rAF closure (which would briefly drop a frame).
  const hiddenRef = useRef(false);
  const docHiddenRef = useRef(typeof document !== 'undefined' && document.hidden);

  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);
  useEffect(() => { activeLayersRef.current = activeLayers; }, [activeLayers]);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);

  // Page Visibility — pause the rAF when the window is minimised or in the
  // background. Costs ~0% when the user is doing anything else; saves a full
  // 60fps canvas paint when they alt-tab away.
  useEffect(() => {
    const onVis = () => { docHiddenRef.current = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Persist state on relevant changes
  useEffect(() => {
    saveState({
      focusedId,
      layerVolumes,
      masterVolume: volume,
      activeLayers: Array.from(activeLayers),
    });
  }, [focusedId, layerVolumes, volume, activeLayers]);

  // Initialise particles for every preset once
  useEffect(() => {
    for (const p of PRESETS) {
      partsRef.current.set(p.id, Array.from({ length: particleCount(p.mode) }, () => mkParticle(p.mode)));
    }
  }, []);

  // ── Canvas render loop ───────────────────────────────────────────────────
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      // Skip the whole canvas pass when the widget is offscreen (collapsed
      // chip / display:none) or the window is in the background. The rAF
      // callback still re-arms itself so playback can resume the moment
      // the widget reopens. macOS rAF runs at ~60Hz; without this gate we
      // burned a full frame on a canvas the user couldn't see.
      if (hiddenRef.current || docHiddenRef.current) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const active = activeLayersRef.current;
      const running = playingRef.current;
      const focused = focusedIdRef.current;
      const idsToDraw: LayerId[] = active.size > 0 ? Array.from(active) : [focused];

      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, '#090811');
      bg.addColorStop(1, '#0f0c1c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Density falloff for multi-layer clarity
      const layerCount = idsToDraw.length;
      const stride = layerCount > 1 ? Math.max(1, Math.floor(layerCount / 2)) : 1;

      for (const id of idsToDraw) {
        const preset = PRESET_BY_ID[id];
        if (!preset) continue;
        const parts = partsRef.current.get(id);
        if (!parts) continue;
        const c = preset.col;
        const layerActive = active.has(id) && running;
        // Dim when widget is in idle / paused state
        const baseAlpha = active.size === 0 ? 0.55 : 1;

        for (let i = 0; i < parts.length; i += stride) {
          const pt = parts[i]!;
          if (pt.m === 'orbs') {
            if (layerActive) {
              pt.pulse = (pt.pulse ?? 0) + .018;
              pt.vx += (Math.random() - .5) * .015;
              pt.vy += (Math.random() - .5) * .015;
              pt.vx *= .98; pt.vy *= .98;
              pt.x += pt.vx; pt.y += pt.vy;
              if (pt.x < -10) pt.x = WIDTH + 10;
              if (pt.x > WIDTH + 10) pt.x = -10;
              if (pt.y < -10) pt.y = HEIGHT + 10;
              if (pt.y > HEIGHT + 10) pt.y = -10;
            }
            const sz = pt.sz * (1 + Math.sin(pt.pulse ?? 0) * .15);
            const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, sz * 2.8);
            g.addColorStop(0, c + 'bb');
            g.addColorStop(.5, c + '44');
            g.addColorStop(1, c + '00');
            ctx.globalAlpha = baseAlpha;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, sz * 2.8, 0, Math.PI * 2);
            ctx.fillStyle = g; ctx.fill();
            ctx.globalAlpha = 1;
          } else if (pt.m === 'fall') {
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt.x + pt.vx, pt.y - pt.sz * 2.2);
            ctx.strokeStyle = c + hex2(pt.op * 255 * baseAlpha);
            ctx.lineWidth = pt.sz * .5;
            ctx.lineCap = 'round';
            ctx.stroke();
            if (layerActive) {
              pt.x += pt.vx; pt.y += pt.vy;
              if (pt.y > HEIGHT + 5) { pt.y = -5; pt.x = Math.random() * WIDTH; }
            }
          } else if (pt.m === 'rise') {
            if (layerActive) {
              pt.life = (pt.life ?? 1) - .006;
              if ((pt.life ?? 0) <= 0) { Object.assign(pt, mkParticle('rise')); continue; }
              pt.x += pt.vx + (Math.random() - .5) * .08;
              pt.y += pt.vy;
            }
            const a = Math.min(1, (pt.life ?? 1) * 2.5) * pt.op * baseAlpha;
            const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.sz * 2);
            g.addColorStop(0, c + 'ff');
            g.addColorStop(1, c + '00');
            ctx.globalAlpha = a;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.sz, 0, Math.PI * 2);
            ctx.fillStyle = g; ctx.fill();
            ctx.globalAlpha = 1;
          } else if (pt.m === 'orbit') {
            if (layerActive) pt.ang = (pt.ang ?? 0) + (pt.spd ?? 0);
            const ang = pt.ang ?? 0;
            const ocx = pt.ocx ?? 150;
            const ocy = pt.ocy ?? 74;
            const r = pt.r ?? 30;
            const ox = ocx + Math.cos(ang) * r;
            const oy = ocy + Math.sin(ang) * r;
            ctx.globalAlpha = baseAlpha;
            ctx.beginPath(); ctx.arc(ox, oy, pt.sz * .5, 0, Math.PI * 2);
            ctx.fillStyle = c + hex2(pt.op * 255);
            ctx.fill();
            for (let t = 1; t <= 5; t++) {
              const ta = ang - (pt.spd ?? 0) * t * 3.5;
              const tx = ocx + Math.cos(ta) * r;
              const ty = ocy + Math.sin(ta) * r;
              ctx.beginPath(); ctx.arc(tx, ty, pt.sz * .5 * (1 - t / 6), 0, Math.PI * 2);
              ctx.fillStyle = c + hex2(pt.op * (1 - t / 6) * 255 * .4);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          } else if (pt.m === 'scatter') {
            if (layerActive) {
              pt.life = (pt.life ?? 0) + .04;
              if ((pt.life ?? 0) > 1) pt.life = 0;
            }
            const a = Math.sin((pt.life ?? 0) * Math.PI) * pt.op * baseAlpha;
            ctx.beginPath();
            ctx.arc(pt.x + (Math.random() - .5) * 1.5, pt.y + (Math.random() - .5) * 1.5, pt.sz, 0, Math.PI * 2);
            ctx.fillStyle = c + hex2(a * 255);
            ctx.fill();
          } else if (pt.m === 'drift') {
            if (layerActive) {
              pt.vx += (Math.random() - .5) * .04;
              pt.vy += (Math.random() - .5) * .04;
              pt.vx *= .99; pt.vy *= .99;
              pt.x += pt.vx; pt.y += pt.vy;
              if (pt.x < -20) pt.x = WIDTH + 20;
              if (pt.x > WIDTH + 20) pt.x = -20;
              if (pt.y < -20) pt.y = HEIGHT + 20;
              if (pt.y > HEIGHT + 20) pt.y = -20;
            }
            const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.sz * 2.2);
            g.addColorStop(0, c + hex2(pt.op * 255 * baseAlpha));
            g.addColorStop(1, c + '00');
            ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.sz * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = g; ctx.fill();
          }
        }
      }

      // VU bars — use focused preset colour
      vuPhaseRef.current += .1;
      const phase = vuPhaseRef.current;
      const focusedCol = PRESET_BY_ID[focused]?.col ?? '#a78bfa';
      const bars = vuRef.current?.querySelectorAll('span');
      if (bars) {
        bars.forEach((b, i) => {
          const el = b as HTMLSpanElement;
          const h = running ? 3 + Math.abs(Math.sin(phase + i * .75)) * 18 : 3;
          el.style.height = h + 'px';
          el.style.background = focusedCol;
          el.style.opacity = running ? String(.4 + Math.abs(Math.sin(phase + i * .75)) * .6) : '0.15';
        });
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => { audioEngine.stopAll(); ytStop(); }, []);

  // ── Layer toggle (add / remove from mix) ─────────────────────────────────
  const toggleLayer = useCallback((id: LayerId) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      const isActive = next.has(id);

      if (isActive) {
        next.delete(id);
        if (id === 'yt') ytStop();
        else if (playingRef.current) audioEngine.stopLayer(id);

        // Pick a new focused id if we just removed the focused layer
        if (focusedIdRef.current === id) {
          const replacement = Array.from(next)[0] ?? 'dark';
          setFocusedId(replacement);
        }
        // Auto-pause when the mix becomes empty
        if (next.size === 0) {
          setPlaying(false);
          audioEngine.stopAll();
        }
      } else {
        next.add(id);
        setFocusedId(id);
        const wasPlaying = playingRef.current;
        if (id === 'yt') {
          loadYTScript();
          if (!wasPlaying) setPlaying(true);
        } else {
          const lv = (layerVolumes[id] ?? 80) / 100;
          audioEngine.playLayer(id, allParams[id], lv);
          if (!wasPlaying) setPlaying(true);
        }
      }
      return next;
    });
  }, [allParams, layerVolumes]);

  // ── Master play toggle ───────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    setPlaying((wasPlaying) => {
      const nextPlaying = !wasPlaying;
      const active = activeLayersRef.current;

      if (nextPlaying) {
        if (active.size === 0) {
          // Bootstrap: add the focused preset to the mix
          const id = focusedIdRef.current;
          setActiveLayers(new Set([id]));
          if (id === 'yt') loadYTScript();
          else audioEngine.playLayer(id, allParams[id as PresetId], (layerVolumes[id] ?? 80) / 100);
        } else {
          for (const id of active) {
            if (id === 'yt') ytPlay();
            else audioEngine.playLayer(id, allParams[id], (layerVolumes[id] ?? 80) / 100);
          }
        }
      } else {
        for (const id of active) {
          if (id === 'yt') ytPause();
          else audioEngine.stopLayer(id);
        }
      }
      return nextPlaying;
    });
  }, [allParams, layerVolumes]);

  // ── Layer volume ─────────────────────────────────────────────────────────
  const onLayerVolumeChange = useCallback((id: LayerId, vIn: number) => {
    const v = Math.round(vIn);
    setLayerVolumes((prev) => ({ ...prev, [id]: v }));
    if (id === 'yt') {
      const combined = Math.round((volume / 100) * (v / 100) * 100);
      ytSetVolume(combined);
    } else {
      audioEngine.setLayerVolume(id, v / 100);
    }
  }, [volume]);

  // ── Master volume ────────────────────────────────────────────────────────
  const onVolumeChange = useCallback((v: number) => {
    const vol = Math.round(v);
    setVolume(vol);
    audioEngine.setMasterVolume(vol);
    if (activeLayersRef.current.has('yt')) {
      const ytLv = layerVolumes.yt ?? 80;
      ytSetVolume(Math.round((vol / 100) * (ytLv / 100) * 100));
    }
  }, [layerVolumes.yt]);

  // ── Drag handlers ────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    draggingRef.current = true;
    dragMovedRef.current = false;
    dragOffsetRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      dragMovedRef.current = true;
      const nx = ev.clientX - dragOffsetRef.current.dx;
      const ny = Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dragOffsetRef.current.dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      draggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragMovedRef.current) return;
      setPos((p) => {
        const W = window.innerWidth;
        if (p.x < -SNAP_PAST_EDGE) {
          const snapped = { x: -(WIDTH - PEEK_PX), y: p.y };
          savePos(snapped); setEdge('left');
          return snapped;
        }
        if (p.x + WIDTH > W + SNAP_PAST_EDGE) {
          const snapped = { x: W - PEEK_PX, y: p.y };
          savePos(snapped); setEdge('right');
          return snapped;
        }
        savePos(p);
        setEdge('none');
        return p;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y]);

  const restoreFromEdge = useCallback(() => {
    const W = window.innerWidth;
    const next = { x: W - WIDTH - 20, y: pos.y };
    setPos(next); savePos(next); setEdge('none');
  }, [pos.y]);

  const snapToNearestEdge = useCallback(() => {
    if (edge !== 'none') { restoreFromEdge(); return; }
    const W = window.innerWidth;
    const center = pos.x + WIDTH / 2;
    const goLeft = center < W / 2;
    const next: Pos = goLeft
      ? { x: -(WIDTH - PEEK_PX), y: pos.y }
      : { x: W - PEEK_PX, y: pos.y };
    setPos(next); savePos(next); setEdge(goLeft ? 'left' : 'right');
  }, [edge, pos.x, pos.y, restoreFromEdge]);

  // ── YouTube load ─────────────────────────────────────────────────────────
  const onYtLoad = useCallback(() => {
    const id = extractYouTubeId(ytUrl);
    if (!id) { setYtError(true); return; }
    setYtError(false);
    const ytLv = layerVolumes.yt ?? 80;
    const combined = Math.round((volume / 100) * (ytLv / 100) * 100);
    loadYouTubeVideo(id, combined, 'krnl0-ambient-radio-yt-iframe');
    setCurrentVidId(id);
    if (!activeLayers.has('yt')) {
      setActiveLayers((prev) => new Set(prev).add('yt'));
    }
    if (!playingRef.current) setPlaying(true);
  }, [ytUrl, volume, layerVolumes.yt, activeLayers]);

  // ── Favorites ────────────────────────────────────────────────────────────
  const currentFavId = currentVidId ?? extractYouTubeId(ytUrl);
  const isStarred = currentFavId !== null && ytFavs.some((f) => f.id === currentFavId);

  const toggleStar = useCallback(() => {
    const id = currentVidId ?? extractYouTubeId(ytUrl);
    if (!id) { setYtError(true); return; }
    setYtFavs((prev) => {
      const existing = prev.find((f) => f.id === id);
      if (existing) {
        const next = prev.filter((f) => f.id !== id);
        saveFavs(next);
        return next;
      }
      const placeholder: YtFav = {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: `Video ${id}`,
        savedAt: Date.now(),
      };
      const next = [placeholder, ...prev].slice(0, FAVS_MAX);
      saveFavs(next);
      // Fetch real title async, patch entry
      void fetchYtTitle(id).then((title) => {
        setYtFavs((cur) => {
          const updated = cur.map((f) => f.id === id ? { ...f, title } : f);
          saveFavs(updated);
          return updated;
        });
      });
      return next;
    });
  }, [currentVidId, ytUrl]);

  const playFav = useCallback((fav: YtFav) => {
    setYtUrl(fav.url);
    setYtError(false);
    const ytLv = layerVolumes.yt ?? 80;
    const combined = Math.round((volume / 100) * (ytLv / 100) * 100);
    loadYTScript();
    loadYouTubeVideo(fav.id, combined, 'krnl0-ambient-radio-yt-iframe');
    setCurrentVidId(fav.id);
    setFocusedId('yt');
    if (!activeLayersRef.current.has('yt')) {
      setActiveLayers((prev) => new Set(prev).add('yt'));
    }
    if (!playingRef.current) setPlaying(true);
    setFavsOpen(false);
  }, [volume, layerVolumes.yt]);

  const removeFav = useCallback((id: string) => {
    setYtFavs((prev) => {
      const next = prev.filter((f) => f.id !== id);
      saveFavs(next);
      return next;
    });
  }, []);

  // ── Settings change (live update + persist) ──────────────────────────────
  const onSettingChange = useCallback((key: string, value: number) => {
    if (focusedId === 'yt') return;
    setAllParams((prev) => {
      const id = focusedId as PresetId;
      const next = { ...prev, [id]: { ...prev[id], [key]: value } };
      saveParams(next);
      return next;
    });
    if (playingRef.current && activeLayersRef.current.has(focusedId)) {
      audioEngine.setParam(focusedId as PresetId, key, value);
    }
  }, [focusedId]);

  const resetSettings = useCallback(() => {
    if (focusedId === 'yt') return;
    const defaults = { ...DEFAULT_PARAMS[focusedId as PresetId] };
    setAllParams((prev) => {
      const next = { ...prev, [focusedId as PresetId]: defaults };
      saveParams(next);
      return next;
    });
    if (playingRef.current && activeLayersRef.current.has(focusedId)) {
      for (const [k, v] of Object.entries(defaults)) {
        audioEngine.setParam(focusedId as PresetId, k, v);
      }
    }
  }, [focusedId]);

  // ── External control bridge (driven by Jen / ScriptRunner) ──────────────
  // Listens for window CustomEvents so the assistant can drive the radio
  // during a tutorial without exposing a global mutable API.
  useEffect(() => {
    const onMoveToCenter = () => {
      const x = Math.round((window.innerWidth  - WIDTH)  / 2);
      const y = Math.round((window.innerHeight - HEIGHT) / 2);
      const next = { x, y };
      setPos(next); savePos(next); setEdge('none');
      // Pre-fetch the YT IFrame API now — if Jen is centering the radio
      // she's almost certainly about to call play-youtube next, and
      // loadYouTubeVideo() polls forever if the script isn't loaded.
      loadYTScript();
    };

    const onAddLayer = (ev: Event) => {
      const id = (ev as CustomEvent<{ id: LayerId }>).detail?.id;
      if (!id || activeLayersRef.current.has(id)) return;
      toggleLayer(id);
    };

    const onRemoveLayer = (ev: Event) => {
      const id = (ev as CustomEvent<{ id: LayerId }>).detail?.id;
      if (!id || !activeLayersRef.current.has(id)) return;
      toggleLayer(id);
    };

    const onPlayYouTube = (ev: Event) => {
      const detail = (ev as CustomEvent<{ url: string; volume?: number }>).detail;
      const url = detail?.url;
      if (!url) return;
      const vid = extractYouTubeId(url);
      if (!vid) return;
      setYtUrl(url);

      // Apply optional per-layer volume override BEFORE loading the video
      // so the iframe starts at the right level (no momentary loud blast).
      const ytLv = typeof detail?.volume === 'number'
        ? Math.max(0, Math.min(100, Math.round(detail.volume)))
        : (layerVolumes.yt ?? 80);
      if (typeof detail?.volume === 'number') {
        setLayerVolumes((prev) => ({ ...prev, yt: ytLv }));
      }
      const combined = Math.round((volume / 100) * (ytLv / 100) * 100);
      // Guarantee the IFrame API is loading before we ask for a video.
      // loadYouTubeVideo polls for window.YT.Player for ~12s then gives up.
      loadYTScript();
      loadYouTubeVideo(vid, combined, 'krnl0-ambient-radio-yt-iframe');
      ytSetVolume(combined);
      setCurrentVidId(vid);

      if (!activeLayersRef.current.has('yt')) {
        setActiveLayers((prev) => new Set(prev).add('yt'));
      }
      if (!playingRef.current) setPlaying(true);
    };

    // Visual hide — keeps audio + iframe playing, just removes the UI.
    // (Different from the X button, which fully closes and stops everything.)
    const onHide = () => {
      setHidden(true);
    };

    // Snap to the right edge so only a thin peek is visible. User can
    // click it to bring the panel back. Used when Jen wants the radio
    // out of the way but still discoverable.
    const onSnapToEdge = () => {
      setPos((p) => {
        const next: Pos = { x: window.innerWidth - PEEK_PX, y: p.y };
        savePos(next);
        return next;
      });
      setEdge('right');
    };

    window.addEventListener('krnl:radio:move-to-center', onMoveToCenter);
    window.addEventListener('krnl:radio:add-layer',      onAddLayer);
    window.addEventListener('krnl:radio:remove-layer',   onRemoveLayer);
    window.addEventListener('krnl:radio:play-youtube',   onPlayYouTube);
    window.addEventListener('krnl:radio:hide',           onHide);
    window.addEventListener('krnl:radio:snap-to-edge',   onSnapToEdge);
    return () => {
      window.removeEventListener('krnl:radio:move-to-center', onMoveToCenter);
      window.removeEventListener('krnl:radio:add-layer',      onAddLayer);
      window.removeEventListener('krnl:radio:remove-layer',   onRemoveLayer);
      window.removeEventListener('krnl:radio:play-youtube',   onPlayYouTube);
      window.removeEventListener('krnl:radio:hide',           onHide);
      window.removeEventListener('krnl:radio:snap-to-edge',   onSnapToEdge);
    };
  }, [toggleLayer, volume, layerVolumes.yt]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const wrap: CSSProperties = {
    position: 'fixed',
    display: hidden ? 'none' : undefined,
    left: pos.x,
    top: pos.y,
    width: WIDTH,
    zIndex: Z,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    transition: isDragging
      ? 'transform .12s ease'
      : 'left .42s cubic-bezier(0.34, 1.3, 0.4, 1), top .42s cubic-bezier(0.34, 1.3, 0.4, 1), transform .18s ease, box-shadow .25s ease',
    transform: isDragging ? 'scale(1.018)' : 'scale(1)',
    userSelect: 'none',
    willChange: 'left, top, transform',
  };

  const node: CSSProperties = {
    background: '#090811',
    border: '1px solid #19162a',
    borderRadius: 10,
    boxShadow: isDragging
      ? '0 8px 24px rgba(10,8,17,.55), 0 24px 64px rgba(10,8,17,.85), 0 0 0 1px rgba(167,139,250,.18)'
      : '0 2px 6px rgba(10,8,17,.4), 0 12px 40px rgba(10,8,17,.7), 0 0 0 1px rgba(167,139,250,.05)',
    overflow: 'hidden',
    position: 'relative',
    transition: 'box-shadow .25s ease',
  };

  const header: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px 6px',
    borderBottom: '1px solid #19162a',
    background: '#0f0c1c',
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const headerBtn = (active: boolean): CSSProperties => ({
    background: active ? `rgba(${focusedPreset.rgb},.18)` : 'none',
    border: 0,
    color: active ? focusedPreset.col : 'rgba(196,181,253,.4)',
    cursor: 'pointer',
    width: 18, height: 18,
    display: 'grid', placeItems: 'center',
    borderRadius: 3,
    fontSize: 11, lineHeight: 1, padding: 0,
    transition: 'background .15s, color .15s',
  });

  const edgeTab: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: PEEK_PX,
    height: 48,
    background: '#0f0c1c',
    border: '1px solid rgba(167,139,250,.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 7,
    color: 'rgba(167,139,250,.6)',
    zIndex: 10,
  };

  // Multi-coloured label fragments — each active preset name in its colour
  const activeIdsArr = Array.from(activeLayers);
  const labelFragments = activeIdsArr.length === 0
    ? [{ id: focusedId, col: focusedPreset.col, name: focusedPreset.name.toUpperCase() }]
    : activeIdsArr.map((id) => ({ id, col: PRESET_BY_ID[id]?.col ?? '#fff', name: (PRESET_BY_ID[id]?.name ?? '').toUpperCase() }));

  const curParams: Params = focusedId !== 'yt' ? (allParams[focusedId as PresetId] ?? DEFAULT_PARAMS[focusedId as PresetId]) : {};
  const curSettings = SETTINGS[focusedId];

  return (
    <>
      <div
        id="krnl0-ambient-radio-yt"
        style={{ position: 'fixed', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none', top: -9999, left: -9999 }}
      >
        <div id="krnl0-ambient-radio-yt-iframe" />
      </div>

      <div data-testid="ambient-radio" style={wrap}>
        {edge === 'left' && (
          <div
            data-testid="ambient-radio-edge-tab-left"
            style={{ ...edgeTab, right: -PEEK_PX, borderLeft: 'none', borderRadius: '0 6px 6px 0' }}
            onClick={restoreFromEdge}
          >▶</div>
        )}
        {edge === 'right' && (
          <div
            data-testid="ambient-radio-edge-tab-right"
            style={{ ...edgeTab, left: -PEEK_PX, borderRight: 'none', borderRadius: '6px 0 0 6px' }}
            onClick={restoreFromEdge}
          >◀</div>
        )}

        <div style={node}>
          {/* Header */}
          <div data-testid="ambient-radio-handle" style={header} onMouseDown={onHeaderMouseDown}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: focusedPreset.col,
              boxShadow: `0 0 7px ${focusedPreset.col}`,
              flexShrink: 0,
              transition: 'background .2s, box-shadow .2s',
            }} />
            <span style={{
              fontSize: 10, fontWeight: 500, color: '#c4b5fd',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>ambient.radio</span>
            <span style={{ fontSize: 9, color: 'rgba(196,181,253,.35)', marginLeft: 2 }}>v03</span>

            {/* Active-layers badge */}
            {activeLayers.size >= 2 && (
              <span
                data-testid="ambient-radio-layer-badge"
                style={{
                  marginLeft: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 5px 1px 4px',
                  fontSize: 7.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  borderRadius: 100,
                  border: `1px solid rgba(${focusedPreset.rgb},.35)`,
                  background: `rgba(${focusedPreset.rgb},.10)`,
                  color: focusedPreset.col,
                }}
              >
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  {activeIdsArr.slice(0, 4).map((id) => (
                    <span key={id} style={{ width: 5, height: 5, borderRadius: '50%', background: PRESET_BY_ID[id]?.col ?? '#fff' }} />
                  ))}
                </span>
                <span>{activeLayers.size} layers</span>
              </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button type="button" data-testid="ambient-radio-gear" title="Settings" onClick={() => setSettingsOpen((o) => !o)} style={headerBtn(settingsOpen)}>⚙</button>
              <button type="button" title="Snap to edge" onClick={snapToNearestEdge} style={headerBtn(false)}>−</button>
            </div>
          </div>

          {/* Canvas — multi-layer particle field */}
          <div style={{ position: 'relative', height: HEIGHT, overflow: 'hidden' }}>
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ display: 'block', width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 55%, #090811)', pointerEvents: 'none' }} />
            <div style={{
              position: 'absolute', top: 10, left: 12, right: 60,
              display: 'flex', flexWrap: 'wrap', gap: 6,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
              textTransform: 'uppercase', zIndex: 2, pointerEvents: 'none',
            }}>
              {labelFragments.slice(0, 4).map((f, i) => (
                <span key={`${f.id}-${i}`} style={{ color: f.col, textShadow: '0 0 12px rgba(0,0,0,.8)' }}>
                  {f.name}
                </span>
              ))}
              {labelFragments.length > 4 && (
                <span style={{ color: 'rgba(255,255,255,.4)' }}>+{labelFragments.length - 4}</span>
              )}
            </div>
            {activeLayers.size === 0 && (
              <div style={{ position: 'absolute', top: 26, left: 12, fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.45, color: focusedPreset.col, zIndex: 2, pointerEvents: 'none' }}>
                tap a chip to layer
              </div>
            )}
            <div
              ref={vuRef}
              style={{ position: 'absolute', bottom: 18, right: 10, display: 'flex', gap: 2, alignItems: 'flex-end', zIndex: 2 }}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} style={{ width: 3, borderRadius: 1.5, height: 4, background: 'rgba(255,255,255,.15)', transition: 'height .08s ease' }} />
              ))}
            </div>
          </div>

          {/* YouTube URL row (focused on yt) */}
          {isYtFocused && !settingsOpen && (
            <>
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center',
                padding: '7px 10px',
                borderBottom: favsOpen ? '1px solid rgba(244,63,94,.15)' : '1px solid rgba(255,255,255,.05)',
                background: 'rgba(244,63,94,.03)',
              }}>
                <input
                  data-testid="ambient-radio-yt-url"
                  type="text"
                  placeholder="Paste YouTube URL or video ID…"
                  value={ytUrl}
                  onChange={(e) => { setYtUrl(e.target.value); setYtError(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onYtLoad(); }}
                  style={{
                    flex: 1, minWidth: 0,
                    background: 'rgba(255,255,255,.06)',
                    border: `1px solid rgba(244,63,94,${ytError ? '.7' : '.25'})`,
                    borderRadius: 5,
                    color: 'rgba(255,255,255,.8)',
                    fontFamily: 'inherit',
                    fontSize: 8,
                    padding: '5px 7px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  data-testid="ambient-radio-yt-star"
                  aria-label={isStarred ? 'Unstar video' : 'Star video'}
                  title={isStarred ? 'Unstar' : 'Save to favorites'}
                  onClick={toggleStar}
                  disabled={!currentFavId}
                  style={{
                    background: isStarred ? 'rgba(244,63,94,.18)' : 'rgba(255,255,255,.04)',
                    border: `1px solid rgba(244,63,94,${isStarred ? '.55' : '.2'})`,
                    borderRadius: 5,
                    color: isStarred ? '#f43f5e' : (currentFavId ? 'rgba(244,63,94,.55)' : 'rgba(255,255,255,.2)'),
                    fontSize: 10,
                    lineHeight: 1,
                    padding: '4px 7px',
                    cursor: currentFavId ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    transition: 'background .15s, color .15s, border-color .15s',
                  }}
                >{isStarred ? '★' : '☆'}</button>
                <button
                  type="button"
                  data-testid="ambient-radio-yt-favs-toggle"
                  aria-label="Toggle favorites"
                  title={`${ytFavs.length} saved`}
                  onClick={() => setFavsOpen((o) => !o)}
                  style={{
                    background: favsOpen ? 'rgba(244,63,94,.18)' : 'rgba(255,255,255,.04)',
                    border: `1px solid rgba(244,63,94,${favsOpen ? '.55' : '.2'})`,
                    borderRadius: 5,
                    color: favsOpen ? '#f43f5e' : 'rgba(244,63,94,.55)',
                    fontSize: 8,
                    padding: '5px 7px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    letterSpacing: '0.04em',
                    transition: 'background .15s, color .15s, border-color .15s',
                  }}
                >{ytFavs.length}<span style={{ fontSize: 7 }}>{favsOpen ? '▴' : '▾'}</span></button>
                <button
                  type="button"
                  onClick={onYtLoad}
                  style={{
                    background: 'rgba(244,63,94,.12)',
                    border: '1px solid rgba(244,63,94,.3)',
                    borderRadius: 5,
                    color: '#f43f5e',
                    fontSize: 8,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >▶ Load</button>
              </div>

              {favsOpen && (
                <div
                  data-testid="ambient-radio-yt-favs"
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                    background: 'rgba(244,63,94,.02)',
                    padding: ytFavs.length === 0 ? '10px' : '4px 6px',
                  }}
                >
                  {ytFavs.length === 0 ? (
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', letterSpacing: '0.04em', textAlign: 'center' }}>
                      no saved videos — load one, then tap ☆
                    </div>
                  ) : ytFavs.map((fav) => {
                    const playing_ = currentVidId === fav.id;
                    return (
                      <div
                        key={fav.id}
                        data-testid={`ambient-radio-yt-fav-${fav.id}`}
                        onClick={() => playFav(fav)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 6px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: playing_ ? 'rgba(244,63,94,.10)' : 'transparent',
                          borderLeft: `2px solid ${playing_ ? '#f43f5e' : 'transparent'}`,
                          transition: 'background .12s',
                        }}
                        onMouseEnter={(e) => { if (!playing_) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.04)'; }}
                        onMouseLeave={(e) => { if (!playing_) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        <span style={{
                          fontSize: 9,
                          color: playing_ ? '#f43f5e' : 'rgba(244,63,94,.7)',
                          flexShrink: 0,
                        }}>{playing_ ? '▶' : '♪'}</span>
                        <span
                          title={fav.title}
                          style={{
                            flex: 1, minWidth: 0,
                            fontSize: 8.5,
                            color: playing_ ? '#fff' : 'rgba(255,255,255,.75)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >{fav.title}</span>
                        <button
                          type="button"
                          data-testid={`ambient-radio-yt-fav-remove-${fav.id}`}
                          aria-label={`Remove ${fav.title}`}
                          onClick={(e) => { e.stopPropagation(); removeFav(fav.id); }}
                          style={{
                            background: 'none', border: 0,
                            color: 'rgba(255,255,255,.35)',
                            cursor: 'pointer', fontSize: 12, lineHeight: 1,
                            padding: 0, width: 14, height: 14,
                            display: 'grid', placeItems: 'center',
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Settings panel — focused layer */}
          {settingsOpen ? (
            <div data-testid="ambient-radio-settings" style={{
              padding: '8px 10px 10px',
              borderBottom: '1px solid rgba(255,255,255,.05)',
              background: 'rgba(255,255,255,.015)',
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: focusedPreset.col, marginBottom: 8,
              }}>
                <span>{focusedPreset.name} settings</span>
                {(curSettings.length > 0 || focusedId === 'synth') && (
                  <button
                    type="button"
                    onClick={resetSettings}
                    style={{
                      background: 'none', border: '1px solid rgba(255,255,255,.1)',
                      color: 'rgba(255,255,255,.4)', fontFamily: 'inherit',
                      fontSize: 7, padding: '2px 6px', borderRadius: 3,
                      cursor: 'pointer', letterSpacing: '0.08em',
                    }}
                  >reset</button>
                )}
              </div>
              {curSettings.length === 0 && focusedId !== 'synth' ? (
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,.3)', padding: '6px 0' }}>
                  no settings for this preset
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {curSettings.map((s) => {
                    const v = curParams[s.key] ?? s.min;
                    return (
                      <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          <span style={{ color: 'rgba(255,255,255,.5)' }}>{s.label}</span>
                          <span style={{ color: focusedPreset.col, opacity: 0.85 }}>{
                            s.step >= 1 ? Math.round(v).toString() : v.toFixed(2)
                          }</span>
                        </div>
                        <MiniSlider
                          value={v}
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          color={focusedPreset.col}
                          rgb={focusedPreset.rgb}
                          onChange={(nv) => onSettingChange(s.key, nv)}
                          testId={`ambient-radio-setting-${s.key}`}
                        />
                      </div>
                    );
                  })}

                  {focusedId === 'synth' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>Polyphonic</span>
                        <button
                          type="button"
                          data-testid="ambient-radio-setting-polyphonic"
                          onClick={() => onSettingChange('polyphonic', (curParams.polyphonic ?? 0) > 0.5 ? 0 : 1)}
                          style={{
                            width: 28, height: 14,
                            borderRadius: 7,
                            border: `1px solid rgba(${focusedPreset.rgb},${(curParams.polyphonic ?? 0) > 0.5 ? '.6' : '.25'})`,
                            background: (curParams.polyphonic ?? 0) > 0.5 ? `rgba(${focusedPreset.rgb},.3)` : 'rgba(255,255,255,.06)',
                            cursor: 'pointer', position: 'relative', padding: 0,
                            transition: 'background .15s, border-color .15s',
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 1, left: (curParams.polyphonic ?? 0) > 0.5 ? 14 : 1,
                            width: 10, height: 10, borderRadius: '50%',
                            background: (curParams.polyphonic ?? 0) > 0.5 ? focusedPreset.col : 'rgba(255,255,255,.3)',
                            transition: 'left .18s cubic-bezier(.4,0,.2,1)',
                            boxShadow: (curParams.polyphonic ?? 0) > 0.5 ? `0 0 6px rgba(${focusedPreset.rgb},.7)` : 'none',
                          }} />
                        </button>
                      </div>

                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>Chords</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {CHORD_ORDER.map((name) => {
                            const key = `chord_${name}`;
                            const on = (curParams[key] ?? 0) > 0.5;
                            return (
                              <button
                                key={name}
                                type="button"
                                data-testid={`ambient-radio-chord-${name}`}
                                onClick={() => onSettingChange(key, on ? 0 : 1)}
                                style={{
                                  fontFamily: 'inherit',
                                  fontSize: 8,
                                  letterSpacing: '0.04em',
                                  padding: '2px 7px',
                                  border: `1px solid ${on ? focusedPreset.col : 'rgba(255,255,255,.12)'}`,
                                  background: on ? `rgba(${focusedPreset.rgb},.16)` : 'rgba(255,255,255,.04)',
                                  color: on ? focusedPreset.col : 'rgba(255,255,255,.38)',
                                  borderRadius: 100,
                                  cursor: 'pointer',
                                  transition: 'all .12s',
                                  boxShadow: on ? `0 0 6px rgba(${focusedPreset.rgb},.22)` : 'none',
                                }}
                              >
                                {CHORD_LABELS[name] ?? name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Preset chips — tap to layer */}
              <div style={{ padding: '8px 10px 4px' }}>
                <div style={{ fontSize: 7, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 5 }}>
                  tap to layer
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {PRESETS.map((s) => {
                    const on = activeLayers.has(s.id);
                    const isFocused = s.id === focusedId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-testid={`ambient-radio-preset-${s.id}`}
                        onClick={() => toggleLayer(s.id)}
                        style={{
                          fontFamily: 'inherit',
                          fontSize: 8.5,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '3px 9px 3px 7px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: `1px solid ${on ? s.col : (isFocused ? `rgba(${s.rgb},.35)` : 'rgba(255,255,255,.1)')}`,
                          background: on ? `rgba(${s.rgb},.18)` : 'rgba(255,255,255,.04)',
                          color: on ? s.col : 'rgba(255,255,255,.42)',
                          borderRadius: 100,
                          cursor: 'pointer',
                          transition: 'all .12s',
                          boxShadow: on ? `0 0 8px rgba(${s.rgb},.28)` : 'none',
                        }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: on ? s.col : `rgba(${s.rgb},.4)`,
                          boxShadow: on ? `0 0 4px ${s.col}` : 'none',
                          transition: 'all .12s',
                        }} />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active-layer mixer rows */}
              {activeLayers.size > 0 && (
                <div data-testid="ambient-radio-mixer" style={{
                  padding: '4px 8px 6px',
                  borderTop: '1px solid rgba(255,255,255,.03)',
                  maxHeight: 150,
                  overflowY: 'auto',
                }}>
                  {activeIdsArr.map((id) => {
                    const p = PRESET_BY_ID[id];
                    if (!p) return null;
                    const isFocused = id === focusedId;
                    const vol = layerVolumes[id] ?? 80;
                    return (
                      <div
                        key={id}
                        onClick={() => setFocusedId(id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 5px 3px 4px',
                          marginBottom: 2,
                          borderLeft: `2px solid ${isFocused ? p.col : 'transparent'}`,
                          background: isFocused ? `rgba(${p.rgb},.08)` : 'transparent',
                          borderRadius: 3,
                          cursor: 'pointer',
                          transition: 'background .12s, border-color .12s',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.col, boxShadow: `0 0 5px ${p.col}`, flexShrink: 0 }} />
                        <span style={{
                          fontSize: 8.5, color: p.col,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          minWidth: 40, flexShrink: 0,
                        }}>{p.name}</span>
                        <MiniSlider
                          value={vol}
                          min={0} max={100} step={1}
                          color={p.col} rgb={p.rgb}
                          compact
                          onChange={(v) => onLayerVolumeChange(id, v)}
                          testId={`ambient-radio-layer-vol-${id}`}
                        />
                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,.35)', minWidth: 18, textAlign: 'right', flexShrink: 0 }}>{vol}</span>
                        <button
                          type="button"
                          data-testid={`ambient-radio-layer-remove-${id}`}
                          aria-label={`Remove ${p.name}`}
                          onClick={(e) => { e.stopPropagation(); toggleLayer(id); }}
                          style={{
                            background: 'none', border: 0, color: 'rgba(255,255,255,.35)',
                            cursor: 'pointer', fontSize: 12, lineHeight: 1,
                            padding: 0, width: 14, height: 14,
                            display: 'grid', placeItems: 'center',
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Footer: master play disc + master volume */}
          <div style={{ padding: '8px 10px 10px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <button
              type="button"
              data-testid="ambient-radio-play"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={togglePlay}
              style={{
                width: 26, height: 26,
                borderRadius: '50%',
                border: `1px solid rgba(${focusedPreset.rgb},${playing ? '.55' : '.25'})`,
                background: playing
                  ? `radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), ${focusedPreset.col} 70%)`
                  : `radial-gradient(circle at 30% 30%, rgba(${focusedPreset.rgb},.35), rgba(${focusedPreset.rgb},.08) 75%)`,
                boxShadow: playing
                  ? `0 0 12px rgba(${focusedPreset.rgb},.55), inset 0 0 6px rgba(0,0,0,.25)`
                  : `inset 0 1px 2px rgba(0,0,0,.35)`,
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                transition: 'background .18s ease, box-shadow .18s ease, transform .12s ease',
              }}
            />

            <MiniSlider
              value={volume}
              min={0} max={100} step={1}
              color={focusedPreset.col} rgb={focusedPreset.rgb}
              onChange={onVolumeChange}
              testId="ambient-radio-volume"
            />
            <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,.3)', minWidth: 22, textAlign: 'right', flexShrink: 0 }}>{volume}</span>
          </div>
        </div>
      </div>
    </>
  );
}
