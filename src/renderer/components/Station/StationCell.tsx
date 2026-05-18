/**
 * StationCell — generic wrapper for all mother-node kinds in Station Mode.
 *
 * ADR 0008 § 2.7 / § 6 / § 12.
 *
 * Responsibilities:
 *   - Resolve the mother node for this slot via config.stationSlot.
 *   - Provide MotherFrameStationContext so nested <MotherFrame> renders
 *     fluid 100%/100% instead of fixed 540×540 (avoids the double-wrap bug).
 *   - Overlay a small DragHandle at the top of the card:
 *       · click+drag onto another station cell → swap mothers' slots
 *       · right-click → context menu with "Hide" action
 *   - Render a "show" placeholder if the mother is stationHidden.
 *
 * HTML5 drag-and-drop is used (built-in threshold prevents accidental drags;
 * native cursor + drag image; works across all panels without per-cell
 * mouse-tracking).
 */

import { useCallback, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { NODE_REGISTRY } from '../nodes/registry';
import { MotherFrameStationContext, MOTHER_TOTAL } from '../nodes/MotherFrame';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { ContextMenu } from '../ContextMenu';
import { resolveStationSlot, SLOT_INDEX } from './SlotResolver';
import type { StationSlot, MotherNodeConfig } from '../../../shared/types';

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
  const updateNode = useBoardStore((s) => s.updateNode);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onSelect = useCallback(() => {
    if (node) selectNode(node.id);
  }, [node, selectNode]);

  if (!node) return null;

  // Hidden mother: render a small "show" placeholder.
  const cfg = (node.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
  if (cfg.stationHidden) {
    return (
      <HiddenPlaceholder
        kind={node.kind}
        onShow={() => updateNode(node.id, { config: { ...cfg, stationHidden: false } })}
      />
    );
  }

  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;

  const onCommand = makeCommandHandler(node.id);
  const slotIndex = SLOT_INDEX[slot] ?? 1;

  // ── Drop target — accepts a swap from any other station cell ────────────
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
        <DragHandle
          nodeId={node.id}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        />
        <Component
          node={node}
          selected={false}
          onCommand={onCommand}
          onSelect={onSelect}
          slotIndex={slotIndex}
          slotTotal={MOTHER_TOTAL}
        />
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={[
              {
                label: 'Hide',
                onSelect: () => {
                  updateNode(node.id, { config: { ...cfg, stationHidden: true } });
                  setMenu(null);
                },
              },
            ]}
            onDismiss={() => setMenu(null)}
          />
        )}
      </div>
    </MotherFrameStationContext.Provider>
  );
}

// ── DragHandle ─────────────────────────────────────────────────────────────
// Thin (14px) strip across the top of the card. Visible as a centered grip
// glyph on hover, transparent otherwise so it doesn't disrupt the card's
// chrome. Click+drag = swap; right-click = context menu.

function DragHandle({
  nodeId,
  onContextMenu,
}: {
  nodeId: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, nodeId);
  };

  return (
    <div
      draggable
      role="button"
      aria-label="Drag to swap, right-click to hide"
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 40,
        height: 14,
        zIndex: 10,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hover ? 'var(--paper-3)' : 'transparent',
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        transition: 'background 120ms',
        userSelect: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 10,
          letterSpacing: 2,
          color: hover ? 'var(--ink-2)' : 'var(--ink-4, var(--ink-3))',
          opacity: hover ? 1 : 0.5,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
        }}
      >
        ⋮⋮
      </span>
    </div>
  );
}

// ── HiddenPlaceholder ───────────────────────────────────────────────────────
// Renders when config.stationHidden is true. Compact pill showing the kind
// name + a "show" button so the user can restore it.

function HiddenPlaceholder({ kind, onShow }: { kind: string; onShow: () => void }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        fontFamily: 'var(--font-mono)',
        gap: 12,
        opacity: 0.4,
      }}
    >
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
        {kind} · hidden
      </span>
      <button
        type="button"
        onClick={onShow}
        style={{
          background: 'transparent',
          color: 'var(--acid)',
          border: '1px solid var(--paper-3)',
          padding: '2px 10px',
          borderRadius: 2,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        show
      </button>
    </div>
  );
}
