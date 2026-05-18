/**
 * StationCell — single generic wrapper for all mother-node kinds in Station Mode.
 *
 * ADR 0008 § 2.7 / § 6 / § 12 required change #3.
 *
 * Takes a StationSlot, finds the matching mother node from boardStore (via
 * config.stationSlot), resolves its React component from NODE_REGISTRY, and
 * renders it inside a station-variant context.
 *
 * IMPORTANT: each mother component (PomoNode, TodoNode, ...) already wraps
 * its own UI in `<MotherFrame width={MOTHER_WIDTH}>`. If we ALSO wrap with
 * `<MotherFrame variant="station">` here, we get a fluid outer 100×100%
 * frame containing a fixed 540×540 inner frame — the cause of "the
 * resizable edges resize a background frame, not the node itself". The
 * fix: don't double-wrap. Provide MotherFrameStationContext so the inner
 * MotherFrame (rendered by the mother component) auto-switches to the
 * fluid station variant.
 *
 * Supplies the same NodeProps-shaped context (onCommand / onSelect) that
 * createNodeAdapter builds in CanvasFlow.tsx — no per-kind shims required
 * because NodeProps is RF-independent by design (Decision #8).
 */

import { useCallback } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { NODE_REGISTRY } from '../nodes/registry';
import { MotherFrameStationContext, MOTHER_TOTAL } from '../nodes/MotherFrame';
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

  // Stable onSelect — keyed on node id.
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
      <Component
        node={node}
        selected={false}
        onCommand={onCommand}
        onSelect={onSelect}
        slotIndex={slotIndex}
        slotTotal={MOTHER_TOTAL}
      />
    </MotherFrameStationContext.Provider>
  );
}
