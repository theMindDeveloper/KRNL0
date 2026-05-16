/**
 * SynthesizerChrome — interactive eurorack-style chassis.
 *
 * Wave-D redesign: knobs, VU meter, jacks, and PWR LED are wired to real
 * KRNL state. VU meter shows live FFT bins from the AmbientRadio audio
 * engine when any preset layer is playing; otherwise falls back to a
 * static analytics readout (tasks today / focus min today).
 *
 * Controls:
 *   - ZOOM knob    → React Flow viewport zoom (8 detents, 40–150%)
 *   - POMO knob    → pomo mother sessionMin (15/25/45/60)
 *   - THEME knob   → light/dark
 *   - GRID knob    → toggles canvas dot grid (html[data-grid])
 *   - VU L bars    → FFT bass-band magnitude when radio playing, else
 *                    tasks completed today
 *   - VU R bars    → FFT treble-band magnitude when radio playing, else
 *                    focus minutes today ÷ 5
 *   - PWR LED      → pulsing acid-green when any pomo is running
 *   - IN jack      → spawn a text note at viewport center
 *   - GATE jack    → pause all running pomos
 *   - CV jack      → reset zoom to 100%
 *   - OUT jack     → save board snapshot
 *   - serial strip → theMindDeveloper / github link / live counters
 */

import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';
import { useAnalytics, lastNDays } from '../../analytics';
import { saveBoard, emit } from '../../store/eventLog';
import { pomoSetConfig, pomoPause } from '../nodes/PomoNode/commands';
import { defaultPomoConfig } from '../nodes/PomoNode/types';
import type { PomoConfig, PomoState } from '../nodes/PomoNode/types';
import { audioEngine } from '../AmbientRadio/audio';
import type { Node as KrnlNode } from '../../../shared/types/node';

const ZOOM_STEPS = [0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5] as const;
const POMO_STEPS = [15, 25, 45, 60] as const;
const THEME_STEPS = ['light', 'dark'] as const;
const GRID_STEPS = ['on', 'off'] as const;

const VU_BARS = 12;

function nearestIndex<T extends number>(steps: readonly T[], value: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i]! - value);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function indicatorAngle(idx: number, total: number): number {
  if (total <= 1) return 0;
  const t = idx / (total - 1);
  return -110 + t * 220;
}

function arcDash(idx: number, total: number): string {
  if (total <= 1) return '75 100';
  const t = idx / (total - 1);
  return `${Math.max(2, Math.round(t * 75))} 100`;
}

