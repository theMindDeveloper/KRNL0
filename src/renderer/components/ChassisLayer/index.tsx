/* ChassisLayer — renders a decorative chassis behind the mother-node row.
 *
 * Lives in React Flow coordinate space via <ViewportPortal>, so it pans/zooms
 * with the canvas like a regular node. Sized to envelop the visible mothers.
 *
 * Mother seed positions (src/main/persistence/board.ts, y=0):
 *   pomo:-1400, todo:-840, habit:-280, term:280, calendar:840, clock:1400.
 * Mother size is 540×540 (src/renderer/components/nodes/MotherFrame —
 * MOTHER_WIDTH/MOTHER_HEIGHT).
 *
 * Per-variant vertical dimensions (top rail + gap + 540px mother + gap +
 * bottom rail):
 *   - synthesizer/telemetry: ~90px above + ~95px below the mother row
 *   - krnl-dock: 96px top rail + 540 + 96px bottom rail = 744 total.
 *
 * Horizontal dimensions (KRNL Dock only — synth/tel keep the full
 * row span): computed from the bounding box of currently-VISIBLE mothers
 * so flipping a switch shrinks the rack. Hidden mothers don't contribute.
 * Synth/Tel keep a static span — those docks aren't switchable.
 *
 * Variant 'classic' = default look — returns null (no chassis).
 */

import { useMemo } from 'react';
import { ViewportPortal } from '@xyflow/react';
import type { DockStyle } from './useDockStyle';
import { SynthesizerChrome } from './SynthesizerChrome';
import { TelemetryChrome } from './TelemetryChrome';
import { KrnlDockChrome } from './KrnlDockChrome';
import { useBoardStore } from '../../store/boardStore';
import { MOTHER_WIDTH, MOTHER_HEIGHT } from '../nodes/MotherFrame';

type Bounds = { left: number; top: number; width: number; height: number };

// Static dimensions for synth/tel. Mother row x-span -1400..1940.
const STATIC_DIMS: Record<'synthesizer' | 'telemetry', Bounds> = {
  synthesizer: { left: -1410, top: -50,  width: 3360, height: 678 },
  telemetry:   { left: -1410, top: -76,  width: 3360, height: 686 },
};

// KRNL Dock vertical layout — chassis spans top rail above + mothers + bottom rail below.
const KRNL_DOCK_TOP_OFFSET = -102;   // 96px top rail + 6px gap above mothers
const KRNL_DOCK_VERTICAL = 744;      // 96 + 6 + 540 + 6 + 96
const KRNL_DOCK_SIDE_PAD = 10;       // breathing room each side

// Minimum width even when all mothers are hidden — chassis collapses but
// stays large enough to see the rails + an empty middle.
const KRNL_DOCK_MIN_WIDTH = 600;

export function ChassisLayer({ dockStyle }: { dockStyle: DockStyle }) {
  // Subscribe to mother positions + visibility. The selector runs only when
  // the relevant slice changes, so unrelated updates (drag of a child, pomo
  // tick, etc.) don't re-render this layer.
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

  const krnlDockBounds = useMemo<Bounds>(() => {
    if (!motherBounds) {
      // No mothers visible — collapsed chassis centered around origin.
      return {
        left: -KRNL_DOCK_MIN_WIDTH / 2,
        top: KRNL_DOCK_TOP_OFFSET,
        width: KRNL_DOCK_MIN_WIDTH,
        height: KRNL_DOCK_VERTICAL,
      };
    }
    const width = Math.max(
      KRNL_DOCK_MIN_WIDTH,
      (motherBounds.maxX - motherBounds.minX) + KRNL_DOCK_SIDE_PAD * 2,
    );
    return {
      left: motherBounds.minX - KRNL_DOCK_SIDE_PAD,
      top: KRNL_DOCK_TOP_OFFSET,
      width,
      height: KRNL_DOCK_VERTICAL,
    };
  }, [motherBounds]);

  if (dockStyle === 'classic') return null;

  const bounds = dockStyle === 'krnl-dock'
    ? krnlDockBounds
    : STATIC_DIMS[dockStyle];

  return (
    <ViewportPortal>
      <div
        className={`dock-chassis dock-${dockStyle}`}
        style={{
          position: 'absolute',
          transform: `translate(${bounds.left}px, ${bounds.top}px)`,
          width: bounds.width,
          height: bounds.height,
          // Smooth resize on switch toggle (KRNL Dock only — synth/tel are
          // static so the transition is a no-op for them).
          transition: 'transform 320ms cubic-bezier(0.4, 0.0, 0.2, 1), width 320ms cubic-bezier(0.4, 0.0, 0.2, 1)',
        }}
      >
        {dockStyle === 'synthesizer' && <SynthesizerChrome />}
        {dockStyle === 'telemetry' && <TelemetryChrome />}
        {dockStyle === 'krnl-dock' && <KrnlDockChrome />}
      </div>
    </ViewportPortal>
  );
}

// Silence unused-import warning when MOTHER_HEIGHT becomes useful for vertical
// fits (not used today — mothers are always y=0..540).
void MOTHER_HEIGHT;
