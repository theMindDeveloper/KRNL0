/**
 * StationCell — single generic wrapper for all mother-node kinds in Station Mode.
 *
 * ADR 0008 § 2.7 / § 6 / § 12 required change #3.
 *
 * Takes a StationSlot, finds the matching mother node from boardStore (via
 * config.stationSlot), resolves its React component from NODE_REGISTRY, and
 * wraps it in <MotherFrame variant="station">.
 *
 * Supplies the same NodeProps-shaped context (onCommand / onSelect) that
 * createNodeAdapter builds in CanvasFlow.tsx — no per-kind shims required
 * because NodeProps is RF-independent by design (Decision #8).
 */

import { useCallback } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { NODE_REGISTRY } from '../nodes/registry';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../nodes/MotherFrame';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { resolveStationSlot, SLOT_INDEX } from './SlotResolver';
import type { StationSlot } from '../../../shared/types';

interface Props {
  slot: StationSlot;
}

export function StationCell({ slot }: Props) {
  // Find the mother node for this slot.
  const node = useBoardStore((s) =>
    s.board?.nodes.find(
      (n) => n.isMother && resolveStationSlot(n) === slot
    ) ?? null
  );
  const selectNode = useBoardStore((s) => s.selectNode);

  // Stable onSelect — keyed on node id so it doesn't re-create unless the
  // node identity changes (slot swap).
  const onSelect = useCallback(() => {
    if (node) selectNode(node.id);
  }, [node, selectNode]);

  if (!node) return null;

  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;

  // makeCommandHandler is already cached module-level in CanvasFlow; calling
  // it here for station cells uses the same cache (Map keyed on nodeId).
  const onCommand = makeCommandHandler(node.id);

  const slotIndex = SLOT_INDEX[slot] ?? 1;

  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={MOTHER_TOTAL}
      width={MOTHER_WIDTH}
      position={node.position}
      variant="station"
    >
      <Component
        node={node}
        selected={false}
        onCommand={onCommand}
        onSelect={onSelect}
        slotIndex={slotIndex}
        slotTotal={MOTHER_TOTAL}
      />
    </MotherFrame>
  );
}
