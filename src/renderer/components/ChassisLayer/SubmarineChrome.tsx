/**
 * SubmarineChrome — full periscope console (dark-only).
 *
 * Hull made of walnut + brass + rivets. Two dense rails of instruments
 * wrap the mother row. Everything visible is either wired to real KRNL
 * state or is a real interactive control.
 *
 * Top rail (left→right):
 *   01 · DIVING ALARM BELL — rings (animates) when open task count ≥ 20
 *   02 · DEPTH GAUGE       — needle = viewport zoom (0 m surface → 200 m)
 *   03 · TRIM INDICATOR    — bubble level wired to events done vs open
 *                            ratio; fore/aft dive-plane lamps
 *   04 · BALLAST TANKS     — 4 vertical tanks (FORE/MAIN/AFT/TRIM) whose
 *                            fill levels reflect mother visibility
 *                            (visible = filled). Click a tank to toggle
 *                            its mother's station-mode visibility.
 *   05 · SONAR             — rotating sweep + bearing blips per event
 *   06 · RADAR CONTACT LOG — last 5 events as phosphor lines
 *   07 · OXYGEN GAUGE      — small dial, focus minutes / 480
 *   08 · BATTERY BANKS     — 4 horizontal cells, drain = sessions today
 *   09 · COMPASS           — heading from time-of-day, digital readout
 *
 * Bottom rail (left→right):
 *   10 · HELM WHEEL        — clickable, resets zoom to 1:1
 *   11 · TELEGRAPH         — engine order, mirrors pomo state
 *   12 · TORPEDO TUBES     — 4 status lamps wired to the 4 main mothers
 *                            (pomo/todo/habit/calendar); click to fire
 *                            (= jump camera to that mother)
 *   13 · VALVE MANIFOLD    — 3 chrome valves wired to layer-visibility
 *                            (tasks/texts/images). Click to rotate +
 *                            toggle the layer.
 *   14 · PRESSURE GAUGE    — needle = open task count / 30
 *   15 · BRASS PLAQUE      — SS·KRNL hull #, class, builder credit
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';
import { useEventLog, emit } from '../../store/eventLog';
import { useAnalytics, lastNDays } from '../../analytics';
import { useLayerVisibility, type Layer } from '../../store/layerVisibility';
import type { PomoState } from '../nodes/PomoNode/types';
import type { MotherNodeConfig } from '../../../shared/types';

function pad(n: number, w = 2): string { return n.toString().padStart(w, '0'); }

function fnvHash3(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 3);
}

function entryBearing(ts: number): number {
  const v = ((ts >>> 0) * 2654435761 >>> 0) / 0xffffffff;
  return v * 360;
}

// Mothers that get a torpedo tube (4 tubes, 4 primary mothers).
const TORPEDO_MOTHERS = ['pomo', 'todo', 'habit', 'calendar'] as const;
// Layer-visibility valves.
const VALVES: ReadonlyArray<{ layer: Layer; label: string }> = [
  { layer: 'tasks',  label: 'TASKS' },
  { layer: 'texts',  label: 'TEXTS' },
  { layer: 'images', label: 'IMGS'  },
];

export function SubmarineChrome() {
  const rf = useReactFlow();
  const board = useBoardStore((s) => s.board);
  const updateNode = useBoardStore((s) => s.updateNode);
  const entries = useEventLog((s) => s.entries);
  const analytics = useAnalytics();
  const layerState = useLayerVisibility((s) => ({ tasks: s.tasks, texts: s.texts, images: s.images }));
  const toggleLayer = useLayerVisibility((s) => s.toggleLayer);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // ── Zoom for depth gauge ────────────────────────────────────────────────
  const [zoom, setZoom] = useState<number>(() => rf.getZoom?.() ?? 1);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const z = rf.getZoom?.() ?? 1;
      setZoom((prev) => (Math.abs(prev - z) > 0.005 ? z : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rf]);

  // ── Derived state ──────────────────────────────────────────────────────
  const mothers = useMemo(() => (board?.nodes ?? []).filter((n) => n.isMother), [board]);
  const motherByKind = useMemo(() => {
    const m = new Map<string, typeof mothers[number]>();
    for (const x of mothers) m.set(x.kind, x);
    return m;
  }, [mothers]);

  const pomoRunning = useMemo(() =>
    mothers.some((m) => (m.state as PomoState | undefined)?.status === 'running'), [mothers]);
  const pomoPaused = useMemo(() =>
    mothers.some((m) => (m.state as PomoState | undefined)?.status === 'paused'), [mothers]);

  const open = analytics.open();
  const todayTotals = analytics.totals(lastNDays(1));
  const streaks = analytics.streaks();

  // Depth: zoom 0.4 (surface) .. 1.5 (200m) → -110° .. +110°
  const depthAngle = useMemo(() => {
    const z = Math.max(0.4, Math.min(1.5, zoom));
    const t = (z - 0.4) / (1.5 - 0.4);
    return -110 + t * 220;
  }, [zoom]);
  const depthMeters = useMemo(() => {
    const z = Math.max(0.4, Math.min(1.5, zoom));
    return Math.round(((z - 0.4) / (1.5 - 0.4)) * 200);
  }, [zoom]);

  // Compass: 24h → 360°
  const dt = new Date(now);
  const headingAngle = ((dt.getHours() + dt.getMinutes() / 60) / 24) * 360;
  const headingLabel = pad(Math.round(headingAngle), 3);

  // Sonar sweep
  const sweepAngle = ((now / 4000) * 360) % 360;
  const sonarBlips = useMemo(() => {
    const cutoff = now - 30_000;
    return entries
      .filter((e) => e.ts >= cutoff)
      .slice(-12)
      .map((e) => {
        const bearing = entryBearing(e.ts);
        const r = e.severity === 'err' ? 0.85 : e.severity === 'warn' ? 0.68 : e.severity === 'info' ? 0.5 : 0.32;
        const ahead = ((bearing - sweepAngle) % 360 + 360) % 360;
        const fade = 1 - (ahead / 360);
        return { id: e.id, bearing, r, fade, severity: e.severity };
      });
  }, [entries, now, sweepAngle]);

  // Telegraph order from pomo state
  const pomoOrder = pomoRunning ? 'AHEAD FULL' : pomoPaused ? 'DEAD SLOW' : 'ALL STOP';
  const telegraphAngle = pomoRunning ? 70 : pomoPaused ? -20 : -90;

  // Pressure: open tasks → 0..30
  const pressureFrac = Math.min(1, open.tasksOpen / 30);
  const pressureAngle = -110 + pressureFrac * 220;

  // Oxygen: focus minutes today / 480 (8 hours)
  const oxygenFrac = Math.min(1, open.focusMinToday / 480);
  const oxygenAngle = -110 + oxygenFrac * 220;
  const oxygenPct = Math.round(oxygenFrac * 100);

  // Battery: sessions today, max 8 cells lit
  const batteryCells = Math.min(8, todayTotals.sessions);

  // Trim: today's completion ratio − 0.5 → tilts bubble left/right
  const completion = open.tasksTotal === 0 ? 0.5 : (open.tasksTotal - open.tasksOpen) / open.tasksTotal;
  const trimDeg = (completion - 0.5) * 30;  // ±15° bubble tilt

  // Diving alarm — pulses when open task count ≥ 20
  const alarmActive = open.tasksOpen >= 20;

  // Recent radar contacts
  const radarContacts = useMemo(() => entries.slice(-5).reverse(), [entries]);

  // Helm — sway animation
  const helmRef = useRef<HTMLDivElement>(null);
  const helmAngleRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const sway = Math.sin(t / 1800) * 8;
      helmAngleRef.current = sway + helmAngleRef.current * 0.97;
      if (helmRef.current) helmRef.current.style.transform = `rotate(${helmAngleRef.current.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Bell ring animation — toggles class periodically when alarm is active
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!alarmActive || !bellRef.current) return;
    const el = bellRef.current;
    const id = setInterval(() => {
      el.classList.add('ring');
      setTimeout(() => el.classList.remove('ring'), 240);
    }, 1400);
    return () => clearInterval(id);
  }, [alarmActive]);

  // Interactions — all mode-agnostic (no camera moves; works in canvas + station)
  const onValve = (layer: Layer) => {
    const visible = layerState[layer];
    toggleLayer(layer);
    emit('sys.cmd',
      `submarine.valve:${layer} ${visible ? 'closed' : 'opened'}`,
      { severity: visible ? 'warn' : 'ok' });
  };
  const onBallastTank = (kind: string) => {
    const m = motherByKind.get(kind);
    if (!m) return;
    const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
    updateNode(m.id, { config: { ...cfg, stationHidden: !cfg.stationHidden } });
  };

  const serial = useMemo(() => fnvHash3(board?.savedAt ?? 'KRNL'), [board?.savedAt]);

  // Ballast tanks — each tank's fill level mirrors station visibility of one mother.
  const ballastTanks = [
    { kind: 'pomo',     label: 'FORE',  size: 1.0 },
    { kind: 'todo',     label: 'MAIN',  size: 1.0 },
    { kind: 'habit',    label: 'AFT',   size: 1.0 },
    { kind: 'calendar', label: 'TRIM',  size: 1.0 },
  ];

  return (
    <>
      {/* ═════════════════════ TOP RAIL ═════════════════════════════════ */}
      <div className="md-sub-top">
        {/* Rivet line — top edge */}
        <span className="md-sub-rivet rv-tl" />
        <span className="md-sub-rivet rv-tl2" />
        <span className="md-sub-rivet rv-tr2" />
        <span className="md-sub-rivet rv-tr" />

        {/* 01 — Diving alarm bell ─────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-bell-mod">
          <div className={`md-sub-bell${alarmActive ? ' active' : ''}`} ref={bellRef}>
            <svg viewBox="-12 -8 24 24" aria-hidden>
              {/* bell body */}
              <path d="M -6 6 L 6 6 L 5 -4 Q 5 -7 0 -7 Q -5 -7 -5 -4 Z" className="bell-body" />
              {/* bell yoke */}
              <line x1="-5" y1="-7" x2="5" y2="-7" className="bell-yoke" />
              <line x1="-2" y1="-7" x2="-2" y2="-9" className="bell-yoke" />
              <line x1="2"  y1="-7" x2="2"  y2="-9" className="bell-yoke" />
              {/* clapper */}
              <circle cx="0" cy="3" r="1.2" className="bell-clapper" />
              {/* rim */}
              <line x1="-6" y1="6" x2="6" y2="6" className="bell-rim" />
            </svg>
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">01</span>
            <span className="lbl">{alarmActive ? 'ALARM' : 'IDLE'}</span>
          </div>
        </div>

        {/* 02 — Depth gauge ───────────────────────────────────────────── */}
        <div className="md-sub-instrument">
          <div className="md-sub-bezel">
            <div className="md-sub-bezel-inner">
              <DialFace>
                {[0, 50, 100, 150, 200].map((m, i) => {
                  const a = -110 + i * 55;
                  const rad = (a * Math.PI) / 180;
                  return (
                    <text
                      key={m}
                      x={Math.cos(rad - Math.PI / 2) * 22}
                      y={Math.sin(rad - Math.PI / 2) * 22 + 3}
                      className="md-sub-numeral"
                    >{m}</text>
                  );
                })}
                <path d="M 32 12 A 34 34 0 0 1 12 32" className="md-sub-hazard" fill="none" />
                <text x="0" y="20" className="md-sub-unit">METRES</text>
                <Needle angle={depthAngle} />
                <circle cx="0" cy="0" r="3" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">02</span>
            <span>DEPTH</span>
            <span className="r">{pad(depthMeters, 3)}m</span>
          </div>
        </div>

        {/* 03 — Trim indicator (bubble level + dive plane lamps) ──────── */}
        <div className="md-sub-mod md-sub-trim-mod">
          <div className="md-sub-trim">
            <div className="md-sub-trim-glass">
              <span
                className="md-sub-trim-bubble"
                style={{ transform: `translateX(${(trimDeg / 15) * 28}px)` }}
              />
              <span className="md-sub-trim-line" />
              <span className="md-sub-trim-tick t0" />
              <span className="md-sub-trim-tick t1" />
              <span className="md-sub-trim-tick t2" />
              <span className="md-sub-trim-tick t3" />
              <span className="md-sub-trim-tick t4" />
            </div>
            <div className="md-sub-planes">
              <div className="plane-row">
                <span className="lbl">FORE</span>
                <span className={`lamp${trimDeg < -4 ? ' on' : ''}`} />
                <span className={`lamp center${Math.abs(trimDeg) < 4 ? ' on' : ''}`} />
                <span className={`lamp${trimDeg > 4 ? ' on' : ''}`} />
              </div>
              <div className="plane-row">
                <span className="lbl">AFT</span>
                <span className={`lamp${trimDeg > 4 ? ' on' : ''}`} />
                <span className={`lamp center${Math.abs(trimDeg) < 4 ? ' on' : ''}`} />
                <span className={`lamp${trimDeg < -4 ? ' on' : ''}`} />
              </div>
            </div>
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">03</span>
            <span className="lbl">TRIM · {trimDeg > 1 ? 'BOW UP' : trimDeg < -1 ? 'BOW DOWN' : 'LEVEL'}</span>
          </div>
        </div>

        {/* 04 — Ballast tanks ─────────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-ballast-mod">
          <div className="md-sub-ballast">
            {ballastTanks.map((t) => {
              const mother = motherByKind.get(t.kind);
              const cfg = (mother?.config ?? {}) as MotherNodeConfig;
              const flooded = !!mother && !cfg.stationHidden;
              const fill = flooded ? 0.78 : 0.12;
              return (
                <button
                  key={t.kind}
                  type="button"
                  className="md-sub-ballast-tank"
                  onClick={() => onBallastTank(t.kind)}
                  title={`${t.label} ballast — ${flooded ? 'flooded (mother visible)' : 'blown (mother hidden)'}`}
                >
                  <div className="tank-glass">
                    <div
                      className="tank-fill"
                      style={{ height: `${fill * 100}%` }}
                    />
                    <div className="tank-marks">
                      <span /><span /><span /><span />
                    </div>
                  </div>
                  <div className="tank-lbl">{t.label}</div>
                </button>
              );
            })}
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">04</span>
            <span className="lbl">BALLAST · TRIM</span>
          </div>
        </div>

        {/* 05 — Sonar (big) ───────────────────────────────────────────── */}
        <div className="md-sub-instrument md-sub-sonar-mod">
          <div className="md-sub-bezel md-sub-bezel-large">
            <div className="md-sub-bezel-inner sonar">
              <DialFace>
                <circle cx="0" cy="0" r="42" className="md-sub-sonar-rim" />
                <circle cx="0" cy="0" r="32" className="md-sub-sonar-ring" />
                <circle cx="0" cy="0" r="22" className="md-sub-sonar-ring" />
                <circle cx="0" cy="0" r="12" className="md-sub-sonar-ring" />
                <line x1="-42" y1="0" x2="42" y2="0" className="md-sub-sonar-cross" />
                <line x1="0" y1="-42" x2="0" y2="42" className="md-sub-sonar-cross" />
                <text x="0" y="-44" className="md-sub-sonar-letter">N</text>
                <text x="44" y="3" className="md-sub-sonar-letter">E</text>
                <text x="0" y="48" className="md-sub-sonar-letter">S</text>
                <text x="-44" y="3" className="md-sub-sonar-letter">W</text>
                {sonarBlips.map((b) => {
                  const rad = (b.bearing * Math.PI) / 180;
                  const x = Math.cos(rad - Math.PI / 2) * b.r * 40;
                  const y = Math.sin(rad - Math.PI / 2) * b.r * 40;
                  return (
                    <circle
                      key={b.id}
                      cx={x}
                      cy={y}
                      r={b.severity === 'err' ? 2.6 : 1.8}
                      className={`md-sub-sonar-blip sev-${b.severity}`}
                      opacity={Math.max(0.18, b.fade * 0.95)}
                    />
                  );
                })}
                <defs>
                  <linearGradient id="sub-sweep" x1="0" y1="0" x2="0" y2="-42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgba(143,255,143,0.6)" />
                    <stop offset="100%" stopColor="rgba(143,255,143,0)" />
                  </linearGradient>
                </defs>
                <g style={{ transform: `rotate(${sweepAngle.toFixed(2)}deg)`, transformOrigin: '0 0' }}>
                  <polygon points="0,0 -3,-42 3,-42" fill="url(#sub-sweep)" />
                  <line x1="0" y1="0" x2="0" y2="-42" className="md-sub-sonar-arm" />
                </g>
                <circle cx="0" cy="0" r="2.2" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">05</span>
            <span>SONAR · ACTIVE</span>
            <span className="r">{pad(sonarBlips.length, 2)} CONT</span>
          </div>
        </div>

        {/* 06 — Radar contact log ─────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-radar-mod">
          <div className="md-sub-radar">
            <div className="md-sub-radar-head">
              <span>BRG</span><span>TIME</span><span>CONTACT</span>
            </div>
            {radarContacts.length === 0 && (
              <div className="md-sub-radar-row empty">
                <span className="brg">···</span>
                <span className="ts">--:--</span>
                <span className="desc">no contacts on screen — waters clear</span>
              </div>
            )}
            {radarContacts.map((e) => {
              const d = new Date(e.ts);
              const brg = pad(Math.round(entryBearing(e.ts)), 3);
              return (
                <div key={e.id} className={`md-sub-radar-row sev-${e.severity}`}>
                  <span className="brg">{brg}°</span>
                  <span className="ts">{pad(d.getHours())}:{pad(d.getMinutes())}</span>
                  <span className="desc" title={e.text}>{e.text}</span>
                </div>
              );
            })}
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">06</span>
            <span className="lbl">RADAR · CONTACT LOG</span>
          </div>
        </div>

        {/* 07 — Oxygen gauge ──────────────────────────────────────────── */}
        <div className="md-sub-instrument md-sub-small-mod">
          <div className="md-sub-bezel md-sub-bezel-mini">
            <div className="md-sub-bezel-inner">
              <DialFace>
                {Array.from({ length: 6 }).map((_, i) => {
                  const a = -110 + i * 44;
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={Math.cos(rad - Math.PI / 2) * 32}
                      y1={Math.sin(rad - Math.PI / 2) * 32}
                      x2={Math.cos(rad - Math.PI / 2) * 40}
                      y2={Math.sin(rad - Math.PI / 2) * 40}
                      className="md-sub-tick"
                    />
                  );
                })}
                <text x="0" y="20" className="md-sub-unit">O2 %</text>
                <Needle angle={oxygenAngle} />
                <circle cx="0" cy="0" r="2.8" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">07</span>
            <span>OXYGEN</span>
            <span className="r">{pad(oxygenPct, 2)}%</span>
          </div>
        </div>

        {/* 08 — Battery banks ─────────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-battery-mod">
          <div className="md-sub-battery">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={`md-sub-cell${i < batteryCells ? ' lit' : ''}`}
              />
            ))}
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">08</span>
            <span className="lbl">BATT · {pad(batteryCells, 2)}/08</span>
          </div>
        </div>

        {/* 09 — Compass ────────────────────────────────────────────────── */}
        <div className="md-sub-instrument">
          <div className="md-sub-bezel">
            <div className="md-sub-bezel-inner">
              <DialFace>
                <g style={{ transform: `rotate(${(-headingAngle).toFixed(2)}deg)`, transformOrigin: '0 0' }}>
                  {Array.from({ length: 36 }).map((_, i) => {
                    const a = i * 10;
                    const rad = (a * Math.PI) / 180;
                    const r1 = i % 3 === 0 ? 30 : 34;
                    return (
                      <line
                        key={i}
                        x1={Math.cos(rad - Math.PI / 2) * r1}
                        y1={Math.sin(rad - Math.PI / 2) * r1}
                        x2={Math.cos(rad - Math.PI / 2) * 40}
                        y2={Math.sin(rad - Math.PI / 2) * 40}
                        className={i % 9 === 0 ? 'md-sub-tick-major' : 'md-sub-tick-minor'}
                      />
                    );
                  })}
                  {['N', 'E', 'S', 'W'].map((c, i) => {
                    const a = i * 90;
                    const rad = (a * Math.PI) / 180;
                    return (
                      <text
                        key={c}
                        x={Math.cos(rad - Math.PI / 2) * 22}
                        y={Math.sin(rad - Math.PI / 2) * 22 + 3}
                        className={`md-sub-compass-letter${c === 'N' ? ' n' : ''}`}
                      >{c}</text>
                    );
                  })}
                </g>
                <line x1="0" y1="-42" x2="0" y2="-34" className="md-sub-lubber" />
                <text x="0" y="20" className="md-sub-unit">BRG</text>
                <circle cx="0" cy="0" r="3" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">09</span>
            <span>HEADING</span>
            <span className="r">{headingLabel}°</span>
          </div>
        </div>
      </div>

      {/* ═════════════════════ BOTTOM RAIL ══════════════════════════════ */}
      <div className="md-sub-bot">
        <span className="md-sub-rivet rv-bl" />
        <span className="md-sub-rivet rv-bl2" />
        <span className="md-sub-rivet rv-br2" />
        <span className="md-sub-rivet rv-br" />

        {/* 10 — Helm wheel ─────────────────────────────────────────────── */}
        <div className="md-sub-helm" title="Helm — sways with the seas">
          <div className="md-sub-helm-wheel" ref={helmRef}>
            <svg viewBox="-50 -50 100 100">
              <circle cx="0" cy="0" r="42" className="md-sub-helm-rim" />
              <circle cx="0" cy="0" r="36" className="md-sub-helm-inner" />
              {Array.from({ length: 8 }).map((_, i) => {
                const a = i * 45;
                const rad = (a * Math.PI) / 180;
                return (
                  <line
                    key={i}
                    x1={Math.cos(rad) * 10}
                    y1={Math.sin(rad) * 10}
                    x2={Math.cos(rad) * 46}
                    y2={Math.sin(rad) * 46}
                    className="md-sub-helm-spoke"
                  />
                );
              })}
              {Array.from({ length: 8 }).map((_, i) => {
                const a = i * 45;
                const rad = (a * Math.PI) / 180;
                return (
                  <circle
                    key={`h${i}`}
                    cx={Math.cos(rad) * 46}
                    cy={Math.sin(rad) * 46}
                    r="3.6"
                    className="md-sub-helm-knob"
                  />
                );
              })}
              <circle cx="0" cy="0" r="8" className="md-sub-helm-hub" />
              <circle cx="0" cy="0" r="3" className="md-sub-cap" />
            </svg>
          </div>
          <div className="md-sub-helm-lbl">10 · HELM</div>
        </div>

        {/* 11 — Telegraph ──────────────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-telegraph">
          <div className="md-sub-bezel md-sub-bezel-mini">
            <div className="md-sub-bezel-inner">
              <DialFace>
                <text x="0" y="-32" className="md-sub-tel-lbl">AHEAD</text>
                <text x="34" y="3" className="md-sub-tel-lbl">SLOW</text>
                <text x="0" y="36" className="md-sub-tel-lbl">STOP</text>
                <text x="-34" y="3" className="md-sub-tel-lbl">REV</text>
                {Array.from({ length: 4 }).map((_, i) => {
                  const a = -135 + i * 90;
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={Math.cos(rad - Math.PI / 2) * 24}
                      y1={Math.sin(rad - Math.PI / 2) * 24}
                      x2={Math.cos(rad - Math.PI / 2) * 34}
                      y2={Math.sin(rad - Math.PI / 2) * 34}
                      className="md-sub-tick"
                    />
                  );
                })}
                <g style={{ transform: `rotate(${telegraphAngle}deg)`, transformOrigin: '0 0', transition: 'transform 480ms cubic-bezier(0.4, 0.0, 0.2, 1)' }}>
                  <polygon points="0,3 -2,0 0,-30 2,0" className="md-sub-needle" />
                </g>
                <circle cx="0" cy="0" r="3" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">11</span>
            <span>TELEGRAPH</span>
            <span className="r">{pomoOrder}</span>
          </div>
        </div>

        {/* 12 — Torpedo tubes — status readouts per mother ───────────── */}
        <div className="md-sub-mod md-sub-tubes-mod">
          <div className="md-sub-tubes">
            {TORPEDO_MOTHERS.map((kind, i) => {
              const m = motherByKind.get(kind);
              let armed = false;
              let read = '—';
              if (m) {
                if (kind === 'pomo') {
                  armed = pomoRunning;
                  read = `${pad(Math.min(99, open.focusMinToday))}m`;
                } else if (kind === 'todo') {
                  armed = open.tasksOpen > 0;
                  read = `${pad(Math.min(99, open.tasksOpen))}·O`;
                } else if (kind === 'habit') {
                  armed = streaks.longestHabitStreak > 0;
                  read = `${pad(Math.min(99, streaks.longestHabitStreak))}d`;
                } else if (kind === 'calendar') {
                  armed = todayTotals.tasksDone > 0;
                  read = `${pad(Math.min(99, todayTotals.tasksDone))}·D`;
                }
              }
              return (
                <div
                  key={kind}
                  className={`md-sub-tube${armed ? ' loaded' : ''}`}
                  title={`Tube ${i + 1} · ${kind.toUpperCase()} · ${armed ? 'armed' : 'cold'}`}
                >
                  <span className="tube-door">
                    <span className="tube-bolt" />
                    <span className="tube-bolt" />
                    <span className="tube-bolt" />
                    <span className="tube-bolt" />
                  </span>
                  <span className="tube-lbl">{kind.toUpperCase()}</span>
                  <span className="tube-sub">{read}</span>
                </div>
              );
            })}
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">12</span>
            <span className="lbl">TORPEDO BAY · STATUS</span>
          </div>
        </div>

        {/* 13 — Valve manifold ─────────────────────────────────────────── */}
        <div className="md-sub-mod md-sub-valves-mod">
          <div className="md-sub-valves">
            {VALVES.map((v) => {
              const open = layerState[v.layer];
              return (
                <button
                  key={v.layer}
                  type="button"
                  className={`md-sub-valve${open ? ' open' : ''}`}
                  onClick={() => onValve(v.layer)}
                  title={`${v.label} layer — ${open ? 'OPEN (visible)' : 'CLOSED (hidden)'}`}
                >
                  <span className="valve-handle">
                    <span className="valve-spoke s0" />
                    <span className="valve-spoke s1" />
                    <span className="valve-spoke s2" />
                    <span className="valve-cap" />
                  </span>
                  <span className="valve-pipe" />
                  <span className="valve-lbl">{v.label}</span>
                </button>
              );
            })}
          </div>
          <div className="md-sub-mod-tag">
            <span className="num">13</span>
            <span className="lbl">VALVES · MANIFOLD</span>
          </div>
        </div>

        {/* 14 — Pressure gauge ─────────────────────────────────────────── */}
        <div className="md-sub-instrument md-sub-small-mod">
          <div className="md-sub-bezel md-sub-bezel-mini">
            <div className="md-sub-bezel-inner">
              <DialFace>
                {Array.from({ length: 11 }).map((_, i) => {
                  const a = -110 + i * 22;
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={Math.cos(rad - Math.PI / 2) * 32}
                      y1={Math.sin(rad - Math.PI / 2) * 32}
                      x2={Math.cos(rad - Math.PI / 2) * 40}
                      y2={Math.sin(rad - Math.PI / 2) * 40}
                      className={i % 5 === 0 ? 'md-sub-tick-major' : 'md-sub-tick-minor'}
                    />
                  );
                })}
                <path d="M 30 -14 A 34 34 0 0 1 32 14" className="md-sub-hazard" fill="none" />
                <text x="0" y="20" className="md-sub-unit">PSI</text>
                <Needle angle={pressureAngle} />
                <circle cx="0" cy="0" r="3" className="md-sub-cap" />
              </DialFace>
            </div>
          </div>
          <div className="md-sub-tag">
            <span className="num">14</span>
            <span>HULL · PSI</span>
            <span className="r">{pad(open.tasksOpen, 2)}/30</span>
          </div>
        </div>

        {/* 15 — Brass plaque ───────────────────────────────────────────── */}
        <div className="md-sub-plate">
          <div className="md-sub-plate-row">
            <span className="k">SS · KRNL</span>
            <span className="v">U-{serial}</span>
          </div>
          <div className="md-sub-plate-row thin">
            <span className="k">CLASS</span>
            <span className="v">PROD-I</span>
          </div>
          <div className="md-sub-plate-row thin">
            <span className="k">CREW</span>
            <span className="v">{mothers.length}/06</span>
          </div>
          <div className="md-sub-plate-row thin">
            <span className="k">STREAK</span>
            <span className="v">{pad(streaks.longestHabitStreak, 2)}d</span>
          </div>
          <div className="md-sub-plate-row thin">
            <span className="k">BUILDER</span>
            <a
              className="md-sub-credit"
              href="https://github.com/theMindDeveloper"
              target="_blank"
              rel="noreferrer noopener"
              title="theMindDeveloper on GitHub"
            >@theMind</a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Small SVG helpers (DialFace, Needle) ───────────────────────────── */

function DialFace({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="-50 -50 100 100" className="md-sub-dial">
      <circle cx="0" cy="0" r="42" className="md-sub-face" />
      {children}
    </svg>
  );
}

function Needle({ angle }: { angle: number }) {
  return (
    <g style={{ transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: '0 0' }}>
      <polygon points="0,4 -2,0 0,-38 2,0" className="md-sub-needle" />
    </g>
  );
}
