/**
 * MacintoshChrome — 1984 Macintosh 128K all-in-one as the chassis.
 *
 * The mother row IS the CRT screen. The chrome above and below paints the
 * Snow-White beige plastic case around it: the top vent band with rainbow
 * Apple logo, the "Macintosh" wordmark, the brightness knob, the floppy
 * drive slot, the model plate, the smiling-Mac glyph on the bezel, the
 * Power LED, and the rivet-anchored case skirt.
 *
 * Mode-agnostic interactions (work in canvas + station mode):
 *   - Top rainbow Apple   — click → save board (emits sys.cmd)
 *   - Top vent slots      — animated faint warm-glow shift when a pomo runs
 *   - Brightness knob     — turns with current viewport zoom; click toggles
 *                           station-mode visibility for ALL mothers (one-click
 *                           show/hide). No camera move.
 *   - Contrast knob       — turns with today's task completion ratio
 *   - CRT bezel scanlines — subtle horizontal scanlines over the mothers
 *   - Smiling Mac glyph   — bottom-left of the bezel, classic ROM-icon
 *   - Floppy slot label   — "board.json" + tiny eject ◁ on the right
 *   - Power LED (green)   — solid when a pomo is running, slow pulse when
 *                           the board saved within 5s, dim otherwise
 *   - Model plate         — KRNL∙0 / M0001 / REV {fnv1a-hash(savedAt)}
 *   - "@theMind"           — credit, GitHub link
 */

import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useReactFlow } from '@xyflow/react';
import { useAnalytics, lastNDays } from '../../analytics';
import { emit } from '../../store/eventLog';
import type { PomoState } from '../nodes/PomoNode/types';
import type { MotherNodeConfig } from '../../../shared/types';

function pad(n: number, w = 2): string { return n.toString().padStart(w, '0'); }

// fnv1a hash → 4 hex chars. Stable per-board serial number on the plate.
function fnvHash4(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
}

