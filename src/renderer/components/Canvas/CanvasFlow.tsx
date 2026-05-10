/**
 * CanvasFlow.tsx — React Flow canvas replacing the custom Canvas.
 * Decision #13 §C–F.
 *
 * boardStore is the single source of truth. nodes + edges are derived via
 * useMemo from board.nodes / board.edges. RF runs in controlled mode.
 */

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  BaseEdge,
  getBezierPath,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Viewport,
  type EdgeProps,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBoardStore } from '../../store/boardStore';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { NODE_TYPES } from '../nodes/registry';
import { toRfNode, toRfEdge } from './rfAdapters';
import { makeCommandHandler } from './commandDispatch';
import { Dock } from '../Dock';
import type { Node as KrnlNode } from '../../../shared/types/node';
import type { NodeKind } from '../../../shared/types/node';

// ── Edge components ───────────────────────────────────────────────────────────

function TaskFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: 'var(--cyan)',
        strokeWidth: 2,
        strokeDasharray: '14 8',
      }}
    />
  );
}

function DefaultEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = (data as { edge?: { enabled?: boolean } } | undefined)?.edge?.enabled === true;
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: active ? 'var(--acid)' : 'var(--ink-3)',
        strokeWidth: active ? 1.5 : 1,
        strokeDasharray: active ? undefined : '4 4',
        opacity: active ? 1 : 0.6,
        filter: active ? 'url(#acid-glow)' : undefined,
      }}
    />
  );
}

const EDGE_TYPES = {
  'task-flow': TaskFlowEdge,
  default: DefaultEdge,
};

// ── Per-id stable caches — keep RF/React.memo identity across renders ────────
// Without these, every store update creates fresh closures → adapter memo
// breaks → all nodes re-render every frame (the lag bug).
const commandHandlerCache = new Map<string, ReturnType<typeof makeCommandHandler>>();
const selectHandlerCache = new Map<string, () => void>();
const rfNodeCache = new Map<string, { src: KrnlNode; rf: ReturnType<typeof toRfNode> }>();

function getCommandHandler(nodeId: string): ReturnType<typeof makeCommandHandler> {
  let handler = commandHandlerCache.get(nodeId);
  if (!handler) {
    handler = makeCommandHandler(nodeId);
    commandHandlerCache.set(nodeId, handler);
  }
  return handler;
}

function getSelectHandler(
  nodeId: string,
  selectNode: (id: string | null) => void
): () => void {
  let handler = selectHandlerCache.get(nodeId);
  if (!handler) {
    handler = () => selectNode(nodeId);
    selectHandlerCache.set(nodeId, handler);
  }
  return handler;
}

function getMemoizedRfNode(
  node: KrnlNode,
  ctx: { onCommand: ReturnType<typeof makeCommandHandler>; onSelect: () => void }
) {
  const cached = rfNodeCache.get(node.id);
  // updateNode rewrites a single node ref on change; others stay identical.
  if (cached && cached.src === node) return cached.rf;
  const rf = toRfNode(node, ctx);
  rfNodeCache.set(node.id, { src: node, rf });
  return rf;
}

// ── Inner canvas (must be inside ReactFlowProvider) ───────────────────────────

// CanvasFlowInner receives the initial viewport as a prop (already loaded).
// This ensures defaultViewport captures the persisted value from board.json.
interface CanvasFlowInnerProps {
  initialViewport: { x: number; y: number; zoom: number };
}

