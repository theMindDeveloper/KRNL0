/**
 * MacintoshChrome — the System 1 Finder desktop as the chassis.
 *
 * Rebuilt from scratch (ADR 0009 phase 5): no plastic case, CRT bezel,
 * floppy slot or knobs. The station is a flat desktop with
 *   - a menu bar on top: KRNL0 mark, board name, a "Panes" toggle that hides
 *     or shows every panel at once, pomo state and the clock;
 *   - an info bar at the bottom, like a Finder window footer: item count,
 *     open/done tasks, focus minutes today and when board.json last saved.
 * The panels themselves are the windows (striped title bars live in
 * chassis.css under the Macintosh component skins).
 */

import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useAnalytics, lastNDays } from '../../analytics';
import { emit } from '../../store/eventLog';
import type { PomoState } from '../nodes/PomoNode/types';
import type { MotherNodeConfig } from '../../../shared/types';

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function savedAgo(savedAt: string | undefined, now: number): string {
  if (!savedAt) return 'not saved yet';
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return 'not saved yet';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'saved just now';
  if (s < 60) return `saved ${s}s ago`;
  if (s < 3600) return `saved ${Math.round(s / 60)}m ago`;
  return `saved ${Math.round(s / 3600)}h ago`;
}

export function MacintoshChrome() {
  const board = useBoardStore((s) => s.board);
  const updateNode = useBoardStore((s) => s.updateNode);
  const boardName = useBoardStore((s) => (s.board as { title?: string } | null)?.title ?? 'deep-work');
  const analytics = useAnalytics();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mothers = useMemo(() => (board?.nodes ?? []).filter((n) => n.isMother), [board]);
  const pomoRunning = mothers.some((m) => (m.state as PomoState | undefined)?.status === 'running');
  const allHidden = mothers.length > 0 && mothers.every((m) =>
    ((m.config ?? {}) as MotherNodeConfig).stationHidden === true);

  const open = analytics.open();
  const today = analytics.totals(lastNDays(1));
  const d = new Date(now);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // One click hides or shows every panel. No camera move.
  const togglePanes = () => {
    if (!board) return;
    for (const m of mothers) {
      const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      updateNode(m.id, { config: { ...cfg, stationHidden: !allHidden } });
    }
    emit('sys.cmd', `macintosh.panes: ${allHidden ? 'all shown' : 'all hidden'}`, { severity: 'info' });
  };

  return (
    <>
      <div className="md-mac-menubar" data-testid="mac-menubar">
        <span className="md-mac-mark" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges">
            <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="currentColor" />
            <rect x="3" y="3" width="6" height="6" fill="currentColor" />
          </svg>
        </span>
        <span className="md-mac-title">KRNL0</span>
        <span className="md-mac-item md-mac-board">{boardName}</span>
        <button
          type="button"
          className="md-mac-item md-mac-menu-btn"
          onClick={togglePanes}
          title="Hide or show every panel"
        >
          {allHidden ? 'Show panes' : 'Hide panes'}
        </button>
        <span className="md-mac-spacer" />
        <span className={`md-mac-item md-mac-pomo${pomoRunning ? ' is-running' : ''}`}>
          {pomoRunning ? '● Focus running' : 'Idle'}
        </span>
        <span className="md-mac-item md-mac-clock" data-testid="mac-clock">{clock}</span>
      </div>

      <div className="md-mac-infobar" data-testid="mac-infobar">
        <span>{mothers.length} panels</span>
        <span>{open.tasksOpen} open</span>
        <span>{today.tasksDone} done today</span>
        <span>{today.focusMin}m focus</span>
        <span className="md-mac-spacer" />
        <span>board.json · {savedAgo(board?.savedAt, now)}</span>
      </div>
    </>
  );
}
