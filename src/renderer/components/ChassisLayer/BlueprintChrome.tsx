/**
 * BlueprintChrome — technical-drafting chassis.
 *
 * Aesthetic: an engineering blueprint laid across the mother row. Dimension
 * arrows quantify the board, a title block top-right identifies the drawing,
 * a revision-history table along the bottom is fed by the event log. Works
 * in light + dark — light reads as drafting paper + ink, dark reads as
 * cyan-lined blueprint on navy.
 *
 * Live wiring:
 *   - top dimension callouts   — nodes / edges / longest habit streak,
 *                                rendered as architectural dimension lines
 *   - sheet detail (top-left)  — current viewport zoom in % (acts as scale)
 *   - title block (top-right)  — PROJECT / DRAWING / DRAWN BY / SHEET / REV
 *                                REV ticks each time the board saves
 *   - detail bubble (centre)   — live clock (HH:MM)
 *   - revision table (bottom)  — last 3 event-log entries as REV rows,
 *                                each clickable to scroll the live log
 *   - section marker (bottom-r)— scale bar + section cut symbol
 *
 * Interaction:
 *   - Click the scale bar  → reset RF zoom to 100%
 *   - Title block "@theMind" → GitHub link, like the synth/telemetry credit
 */

import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';
import { useEventLog } from '../../store/eventLog';
import { useAnalytics, lastNDays } from '../../analytics';
import type { EventSeverity } from '../../store/eventLog/types';

function pad(n: number, w = 2): string { return n.toString().padStart(w, '0'); }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function severityTag(sev: EventSeverity): string {
  return sev === 'err' ? 'CRIT' : sev === 'warn' ? 'CHK' : sev === 'info' ? 'NOTE' : 'OK';
}

