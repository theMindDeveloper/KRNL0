import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { resolveNodeComponent } from '../nodes/registry';
import { makeCommandHandler } from './commandDispatch';

const PAN_BUTTON_MIDDLE = 1;
const PAN_BUTTON_LEFT = 0;
const ZOOM_SENSITIVITY = 0.001;

const noop = (): void => {};

// Dot-grid background using radial-gradient.
const GRID_STYLE: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(circle, var(--grid-strong) 1.5px, transparent 1.5px),
    radial-gradient(circle, var(--grid) 1px, transparent 1px)
  `,
  backgroundSize: `var(--grid-major) var(--grid-major), var(--grid-minor) var(--grid-minor)`,
};

export function Canvas() {
  const board = useBoardStore((s) => s.board);
  const viewport = useBoardStore((s) => s.viewport);
  const panBy = useBoardStore((s) => s.panBy);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const resetViewport = useBoardStore((s) => s.resetViewport);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ pointerId: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

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
  useEffect(() => {
    const target = document.body;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) setSpaceHeld(true);
      if (e.code === 'Home') resetViewport();
    };
    const onUp = (e: KeyboardEvent) => {
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

  const cursor = panState.current ? 'grabbing' : spaceHeld ? 'grab' : 'default';

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={onWheel}
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
          {/* Week 3: Edge[] rendered here as SVG paths */}
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
            const onCommand = commandHandlers[node.id] ?? noop;
            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: node.position.x,
                  top: node.position.y,
                }}
              >
                <Component
                  node={node}
                  selected={false}
                  onCommand={onCommand}
                  onSelect={noop}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
