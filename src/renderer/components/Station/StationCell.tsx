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
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { resolveStationSlot, SLOT_INDEX } from './SlotResolver';
import type { StationSlot } from '../../../shared/types';

interface Props {
  slot: StationSlot;
}

const DRAG_MIME = 'application/x-krnl0-station-mother';

export function StationCell({ slot }: Props) {
  const node = useBoardStore((s) =>
    s.board?.nodes.find(
      (n) => n.isMother && resolveStationSlot(n) === slot
    ) ?? null
  );
  const selectNode = useBoardStore((s) => s.selectNode);
  const swapMotherSlots = useBoardStore((s) => s.swapMotherSlots);

  const onSelect = useCallback(() => {
    if (node) selectNode(node.id);
  }, [node, selectNode]);

  if (!node) return null;

  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;

  const onCommand = makeCommandHandler(node.id);
  const slotIndex = SLOT_INDEX[slot] ?? 1;

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const sourceId = e.dataTransfer.getData(DRAG_MIME);
    if (!sourceId || sourceId === node.id) return;
    e.preventDefault();
    swapMotherSlots(sourceId, node.id);
  };

  return (
    <MotherFrameStationContext.Provider value={true}>
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
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
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, nodeId);
    (e.currentTarget as HTMLDivElement).dataset.dragging = 'true';
  };
  const onDragEnd = (e: React.DragEvent) => {
    delete (e.currentTarget as HTMLDivElement).dataset.dragging;
  };

  return (
    <div
      draggable
      role="button"
      aria-label="Drag to swap with another panel"
      className="station-drag-handle"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
