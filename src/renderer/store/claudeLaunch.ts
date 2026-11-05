// Start Claude Code in the board's terminal (issue #206).
//
// One entry point for the Orb quick action and `krnl term claude [--bypass]`:
// bring the terminal into view (Station: show its panel; Canvas: centre it),
// wait for its shell session, then type the command into it.

import type { MotherNodeConfig } from '../../shared/types/board';
import { isStationHidden } from '../components/Station/stationVisibility';
import { getLiveTerminal } from '../components/nodes/TerminalNode/liveTerminals';
import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import { focusNode } from './scheduleActions';

export const CLAUDE_COMMAND = 'claude';
export const CLAUDE_BYPASS_FLAG = '--dangerously-skip-permissions';

export function claudeCommandLine(bypass: boolean): string {
  return bypass ? `${CLAUDE_COMMAND} ${CLAUDE_BYPASS_FLAG}` : CLAUDE_COMMAND;
}

export interface LaunchResult { ok: boolean; message: string }

interface LaunchDeps {
  /** Writes to a PTY session; defaults to the preload bridge. */
  write?: (sessionId: string, data: string) => Promise<void>;
  /** How long to wait for the terminal's shell to start. */
  timeoutMs?: number;
  /** Poll step while waiting for the session. */
  stepMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Make the terminal visible: show its Station panel, or centre it on the canvas. */
export function revealTerminal(): string | null {
  const st = useBoardStore.getState();
  const board = st.board;
  const term = board?.nodes.find((n) => n.kind === 'term');
  if (!board || !term) return null;
  if (board.layoutMode === 'station') {
    if (isStationHidden(term)) {
      const cfg = (term.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      st.updateNode(term.id, { config: { ...cfg, stationHidden: false } });
      const b = useBoardStore.getState().board;
      if (b) void saveBoard(b);
    }
  } else {
    focusNode(term.id);
  }
  return term.id;
}

export async function launchClaudeInTerminal(bypass: boolean, deps: LaunchDeps = {}): Promise<LaunchResult> {
  const termId = revealTerminal();
  if (!termId) return { ok: false, message: 'No terminal on the board' };
  const bridge = window.krnl;
  const write = deps.write ?? (bridge ? (id: string, data: string) => bridge.ptyWrite(id, data) : null);
  if (!write) return { ok: false, message: 'No terminal bridge (browser preview)' };
  const timeoutMs = deps.timeoutMs ?? 6000;
  const stepMs = deps.stepMs ?? 100;

  // The panel mounts and the shell spawns asynchronously after reveal.
  let sessionId: string | null = null;
  for (let waited = 0; waited <= timeoutMs; waited += stepMs) {
    sessionId = getLiveTerminal(termId)?.sessionId ?? null;
    if (sessionId) break;
    await sleep(stepMs);
  }
  if (!sessionId) return { ok: false, message: 'The terminal shell did not start in time' };

  const line = claudeCommandLine(bypass);
  await write(sessionId, `${line}\r`);
  getLiveTerminal(termId)?.term.focus();
  return { ok: true, message: `Started "${line}" in the terminal` };
}
