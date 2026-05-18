/* CanvasChassis — canvas-mode chrome layer (ViewportPortal-anchored).
 *
 * ADR 0008 § 2.6. Bounds + Chrome are sourced from `dockRegistry` — adding a
 * new dock style requires no edits here.
 */

import { useMemo } from 'react';
import { ViewportPortal } from '@xyflow/react';
import type { DockStyle } from './useDockStyle';
import { DOCK_REGISTRY } from './dockRegistry';
import { useBoardStore } from '../../store/boardStore';
import { MOTHER_WIDTH, MOTHER_HEIGHT } from '../nodes/MotherFrame';

type Bounds = { left: number; top: number; width: number; height: number };

export function CanvasChassis({ dockStyle }: { dockStyle: DockStyle }) {
  const def = DOCK_REGISTRY[dockStyle];

  // Subscribe to mother x-span — used by `fit-mothers` styles only. Selector
  // returns null when no mothers exist, otherwise minX/maxX.
  const motherBounds = useBoardStore((s) => {
    if (!s.board) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of s.board.nodes) {
      if (!n.isMother) continue;
      const x = n.position.x;
      if (x < minX) minX = x;
      if (x + MOTHER_WIDTH > maxX) maxX = x + MOTHER_WIDTH;
    }
    return Number.isFinite(minX) ? { minX, maxX } : null;
  });

  const bounds = useMemo<Bounds | null>(() => {
    if (!def.canvasBounds) return null;
    if (def.canvasBounds.kind === 'static') {
      return { ...def.canvasBounds.rect };
    }
    // fit-mothers
    const { topOffset, height, sidePad, minWidth } = def.canvasBounds;
    if (!motherBounds) {
      return { left: -minWidth / 2, top: topOffset, width: minWidth, height };
    }
    const width = Math.max(minWidth, (motherBounds.maxX - motherBounds.minX) + sidePad * 2);
    return { left: motherBounds.minX - sidePad, top: topOffset, width, height };
  }, [def.canvasBounds, motherBounds]);

  if (!def.Chrome || !bounds) return null;
  const Chrome = def.Chrome;

  return (
    <ViewportPortal>
      <div
        data-testid="canvas-chassis"
        className={`dock-chassis dock-${dockStyle}`}
        style={{
          position: 'absolute',
          transform: `translate(${bounds.left}px, ${bounds.top}px)`,
          width: bounds.width,
          height: bounds.height,
          // Smooth resize when the chrome rect changes (fit-mothers styles).
          transition: 'transform 320ms cubic-bezier(0.4, 0.0, 0.2, 1), width 320ms cubic-bezier(0.4, 0.0, 0.2, 1)',
        }}
      >
        <Chrome />
      </div>
    </ViewportPortal>
  );
}

void MOTHER_HEIGHT;