export function MacintoshChrome() {
  const rf = useReactFlow();
  const board = useBoardStore((s) => s.board);
  const updateNode = useBoardStore((s) => s.updateNode);
  const analytics = useAnalytics();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Live zoom for the brightness knob ──────────────────────────────────
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

  const nodeCount = board?.nodes.length ?? 0;
  const open = analytics.open();
  const todayTotals = analytics.totals(lastNDays(1));

  // Brightness rotation: zoom 0.4..1.5 → -110°..+110°.
  const brightnessAngle = useMemo(() => {
    const z = Math.max(0.4, Math.min(1.5, zoom));
    const t = (z - 0.4) / (1.5 - 0.4);
    return -110 + t * 220;
  }, [zoom]);

  // Contrast rotation: completion ratio → -110°..+110°.
  const completionPct = open.tasksTotal === 0
    ? 0
    : (open.tasksTotal - open.tasksOpen) / open.tasksTotal;
  const contrastAngle = -110 + completionPct * 220;

  // Power LED state — running pomo > saved <5s ago > idle.
  const mothers = useMemo(() => (board?.nodes ?? []).filter((n) => n.isMother), [board]);
  const pomoRunning = useMemo(() =>
    mothers.some((m) => (m.state as PomoState | undefined)?.status === 'running'),
  [mothers]);
  const savedRecently = useMemo(() => {
    if (!board?.savedAt) return false;
    const t = Date.parse(board.savedAt);
    if (!Number.isFinite(t)) return false;
    return now - t < 5000;
  }, [board?.savedAt, now]);
  const ledState: 'on' | 'pulse' | 'dim' = pomoRunning ? 'on' : savedRecently ? 'pulse' : 'dim';

  const serial = useMemo(() => fnvHash4(board?.savedAt ?? 'KRNL'), [board?.savedAt]);
  const rev = useMemo(() => {
    if (!board?.savedAt) return 'A0';
    const t = Date.parse(board.savedAt);
    if (!Number.isFinite(t)) return 'A0';
    return `A${pad(Math.floor(t / 1000) % 100)}`;
  }, [board?.savedAt]);

  // Brightness knob click → toggle station-mode visibility for ALL mothers.
  // Works in both layout modes. No camera move.
  const onBrightness = () => {
    if (!board) return;
    const allHidden = mothers.every((m) =>
      ((m.config ?? {}) as MotherNodeConfig).stationHidden === true);
    for (const m of mothers) {
      const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      updateNode(m.id, { config: { ...cfg, stationHidden: !allHidden } });
    }
    emit('sys.cmd',
      `macintosh.brightness: ${allHidden ? 'all panes shown' : 'all panes hidden'}`,
      { severity: 'info' });
  };

  // Smiley-Mac eye blinks slowly when the LED is "on" (pomo running).
  const blinkPhase = pomoRunning ? Math.floor(now / 1800) % 6 === 0 : false;

  return (
    <>
      {/* ── TOP CASE — beige plastic, vents, brand row ──────────────────── */}
      <div className="md-mac-case-top">
        {/* horizontal vent slots across the top */}
        <div className="md-mac-vents" data-running={pomoRunning ? 'true' : 'false'}>
          {Array.from({ length: 16 }).map((_, i) => <span key={i} />)}
        </div>

        {/* brand row: "Macintosh" wordmark + serial badge on the right */}
        <div className="md-mac-brand">
          <div className="md-mac-wordmark">
            <span>Macintosh</span>
          </div>
          <div className="md-mac-brand-meta">
            <span className="k">M0001</span>
            <span className="v">S/N · {serial}</span>
          </div>
        </div>
      </div>

      {/* ── CRT BEZEL — frames the mother row, with smiling Mac icon ────── */}
      <div className="md-mac-crt-bezel" aria-hidden>
        <div className="md-mac-crt-scanlines" />
        <div className="md-mac-crt-glare" />
        {/* Smiling-Mac happy-startup icon — Susan Kare's classic ROM glyph.
            Sits at the bottom-left corner of the bezel and blinks while a
            pomo is running. */}
        <div className={`md-mac-smiley${blinkPhase ? ' is-blink' : ''}${pomoRunning ? ' is-running' : ''}`}>
          <svg width="28" height="28" viewBox="0 0 16 16" aria-hidden>
            {/* outline of compact mac */}
            <rect x="1" y="1" width="14" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" shapeRendering="crispEdges" />
            {/* screen inset */}
            <rect x="3" y="3" width="10" height="7" fill="none" stroke="currentColor" strokeWidth="0.6" shapeRendering="crispEdges" />
            {/* eyes */}
            <rect x="5" y="5" width="1" height="1" fill="currentColor" className="eye left" />
            <rect x="10" y="5" width="1" height="1" fill="currentColor" className="eye right" />
            {/* nose */}
            <rect x="7" y="6" width="2" height="1" fill="currentColor" />
            {/* smile */}
            <path d="M 5 8 L 6 9 L 10 9 L 11 8" stroke="currentColor" strokeWidth="0.6" fill="none" />
            {/* floppy slot */}
            <rect x="5" y="11" width="6" height="1" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* ── BOTTOM CASE — floppy, plate, knobs, power ───────────────────── */}
      <div className="md-mac-case-bot">
        <div className="md-mac-floppy">
          <div className="md-mac-floppy-slot">
            <span className="md-mac-floppy-led" />
            <span className="md-mac-floppy-label">board.json</span>
            <span className="md-mac-floppy-eject" title="Decorative">◁</span>
          </div>
          <div className="md-mac-floppy-sub">FLOPPY · 400K · SS</div>
        </div>

        <div className="md-mac-plate">
          <div className="md-mac-plate-row md-mac-plate-row-hero">
            <span className="k">Macintosh</span>
            <span className="v">KRNL∙0</span>
          </div>
          <div className="md-mac-plate-row md-mac-plate-row-thin">
            <span className="k">MODEL</span>
            <span className="v">M0001 · {pad(nodeCount, 3)} ITEMS</span>
          </div>
          <div className="md-mac-plate-row md-mac-plate-row-split">
            <div><span className="k">S/N</span><span className="v">{serial}</span></div>
            <div><span className="k">REV</span><span className="v">{rev}</span></div>
          </div>
          <div className="md-mac-plate-row md-mac-plate-row-thin">
            <span className="k">DESIGNED BY</span>
            <a
              className="md-mac-credit"
              href="https://github.com/theMindDeveloper"
              target="_blank"
              rel="noreferrer noopener"
              title="theMindDeveloper on GitHub"
            >@theMind</a>
          </div>
        </div>

        <div className="md-mac-controls">
          <button
            type="button"
            className="md-mac-knob"
            onClick={onBrightness}
            title="Brightness · toggle station visibility (all panes)"
            aria-label="brightness"
          >
            <span className="md-mac-knob-cap">
              <span
                className="md-mac-knob-indicator"
                style={{ transform: `rotate(${brightnessAngle}deg)` }}
              />
            </span>
            <span className="md-mac-knob-lbl">BRT</span>
          </button>

          <div className="md-mac-knob" aria-hidden title="Contrast · task-completion ratio">
            <span className="md-mac-knob-cap">
              <span
                className="md-mac-knob-indicator"
                style={{ transform: `rotate(${contrastAngle}deg)` }}
              />
            </span>
            <span className="md-mac-knob-lbl">CNT</span>
          </div>

          <div className="md-mac-power" title={`power · ${ledState}`}>
            <span className={`md-mac-power-led led-${ledState}`} />
            <span className="md-mac-power-lbl">PWR</span>
            <span className="md-mac-power-sub">{todayTotals.tasksDone} ▲</span>
          </div>
        </div>
      </div>

      {/* Decorative case rivets — 4 corners */}
      <span className="md-mac-rivet rv-tl" aria-hidden />
      <span className="md-mac-rivet rv-tr" aria-hidden />
      <span className="md-mac-rivet rv-bl" aria-hidden />
      <span className="md-mac-rivet rv-br" aria-hidden />
    </>
  );
}
