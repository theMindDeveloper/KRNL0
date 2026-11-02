// A pen stroke as a canvas node, so drawings select, box-select and move like
// everything else. The stroke itself lives on board.drawings (flow
// coordinates); this node is derived from it: positioned at the stroke's
// bounding box, drawn above every other node. Only the ink takes the mouse;
// the empty part of the box lets clicks through to whatever is underneath.
import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { DrawStroke } from '../../../shared/types/board';
import { strokePath } from './DrawLayer';

export const STROKE_NODE_PREFIX = 'stroke:';
export const STROKE_Z = 100000;
const PAD = 8;

export type StrokeNodeData = { stroke: DrawStroke };

export function strokeBox(s: DrawStroke): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of s.points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  // Arrow heads and thick strokes reach past the points.
  const pad = PAD + s.size * (s.tool === 'arrow' ? 2.5 : 1);
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export const DrawStrokeNode = memo(function DrawStrokeNode({ data, selected }: NodeProps) {
  const { stroke } = data as StrokeNodeData;
  const b = strokeBox(stroke);
  const d = strokePath(stroke.points, stroke.size, stroke.tool);
  return (
    <svg
      width={b.w}
      height={b.h}
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
    >
      {selected && (
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="none"
          stroke="var(--acid, #c9f158)" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      )}
      {/* Wider invisible hit area so thin lines are easy to grab. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'stroke', cursor: 'move' }} />
      <path d={d} fill={stroke.color}
        opacity={stroke.tool === 'highlighter' ? 0.32 : stroke.tool === 'marker' ? 0.9 : 1}
        style={{ pointerEvents: 'fill', cursor: 'move' }} />
    </svg>
  );
});
