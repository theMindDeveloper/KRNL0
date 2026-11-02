// Decision 32 — Analytics is a fixed mother ('mother-analytics', slot 'main').
//
// Its visibility only matters in Station mode, where it takes the canvas panel
// when shown. Like every mother it is stored as config.stationHidden (default
// hidden — see stationVisibility.ts). Canvas mode always shows it in the
// mother row. The Dock button, the 'A' shortcut and `sys analytics
// open|close|toggle` all go through these helpers so they agree.

import type { Board } from '../../shared/types';
import type { MotherNodeConfig } from '../../shared/types/board';
import type { Node } from '../../shared/types/node';
import { isStationHidden } from '../components/Station/stationVisibility';
import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';

export function findAnalyticsMother(board: Pick<Board, 'nodes'> | null | undefined): Node | undefined {
  return board?.nodes.find((n) => n.kind === 'analytics' && n.isMother === true);
}

/** Station-mode visibility of the analytics window. */
export function isAnalyticsShown(board: Pick<Board, 'nodes'> | null | undefined): boolean {
  const m = findAnalyticsMother(board);
  return !!m && !isStationHidden(m);
}

/** Show or hide the analytics window in Station mode. Persists. */
export function setAnalyticsShown(shown: boolean): void {
  const st = useBoardStore.getState();
  const m = findAnalyticsMother(st.board);
  if (!m) return;
  const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
  st.updateNode(m.id, { config: { ...cfg, stationHidden: !shown } });
  const b = useBoardStore.getState().board;
  if (b) void saveBoard(b);
}

export function toggleAnalyticsShown(): void {
  setAnalyticsShown(!isAnalyticsShown(useBoardStore.getState().board));
}
