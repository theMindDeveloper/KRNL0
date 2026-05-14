/**
 * CanvasFlow.tsx — React Flow canvas replacing the custom Canvas.
 * Decision #13 §C–F.
 *
 * boardStore is the single source of truth. nodes + edges are derived via
 * useMemo from board.nodes / board.edges. RF runs in controlled mode.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  BaseEdge,
  getBezierPath,
  useReactFlow,
  applyNodeChanges,
  type NodeChange,
  type EdgeChange,
  type Edge as RFEdge,
  type Viewport,
  type EdgeProps,
  type OnSelectionChangeParams,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBoardStore } from '../../store/boardStore';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { NODE_TYPES } from '../nodes/registry';
import { toRfNode, toRfEdge, type KrnlRFNode } from './rfAdapters';
import { makeCommandHandler, deleteTaskNodesCascade } from './commandDispatch';
import { Dock } from '../Dock';
import { ContextMenu } from '../ContextMenu';
import { ingestImageFile, initialDisplaySize } from './dropImage';
import type { Node as KrnlNode } from '../../../shared/types/node';
import type { NodeKind } from '../../../shared/types/node';
import type { Edge as KrnlEdge } from '../../../shared/types/edge';
import type { Connection } from '@xyflow/react';

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
  // Styling mirrors frontendref/LifeOS Whiteboard.html .connections path.task-edge
  // (cyan, 3px, rounded caps, cyan drop-shadow glow) PLUS an opacity gradient
  // along source→target so the trail reads as "energy flowing into the task":
  // dim at the source side, full glow at the target side.
  //
  // gradientUnits=userSpaceOnUse means the gradient axis is anchored to the
  // actual (sourceX,sourceY)→(targetX,targetY) coordinates rather than the
  // path's bounding box — so the fade direction is correct for any edge
  // orientation (horizontal, vertical, diagonal, curved).
  //
  // The seamless dash march comes from .react-flow__edge-task-flow.animated CSS
  // in reactflow-theme.css — period-matched to dasharray "14 8" so no hitch.
  const gradId = `krnl-task-flow-grad-${id}`;
  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.18" />
          <stop offset="45%" stopColor="var(--cyan)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--cyan)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: `url(#${gradId})`,
          strokeWidth: 3,
          strokeDasharray: '14 8',
          strokeLinecap: 'round',
          opacity: 1,
          filter: 'drop-shadow(0 0 3px rgba(78, 168, 176, 0.30))',
        }}
      />
    </>
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
const rfEdgeCache = new Map<
  string,
  { src: KrnlEdge; srcKind: string; tgtKind: string; rf: ReturnType<typeof toRfEdge> }
>();
const rfMotherCache = new Map<
  string,
  {
    src: KrnlNode;
    slotIndex: number;
    slotTotal: number;
    hasLeft: boolean;
    hasRight: boolean;
    rf: ReturnType<typeof toRfNode>;
  }
>();

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

function getMemoizedRfEdge(
  edge: KrnlEdge,
  srcKind: string,
  tgtKind: string
): ReturnType<typeof toRfEdge> {
  const cached = rfEdgeCache.get(edge.id);
  // updateNode keeps board.edges reference stable → during a drag tick the
  // edge ref + kinds are unchanged → cache hit → RF skips edge re-render.
  if (
    cached &&
    cached.src === edge &&
    cached.srcKind === srcKind &&
    cached.tgtKind === tgtKind
  ) {
    return cached.rf;
  }
  const rf = toRfEdge(edge, srcKind, tgtKind);
  rfEdgeCache.set(edge.id, { src: edge, srcKind, tgtKind, rf });
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
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

  // Start the debounced viewport persister (Decision #7).
  useViewportPersistence();

  // ── Fit-view on first launch (Architect Amendment B) ──────────────────────
  // When the persisted viewport equals the legacy seed sentinel {0, 220, 1},
  // it means the user has never panned/zoomed (fresh board) — or the viewport
  // was previously clobbered by the now-removed migrateMotherPositions bug.
  // In that case we fire fitView once so all 5 mothers are visible in the
  // initial view. The didFitRef guard ensures this runs at most once per session.
  const didFitRef = useRef(false);
  const rfNodes = useBoardStore((s) => s.board?.nodes ?? []);

  useEffect(() => {
    if (didFitRef.current) return;
    if (rfNodes.length === 0) return;
    if (
      initialViewport.x !== 0 ||
      initialViewport.y !== 220 ||
      initialViewport.zoom !== 1
    ) {
      // User has a real persisted viewport — do not fit.
      didFitRef.current = true;
      return;
    }
    // Sentinel matched — fit to mother nodes.
    const motherIds = rfNodes
      .filter((n) => (n as { isMother?: boolean }).isMother === true)
      .map((n) => ({ id: (n as { id: string }).id }));
    if (motherIds.length === 0) return;
    fitView({ padding: 0.15, includeHiddenNodes: false, nodes: motherIds, duration: 0 });
    didFitRef.current = true;
  }, [rfNodes.length, initialViewport, fitView]);

  const addEdge = useBoardStore((s) => s.addEdge);
  const removeNode = useBoardStore((s) => s.removeNode);
  const removeEdge = useBoardStore((s) => s.removeEdge);

  // Right-click context menu state. Pinned to the screen position of the
  // event; cleared on outside click / Escape / window blur. Only opened for
  // non-mother nodes — mothers handle right-click internally (HabitNode per
  // habit-row menu, TodoNode per-row menu, etc.).
  // nodeIds holds the full batch when the right-click target is part of a
  // multi-selection (marquee). For single-node right-click it's just `[id]`.
  const [ctxMenu, setCtxMenu] = useState<
    { x: number; y: number; nodeIds: string[] } | null
  >(null);

  const [edgeCtxMenu, setEdgeCtxMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
  } | null>(null);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, rfNode: KrnlRFNode) => {
      event.preventDefault();
      const inner = rfNode.data.node;
      // Mother nodes own their own right-click UX. Mothers are pinned, so a
      // canvas-level delete is meaningless on them and would visually suppress
      // the per-row menus (HabitNode rows, TodoNode rows, etc.).
      if (inner.isMother) return;

      // Batch mode: if the right-clicked node is part of a multi-selection,
      // operate on the whole selection. Otherwise just on the clicked node.
      // Mothers are excluded from the batch (they're undeletable).
      const selectedIds = (getNodes() as KrnlRFNode[])
        .filter((n) => n.selected && !n.data.node.isMother)
        .map((n) => n.id);
      const nodeIds =
        selectedIds.length > 1 && selectedIds.includes(inner.id)
          ? selectedIds
          : [inner.id];

      setCtxMenu({ x: event.clientX, y: event.clientY, nodeIds });
    },
    [getNodes],
  );

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const handleEdgeContextMenu = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    setEdgeCtxMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeCtxMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', closeCtxMenu);
    };
  }, [ctxMenu, closeCtxMenu]);

  const deleteFromCtxMenu = useCallback(() => {
    if (!ctxMenu) return;
    const taskIds: string[] = [];
    const otherIds: string[] = [];
    const currentBoard = useBoardStore.getState().board;
    for (const id of ctxMenu.nodeIds) {
      const node = currentBoard?.nodes.find((n) => n.id === id);
      if (node?.kind === 'todo.task') taskIds.push(id);
      else otherIds.push(id);
    }
    if (taskIds.length > 0) deleteTaskNodesCascade(taskIds);
    for (const id of otherIds) removeNode(id);
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
    closeCtxMenu();
  }, [ctxMenu, removeNode, closeCtxMenu]);

  // Global undo/redo: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z = redo.
  // Skipped when focus is on an editable surface so it doesn't fight inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useBoardStore.getState().undo();
        const updated = useBoardStore.getState().board;
        if (updated) void window.krnl?.boardSave(updated);
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        useBoardStore.getState().redo();
        const updated = useBoardStore.getState().board;
        if (updated) void window.krnl?.boardSave(updated);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Hidden file input used when the dock's "image" button is clicked — opens
  // the OS file picker and spawns a fully-formed ImageNode (with assetId)
  // rather than an empty placeholder node.
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageDropPos = useRef<{ x: number; y: number } | null>(null);

  const spawnImageNodeFromFile = useCallback(async (
    file: File,
    pos: { x: number; y: number },
  ) => {
    const result = await ingestImageFile(file);
    if (!result) return;
    const { width, height } = initialDisplaySize(
      result.naturalWidth,
      result.naturalHeight,
    );
    const newNode: KrnlNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'image',
      position: { x: pos.x, y: pos.y },
      state: {
        assetId: result.assetId,
        naturalWidth: result.naturalWidth,
        naturalHeight: result.naturalHeight,
        mimeType: result.mimeType,
        alt: result.alt,
        width,
        height,
      },
      config: {},
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  }, [addNode]);

  const onPickImageFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const pos = pendingImageDropPos.current ?? screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    pendingImageDropPos.current = null;
    await spawnImageNodeFromFile(file, pos);
  }, [screenToFlowPosition, spawnImageNodeFromFile]);

  // ── Dock add-node handler — text spawns at canvas center; image opens
  //   the OS file picker. No empty placeholder nodes for images.
  const handleAddNode = useCallback((args: { kind: NodeKind }) => {
    if (args.kind === 'image') {
      imageFileInputRef.current?.click();
      return;
    }
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const defaultState: Record<NodeKind, Record<string, unknown>> = {
      pomo: {}, todo: {}, habit: {}, term: {}, calendar: {},
      // clock is a permanent mother — never spawnable via handleAddNode.
      // Entry required only for Record<NodeKind, ...> type completeness.
      clock: {},
      'pomo.session': {}, 'todo.task': {}, 'habit.day': {},
      text: { text: '' },
      image: {},
    };
    const newNode: KrnlNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: args.kind,
      position: { x: center.x, y: center.y },
      state: defaultState[args.kind],
      config: {},
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  }, [addNode, screenToFlowPosition]);

  // ── Drag-drop image files onto the canvas (image-node F1/F2) ──────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    for (const file of files) {
      await spawnImageNodeFromFile(file, pos);
      pos.x += 24;
      pos.y += 24;
    }
  }, [screenToFlowPosition, spawnImageNodeFromFile]);

  // ── onConnect — wire a visual link edge between two non-mother nodes ──────
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    if (conn.source === conn.target) return;

    const board = useBoardStore.getState().board;
    const nodes = board?.nodes ?? [];
    const existingEdges = board?.edges ?? [];
    const sourceNode = nodes.find((n) => n.id === conn.source);
    const targetNode = nodes.find((n) => n.id === conn.target);
    const srcIsTask = sourceNode?.kind === 'todo.task';
    const tgtIsTask = targetNode?.kind === 'todo.task';
    const srcIsHabitLane = sourceNode?.kind === 'habit.lane';
    const tgtIsHabitLane = targetNode?.kind === 'habit.lane';
    const isTaskFlow =
      (srcIsTask && (tgtIsTask || tgtIsHabitLane)) ||
      (srcIsHabitLane && tgtIsTask);
    const event = isTaskFlow ? 'task.next' : 'link';

    // Dedup: refuse to add a second edge with the same (source, target, event).
    // Drag-to-connect is easy to fire twice; the canvas should not accumulate
    // duplicates that visually overlap and break the chain index counters.
    const duplicate = existingEdges.some(
      (e) =>
        e.from.nodeId === conn.source &&
        e.to.nodeId === conn.target &&
        e.from.event === event,
    );
    if (duplicate) return;

    const targetCommand = tgtIsHabitLane ? 'habit.markDone' : 'task.activate';
    const edge: KrnlEdge = isTaskFlow
      ? {
          id: `edge-${crypto.randomUUID()}`,
          from: { nodeId: conn.source, event: 'task.next' },
          to: { nodeId: conn.target, command: targetCommand },
          enabled: true,
        }
      : {
          id: `edge-${crypto.randomUUID()}`,
          from: { nodeId: conn.source, event: 'link' },
          to: { nodeId: conn.target, command: 'link' },
          enabled: true,
        };

    addEdge(edge);
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  }, [addEdge]);

  // ── Derive RF nodes from boardStore — memoized per-id ───────────────────
  // Stable RFNode identity unless the underlying KrnlNode reference changes.
  const derivedNodes = useMemo(() => {
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

      // Mother node: cache by (node ref, slotIndex, slotTotal, hasLeft, hasRight).
      // Without this cache, every drag tick built a fresh RFNode for every
      // mother — fresh `data` object with fresh `onMoveLeft`/`onMoveRight`
      // closures — defeating React.memo on the adapter and forcing PomoNode /
      // TodoNode / HabitNode / **TerminalNode (with its xterm instance)** to
      // re-render 60fps. That was the dominant drag-lag cause.
      const slotIndex = slotIndexMap.get(node.id) ?? 1;
      const hasLeft = slotIndex > 1;
      const hasRight = slotIndex < slotTotal;
      const cached = rfMotherCache.get(node.id);
      if (
        cached &&
        cached.src === node &&
        cached.slotIndex === slotIndex &&
        cached.slotTotal === slotTotal &&
        cached.hasLeft === hasLeft &&
        cached.hasRight === hasRight
      ) {
        return cached.rf;
      }

      const onMoveLeft = hasLeft
        ? () => {
            const prevMother = motherNodes[slotIndex - 2];
            if (prevMother) {
              swapMotherSlots(node.id, prevMother.id);
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            }
          }
        : undefined;
      const onMoveRight = hasRight
        ? () => {
            const nextMother = motherNodes[slotIndex];
            if (nextMother) {
              swapMotherSlots(node.id, nextMother.id);
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            }
          }
        : undefined;

      const rf = toRfNode(node, {
        onCommand,
        onSelect,
        slotIndex,
        slotTotal,
        onMoveLeft,
        onMoveRight,
      });
      rfMotherCache.set(node.id, { src: node, slotIndex, slotTotal, hasLeft, hasRight, rf });
      return rf;
    });
  }, [board, selectNode, swapMotherSlots]);

  // ── Local RF nodes state — fixes RF warning #015 + drag stutter ──────────
  // RF emits 'dimensions' / 'position' (during drag) / 'select' changes that
  // it expects us to feed back via applyNodeChanges. Routing every drag tick
  // through Zustand was making the whole render tree re-execute at 60fps
  // (StatusBar, mother nodes, edges) and the dropped dimensions changes were
  // causing RF to warn about "uninitialized" nodes and fall back to a slow
  // drag path. Now Zustand is still the persisted source of truth, but RF
  // owns the live working copy:
  //   - When the store changes (commands, add, remove) → effect syncs into
  //     local state, but ONLY when not currently dragging.
  //   - During drag → onNodesChange mutates local state only. Zustand is
  //     untouched. Zero re-renders outside RF's internal repositioning.
  //   - On drag end → commit final position to Zustand once; the effect's
  //     sync becomes a no-op because the new position already matches.
  const [nodes, setNodes] = useState<KrnlRFNode[]>(derivedNodes);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setNodes(derivedNodes);
    }
  }, [derivedNodes]);

  // ── Derive RF edges from boardStore ──────────────────────────────────────
  // Each edge is memoised by id; cache hits when edge ref + endpoint kinds are
  // unchanged. During a node drag, board.edges keeps its reference and node
  // kinds don't change → every edge returns its cached RFEdge → RF skips the
  // edge component re-render. Only the dragged node's edges' bezier paths are
  // recomputed by RF itself based on the new source/target positions.
  const rfEdges = useMemo(() => {
    if (!board) return [];
    const kindMap = new Map<string, string>(
      board.nodes.map((n: KrnlNode) => [n.id, n.kind])
    );
    return board.edges.map((edge) => {
      const srcKind = kindMap.get(edge.from.nodeId) ?? '';
      const tgtKind = kindMap.get(edge.to.nodeId) ?? '';
      return getMemoizedRfEdge(edge, srcKind, tgtKind);
    });
  }, [board]);

  // ── onNodesChange — apply every change locally; commit only on drag end ──
  // Local-first: applyNodeChanges absorbs position/dimensions/select changes
  // into the live RF nodes array without touching Zustand. This is what makes
  // the drag smooth — no store cascade, no StatusBar re-render, no mother
  // node re-render per frame. Zustand is touched only when:
  //   - drag ends (commit final position + persist)
  //   - selection changes (mirror to store for sys/CLI integration)
  const onNodesChange = useCallback(
    (changes: NodeChange<KrnlRFNode>[]) => {
      setNodes((nds) => applyNodeChanges<KrnlRFNode>(changes, nds));

      for (const change of changes) {
        if (change.type === 'position') {
          // Track drag state so the store-sync effect doesn't clobber local
          // nodes mid-drag.
          if (change.dragging === true) {
            isDraggingRef.current = true;
          } else if (change.dragging === false) {
            isDraggingRef.current = false;
            if (change.position) {
              updateNode(change.id, { position: change.position });
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            }
          }
        }
        // 'select' changes are handled by onSelectionChange below — calling
        // selectNode per-change here would clobber multi-selection (last
        // selected id wins, others lost from the store's point of view).
        // 'dimensions' — absorbed by applyNodeChanges above; this is what
        // resolves RF error #015 ("trying to drag a node that is not
        // initialized"). Without it RF takes a slow non-measured drag path.
      }
    },
    [updateNode]
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

  // ── onSelectionChange — mirror to store only when a single node is picked.
  // For marquee multi-select we leave the store's selectedNodeId as null so
  // single-node-aware features (StatusBar, sys CLI) don't get a confusing
  // "active" id while RF is showing many nodes selected.
  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      selectNode(nodes.length === 1 ? nodes[0]!.id : null);
    },
    [selectNode]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      defaultViewport={initialViewport}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={handleEdgeContextMenu}
      onPaneClick={closeCtxMenu}
      onPaneContextMenu={closeCtxMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onMoveEnd={onMoveEnd}
      onSelectionChange={onSelectionChange}
      deleteKeyCode={null}
      // Marquee selection on left-drag (empty canvas); pan with middle/right-drag.
      // Right-click on a node/edge still fires onNodeContextMenu / onEdgeContextMenu
      // because that's a press-release event, not a drag.
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={[1, 2]}
      multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
      fitView={false}
      minZoom={0.25}
      maxZoom={4}
      // Perf + terminal-keyboard fix: stop RF from grabbing focus or arrow keys
      // away from xterm/inputs inside nodes.
      nodesFocusable={false}
      disableKeyboardA11y
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

      {/* Left dock */}
      <Panel position="top-left" style={{ margin: 0, padding: 0 }}>
        <Dock onAddNode={handleAddNode} />
      </Panel>

      {/* Hidden file picker for the dock's "image" button (no placeholder
          node is ever created — the picker spawns a real ImageNode with an
          assetId in one step). */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={onPickImageFile}
        style={{ display: 'none' }}
        data-testid="canvas-image-file-input"
      />

      {edgeCtxMenu !== null && (
        <ContextMenu
          x={edgeCtxMenu.x}
          y={edgeCtxMenu.y}
          items={[{
            label: 'Disconnect',
            danger: true,
            onSelect: () => {
              removeEdge(edgeCtxMenu.edgeId);
              const updated = useBoardStore.getState().board;
              if (updated) void window.krnl?.boardSave(updated);
            },
          }]}
          onDismiss={() => setEdgeCtxMenu(null)}
        />
      )}

      {ctxMenu && (
        <div
          data-testid="node-ctx-menu"
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: 'var(--node-bg, #18160f)',
            border: '1px solid var(--paper-3)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: 4,
            zIndex: 1000,
            minWidth: 140,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <button
            type="button"
            data-testid="node-ctx-menu-delete"
            onClick={deleteFromCtxMenu}
            title="delete node"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--rust)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              textTransform: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(200,85,61,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {ctxMenu.nodeIds.length > 1 ? `delete (${ctxMenu.nodeIds.length})` : 'delete'}
          </button>
        </div>
      )}
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
  // Subscribe to a boolean, not the board reference, so this outer component
  // doesn't re-render every drag tick. CanvasFlowInner subscribes to s.board
  // internally — we only need the loaded/not-loaded gate here.
  const hasBoard = useBoardStore((s) => s.board !== null);

  if (!hasBoard) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ink-4)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        loading…
      </div>
    );
  }

  return <CanvasFlowInner initialViewport={viewport} />;
}