function CanvasFlowInner({ initialViewport }: CanvasFlowInnerProps) {
  const board = useBoardStore((s) => s.board);
  const selectNode = useBoardStore((s) => s.selectNode);
  const updateNode = useBoardStore((s) => s.updateNode);
  const setViewport = useBoardStore((s) => s.setViewport);
  const addNode = useBoardStore((s) => s.addNode);
  const swapMotherSlots = useBoardStore((s) => s.swapMotherSlots);
  const { screenToFlowPosition } = useReactFlow();

  // Start the debounced viewport persister (Decision #7).
  useViewportPersistence();

  // ── Dock add-node handler — creates text/image nodes at canvas center ─────
  const handleAddNode = useCallback((args: { kind: NodeKind }) => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const newNode: KrnlNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: args.kind,
      position: { x: center.x, y: center.y },
      state: args.kind === 'text' ? { text: '' } : { src: null },
      config: {},
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  }, [addNode, screenToFlowPosition]);

  // ── Derive RF nodes from boardStore — memoized per-id ───────────────────
  // Stable RFNode identity unless the underlying KrnlNode reference changes.
  const rfNodes = useMemo(() => {
    if (!board) return [];

    // Compute slot ordering for mother nodes (sorted by position.x)
    const motherNodes = board.nodes
      .filter((n: KrnlNode) => n.isMother)
      .slice()
      .sort((a: KrnlNode, b: KrnlNode) => a.position.x - b.position.x);
    const slotTotal = motherNodes.length;
    const slotIndexMap = new Map<string, number>(
      motherNodes.map((n: KrnlNode, i: number) => [n.id, i + 1])
    );

    return board.nodes.map((node: KrnlNode) => {
      const onCommand = getCommandHandler(node.id);
      const onSelect = getSelectHandler(node.id, selectNode);

      if (!node.isMother) {
        return getMemoizedRfNode(node, { onCommand, onSelect });
      }

      // Mother node: compute slot context and reorder handlers
      const slotIndex = slotIndexMap.get(node.id) ?? 1;
      const onMoveLeft = slotIndex > 1
        ? () => {
            const prevMother = motherNodes[slotIndex - 2];
            if (prevMother) {
              swapMotherSlots(node.id, prevMother.id);
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            }
          }
        : undefined;
      const onMoveRight = slotIndex < slotTotal
        ? () => {
            const nextMother = motherNodes[slotIndex];
            if (nextMother) {
              swapMotherSlots(node.id, nextMother.id);
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            }
          }
        : undefined;

      // For mother nodes we bypass the rfNodeCache since slot context changes
      return toRfNode(node, { onCommand, onSelect, slotIndex, slotTotal, onMoveLeft, onMoveRight });
    });
  }, [board, selectNode, swapMotherSlots]);

  // ── Derive RF edges from boardStore ──────────────────────────────────────
  const rfEdges = useMemo(() => {
    if (!board) return [];
    // Build id → kind map once for O(1) lookups per edge.
    const kindMap = new Map<string, string>(
      board.nodes.map((n: KrnlNode) => [n.id, n.kind])
    );
    return board.edges.map((edge) => {
      const srcKind = kindMap.get(edge.from.nodeId) ?? '';
      const tgtKind = kindMap.get(edge.to.nodeId) ?? '';
      return toRfEdge(edge, srcKind, tgtKind);
    });
  }, [board]);

  // ── onNodesChange — controlled mode per Decision #13 §C ──────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position') {
          // Only commit when drag ends (dragging === false) to avoid 60fps writes.
          if (!change.dragging && change.position) {
            updateNode(change.id, { position: change.position });
            // Persist after drag ends.
            const updated = useBoardStore.getState().board;
            if (updated) void window.krnl?.boardSave(updated);
          }
          // While dragging === true: RF handles the internal preview, no store write.
        } else if (change.type === 'select') {
          // Mirror single-select to store (multi-select is not persisted in v1).
          if (change.selected) {
            selectNode(change.id);
          }
        }
        // 'remove', 'dimensions', 'add' — all ignored per §C.
      }
    },
    [updateNode, selectNode]
  );

  // ── onEdgesChange — ignored for v1 (no edge create/delete UX) ────────────
  const onEdgesChange = useCallback((_changes: EdgeChange[]) => {
    // no-op for v1
  }, []);

  // ── onMoveEnd — sync viewport to store only when pan/zoom gesture ends ──
  // onMove fires at 60fps and was causing Zustand updates + StatusBar re-renders
  // on every frame. onMoveEnd fires once per gesture (mouse-up / touch-end).
  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [setViewport]
  );

  // ── onSelectionChange — mirror first selected node to store ──────────────
  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      selectNode(nodes[0]?.id ?? null);
    },
    [selectNode]
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      defaultViewport={initialViewport}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onMoveEnd={onMoveEnd}
      onSelectionChange={onSelectionChange}
      deleteKeyCode={null}
      fitView={false}
      minZoom={0.25}
      maxZoom={4}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'var(--paper)' }}
    >
      {/* Dotted grid background — replaces the radial gradient from Canvas */}
      <Background
        variant={BackgroundVariant.Dots}
        gap={32}
        size={1.5}
        color="var(--grid-strong)"
      />

      {/* Controls — zoom in/out, fit view */}
      <Controls position="bottom-right" showInteractive={false} />

      {/* MiniMap — node colours keyed by kind per Decision #13 §A */}
      <MiniMap
        position="bottom-right"
        nodeColor={(node) => {
          if (node.type === 'term') return 'var(--ink)';
          if (node.type === 'todo.task' || node.type === 'pomo.session' || node.type === 'habit.day') {
            return 'var(--cyan)';
          }
          return 'var(--spine)';
        }}
        maskColor="rgba(14,13,11,0.7)"
        pannable
        zoomable
      />

      {/* SVG defs for the acid-glow filter used by active edges */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="acid-glow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#c9f158" floodOpacity="0.7" />
          </filter>
        </defs>
      </svg>

      {/* Left dock — Phase 6: wire to create child node kinds once bodies exist */}
      <Panel position="top-left" style={{ margin: 0, padding: 0 }}>
        <Dock onAddNode={handleAddNode} />
      </Panel>
    </ReactFlow>
  );
}

// ── Public export — defers mount until board is loaded ────────────────────────
// RF reads `defaultViewport` exactly once at mount. Mounting only after
// setBoard() has run ensures the persisted viewport from board.json is applied
// rather than the default {0, 160, 1} placeholder.
//
// NOTE: ReactFlowProvider is no longer here — it lives in App.tsx so that
// TopBar (useReactFlow for fitView) and StatusBar (useReactFlow for zoom) share
// the same RF instance context as CanvasFlowInner.

export function CanvasFlow() {
  const viewport = useBoardStore((s) => s.viewport);
  const board = useBoardStore((s) => s.board);

  // Don't mount until board is loaded so defaultViewport has the persisted value.
  if (!board) return null;

  return <CanvasFlowInner initialViewport={viewport} />;
}
