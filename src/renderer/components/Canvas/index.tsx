import { useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

export function Canvas() {
  const board = useBoardStore((s) => s.board);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: -160, zoom: 1 });

  // TODO (Week 2): implement full pan + zoom with pointer events
  // Camera centers on (0, 160) by default so all four mothers are visible

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--paper)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    >
      {/* Canvas transform layer */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* SVG edge layer — renders behind nodes */}
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          {/* TODO (Week 3): render Edge[] as SVG paths with acid pulse animation */}
        </svg>

        {/* Node layer */}
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
          board.nodes.map((node) => (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.position.x,
                top: node.position.y,
              }}
            >
              {/* TODO (Week 2): route node.kind to the correct NodeKind.render() */}
              <div
                style={{
                  border: '1px solid var(--paper-3)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--node-bg)',
                  padding: '14px 16px',
                  minWidth: 200,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {node.isMother ? '▙ ' : '● '}{node.kind}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
