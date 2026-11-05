/**
 * StationCell — generic wrapper for all mother-node kinds in Station Mode.
 *
 * ADR 0008 § 2.7 / § 6 / § 12.
 *
 * Responsibilities:
 *   - Resolve the mother node for this slot via config.stationSlot.
 *   - Provide MotherFrameStationContext so nested <MotherFrame> renders
 *     fluid 100%/100% instead of fixed 540×540 (avoids the double-wrap bug).
 *   - Overlay a small DragHandle at the top of the card so the user can
 *     drag a mother onto another panel to swap their slots.
 *
 * Visibility (hide/show) is owned by StationToolbar (top-of-shell strip) —
 * panels are conditionally rendered at the StationLayout level so hidden
 * mothers fully omit their panel and neighbours redistribute the space.
 * StationCell only ever renders when its panel is actually mounted, so it
 * doesn't need its own hidden state.
 */

import { useCallback } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { NODE_REGISTRY } from '../nodes/registry';
import { MotherFrameStationContext, MOTHER_TOTAL } from '../nodes/MotherFrame';
import { beginHold } from '../nodes/MotherFrame/motherDrag';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { resolveStationSlot, SLOT_INDEX } from './SlotResolver';
import type { StationSlot } from '../../../shared/types';

interface Props {
  slot: StationSlot;
}

export function StationCell({ slot }: Props) {
  const node = useBoardStore((s) =>
    s.board?.nodes.find(
      (n) => n.isMother && resolveStationSlot(n) === slot
    ) ?? null
  );
  const selectNode = useBoardStore((s) => s.selectNode);

  const onSelect = useCallback(() => {
    if (node) selectNode(node.id);
  }, [node, selectNode]);

  if (!node) return null;

  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;

  const onCommand = makeCommandHandler(node.id);
  const slotIndex = SLOT_INDEX[slot] ?? 1;

  return (
    <MotherFrameStationContext.Provider value={true}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <DragHandle nodeId={node.id} />
        <Component
          node={node}
          selected={false}
          onCommand={onCommand}
          onSelect={onSelect}
          slotIndex={slotIndex}
          slotTotal={MOTHER_TOTAL}
        />
      </div>
    </MotherFrameStationContext.Provider>
  );
}

function DragHandle({ nodeId }: { nodeId: string }) {
  // Press and move to pick the panel up: you hold it (it follows you,
  // tilting in 3D) and drop it on another panel to swap them.
  return (
    <div
      role="button"
      aria-label="Drag to swap with another panel"
      className="station-drag-handle"
      onPointerDown={(e) => beginHold(e, nodeId)}
    >
      <svg
        aria-hidden
        width="18"
        height="10"
        viewBox="0 0 18 10"
        fill="currentColor"
        style={{ display: 'block', pointerEvents: 'none' }}
      >
        {/* 6 dots in a 3×2 grid — standard drag-handle affordance */}
        <circle cx="3"  cy="3" r="1" />
        <circle cx="9"  cy="3" r="1" />
        <circle cx="15" cy="3" r="1" />
        <circle cx="3"  cy="7" r="1" />
        <circle cx="9"  cy="7" r="1" />
        <circle cx="15" cy="7" r="1" />
      </svg>
    </div>
  );
}
