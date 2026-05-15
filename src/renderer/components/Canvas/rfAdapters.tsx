/**
 * rfAdapters.tsx — thin bridge between boardStore Node/Edge types and
 * React Flow's node/edge shapes.
 *
 * Rules (Decision #13 §B):
 *  - boardStore is the single source of truth.
 *  - Adapter HOC reads data props forwarded by RF; never writes to RF state.
 *  - Handles render inside the adapter wrapper so node bodies stay untouched.
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type {
  Node as RFNode,
  Edge as RFEdge,
  NodeProps as RFNodeProps,
} from '@xyflow/react';
import type { Node } from '../../../shared/types/node';
import type { Edge } from '../../../shared/types/edge';
import type { NodeProps } from '../nodes/types';
import type { ComponentType } from 'react';

// ── RFNodeData — the shape stored in RF's node.data ───────────────────────────
// Extends Record<string,unknown> as required by RF's Node<Data> constraint.
export interface RFNodeData extends Record<string, unknown> {
  node: Node;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  onSelect: () => void;
  slotIndex?: number | undefined;
  slotTotal?: number | undefined;
  onReorderDrop?: ((fromSlotIndex: number, toSlotIndex: number) => void) | undefined;
  onReorderHover?: ((candidateSlotIndex: number) => void) | undefined;
  onReorderEnd?: (() => void) | undefined;
  slotCentersX?: readonly number[] | undefined;
}

// Convenience alias for the full RF node type with our data.
export type KrnlRFNode = RFNode<RFNodeData>;

// ── toRfNode ──────────────────────────────────────────────────────────────────

// Pre-seeded width/height so RF doesn't fire warning #015 ("trying to drag a
// node that is not initialized") when a freshly-added node is dragged before
// the ResizeObserver has fired its first measurement. These are approximate
// — RF replaces them with measured values once the ResizeObserver delivers.
//
// Wave C (LifeOS UI refresh) — mother kinds bumped to 500×500 so mothers
// read as primary canvas anchors against the 220×120 child task cards.
// Sync point: MOTHER_WIDTH / MOTHER_HEIGHT in
// src/renderer/components/nodes/MotherFrame/index.tsx + seed positions in
// src/main/persistence/board.ts. A mismatch makes the RF selection ring
// sit off the visible card edge — see ADR 0006.
const INITIAL_DIMS_BY_KIND: Record<string, { width: number; height: number }> = {
  'todo.task':   { width: 220, height: 120 },
  'todo':        { width: 500, height: 500 },
  'pomo':        { width: 500, height: 500 },
  'ai':          { width: 500, height: 500 },
  'habit':       { width: 500, height: 500 },
  'terminal':    { width: 500, height: 500 },
  'calendar':    { width: 500, height: 500 },
  'clock':       { width: 500, height: 500 },
  'habit.lane':  { width: 280, height: 170 },
  'text':        { width: 260, height: 120 },
  'image':       { width: 240, height: 180 },
};

export function toRfNode(
  node: Node,
  ctx: {
    onCommand: (command: string, args?: Record<string, unknown>) => void;
    onSelect: () => void;
    slotIndex?: number | undefined;
    slotTotal?: number | undefined;
    onReorderDrop?: ((fromSlotIndex: number, toSlotIndex: number) => void) | undefined;
    onReorderHover?: ((candidateSlotIndex: number) => void) | undefined;
    onReorderEnd?: (() => void) | undefined;
    slotCentersX?: readonly number[] | undefined;
  }
): KrnlRFNode {
  // Decision 22.2 Fix 5 — add a CSS class keyed on node.kind so the todo-family
  // selection ring can be scoped in reactflow-theme.css without inline style overrides.
  // node.kind may contain "." (e.g. "todo.task") — replace with "--" for a valid class name.
  // Add "krnl-mother" class so the body.krnl-reordering slide-animation CSS rule
  // can target all mother nodes during a reorder gesture.
  const kindClass = node.isMother
    ? `krnl-kind-${node.kind.replace('.', '--')} krnl-mother`
    : `krnl-kind-${node.kind.replace('.', '--')}`;
  const initialDims = INITIAL_DIMS_BY_KIND[node.kind];
  // Prefer state.width/height when the node stores its own size (text, image)
  // so the RF wrapper — and therefore the NodeResizer ring + left/right
  // Handles — stays glued to the visible card edges across resizes. Falls
  // back to the kind's initial-dims row to suppress RF warning #015 on the
  // first paint before any resize has occurred.
  const stateAny = node.state as { width?: number; height?: number };
  const w = stateAny.width ?? initialDims?.width;
  const h = stateAny.height ?? initialDims?.height;
  const sizeFields =
    w !== undefined && h !== undefined
      ? { width: w, height: h, measured: { width: w, height: h } }
      : {};
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    draggable: !node.isMother,
    selectable: true,
    className: kindClass,
    ...sizeFields,
    data: {
      node,
      onCommand: ctx.onCommand,
      onSelect: ctx.onSelect,
      slotIndex: ctx.slotIndex,
      slotTotal: ctx.slotTotal,
      onReorderDrop: ctx.onReorderDrop,
      onReorderHover: ctx.onReorderHover,
      onReorderEnd: ctx.onReorderEnd,
      slotCentersX: ctx.slotCentersX,
    },
  };
}

// ── toRfEdge ──────────────────────────────────────────────────────────────────

export function toRfEdge(
  edge: Edge,
  srcKind: string,
  tgtKind: string
): RFEdge {
  const isTaskFlow =
    (srcKind === 'todo.task' && (tgtKind === 'todo.task' || tgtKind === 'habit.lane')) ||
    (srcKind === 'habit.lane' && tgtKind === 'todo.task');
  return {
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    type: isTaskFlow ? 'task-flow' : 'default',
    // animated:false on task-flow edges so RF does NOT attach its `.animated`
    // class. RF's default `dashdraw` keyframe sweeps stroke-dashoffset 10 → 0
    // over 0.5s, which is a 10-unit sweep on our 22-unit `strokeDasharray`
    // ('14 8'). Mismatched period → visible snap every 0.5s = the stutter
    // bug. Instead, our period-matched `krnl-task-flow-dash` keyframe in
    // reactflow-theme.css runs on the task-flow edge path directly (1.6s,
    // 22 → 0) so the dash march loops seamlessly without RF's interference.
    animated: false,
    data: { edge },
  };
}

// ── createNodeAdapter ─────────────────────────────────────────────────────────

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink-3)',
  opacity: 0.7,
  // RF positions Handles at the absolute left/right edge of the node. Without
  // an explicit z-index, nodes whose body has `position: relative` content
  // (e.g. ImageNode's image-frame) create a new stacking context and bury
  // default-z handles. Lift to z-index 10 to keep connector dots in front.
  zIndex: 10,
};

/**
 * HOC that adapts a KRNL NodeProps component to a React Flow node component.
 * Adds source/target Handles on left/right so node bodies are not touched.
 * Memoised for RF's identity comparison.
 */