export function BlueprintChrome() {
  const rf = useReactFlow();
  const board = useBoardStore((s) => s.board);
  const entries = useEventLog((s) => s.entries);
  const analytics = useAnalytics();

  // ── Live clock (HH:MM, ticked once per minute) ──────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Live zoom for the scale callout ─────────────────────────────────────
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

  // ── Dimension callouts: nodes / edges / streak ──────────────────────────
  const nodeCount = board?.nodes.length ?? 0;
  const edgeCount = board?.edges.length ?? 0;
  const streaks = analytics.streaks();
  const todayTotals = analytics.totals(lastNDays(1));

  // ── Title block REV bumps each time the board's savedAt changes ─────────
  // The board.savedAt ISO timestamp ticks on every persist; using its tail
  // as the revision number is stable across reloads and visibly changes
  // when work is committed.
  const rev = useMemo(() => {
    if (!board?.savedAt) return '000';
    const t = Date.parse(board.savedAt);
    if (!Number.isFinite(t)) return '000';
    return pad(Math.floor(t / 1000) % 1000, 3);
  }, [board?.savedAt]);

  // ── Revision history table — last 3 event-log entries ───────────────────
  const recent = useMemo(() => entries.slice(-3).reverse(), [entries]);

  // ── Scale bar click → reset zoom (treated as "rescale to 1:1") ──────────
  const onScaleClick = () => {
    const v = rf.getViewport?.();
    if (!v) return;
    rf.setViewport?.({ x: v.x, y: v.y, zoom: 1 }, { duration: 320 });
  };

  // Scale percentage (1.0 → "1:1", 0.5 → "1:2", 2.0 → "2:1")
  const scaleLabel = (() => {
    if (zoom <= 0) return '1:1';
    if (Math.abs(zoom - 1) < 0.02) return '1:1';
    if (zoom < 1) return `1:${(1 / zoom).toFixed(2).replace(/\.?0+$/, '')}`;
    return `${zoom.toFixed(2).replace(/\.?0+$/, '')}:1`;
  })();

  return (
    <>
      {/* ── TOP RAIL — dimension callouts + title block ────────────────── */}
      <div className="md-bp-top">
        {/* Sheet detail (left) */}
        <div className="md-bp-detail md-bp-detail-left">
          <div className="md-bp-detail-key">SHEET DETAIL</div>
          <div className="md-bp-detail-val">{scaleLabel}</div>
          <div className="md-bp-detail-sub">CURRENT SCALE</div>
        </div>

        {/* Dimension callouts (centre-left) */}
        <div className="md-bp-dims">
          <div className="md-bp-dim">
            <span className="md-bp-dim-arrow">◄</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-num">{pad(nodeCount, 3)}.00</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-arrow">►</span>
            <span className="md-bp-dim-lbl">NODES</span>
          </div>
          <div className="md-bp-dim">
            <span className="md-bp-dim-arrow">◄</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-num">{pad(edgeCount, 3)}.00</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-arrow">►</span>
            <span className="md-bp-dim-lbl">EDGES</span>
          </div>
          <div className="md-bp-dim">
            <span className="md-bp-dim-arrow">◄</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-num">{pad(streaks.longestHabitStreak, 3)}.00</span>
            <span className="md-bp-dim-line" />
            <span className="md-bp-dim-arrow">►</span>
            <span className="md-bp-dim-lbl">STREAK·D</span>
          </div>
        </div>

        {/* Live clock detail bubble (centre-right) */}
        <div className="md-bp-detail md-bp-detail-clock">
          <div className="md-bp-detail-key">LOCAL · 24H</div>
          <div className="md-bp-detail-val">
            {pad(now.getHours())}<span className="colon">:</span>{pad(now.getMinutes())}
          </div>
          <div className="md-bp-detail-sub">{fmtDate(now)}</div>
        </div>

        {/* Title block (right) — drafting title-block grid */}
        <div className="md-bp-title">
          <div className="md-bp-title-row">
            <span className="k">PROJECT</span>
            <span className="v">KRNL·0</span>
          </div>
          <div className="md-bp-title-row">
            <span className="k">DRAWING</span>
            <span className="v">board.json</span>
          </div>
          <div className="md-bp-title-row">
            <span className="k">DRAWN BY</span>
            <a
              className="md-bp-title-credit"
              href="https://github.com/theMindDeveloper"
              target="_blank"
              rel="noreferrer noopener"
              title="theMindDeveloper on GitHub"
            >
              @theMind
            </a>
          </div>
          <div className="md-bp-title-row md-bp-title-row-split">
            <span><span className="k">SHEET</span><span className="v">01 / 01</span></span>
            <span><span className="k">REV</span><span className="v">{rev}</span></span>
          </div>
        </div>
      </div>

      {/* ── BOTTOM RAIL — revision history + scale bar + section marker ── */}
      <div className="md-bp-bot">
        {/* Revision history table */}
        <div className="md-bp-rev">
          <div className="md-bp-rev-head">
            <span className="col-no">REV</span>
            <span className="col-tag">TAG</span>
            <span className="col-desc">DESCRIPTION</span>
            <span className="col-ts">TIMESTAMP</span>
          </div>
          {recent.length === 0 && (
            <div className="md-bp-rev-row md-bp-rev-row-empty">
              <span className="col-no">—</span>
              <span className="col-tag">—</span>
              <span className="col-desc">no revisions on file · drafting in progress</span>
              <span className="col-ts">--:--:--</span>
            </div>
          )}
          {recent.map((e, i) => {
            const d = new Date(e.ts);
            const revNo = pad(recent.length - i, 2);
            return (
              <div key={e.id} className={`md-bp-rev-row sev-${e.severity}`}>
                <span className="col-no">R{revNo}</span>
                <span className="col-tag">{severityTag(e.severity)}</span>
                <span className="col-desc">{e.text}</span>
                <span className="col-ts">{pad(d.getHours())}:{pad(d.getMinutes())}:{pad(d.getSeconds())}</span>
              </div>
            );
          })}
        </div>

        {/* Section marker + scale bar (right) */}
        <div className="md-bp-section">
          <button
            type="button"
            className="md-bp-scale"
            onClick={onScaleClick}
            title="Reset scale to 1:1"
          >
            <span className="md-bp-scale-lbl">SCALE 1:1</span>
            <span className="md-bp-scale-bar">
              <span className="tick" /><span className="tick" /><span className="tick" />
              <span className="tick" /><span className="tick" />
            </span>
            <span className="md-bp-scale-num">0 · 50 · 100</span>
          </button>
          <div className="md-bp-section-sym">
            {/* Section-cut marker — A↑/A↓ with cut-line */}
            <span className="cut-letter top">A</span>
            <span className="cut-line" />
            <span className="cut-letter bot">A</span>
          </div>
          <div className="md-bp-section-meta">
            <span className="k">TASKS · TODAY</span>
            <span className="v">{todayTotals.tasksDone}</span>
          </div>
        </div>
      </div>
    </>
  );
}
