/**
 * CanvasFlow.tsx — React Flow canvas replacing the custom Canvas.
 * Decision #13 §C–F.
 *
 * boardStore is the single source of truth. nodes + edges are derived via
 * useMemo from board.nodes / board.edges. RF runs in controlled mode.
 */

import { useMemo, useCallback, useState, useEffect, useLayoutEffect, useRef, createContext, useContext, memo, type ComponentType } from 'react';
import { scheduleBatch } from '../../utils/rafBatcher';
import { rfToScreen, updateViewport, updateCanvasRect } from '../../utils/viewportBus';
import { useCameraEnsureVisible } from '../../utils/cameraEnsureVisible';
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
  applyNodeChanges,
  type NodeChange,
  type EdgeChange,
  type Edge as RFEdge,
  type Viewport,
  type EdgeProps,
  type OnSelectionChangeParams,
  type NodeProps as RFNodeProps,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBoardStore } from '../../store/boardStore';
import { saveBoard } from '../../store/eventLog';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { NODE_TYPES } from '../nodes/registry';
import { toRfNode, toRfEdge, type KrnlRFNode, type RFNodeData } from './rfAdapters';
import { makeCommandHandler, deleteTaskNodesCascade } from './commandDispatch';
import { Dock } from '../Dock';
import { ChassisLayer } from '../ChassisLayer';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { useLayerVisibility, kindToLayer } from '../../store/layerVisibility';
import { ContextMenu } from '../ContextMenu';
import { ingestImageFile, initialDisplaySize } from './dropImage';
import type { Node as KrnlNode } from '../../../shared/types/node';
import type { NodeKind } from '../../../shared/types/node';
import type { Edge as KrnlEdge } from '../../../shared/types/edge';
import type { Connection } from '@xyflow/react';
import type { TaskState } from '../nodes/TaskNode/types';
import type { HabitLaneState } from '../nodes/HabitLaneNode/types';
import type { FrameState } from '../nodes/FrameNode/types';
import { defaultFrameState, defaultFrameConfig } from '../nodes/FrameNode/types';
import { defaultAnalyticsState, defaultAnalyticsConfig } from '../nodes/AnalyticsNode/types';
import { MOTHER_WIDTH, MOTHER_HEIGHT } from '../nodes/MotherFrame';

// ── MiniMap node color — module-level to avoid per-paint inline allocation ───
// Hex literals used instead of CSS var() to skip variable resolution per rect.
function miniMapNodeColor(n: KrnlRFNode): string {
  switch (n.type) {
    case 'pomo':       return '#c8553d';
    case 'todo':       return '#22d3ee';
    case 'habit':      return '#c9f158';
    case 'terminal':   return '#5a5244';
    case 'calendar':   return '#5e7d1d';
    case 'clock':      return '#a78bfa';
    case 'todo.task':  return '#22d3ee';
    case 'habit.lane': return '#c9f158';
    case 'text':       return '#9a9180';
    case 'image':      return '#c2b89c';
    default:           return '#5a5244';
  }
}

// ── BoldSetContext — carries the set of source node IDs whose outgoing edges ──
// should be bolded. Computed once per hover change in CanvasFlowInner and
// distributed via context so edge components don't need individual store
// subscriptions keyed on board.nodes (which would re-subscribe every render).
// An empty frozen set is the stable default — edges read it as "bold nobody".
const EMPTY_BOLD_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
const BoldSetContext = createContext<ReadonlySet<string>>(EMPTY_BOLD_SET);

// ── Edge components ───────────────────────────────────────────────────────────

function TaskFlowEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  // Bold when this edge's source is in the active bold set. The set is computed
  // in CanvasFlowInner and covers direct children of the hovered mother node
  // (todo.task → todo mother, habit.lane → habit mother). Context read is
  // O(1); no additional store subscription per edge component.
  const boldSet = useContext(BoldSetContext);
  const bold = boldSet.has(source);

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
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.35" />
          <stop offset="45%" stopColor="var(--cyan-glow)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--cyan-glow)" stopOpacity="1" />

        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: `url(#${gradId})`,
          strokeWidth: bold ? 4 : 3,
          strokeDasharray: '14 8',
          strokeLinecap: 'round',
          opacity: 1,
        }}
      />
    </>
  );
}

function DefaultEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  // Bold when this edge's source is in the active bold set (same as TaskFlowEdge).
  const boldSet = useContext(BoldSetContext);
  const bold = boldSet.has(source);

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
        strokeWidth: bold ? (active ? 2.5 : 2) : (active ? 1.5 : 1),
        strokeDasharray: active ? undefined : '4 4',
        opacity: bold ? 1 : (active ? 1 : 0.6),
      }}
    />
  );
}

const EDGE_TYPES = {
  'task-flow': TaskFlowEdge,
  default: DefaultEdge,
};

// ── SwapButton pseudo-node ────────────────────────────────────────────────────
// Sits in the gap between every adjacent mother-node pair. Click swaps the two
// mothers' slot positions. Implemented as a custom RF node so it lives inside
// the flow transform (pans/zooms with the canvas) without any DOM overlay math.
// Not draggable, not selectable, no handles — pure UI.
//
// data carries { leftId, rightId } so the click handler can dispatch the swap
// against boardStore without resubscribing to the whole graph.
interface SwapButtonData extends Record<string, unknown> {
  leftId: string;
  rightId: string;
}

const SwapButtonNode = memo(function SwapButtonNode({
  data,
  positionAbsoluteX,
  positionAbsoluteY,
}: { data: SwapButtonData; positionAbsoluteX: number; positionAbsoluteY: number }) {
  const swapMotherSlots = useBoardStore((s) => s.swapMotherSlots);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      swapMotherSlots(data.leftId, data.rightId);
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
    },
    [data.leftId, data.rightId, swapMotherSlots],
  );

  // stopPropagation on pointer events — RF treats unhandled pointer events as
  // pan-start under panOnDrag=[1,2]; left-button starts a marquee selection.
  // Both must be suppressed so a click on the button doesn't start a drag.
  const stop = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Proximity reveal — zero DOM reads. positionAbsoluteX/Y are RF flow-space
  // coords; rfToScreen() converts to screen coords from the module-level
  // viewport scalars that updateViewport() refreshes on every onMove tick.
  // Dependency on positionAbsoluteX/Y ensures closure re-captures after swap.
  useLayoutEffect(() => {
    const PROXIMITY_SQ = 140 * 140;
    let cursorX = 0;
    let cursorY = 0;
    let btnCX = 0;
    let btnCY = 0;

    const onPointerMove = (e: PointerEvent) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const unschedule = scheduleBatch({
      read() {
        // Button is 32×32 placed at (positionAbsoluteX, positionAbsoluteY) in
        // flow space. Center = (+16, +16). rfToScreen() — no DOM reads.
        const s = rfToScreen(positionAbsoluteX + 16, positionAbsoluteY + 16);
        btnCX = s.x;
        btnCY = s.y;
      },
      write() {
        const btn = btnRef.current;
        if (!btn) return;
        const dx = cursorX - btnCX;
        const dy = cursorY - btnCY;
        const near = (dx * dx + dy * dy) < PROXIMITY_SQ;
        btn.style.opacity = near ? '1' : '0';
        btn.style.pointerEvents = near ? 'all' : 'none';
      },
    });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      unschedule();
    };
  }, [positionAbsoluteX, positionAbsoluteY]);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      onPointerDown={stop}
      onMouseDown={stop}
      title="Swap left ↔ right panel"
      aria-label="Swap adjacent mothers"
      className="krnl-swap-btn"
      style={{
        // RF positions the 32×32 wrapper; this absolute-center rule keeps
        // the button visually centered no matter the wrapper's size drift.
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        // Defensive pointer-events:none until the proximity tick switches
        // it to 'all' — keeps a hidden button from blocking canvas drags.
        pointerEvents: 'none',
        zIndex: 100,
        opacity: 0,
      }}
    >
      <span className="krnl-swap-btn__halo" aria-hidden />
      <span className="krnl-swap-btn__disc" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h10M3 5l2.5-2.5M3 5l2.5 2.5" />
          <path d="M13 11H3M13 11l-2.5 2.5M13 11l-2.5-2.5" />
        </svg>
      </span>
    </button>
  );
});

