import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { resolveNodeComponent } from '../nodes/registry';
import { makeCommandHandler } from './commandDispatch';
import type { NodeKind } from '../../../shared/types/node';

const PAN_BUTTON_MIDDLE = 1;
const PAN_BUTTON_LEFT = 0;
const ZOOM_SENSITIVITY = 0.001;

// Dot-grid background using radial-gradient.
const GRID_STYLE: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(circle, var(--grid-strong) 1.5px, transparent 1.5px),
    radial-gradient(circle, var(--grid) 1px, transparent 1px)
  `,
  backgroundSize: `var(--grid-major) var(--grid-major), var(--grid-minor) var(--grid-minor)`,
};

// Approximate dimensions per node kind for edge port positioning.
const NODE_WIDTHS: Record<NodeKind, number> = {
  pomo: 380,
  todo: 380,
  habit: 380,
  term: 380,
  'pomo.session': 200,
  'todo.task': 220,
  'habit.day': 240,
};
const NODE_HEIGHTS: Record<NodeKind, number> = {
  pomo: 460,
  todo: 360,
  habit: 360,
  term: 360,
  'pomo.session': 120,
  'todo.task': 90,
  'habit.day': 60,
};

function getNodeWidth(kind: string): number {
  return (NODE_WIDTHS as Record<string, number>)[kind] ?? 240;
}
function getNodeHeight(kind: string): number {
  return (NODE_HEIGHTS as Record<string, number>)[kind] ?? 240;
}

interface DragState {
  nodeId: string;
  pointerId: number;
  startPointer: { x: number; y: number };
  startNodePos: { x: number; y: number };
}

export function Canvas() {
  const board = useBoardStore((s) => s.board);
  const viewport = useBoardStore((s) => s.viewport);
  const panBy = useBoardStore((s) => s.panBy);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const resetViewport = useBoardStore((s) => s.resetViewport);
  const updateNode = useBoardStore((s) => s.updateNode);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ pointerId: number } | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useViewportPersistence();

  // Build a stable map of nodeId → onCommand handler so each node gets a
  // memoised reference and doesn't re-render on every canvas tick.
  const commandHandlers = useMemo(() => {
    if (!board) return {};
    return Object.fromEntries(
      board.nodes.map((n) => [n.id, makeCommandHandler(n.id)])
    );
  }, [board?.nodes.map((n) => n.id).join(',')]); // re-memoize only when node list changes

  // Space key as pan modifier (space + left-drag, mirroring Figma/tldraw).
  // Escape to deselect.
  useEffect(() => {
    const target = document.body;
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && !e.repeat) setSpaceHeld(true);
      if (e.code === 'Home') resetViewport();
      if (e.code === 'Escape') setSelectedId(null);
    };
    const onUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') setSpaceHeld(false);
    };
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    return () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
    };
  }, [resetViewport]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const isMiddle = e.button === PAN_BUTTON_MIDDLE;
      const isSpaceLeft = e.button === PAN_BUTTON_LEFT && spaceHeld;
      if (!isMiddle && !isSpaceLeft) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panState.current = { pointerId: e.pointerId };
      e.preventDefault();
    },
    [spaceHeld],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panState.current || panState.current.pointerId !== e.pointerId) return;
      panBy(e.movementX, e.movementY);
    },
    [panBy],
  );

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current || panState.current.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    panState.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = e.clientX - rect.left - rect.width / 2;
      const localY = e.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      zoomAt(localX, localY, factor);
    },
    [zoomAt],
  );

  // Node drag handlers (child nodes only).
  const onNodePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, nodeId: string, nodeX: number, nodeY: number, isMother: boolean) => {
      if (isMother) return;
      if (e.button !== PAN_BUTTON_LEFT) return;
      if (spaceHeld) return; // space+left is canvas pan

      e.stopPropagation();
      setSelectedId(nodeId);

      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        nodeId,
        pointerId: e.pointerId,
        startPointer: { x: e.clientX, y: e.clientY },
        startNodePos: { x: nodeX, y: nodeY },
      };
    },
    [spaceHeld],
  );

  const onNodePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragState.current;
      if (!ds || ds.pointerId !== e.pointerId) return;

      const deltaX = (e.clientX - ds.startPointer.x) / viewport.zoom;
      const deltaY = (e.clientY - ds.startPointer.y) / viewport.zoom;
      const newX = ds.startNodePos.x + deltaX;
      const newY = ds.startNodePos.y + deltaY;

      updateNode(ds.nodeId, { position: { x: newX, y: newY } });
    },
    [viewport.zoom, updateNode],
  );

  const onNodePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragState.current;
      if (!ds || ds.pointerId !== e.pointerId) return;

      e.currentTarget.releasePointerCapture(e.pointerId);
      dragState.current = null;

      // Persist the board after drag.
      if (board) {
        void window.krnl?.boardSave(board);
      }
    },
    [board],
  );

  const cursor = panState.current ? 'grabbing' : spaceHeld ? 'grab' : 'default';

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={onWheel}
      onClick={() => setSelectedId(null)}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--paper)',
        position: 'relative',
        overflow: 'hidden',
        cursor,
        touchAction: 'none',
        ...GRID_STYLE,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          <defs>
            <filter id="acid-glow">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#c9f158" floodOpacity="0.7" />
            </filter>
          </defs>
          {board?.edges.map((edge) => {
            const srcNode = board.nodes.find((n) => n.id === edge.from.nodeId);
            const tgtNode = board.nodes.find((n) => n.id === edge.to.nodeId);
            if (!srcNode || !tgtNode) return null;

            const sx = srcNode.position.x + getNodeWidth(srcNode.kind);
            const sy = srcNode.position.y + getNodeHeight(srcNode.kind) / 2;
            const tx = tgtNode.position.x;
            const ty = tgtNode.position.y + getNodeHeight(tgtNode.kind) / 2;
            const d = `M ${sx} ${sy} C ${sx + 80} ${sy} ${tx - 80} ${ty} ${tx} ${ty}`;

            // Task-flow edge: task → task chain renders as cyan marching ants
            const isTaskFlow = srcNode.kind === 'todo.task' && tgtNode.kind === 'todo.task';
            if (isTaskFlow) {
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke="var(--cyan)"
                  strokeWidth={2}
                  strokeDasharray="14 8"
                  opacity={0.95}
                  className="task-flow-edge"
                />
              );
            }

            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={edge.enabled ? 'var(--acid)' : 'var(--ink-3)'}
                strokeWidth={edge.enabled ? 1.5 : 1}
                strokeDasharray={edge.enabled ? undefined : '4 3'}
                opacity={edge.enabled ? 1 : 0.6}
                filter={edge.enabled ? 'url(#acid-glow)' : undefined}
              />
            );
          })}
        </svg>

        {board === null ? (
          <div
            style={{
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            LOADING BOARD...
          </div>
        ) : (
          board.nodes.map((node) => {
            const Component = resolveNodeComponent(node.kind);
            const onCommand = commandHandlers[node.id] ?? (() => {});
            const isSelected = selectedId === node.id;

            return (
              <div
                key={node.id}
                onPointerDown={(e) =>
                  onNodePointerDown(e, node.id, node.position.x, node.position.y, node.isMother)
                }
                onPointerMove={onNodePointerMove}
                onPointerUp={onNodePointerUp}
                onPointerCancel={onNodePointerUp}
                onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                style={{
                  position: 'absolute',
                  left: node.position.x,
                  top: node.position.y,
                  outline: isSelected ? '1px solid var(--acid)' : undefined,
                  boxShadow: isSelected ? 'var(--shadow-glow)' : undefined,
                  cursor: node.isMother ? 'default' : 'grab',
                }}
              >
                <Component
                  node={node}
                  selected={isSelected}
                  onCommand={onCommand}
                  onSelect={() => setSelectedId(node.id)}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
