/* KrnlDockChrome — full rack chassis (top rail + bottom rail).
 *
 * Wired to real data:
 *   - Top rail clock module    -> useState(new Date()) ticking every second,
 *     with day-of-week + date subline.
 *   - Top rail activity strip  -> <ActivityStrip> from useAnalytics().byDay()
 *     showing the last 30 days of task completions.
 *   - Top rail sys readouts    -> useAnalytics().open() + streaks() for the
 *     three cells (tasks open/total, longest habit streak, focus minutes today).
 *   - Bottom rail switches     -> 3 canvas-layer filters (TASKS / TEXTS /
 *     IMAGES). Each switch flips a flag in useLayerVisibility; CanvasFlow
 *     sets `hidden: true` on RF nodes whose layer is off.
 *   - Bottom rail NUKE button  -> 2-step armed delete-all-tasks. Yellow/black
 *     hazard cover lifts on click; red dome underneath is then armed. Click
 *     the dome to delete every `todo.task` node in the board. Auto-resets
 *     after 4s of inactivity so a stray click can't fire it.
 *   - Bottom rail terminal     -> tail of useEventLog().entries (issue #133).
 *   - Bottom rail uplink       -> "saved Xs ago" from Board.savedAt.
 *
 * Class names prefixed `dk-` to avoid collision with any global `.rail` /
 * `.screw` / `.mod` etc.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalytics, ActivityStrip, lastNDays } from '../../analytics';
import { useEventLog, emit, saveBoard } from '../../store/eventLog';
import { useBoardStore } from '../../store/boardStore';
import { useLayerVisibility, type Layer } from '../../store/layerVisibility';
import { deleteTaskNodesCascade } from '../Canvas/commandDispatch';

const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// 3 canvas-layer filter switches in the bottom-left panel. Each toggle flips
// whether nodes of that kind render across the entire canvas.
const LAYER_BAYS: Array<{ layer: Layer; sub: string }> = [
  { layer: 'tasks',  sub: 'TASKS'  },
  { layer: 'texts',  sub: 'TEXTS'  },
  { layer: 'images', sub: 'IMAGES' },
];

// How long the nuke stays armed after the cover is lifted before slamming
// back down on its own. Long enough for a deliberate two-click sequence;
// short enough that a forgotten armed state doesn't sit there indefinitely.
const NUKE_ARM_TIMEOUT_MS = 4000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatSavedAgo(savedAt: string | undefined, now: number): string {
  if (!savedAt) return '— : —';
  const saved = new Date(savedAt).getTime();
  if (!Number.isFinite(saved)) return '— : —';
  const elapsed = Math.max(0, Math.floor((now - saved) / 1000));
  if (elapsed < 6000) {
    return `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
  }
  const mins = Math.floor(elapsed / 60);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}h`;
}

export function KrnlDockChrome() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── data sources ─────────────────────────────────────────────────────────
  const analytics = useAnalytics();
  const byDay = useMemo(() => analytics.byDay(lastNDays(30)), [analytics]);
  const open = useMemo(() => analytics.open(), [analytics]);
  const streaks = useMemo(() => analytics.streaks(), [analytics]);
  const eventsToday = byDay.length > 0
    ? byDay[byDay.length - 1]!.taskCount + byDay[byDay.length - 1]!.habitCount
    : 0;

  const logTail = useEventLog((s) => s.entries.slice(-5));
  const savedAt = useBoardStore((s) => s.board?.savedAt);
  const savedAgo = formatSavedAgo(savedAt, now.getTime());

  // ── layer visibility (canvas-wide filters) ───────────────────────────────
  const layerState = useLayerVisibility((s) => ({
    tasks: s.tasks,
    texts: s.texts,
    images: s.images,
  }));
  const toggleLayer = useLayerVisibility((s) => s.toggleLayer);
  const activeFilters = (layerState.tasks ? 0 : 1) + (layerState.texts ? 0 : 1) + (layerState.images ? 0 : 1);

  // ── nuke (delete-all-tasks) — 2-step armed action ────────────────────────
  const [nukeArmed, setNukeArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearArmTimer = () => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };
  useEffect(() => () => clearArmTimer(), []);

  const armNuke = () => {
    if (nukeArmed) return;
    setNukeArmed(true);
    clearArmTimer();
    armTimerRef.current = setTimeout(() => setNukeArmed(false), NUKE_ARM_TIMEOUT_MS);
  };

  const fireNuke = () => {
    if (!nukeArmed) return;
    const board = useBoardStore.getState().board;
    if (!board) return;
    const taskIds = board.nodes.filter((n) => n.kind === 'todo.task').map((n) => n.id);
    if (taskIds.length === 0) {
      // Nothing to do — still consume the arm and log it so the user sees feedback.
      emit('sys.cmd', 'destruct: no tasks to delete', { severity: 'info' });
      setNukeArmed(false);
      clearArmTimer();
      return;
    }
    deleteTaskNodesCascade(taskIds);
    const final = useBoardStore.getState().board;
    if (final) void saveBoard(final);
    emit('sys.cmd', `destruct: deleted ${taskIds.length} task${taskIds.length === 1 ? '' : 's'}`, {
      severity: 'err',
    });
    setNukeArmed(false);
    clearArmTimer();
  };

  // ── clock/date strings ───────────────────────────────────────────────────
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const dow = DOW_LABELS[now.getDay()]!;
  const mon = MONTH_LABELS[now.getMonth()]!;
  const day = pad(now.getDate());
  const year = now.getFullYear();
  const utcHH = pad(now.getUTCHours());
  const utcMM = pad(now.getUTCMinutes());

  const focusToday = open.focusMinToday;
  const focusH = Math.floor(focusToday / 60);
  const focusM = focusToday % 60;
  const focusLabel = focusH > 0 ? `${focusH}h ${pad(focusM)}m` : `${focusM}m`;

  return (
    <>
      {/* Canvas-corner crosshairs framing the mother row inside the chassis */}
      <span className="dk-canvas-corner dk-c-tl" aria-hidden />
      <span className="dk-canvas-corner dk-c-tr" aria-hidden />
      <span className="dk-canvas-corner dk-c-bl" aria-hidden />
      <span className="dk-canvas-corner dk-c-br" aria-hidden />

      {/* ===== TOP RAIL ===== */}
      <div className="dk-rail dk-top">
        <span className="dk-screw dk-tl" />
        <span className="dk-screw dk-tr" />
        <span className="dk-screw dk-bl" />
        <span className="dk-screw dk-br" />
        <div className="dk-vents dk-left">
          <span /><span /><span /><span />
        </div>
        <div className="dk-vents dk-right">
          <span /><span /><span /><span />
        </div>

        <div className="dk-top-grid">
          {/* CLOCK */}
          <div className="dk-mod">
            <div className="dk-mod-tag">
              <span className="dk-id">01</span> uptime <span className="dk-right">· live</span>
            </div>
            <div className="dk-screen">
              <div className="dk-clk-digits">
                {hh}<span className="dk-colon">:</span>{mm}<span className="dk-colon">:</span>{ss}
              </div>
              <div className="dk-clk-sub">
                {dow} · {mon} {day} · {year} · utc {utcHH}:{utcMM}
              </div>
            </div>
          </div>

          {/* ACTIVITY */}
          <div className="dk-mod">
            <div className="dk-mod-tag">
              <span className="dk-id">02</span> activity · 30d
              <span className="dk-right">
                <span className="dk-pulse" /> {pad(eventsToday)} events · 24h
              </span>
            </div>
            <div className="dk-screen dk-screen-flush">
              <div className="dk-ecg-wrap">
                <div style={{ position: 'absolute', inset: 0 }}>
                  <ActivityStrip
                    data={byDay}
                    metric="taskCount"
                    width={1000}
                    height={64}
                    stroke="#b8d957"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SYS READOUTS */}
          <div className="dk-mod">
            <div className="dk-mod-tag">
              <span className="dk-id">03</span> system · today
              <span className="dk-right">{open.tasksTotal > 0 ? 'nominal' : 'idle'}</span>
            </div>
            <div className="dk-readouts">
              <div className="dk-cell dk-cell-amber">
                <div className="dk-cell-top"><span className="dk-id">A</span> tasks</div>
                <div className="dk-cell-value">
                  {open.tasksOpen}
                  <span className="dk-cell-unit">/{open.tasksTotal}</span>
                </div>
                <div className="dk-cell-meter">
                  <div
                    className="dk-cell-meter-fill"
                    style={{
                      width: open.tasksTotal === 0
                        ? '0%'
                        : `${Math.round(((open.tasksTotal - open.tasksOpen) / open.tasksTotal) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="dk-cell">
                <div className="dk-cell-top"><span className="dk-id">B</span> streak</div>
                <div className="dk-cell-value">
                  {streaks.longestHabitStreak}
                  <span className="dk-cell-unit">d</span>
                </div>
                <div className="dk-cell-meter">
                  <div
                    className="dk-cell-meter-fill"
                    style={{
                      width: `${Math.min(100, Math.round((streaks.longestHabitStreak / 30) * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="dk-cell">
                <div className="dk-cell-top"><span className="dk-id">C</span> focus</div>
                <div className="dk-cell-value">
                  {focusLabel}
                  <span className="dk-cell-unit">·{open.sessionsToday}s</span>
                </div>
                <div className="dk-cell-meter">
                  <div
                    className="dk-cell-meter-fill"
                    style={{
                      width: `${Math.min(100, Math.round((focusToday / 480) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dk-badge dk-badge-top">KRNL · DOCK-A1</div>
      </div>

      {/* ===== BOTTOM RAIL ===== */}
      <div className="dk-rail dk-bottom">
        <span className="dk-screw dk-tl" />
        <span className="dk-screw dk-tr" />
        <span className="dk-screw dk-bl" />
        <span className="dk-screw dk-br" />
        <div className="dk-vents dk-left">
          <span /><span /><span /><span /><span />
        </div>
        <div className="dk-vents dk-right">
          <span /><span /><span /><span /><span />
        </div>

        <div className="dk-bottom-grid">
          {/* Bottom-left: 3 layer-filter switches + nuke */}
          <div className="dk-switches-panel">
            <div className="dk-mod-tag dk-mod-tag-flat">
              <span className="dk-id">04</span> filters · destruct
              <span className="dk-right">
                {activeFilters === 0 ? 'all visible' : `${activeFilters} hidden`}
              </span>
            </div>
            <div className="dk-switches-row">
              {LAYER_BAYS.map((b, i) => {
                const visible = layerState[b.layer];
                return (
                  <div
                    key={b.layer}
                    className={`dk-sw-cell${visible ? '' : ' dk-sw-off'}`}
                    role="button"
                    tabIndex={0}
                    title={`${b.sub} layer — ${visible ? 'visible' : 'hidden'}`}
                    onClick={() => {
                      toggleLayer(b.layer);
                      emit('sys.cmd',
                        `layer:${b.layer} ${visible ? 'hidden' : 'visible'}`,
                        { severity: visible ? 'warn' : 'ok' });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleLayer(b.layer);
                      }
                    }}
                  >
                    <div className="dk-sw-id">BAY · 0{i + 1}</div>
                    <div className="dk-sw-bezel">
                      <div className="dk-sw-well">
                        <div className="dk-sw-bat">
                          <div className="dk-sw-bat-stem" />
                          <div className="dk-sw-bat-tip" />
                        </div>
                      </div>
                      <div className="dk-sw-led" />
                    </div>
                    <div className="dk-sw-label">{b.sub}</div>
                  </div>
                );
              })}

              {/* NUKE — 2-step armed delete-all-tasks */}
              <div className="dk-nuke" data-armed={nukeArmed ? 'true' : 'false'}>
                <div className="dk-nuke-id">DESTRUCT</div>
                <div className="dk-nuke-housing">
                  <button
                    type="button"
                    className="dk-nuke-button"
                    onClick={fireNuke}
                    disabled={!nukeArmed}
                    aria-label={nukeArmed ? 'Fire destruct' : 'Destruct button (covered)'}
                    title={nukeArmed ? 'FIRE — delete all tasks' : 'Lift cover first'}
                  >
                    <span className="dk-nuke-dome" aria-hidden />
                  </button>
                  <div
                    className="dk-nuke-cover"
                    role="button"
                    tabIndex={0}
                    aria-pressed={nukeArmed}
                    aria-label={nukeArmed ? 'Lower cover' : 'Lift cover to arm destruct'}
                    title={nukeArmed ? 'click cover to abort' : 'click cover to arm'}
                    onClick={() => {
                      if (nukeArmed) {
                        setNukeArmed(false);
                        clearArmTimer();
                      } else {
                        armNuke();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (nukeArmed) {
                          setNukeArmed(false);
                          clearArmTimer();
                        } else {
                          armNuke();
                        }
                      }
                    }}
                  >
                    <span className="dk-nuke-cover-label">LIFT</span>
                  </div>
                </div>
                <div className="dk-nuke-label">
                  {nukeArmed ? 'ARMED' : 'DELETE ALL'}
                </div>
              </div>
            </div>
          </div>

          {/* TERMINAL — tail of the central event log */}
          <div className="dk-term">
            <div className="dk-term-bar">
              <div className="dk-traffic"><span /><span /><span /></div>
              <div className="dk-term-title">
                krnl-dock <span className="dk-dot">·</span> /var/log <span className="dk-dot">·</span> <span className="dk-live">live</span>
              </div>
              <div className="dk-term-stamp">rec</div>
            </div>
            <div className="dk-term-body">
              {logTail.length === 0 ? (
                <div className="dk-term-line" style={{ opacity: 0.5 }}>
                  <span className="dk-term-t">--:--:--</span>
                  <span className="dk-term-arrow">→</span> waiting for activity…
                </div>
              ) : (
                logTail.map((entry) => {
                  const d = new Date(entry.ts);
                  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                  const symKind = entry.severity === 'warn' ? 'warn'
                    : entry.severity === 'err' ? 'err'
                    : entry.severity === 'info' ? 'arrow'
                    : 'ok';
                  const symChar = symKind === 'ok' ? '✓'
                    : symKind === 'warn' ? '!'
                    : symKind === 'err' ? '✕'
                    : '→';
                  return (
                    <div key={entry.id} className="dk-term-line">
                      <span className="dk-term-t">{t}</span>
                      <span className={`dk-term-${symKind}`}>{symChar}</span>{' '}
                      {entry.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* UPLINK — last successful save, mm:ss ago */}
          <div className="dk-uplink">
            <div className="dk-uplink-head"><span>05 · saved</span><span>tx</span></div>
            <div className="dk-uplink-time">{savedAgo}</div>
            <div className="dk-uplink-foot"><span>persisted</span><span className="dk-uplink-led" /></div>
          </div>
        </div>

        <div className="dk-badge dk-badge-bottom">IO · ESTABLISHED — {3 - activeFilters} LAYERS UP</div>
      </div>
    </>
  );
}