// Merge swap-button into NODE_TYPES so RF can resolve it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_NODE_TYPES: Record<string, ComponentType<RFNodeProps<KrnlRFNode>>> = {
  ...NODE_TYPES,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'swap-button': SwapButtonNode as ComponentType<any>,
};

// Stable empty fallback for the nodes-selector when board is null. Sharing
// one reference prevents the selector from returning a fresh `[]` per call.
const EMPTY_NODES: KrnlNode[] = [];

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
  const hoveredNodeId = useBoardStore((s) => s.hoveredNodeId);
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

  // Dock-frame variant (classic | synthesizer | telemetry | phosphor).
  // Hook applies `data-dock` to <html> and persists in localStorage.
  const [dockStyle, setDockStyle] = useDockStyle();

  // Canvas-wide layer filters — KRNL Dock bottom-rail switches flip these
  // and the RF node mapping sets `hidden: true` for nodes whose layer is off.
  const layerTasks = useLayerVisibility((s) => s.tasks);
  const layerTexts = useLayerVisibility((s) => s.texts);
  const layerImages = useLayerVisibility((s) => s.images);

  // Start the debounced viewport persister (Decision #7).
  useViewportPersistence();

  // Seed viewportBus with initialViewport so rfToScreen() is accurate before
  // the first onMove tick (which only fires after the user starts panning).
  useLayoutEffect(() => {
    updateViewport(initialViewport.x, initialViewport.y, initialViewport.zoom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canvasContainerRef + ResizeObserver keep _canvasLeft/_canvasTop in sync
  // across window resize / layout shifts. Fires rarely — not per-frame.
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Reusable "ensure this flow-space rect is comfortably visible" helper.
  // Used by every spawn path; also available to future features that need to
  // focus the camera on a particular thing (search jump, chain head, etc.).
  const ensureVisible = useCameraEnsureVisible(canvasContainerRef);
  useLayoutEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      updateCanvasRect(r.left, r.top);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Fit-view on first launch (Architect Amendment B) ──────────────────────
  // When the persisted viewport equals the legacy seed sentinel {0, 220, 1},
  // it means the user has never panned/zoomed (fresh board) — or the viewport
  // was previously clobbered by the now-removed migrateMotherPositions bug.
  // In that case we fire fitView once so all 5 mothers are visible in the
  // initial view. The didFitRef guard ensures this runs at most once per session.
  const didFitRef = useRef(false);
  // Stable empty-array fallback so the selector doesn't return a fresh `[]`
  // every call while board is null — fresh literal would break zustand's
  // shallow equality check and re-fire downstream renders unnecessarily.
  const rfNodes = useBoardStore((s) => s.board?.nodes ?? EMPTY_NODES);

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
    if (updated) void saveBoard(updated);
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
        if (updated) void saveBoard(updated);
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        useBoardStore.getState().redo();
        const updated = useBoardStore.getState().board;
        if (updated) void saveBoard(updated);
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
    if (updated) void saveBoard(updated);
    ensureVisible({ x: pos.x, y: pos.y, width, height });
  }, [addNode, ensureVisible]);

  const onPickImageFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // If the user explicitly dropped an image at a screen point (drag-drop
    // path), honor that. Otherwise default to the dock-spawn lane: well
    // below the mother row.
    const pos = pendingImageDropPos.current ?? defaultDockSpawnPos();
    pendingImageDropPos.current = null;
    await spawnImageNodeFromFile(file, pos);
    // defaultDockSpawnPos is declared just below — closure captures binding,
    // callback body only executes after both are initialised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnImageNodeFromFile]);

  // ── defaultDockSpawnPos ───────────────────────────────────────────────────
  // Mothers sit at y=0 with height 540 (the bottom edge is at y=540). New
  // text / image / frame nodes spawned from the dock should land WELL below
  // that band so they don't visually collide with the mother row. The X is
  // the current viewport center in flow space so the spawn lands in the
  // user's view horizontally; the Y is clamped to at least 1100 (≈560 px
  // below the mother bottom) so the node is unmistakably outside the
  // mother strip even when the user is panned up to it.
  const defaultDockSpawnPos = useCallback((): { x: number; y: number } => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const BELOW_MOTHERS_Y = 1100;
    return { x: center.x, y: Math.max(center.y, BELOW_MOTHERS_Y) };
  }, [screenToFlowPosition]);

  // ── Dock add-node handler — text/frame land in the dock-spawn lane below
  //   the mother row; image opens the OS file picker (same lane on default).
  const handleAddNode = useCallback((args: { kind: NodeKind }) => {
    // Auto-enable the layer filter for the spawned kind so the new node is
    // immediately visible. Without this, toggling TEXTS / IMAGES off on the
    // KRNL Dock then clicking "add text" silently spawned a hidden node and
    // looked broken.
    const layer = kindToLayer(args.kind);
    if (layer) useLayerVisibility.getState().setLayer(layer, true);

    if (args.kind === 'image') {
      imageFileInputRef.current?.click();
      return;
    }
    // Analytics is a singleton dashboard — clicking the dock button (or
    // pressing 'A') toggles: spawn if none exists, otherwise hide every
    // analytics node currently on the board.
    if (args.kind === 'analytics') {
      const current = useBoardStore.getState().board;
      const existing = current?.nodes.filter((n) => n.kind === 'analytics') ?? [];
      if (existing.length > 0) {
        for (const n of existing) removeNode(n.id);
        const after = useBoardStore.getState().board;
        if (after) void saveBoard(after);
        return;
      }
    }
    const pos = defaultDockSpawnPos();
    const defaultState: Record<NodeKind, Record<string, unknown>> = {
      pomo: {}, todo: {}, habit: {}, term: {}, calendar: {},
      // clock is a permanent mother — never spawnable via handleAddNode.
      // Entry required only for Record<NodeKind, ...> type completeness.
      clock: {},
      'pomo.session': {}, 'todo.task': {}, 'habit.day': {},
      text: { text: '' },
      image: {},
      frame: defaultFrameState() as unknown as Record<string, unknown>,
      analytics: defaultAnalyticsState() as unknown as Record<string, unknown>,
    };
    const defaultConfigByKind: Partial<Record<NodeKind, Record<string, unknown>>> = {
      frame: defaultFrameConfig() as unknown as Record<string, unknown>,
      analytics: defaultAnalyticsConfig() as unknown as Record<string, unknown>,
    };
    const newNode: KrnlNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: args.kind,
      position: pos,
      state: defaultState[args.kind],
      config: defaultConfigByKind[args.kind] ?? {},
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);

    // Pan/zoom-out the camera if the spawn site is not comfortably in view.
    // Use the kind's initial dimensions so we don't have to wait for RF's
    // ResizeObserver to measure the freshly-mounted node.
    const sizes: Partial<Record<NodeKind, { width: number; height: number }>> = {
      text:  { width: 260, height: 120 },
      frame: { width: 360, height: 240 },
      analytics: { width: 620, height: 520 },
    };
    const sz = sizes[args.kind];
    if (sz) ensureVisible({ x: pos.x, y: pos.y, width: sz.width, height: sz.height });
  }, [addNode, removeNode, defaultDockSpawnPos, ensureVisible]);

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
    if (updated) void saveBoard(updated);
  }, [addEdge]);

  // ── Derive RF nodes from boardStore — memoized per-id ───────────────────
  // Stable RFNode identity unless the underlying KrnlNode reference changes.
  // Also appends swap-button pseudo-nodes between every adjacent mother pair
  // so the user can reorder mothers via a click instead of drag-and-drop.
  const derivedNodes = useMemo((): KrnlRFNode[] => {
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

    const baseNodes: KrnlRFNode[] = board.nodes.map((node: KrnlNode) => {
      const onCommand = getCommandHandler(node.id);
      const onSelect = getSelectHandler(node.id, selectNode);

      if (!node.isMother) {
        return getMemoizedRfNode(node, { onCommand, onSelect });
      }

      // Mother node: cache by (node ref, slotIndex, slotTotal).
      const slotIndex = slotIndexMap.get(node.id) ?? 1;
      const cached = rfMotherCache.get(node.id);
      if (
        cached &&
        cached.src === node &&
        cached.slotIndex === slotIndex &&
        cached.slotTotal === slotTotal
      ) {
        return cached.rf;
      }

      const rf = toRfNode(node, {
        onCommand,
        onSelect,
        slotIndex,
        slotTotal,
      });
      rfMotherCache.set(node.id, { src: node, slotIndex, slotTotal, rf });
      return rf;
    });

    // Swap-button pseudo-nodes — one per adjacent mother pair.
    // Position: in the gap between the two cards, vertically centered.
    // gap between motherR.left and motherL.right is
    // motherR.position.x - (motherL.position.x + MOTHER_WIDTH). Place button
    // at the midpoint of that gap; vertical center at half MOTHER_HEIGHT.
    const swapNodes: KrnlRFNode[] = [];
    for (let i = 0; i < motherNodes.length - 1; i++) {
      const left = motherNodes[i]!;
      const right = motherNodes[i + 1]!;
      const gapMidX = (left.position.x + MOTHER_WIDTH + right.position.x) / 2;
      const cy = left.position.y + MOTHER_HEIGHT / 2;
      swapNodes.push({
        id: `__swap__${left.id}__${right.id}`,
        type: 'swap-button',
        position: { x: gapMidX - 16, y: cy - 16 }, // button is 32×32
        draggable: false,
        selectable: false,
        data: {
          // RFNodeData shape padding — never read by SwapButtonNode.
          node: {} as KrnlNode,
          onCommand: () => { /* no-op */ },
          onSelect: () => { /* no-op */ },
          leftId: left.id,
          rightId: right.id,
        } as RFNodeData & { leftId: string; rightId: string },
        width: 32,
        height: 32,
        measured: { width: 32, height: 32 },
        // Sit above mother cards so the button stays clickable.
        zIndex: 50,
      });
    }

    // Apply canvas-wide layer filters from useLayerVisibility. Only nodes
    // whose kind has a registered layer (tasks / texts / images) are affected;
    // mothers + frames + habits stay visible regardless. Spread-clone only the
    // ones that need `hidden:true` so identity is preserved for unaffected nodes.
    const filteredBase = baseNodes.map((rf, idx) => {
      const node = board.nodes[idx];
      if (!node) return rf;
      const layer = kindToLayer(node.kind);
      if (!layer) return rf;
      const visible = layer === 'tasks' ? layerTasks
        : layer === 'texts' ? layerTexts
        : layerImages;
      if (visible) return rf;
      return { ...rf, hidden: true };
    });

    return [...filteredBase, ...swapNodes];
  }, [board, selectNode, layerTasks, layerTexts, layerImages]);

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

  // ── Bold-set — which source node IDs should bold their outgoing edges ─────
  // Keyed on [board.nodes, hoveredNodeId]. When a mother is hovered we walk its
  // children instead of relying on `source === motherId` (mothers have no
  // handles so no edge ever has a mother as its source).
  //   todo   mother  → all todo.task nodes whose state.parentTodoId matches
  //   habit  mother  → all habit.lane nodes whose state.habitId is in the
  //                    mother habit's habit list
  //   others (pomo, terminal, calendar, clock) → empty (no child nodes with edges)
  // When hovering a non-mother: set = {hoveredNodeId} (direct source match).
  // When nothing hovered: empty set (frozen, stable reference).
  const boldSet = useMemo<ReadonlySet<string>>(() => {
    if (!hoveredNodeId || !board) return EMPTY_BOLD_SET;
    const hoveredNode = board.nodes.find((n: KrnlNode) => n.id === hoveredNodeId);
    if (!hoveredNode) return EMPTY_BOLD_SET;

    if (hoveredNode.kind === 'todo' && hoveredNode.isMother) {
      // All task nodes belonging to this todo mother.
      const ids = new Set<string>();
      for (const n of board.nodes) {
        if (n.kind === 'todo.task') {
          const ts = n.state as TaskState;
          if (ts.parentTodoId === hoveredNodeId) ids.add(n.id);
        }
      }
      return ids;
    }

    if (hoveredNode.kind === 'habit' && hoveredNode.isMother) {
      // All habit.lane nodes whose habitId is one of this mother's habits.
      const motherHabitIds = new Set<string>(
        ((hoveredNode.state as { habits?: Array<{ id: string }> }).habits ?? []).map(
          (h) => h.id
        )
      );
      const ids = new Set<string>();
      for (const n of board.nodes) {
        if (n.kind === 'habit.lane') {
          const ls = n.state as HabitLaneState;
          if (motherHabitIds.has(ls.habitId)) ids.add(n.id);
        }
      }
      return ids;
    }

    // Non-mother or other mother kinds (pomo, terminal, calendar, clock):
    // bold edges whose source is the hovered node itself.
    return new Set<string>([hoveredNodeId]);
  }, [board, hoveredNodeId]);

  // ── onNodesChange — apply every change locally; commit only on drag end ──
  // Local-first: applyNodeChanges absorbs position/dimensions/select changes
  // into the live RF nodes array without touching Zustand. This is what makes
  // the drag smooth — no store cascade, no StatusBar re-render, no mother
  // node re-render per frame. Zustand is touched only when:
  //   - drag ends (commit final position + persist)
  //   - selection changes (mirror to store for sys/CLI integration)
  // Bump-animation guard so the keyframe replays only after each gesture
  // finishes its previous run — avoids animation-flicker when collision is
  // sustained across many drag ticks.
  const bumpingRef = useRef<Set<string>>(new Set());
  const triggerBump = useCallback((id: string) => {
    if (bumpingRef.current.has(id)) return;
    bumpingRef.current.add(id);
    requestAnimationFrame(() => {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      if (el) el.setAttribute('data-bump', '1');
      setTimeout(() => {
        const el2 = document.querySelector(`.react-flow__node[data-id="${id}"]`);
        if (el2) el2.removeAttribute('data-bump');
        bumpingRef.current.delete(id);
      }, 280);
    });
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<KrnlRFNode>[]) => {
      const collidedIds: string[] = [];

      setNodes((nds) => {
        // Mother AABBs — frames cannot overlap any mother. Mothers are pinned
        // (draggable:false) so their bounds never change mid-drag.
        const motherBounds: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const n of nds) {
          if (n.data?.node?.isMother !== true) continue;
          const w = (n.measured?.width ?? n.width ?? 0) as number;
          const h = (n.measured?.height ?? n.height ?? 0) as number;
          if (w <= 0 || h <= 0) continue;
          motherBounds.push({ x: n.position.x, y: n.position.y, w, h });
        }

        // For each frame position change, resolve overlap against every
        // mother by iteratively pushing along the smaller-overlap axis.
        // Output: resolved position + the actually-applied delta (children
        // move by the resolved delta, not the un-resolved requested one).
        const frameOverrides = new Map<string, { x: number; y: number; dx: number; dy: number; childIds: Set<string> }>();
        for (const change of changes) {
          if (change.type !== 'position' || !change.position) continue;
          const prev = nds.find((n) => n.id === change.id);
          if (!prev || prev.data?.node?.kind !== 'frame') continue;
          const fw = (prev.measured?.width ?? prev.width ?? 0) as number;
          const fh = (prev.measured?.height ?? prev.height ?? 0) as number;
          let x = change.position.x;
          let y = change.position.y;
          let collided = false;
          // Up to 6 resolver passes — converges in 1–2 in practice; cap is
          // a safety net for pathological mother configurations.
          for (let pass = 0; pass < 6; pass++) {
            let bumped = false;
            for (const m of motherBounds) {
              const overlapX = Math.min(x + fw, m.x + m.w) - Math.max(x, m.x);
              const overlapY = Math.min(y + fh, m.y + m.h) - Math.max(y, m.y);
              if (overlapX <= 0 || overlapY <= 0) continue;
              bumped = true;
              collided = true;
              if (overlapX < overlapY) {
                if (x + fw / 2 < m.x + m.w / 2) x = m.x - fw;
                else x = m.x + m.w;
              } else {
                if (y + fh / 2 < m.y + m.h / 2) y = m.y - fh;
                else y = m.y + m.h;
              }
            }
            if (!bumped) break;
          }
          const dx = x - prev.position.x;
          const dy = y - prev.position.y;
          const fs = prev.data.node.state as FrameState;
          frameOverrides.set(change.id, { x, y, dx, dy, childIds: new Set(fs.childIds ?? []) });
          if (collided) collidedIds.push(change.id);
        }

        const next = applyNodeChanges<KrnlRFNode>(changes, nds);
        if (frameOverrides.size === 0) return next;
        return next.map((n) => {
          const ov = frameOverrides.get(n.id);
          if (ov) {
            // Frame itself — override the un-resolved requested position with
            // the collision-resolved one.
            return { ...n, position: { x: ov.x, y: ov.y } };
          }
          // Child of a moved frame — translate by the resolved delta. RF did
          // not issue a position change for children, so `n.position` here is
          // the pre-tick child position; add the frame's actual delta.
          let x = n.position.x;
          let y = n.position.y;
          let touched = false;
          for (const ovi of frameOverrides.values()) {
            if (ovi.childIds.has(n.id)) {
              x += ovi.dx;
              y += ovi.dy;
              touched = true;
            }
          }
          return touched ? { ...n, position: { x, y } } : n;
        });
      });

      // Bumps fire outside setNodes so the DOM attr write happens AFTER React
      // commits the new position — keeps the keyframe synced to the visible
      // collision.
      for (const id of collidedIds) triggerBump(id);

      for (const change of changes) {
        if (change.type === 'position') {
          if (change.dragging === true) {
            isDraggingRef.current = true;
          } else if (change.dragging === false) {
            isDraggingRef.current = false;
            if (change.position) {
              commitDragEnd(change.id);
            }
          }
        }
      }
    },
    // commitDragEnd is stable (declared just below via useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateNode, triggerBump]
  );

  // ── commitDragEnd ─────────────────────────────────────────────────────────
  // Runs once per drag gesture. Pulls the latest positions from RF (getNodes)
  // and persists them through the store. For a frame: also persists all child
  // positions. For a non-frame: recomputes which frame (if any) contains the
  // dragged node's center and rewrites the affected frames' childIds.
  const commitDragEnd = useCallback((draggedId: string) => {
    const all = getNodes() as KrnlRFNode[];
    const dragged = all.find((n) => n.id === draggedId);
    if (!dragged) return;
    const draggedKind = dragged.data?.node?.kind;

    updateNode(draggedId, { position: dragged.position });

    if (draggedKind === 'frame') {
      const fs = dragged.data.node.state as FrameState;
      for (const cid of fs.childIds ?? []) {
        const child = all.find((n) => n.id === cid);
        if (child) updateNode(cid, { position: child.position });
      }
    } else if (draggedKind && draggedKind !== 'frame') {
      // Skip mothers — they are not eligible to be soft-grouped.
      const isMother = dragged.data?.node?.isMother === true;
      if (!isMother) {
        const w = (dragged.measured?.width ?? dragged.width ?? 0) as number;
        const h = (dragged.measured?.height ?? dragged.height ?? 0) as number;
        const cx = dragged.position.x + w / 2;
        const cy = dragged.position.y + h / 2;
        let newParent: string | null = null;
        for (const n of all) {
          if (n.data?.node?.kind !== 'frame') continue;
          const fw = (n.measured?.width ?? n.width ?? 0) as number;
          const fh = (n.measured?.height ?? n.height ?? 0) as number;
          if (cx >= n.position.x && cx <= n.position.x + fw &&
              cy >= n.position.y && cy <= n.position.y + fh) {
            newParent = n.id;
            break;
          }
        }
        for (const n of all) {
          if (n.data?.node?.kind !== 'frame') continue;
          const fs = n.data.node.state as FrameState;
          const cur = fs.childIds ?? [];
          const had = cur.includes(draggedId);
          const should = n.id === newParent;
          if (had && !should) {
            updateNode(n.id, { state: { ...fs, childIds: cur.filter((id) => id !== draggedId) } });
          } else if (!had && should) {
            updateNode(n.id, { state: { ...fs, childIds: [...cur, draggedId] } });
          }
        }
      }
    }

    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
  }, [getNodes, updateNode]);

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

  // ── onMove — refresh viewportBus scalars every pan/zoom frame ─────────────
  // Pure module-level write — no React state, no Zustand, no re-renders.
  // Badges and swap-buttons call rfToScreen() inside their rAF read() slots
  // and see the updated numbers without triggering any component updates.
  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      updateViewport(viewport.x, viewport.y, viewport.zoom);
    },
    []
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
    <div ref={canvasContainerRef} style={{ width: '100%', height: '100%' }}>
    <BoldSetContext.Provider value={boldSet}>
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={ALL_NODE_TYPES}
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
      onMove={onMove}
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
      // Trackpad-first gestures:
      //   • Two-finger drag on a trackpad fires wheel events with deltaX/deltaY
      //     — `panOnScroll` makes those events pan the canvas the way macOS
      //     Maps / Figma / Miro do.
      //   • Pinch fires `wheel` with ctrlKey synthesised by the OS;
      //     `zoomOnPinch` (default) catches it.
      //   • Cmd (macOS) / Ctrl (Win/Linux) + scroll wheel = zoom. The default
      //     activation key list is ['Meta','Control'], which matches the macOS
      //     and Windows mental model.
      //   • Plain mouse-wheel without modifier pans vertically — for users
      //     without a trackpad, hold Cmd/Ctrl to zoom.
      panOnScroll
      panOnScrollSpeed={0.8}
      zoomOnScroll
      zoomOnPinch
      zoomActivationKeyCode={['Meta', 'Control']}
      panActivationKeyCode={null}
      fitView={false}
      minZoom={0.25}
      maxZoom={4}
      zoomOnDoubleClick={false}
      // Perf + terminal-keyboard fix: stop RF from grabbing focus or arrow keys
      // away from xterm/inputs inside nodes.
      nodesFocusable={false}
      disableKeyboardA11y
      proOptions={{ hideAttribution: true }}
      style={{ background: 'var(--paper)' }}
    >
      {/* Dual-density dot grid — minor (32px, small dots) + major (160px,
          larger dots). Both layers use a brighter shade than --grid-strong so
          dots read clearly without dominating the canvas. */}
      <Background
        id="krnl-grid-minor"
        variant={BackgroundVariant.Dots}
        gap={32}
        size={1.6}
        color="var(--grid)"
        offset={0}
      />
      <Background
        id="krnl-grid-major"
        variant={BackgroundVariant.Dots}
        gap={160}
        size={3.6}
        color="var(--grid-strong)"
        offset={0}
      />

      {/* Controls — zoom in/out, fit view. Moved to bottom-left so MiniMap
          can anchor bottom-right without overlap. */}
      <Controls position="bottom-left" showInteractive={false} />

      {/* PR-wave-A — MiniMap bottom-right. Each node renders as a small
          colored rect so the user can see the board layout at a glance and
          click-to-pan to a region. nodeColor is a module-level function so
          the browser doesn't allocate a new closure per paint. */}
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={miniMapNodeColor}
        nodeStrokeWidth={2}
        maskColor="rgba(14, 13, 11, 0.55)"
        style={{
          width: 160,
          height: 120,
        }}
      />

      {/* Mother-row chassis (synthesizer / telemetry variants).
          Renders in flow coordinates behind the 6 fixed mother nodes via
          ViewportPortal so it pans/zooms with the canvas. */}
      <ChassisLayer dockStyle={dockStyle} />

      {/* Left dock */}
      <Panel position="top-left" style={{ margin: 0, padding: 0 }}>
        <Dock onAddNode={handleAddNode} dockStyle={dockStyle} onDockStyleChange={setDockStyle} />
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
              if (updated) void saveBoard(updated);
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
    </BoldSetContext.Provider>
    </div>
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