export function createNodeAdapter<S = unknown, C = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Inner: ComponentType<NodeProps<S, C>>
): ComponentType<RFNodeProps<KrnlRFNode>> {
  function NodeAdapter(props: RFNodeProps<KrnlRFNode>) {
    const { data, selected } = props;
    const { node, onCommand, onSelect, slotIndex, slotTotal, onReorderDrop, onReorderHover, onReorderEnd, slotCentersX } = data;
    // Mother nodes don't connect — render zero handles. Children get
    // interactive handles so users can wire edges between them.
    const showHandles = !node.isMother;
    return (
      <>
        {showHandles && (
          <Handle
            type="target"
            position={Position.Left}
            style={handleStyle}
            isConnectable={true}
          />
        )}
        <Inner
          node={node as Node<S, C>}
          selected={selected === true}
          onCommand={onCommand}
          onSelect={onSelect}
          {...(slotIndex !== undefined ? { slotIndex: slotIndex as number } : {})}
          {...(slotTotal !== undefined ? { slotTotal: slotTotal as number } : {})}
          {...(onReorderDrop !== undefined ? { onReorderDrop: onReorderDrop as (fromSlotIndex: number, toSlotIndex: number) => void } : {})}
          {...(onReorderHover !== undefined ? { onReorderHover: onReorderHover as (candidateSlotIndex: number) => void } : {})}
          {...(onReorderEnd !== undefined ? { onReorderEnd: onReorderEnd as () => void } : {})}
          {...(slotCentersX !== undefined ? { slotCentersX: slotCentersX as readonly number[] } : {})}
        />
        {showHandles && (
          <Handle
            type="source"
            position={Position.Right}
            style={handleStyle}
            isConnectable={true}
          />
        )}
      </>
    );
  }

  NodeAdapter.displayName = `NodeAdapter(${Inner.displayName ?? Inner.name ?? 'Unknown'})`;
  return React.memo(NodeAdapter) as ComponentType<RFNodeProps<KrnlRFNode>>;
}