export function SynthesizerChrome() {
  const rf = useReactFlow();
  const board = useBoardStore((s) => s.board);
  const theme = useBoardStore((s) => s.theme);
  const setTheme = useBoardStore((s) => s.setTheme);

  const pomoMother = board?.nodes.find((n) => n.kind === 'pomo' && n.isMother) ?? null;
  const pomoConfig = (pomoMother?.config as PomoConfig | undefined) ?? defaultPomoConfig();
  const pomoState = pomoMother?.state as PomoState | undefined;
  const pomoRunning = pomoState?.status === 'running';

  // Live zoom — RF doesn't push updates through hooks; poll on rAF.
  const [zoom, setZoom] = useState(() => rf.getZoom?.() ?? 1);

  // Live VU values — written from rAF loop (FFT when radio is on, otherwise
  // a static analytics-derived bar count). Stored in refs to avoid
  // re-rendering every frame; bars read the ref via a controlled re-render.
  const vuLRef = useRef(0);
  const vuRRef = useRef(0);
  const [, setVuTick] = useState(0);

  const analytics = useAnalytics();
  const todayTotals = analytics.totals(lastNDays(1));

  // Grid visibility — mirrors documentElement[data-grid].
  const [gridOn, setGridOn] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.getAttribute('data-grid') !== 'off';
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-grid', gridOn ? 'on' : 'off');
  }, [gridOn]);

  // rAF loop — drives zoom + VU. Throttled to 30 fps so the VU has time to
  // breathe without burning CPU on tiny VU updates.
  useEffect(() => {
    let raf = 0;
    let lastTime = 0;
    const FRAME_MS = 33;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - lastTime < FRAME_MS) return;
      lastTime = t;

      // Zoom.
      const z = rf.getZoom?.();
      if (typeof z === 'number') setZoom((prev) => (Math.abs(prev - z) > 0.001 ? z : prev));

      // VU — FFT when radio playing, else analytics-driven static read.
      const analyser = audioEngine.getAnalyser?.() ?? null;
      const playing = audioEngine.hasActiveLayer?.() ?? false;
      let l = 0;
      let r = 0;
      if (analyser && playing) {
        const N = analyser.frequencyBinCount; // fftSize/2 = 32
        const buf = new Uint8Array(N);
        analyser.getByteFrequencyData(buf);
        // Split bins into low (L) and high (R) halves. Average → 0..255 →
        // map to 0..VU_BARS. Slight headroom so the meter rarely flatlines.
        let lSum = 0;
        let rSum = 0;
        const half = Math.floor(N / 2);
        for (let i = 0; i < half; i++) lSum += buf[i]!;
        for (let i = half; i < N; i++) rSum += buf[i]!;
        const lAvg = lSum / Math.max(1, half);
        const rAvg = rSum / Math.max(1, N - half);
        l = Math.min(VU_BARS, Math.round((lAvg / 200) * VU_BARS));
        r = Math.min(VU_BARS, Math.round((rAvg / 200) * VU_BARS));
      } else {
        // Fallback: analytics-driven static read.
        l = Math.min(VU_BARS, todayTotals.tasksDone);
        r = Math.min(VU_BARS, Math.round(todayTotals.focusMin / 5));
      }
      if (l !== vuLRef.current || r !== vuRRef.current) {
        vuLRef.current = l;
        vuRRef.current = r;
        setVuTick((n) => (n + 1) & 0xff);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rf, todayTotals.tasksDone, todayTotals.focusMin]);

  // ── knob handlers ──────────────────────────────────────────────────────
  const zoomIdx = nearestIndex(ZOOM_STEPS, zoom);
  const cycleZoom = () => {
    const next = ZOOM_STEPS[(zoomIdx + 1) % ZOOM_STEPS.length]!;
    const v = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    rf.setViewport?.({ ...v, zoom: next });
    emit('sys.cmd', `zoom: ${Math.round(next * 100)}%`, { severity: 'info' });
  };

  const pomoIdx = nearestIndex(POMO_STEPS, pomoConfig.sessionMin);
  const cyclePomo = () => {
    if (!pomoMother) return;
    const next = POMO_STEPS[(pomoIdx + 1) % POMO_STEPS.length]!;
    const newConfig = pomoSetConfig(pomoConfig, { config: { sessionMin: next } });
    useBoardStore.getState().updateNode(pomoMother.id, { config: newConfig });
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
    emit('sys.cmd', `pomo session: ${next}min`, { severity: 'info' });
  };

  const themeIdx = theme === 'dark' ? 1 : 0;
  const cycleTheme = () => {
    const next = THEME_STEPS[(themeIdx + 1) % THEME_STEPS.length]!;
    setTheme(next);
    emit('sys.cmd', `theme: ${next}`, { severity: 'info' });
  };

  const gridIdx = gridOn ? 0 : 1;
  const cycleGrid = () => {
    setGridOn((g) => !g);
    emit('sys.cmd', `grid: ${gridOn ? 'off' : 'on'}`, { severity: 'info' });
  };

  // ── jack handlers ──────────────────────────────────────────────────────
  // IN — spawn a fresh text node at viewport center.
  const jackIn = () => {
    const vp = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    const cx = (window.innerWidth / 2 - vp.x) / vp.zoom;
    const cy = (window.innerHeight / 2 - vp.y) / vp.zoom;
    const node: KrnlNode = {
      id: `text-${crypto.randomUUID()}`,
      kind: 'text',
      position: { x: cx - 130, y: cy - 60 },
      state: { text: '' },
      config: {},
      isMother: false,
    };
    useBoardStore.getState().addNode(node);
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
    emit('sys.cmd', 'jack-in: text node spawned', { severity: 'info' });
  };

  // GATE — pause every running pomo. (A "gate-off" patch in synth terms.)
  const jackGate = () => {
    const b = useBoardStore.getState().board;
    if (!b) return;
    let paused = 0;
    for (const n of b.nodes) {
      if (n.kind !== 'pomo') continue;
      const st = n.state as PomoState;
      if (st.status !== 'running') continue;
      const next = pomoPause(st);
      useBoardStore.getState().updateNode(n.id, { state: next });
      paused++;
    }
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
    emit('sys.cmd', `gate: paused ${paused} pomo${paused === 1 ? '' : 's'}`,
      { severity: paused > 0 ? 'warn' : 'info' });
  };

  // CV — reset zoom to 100%.
  const jackCv = () => {
    const v = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    rf.setViewport?.({ ...v, zoom: 1 });
    emit('sys.cmd', 'cv: zoom reset → 100%', { severity: 'info' });
  };

  // OUT — flush a board save snapshot.
  const jackOut = () => {
    const b = useBoardStore.getState().board;
    if (!b) return;
    void saveBoard(b);
  };

  const knobs = [
    { label: 'zoom',  idx: zoomIdx,  total: ZOOM_STEPS.length,  onClick: cycleZoom,  title: `${Math.round(zoom * 100)}%` },
    { label: 'pomo',  idx: pomoIdx,  total: POMO_STEPS.length,  onClick: cyclePomo,  title: `${pomoConfig.sessionMin}min` },
    { label: 'theme', idx: themeIdx, total: THEME_STEPS.length, onClick: cycleTheme, title: theme },
    { label: 'grid',  idx: gridIdx,  total: GRID_STEPS.length,  onClick: cycleGrid,  title: gridOn ? 'on' : 'off' },
  ];

  const jacks = [
    { id: 'in',   onClick: jackIn,   title: 'IN — spawn text note',  variant: 'in' },
    { id: 'gate', onClick: jackGate, title: 'GATE — pause all pomos', variant: '' },
    { id: 'cv',   onClick: jackCv,   title: 'CV — reset zoom 100%',   variant: '' },
    { id: 'out',  onClick: jackOut,  title: 'OUT — save board',       variant: 'in' },
  ];

  const vuL = vuLRef.current;
  const vuR = vuRRef.current;
  const radioOn = audioEngine.hasActiveLayer?.() ?? false;

  return (
    <>
      <div className="md-synth-top">
        <span className="md-synth-screw" />
        <span className="brand">KRNL<span className="n">·0</span></span>
        <span className="model">{Math.round(zoom * 100)}% · spine·a · eurorack</span>
        <span className="grow" />
        <span className="hp">v0.4 · {board?.nodes.filter((n) => n.isMother).length ?? 6} bays</span>
        <span className="pwr">
          <span className={`led${pomoRunning ? ' led-on' : ''}`} /> pwr
        </span>
        <span className="md-synth-screw" />
      </div>

      <div className="md-synth-bot">
        <div className="md-synth-knobs">
          {knobs.map((k) => (
            <div
              className="md-synth-knob md-synth-knob-interactive"
              key={k.label}
              role="button"
              tabIndex={0}
              title={`${k.label.toUpperCase()} · ${k.title} · click to cycle`}
              onClick={k.onClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.onClick(); }
              }}
            >
              <span className="arc">
                <svg viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="21" pathLength="100" strokeDasharray="75 100" strokeDashoffset="12.5" />
                  <circle
                    className="lit"
                    cx="22" cy="22" r="21"
                    pathLength="100"
                    strokeDasharray={arcDash(k.idx, k.total)}
                    strokeDashoffset="12.5"
                  />
                </svg>
              </span>
              <span className="body" />
              <span
                className="indicator"
                style={{
                  transform: `translateX(-50%) rotate(${indicatorAngle(k.idx, k.total)}deg)`,
                  transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
              <span className="label">{k.label}</span>
            </div>
          ))}
        </div>

        <div className={`md-synth-vu${radioOn ? ' md-synth-vu-live' : ''}`}>
          <div className="row l">
            <span className="lbl">L</span>
            {Array.from({ length: VU_BARS }).map((_, i) => (
              <span key={i} data-active={i < vuL ? 'true' : 'false'} data-peak={i >= 9 ? 'true' : 'false'} />
            ))}
          </div>
          <div className="row r">
            <span className="lbl">R</span>
            {Array.from({ length: VU_BARS }).map((_, i) => (
              <span key={i} data-active={i < vuR ? 'true' : 'false'} data-peak={i >= 9 ? 'true' : 'false'} />
            ))}
          </div>
        </div>

        <div className="md-synth-jacks">
          <button
            type="button"
            className="md-synth-jack md-synth-jack-interactive in"
            title={jacks[0]!.title}
            onClick={jacks[0]!.onClick}
          >
            <span className="hole" /><span className="lbl">in</span>
          </button>
          <span className="arrow">→</span>
          <button
            type="button"
            className="md-synth-jack md-synth-jack-interactive"
            title={jacks[1]!.title}
            onClick={jacks[1]!.onClick}
          >
            <span className="hole" /><span className="lbl">gate</span>
          </button>
          <button
            type="button"
            className="md-synth-jack md-synth-jack-interactive"
            title={jacks[2]!.title}
            onClick={jacks[2]!.onClick}
          >
            <span className="hole" /><span className="lbl">cv</span>
          </button>
          <button
            type="button"
            className="md-synth-jack md-synth-jack-interactive in"
            title={jacks[3]!.title}
            onClick={jacks[3]!.onClick}
          >
            <span className="hole" /><span className="lbl">out</span>
          </button>
        </div>

        <div className="md-synth-serial">
          <span className="id">theMindDeveloper</span>
          <span>{todayTotals.tasksDone}t · {todayTotals.focusMin}m today</span>
          <a
            className="md-synth-serial-link"
            href="https://github.com/theMindDeveloper"
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com/theMindDeveloper
          </a>
        </div>
      </div>
    </>
  );
}
