// Main-window side of the pocket timer (Decision 37). Sends a snapshot of the
// Pomo mother to main whenever it changes, and runs the pocket's buttons
// through the node's own command path. Mounted once, in App.

import { useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { isEasyBoard } from '../store/uiMode';
import { boardTagLibrary } from '../store/spanTags';
import { makeCommandHandler } from '../components/Canvas/commandDispatch';
import { defaultPomoConfig, type PomoConfig, type PomoState, type TimerFace } from '../components/nodes/PomoNode/types';
import { isPomoControlCommand, POCKET_LABEL_COMMAND, isPocketLabelArgs } from '../components/nodes/PomoNode/derive';
import { useFrameTheme } from '../themes/useFrameTheme';
import type { PocketSnapshot } from '../../shared/pocket';
import type { Board } from '../../shared/types';
import { getPocketAway, subscribePocketAway } from './pocketAway';

/** The Pomo mother, if the board has one. */
function pomoMother(board: Board | null): { id: string; state: PomoState; config: PomoConfig } | null {
  const n = board?.nodes.find((x) => x.kind === 'pomo' && x.isMother);
  if (!n) return null;
  return { id: n.id, state: n.state as PomoState, config: (n.config as PomoConfig | undefined) ?? defaultPomoConfig() };
}

function rootLook(): PocketSnapshot['root'] {
  const el = document.documentElement;
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith('data-')) attrs[a.name] = a.value;
  }
  return { attrs, style: el.getAttribute('style') ?? '' };
}

/** Pure — what the pocket gets for this board. Exported for tests. */
export function buildPocketSnapshot(board: Board | null, face: TimerFace, away: boolean, root: PocketSnapshot['root']): PocketSnapshot | null {
  const pomo = pomoMother(board);
  if (!pomo) return null;
  return {
    nodeId: pomo.id,
    state: pomo.state,
    config: pomo.config,
    easy: isEasyBoard(board),
    away,
    library: [...boardTagLibrary(board)],
    face,
    root,
  };
}

export function usePocketBridge(): void {
  const { mode, manifest } = useFrameTheme();
  const defaultFace: TimerFace = manifest.components.pomo.face ?? (mode === 'dark' ? 'vapor' : 'blocks');

  useEffect(() => {
    const send = window.krnl?.pocketSendState;
    if (!send) return;
    let last = '';
    const push = (): void => {
      const board = useBoardStore.getState().board;
      const pomo = pomoMother(board);
      const face = pomo?.config.face ?? defaultFace;
      const snap = buildPocketSnapshot(board, face, getPocketAway(), rootLook());
      const key = JSON.stringify(snap);
      if (key === last) return;
      last = key;
      send(snap);
    };
    push();
    // Only board edits that can change the snapshot: the pomo node, the tag
    // library (on the todo list) or the mode — not pans, hovers or selection.
    const unsubBoard = useBoardStore.subscribe((s, prev) => {
      if (s.board === prev.board) return;
      const pick = (b: Board | null) => b?.nodes.filter((n) => n.isMother && (n.kind === 'pomo' || n.kind === 'todo'));
      const a = pick(s.board);
      const b = pick(prev.board);
      const same = s.board?.uiMode === prev.board?.uiMode && a?.length === b?.length && (a ?? []).every((n, i) => n === b?.[i]);
      if (!same) push();
    });
    const unsubAway = subscribePocketAway(push);
    // Theme and frame changes live on <html>, not in the store.
    const obs = typeof MutationObserver !== 'undefined' ? new MutationObserver(push) : null;
    obs?.observe(document.documentElement, { attributes: true });
    return () => { unsubBoard(); unsubAway(); obs?.disconnect(); };
  }, [defaultFace]);

  useEffect(() => {
    const on = window.krnl?.onPocketRun;
    if (!on) return;
    return on((command, args) => {
      // The node's own controls, or naming a span that just ended (checked again here).
      const label = command === POCKET_LABEL_COMMAND && isPocketLabelArgs(args);
      if (!isPomoControlCommand(command) && !label) return;
      const pomo = pomoMother(useBoardStore.getState().board);
      if (!pomo) return;
      try {
        if (label) makeCommandHandler(pomo.id)(command, args as unknown as Record<string, unknown>);
        else makeCommandHandler(pomo.id)(command);
      } catch {
        // makeCommandHandler already logged it to the event log.
      }
    });
  }, []);
}
