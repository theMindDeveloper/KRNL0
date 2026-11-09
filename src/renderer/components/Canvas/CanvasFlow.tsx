/**
 * CanvasFlow.tsx — React Flow canvas replacing the custom Canvas.
 * Decision #13 §C–F.
 *
 * boardStore is the single source of truth. nodes + edges are derived via
 * useMemo from board.nodes / board.edges. RF runs in controlled mode.
 */

import { useMemo, useCallback, useState, useEffect, useLayoutEffect, useRef, createContext, useContext, memo, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
import { isEasyBoard } from '../../store/uiMode';
import { saveBoard, emit } from '../../store/eventLog';
import { wouldCreateChainCycle } from '../../store/chainWalker';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { NODE_TYPES } from '../nodes/registry';
import { toRfNode, toRfEdge, type KrnlRFNode, type RFNodeData } from './rfAdapters';
import { makeCommandHandler, deleteTaskNodesCascade } from './commandDispatch';
import { Dock } from '../Dock';
import { DrawLayer } from './DrawLayer';
import { motherRowY } from './motherRow';
import { DrawStrokeNode, STROKE_NODE_PREFIX, STROKE_Z, strokeBox } from './DrawStrokeNode';
import type { DrawStroke } from '../../../shared/types/board';
import { targetNodeIdAt } from './connectTarget';
import { PieMenu } from '../ui/PieMenu';
import { canvasWheelItems } from './canvasWheel';
import { useDrawStore } from '../../store/drawStore';
import type { TextLook } from '../nodes/TextNode/types';
import { ChassisLayer } from '../ChassisLayer';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { useLayerVisibility, kindToLayer } from '../../store/layerVisibility';
import { finishedClockKey, finishedTaskIds, useFinishedCards } from '../../store/finishedCards';
import { ContextMenu } from '../ContextMenu';
import { ingestImageFile, imageRejectReason, initialDisplaySize } from './dropImage';
import { classifyFile, classifyUrl } from './dropMedia';
import { ingestMediaFile } from './ingestMedia';
import { MEDIA_SIZE, type MediaState } from '../nodes/MediaNode/types';
import type { Node as KrnlNode } from '../../../shared/types/node';
import type { NodeKind } from '../../../shared/types/node';
import type { Edge as KrnlEdge } from '../../../shared/types/edge';
import type { Connection, FinalConnectionState } from '@xyflow/react';
import type { TaskState } from '../nodes/TaskNode/types';
import type { HabitLaneState } from '../nodes/HabitLaneNode/types';
import type { HabitState } from '../nodes/HabitNode/types';
import type { TodoState } from '../nodes/TodoNode/types';
import type { PomoConfig } from '../nodes/PomoNode/types';
import { defaultPomoConfig } from '../nodes/PomoNode/types';
import { todoAdd, todoLinkTask } from '../nodes/TodoNode/commands';
import type { FrameState } from '../nodes/FrameNode/types';
import { defaultFrameState, defaultFrameConfig } from '../nodes/FrameNode/types';
import { MOTHER_WIDTH, MOTHER_HEIGHT } from '../nodes/MotherFrame';
import { isStationHidden } from '../Station/stationVisibility';
import { isStationShown, useStationViewportGate } from '../Station/useStationViewportGate';
import { Z } from '../ui/layers';
import { shortcutBlocked, isControlTarget } from '../../utils/keyboardTargets';
import { requestTextEdit } from '../nodes/TextNode/editEvent';
import { undoable } from '../../store/undoNotice';

// Canvas-mode mother row: first slot x and the step between slots (540 wide +
// 20 gap) — matches the seeded positions in main/persistence/board.ts.
const MOTHER_ROW_START_X = -1400;
const MOTHER_ROW_STEP = 560;
import { findAnalyticsMother, toggleAnalyticsShown } from '../../store/analyticsMother';
import { FIT_NODES_EVENT, FOCUS_NODE_EVENT } from '../../store/scheduleActions';
import { activeCanvasOf, edgesOnCanvas, isOnCanvas, isSharedNode, isStrokeOnCanvas, visibleNodeIds } from '../../../shared/canvas';
import { alignAll, gridScopeOf, landing, onGrid, snap as snapGrid, type Box } from './alignGrid';

/** Align to grid: let moved nodes glide the last few pixels instead of jumping. */
function settleNodes(ids: readonly string[]): void {
  requestAnimationFrame(() => {
    for (const id of ids) {
      const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      el.setAttribute('data-settling', '1');
      window.setTimeout(() => el.removeAttribute('data-settling'), 320);
    }
  });
}

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
        zIndex: Z.chrome,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'draw-stroke': DrawStrokeNode as ComponentType<any>,
};

// Pen strokes as RF nodes (see DrawStrokeNode). Cached per stroke reference.
// `data.node` is a stand-in so code that reads data.node.kind / isMother
// keeps working; the real stroke is data.stroke.
const strokeNodeCache = new WeakMap<DrawStroke, KrnlRFNode>();
function strokeRfNode(s: DrawStroke): KrnlRFNode {
  const hit = strokeNodeCache.get(s);
  if (hit) return hit;
  const b = strokeBox(s);
  const id = STROKE_NODE_PREFIX + s.id;
  const rf = {
    id,
    type: 'draw-stroke',
    position: { x: b.x, y: b.y },
    width: b.w,
    height: b.h,
    measured: { width: b.w, height: b.h },
    zIndex: STROKE_Z,
    connectable: false,
    // Only the ink takes the mouse (see DrawStrokeNode).
    style: { pointerEvents: 'none' as const },
    data: {
      node: { id, kind: 'drawing', isMother: false, position: { x: b.x, y: b.y }, config: {}, state: {} },
      stroke: s,
    },
  } as unknown as KrnlRFNode;
  strokeNodeCache.set(s, rf);
  return rf;
}
const isStrokeId = (id: string): boolean => id.startsWith(STROKE_NODE_PREFIX);

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

// Size of the canvas area the saved viewport was last framed for (see the
// ResizeObserver in CanvasFlowInner). Module-level so it survives the
// remount when switching Station ↔ Canvas.
let lastCanvasSize: { w: number; h: number } | null = null;

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
  const { screenToFlowPosition, getNodes, fitView, getViewport, setViewport: setRfViewport, setCenter } = useReactFlow();

  // Dock-frame variant (classic | synthesizer | telemetry | phosphor).
  // Hook applies `data-dock` to <html> and persists in localStorage.
  const [dockStyle, setDockStyle] = useDockStyle();

  // Canvas-wide layer filters — KRNL Dock bottom-rail switches flip these
  // and the RF node mapping sets `hidden: true` for nodes whose layer is off.
  const layerTasks = useLayerVisibility((s) => s.tasks);
  const layerTexts = useLayerVisibility((s) => s.texts);
  const layerImages = useLayerVisibility((s) => s.images);
  // Finished task cards leave the canvas (engagement.md F4): the policy, the
  // "show finished" switch, and a coarse clock (day / 5 min) to re-check on.
  const finishedPolicy = useFinishedCards((s) => s.policy);
  const showFinished = useFinishedCards((s) => s.showFinished);
  const [finishedClock, setFinishedClock] = useState(() => finishedClockKey(finishedPolicy, Date.now()));
  useEffect(() => {
    const check = () => setFinishedClock(finishedClockKey(finishedPolicy, Date.now()));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [finishedPolicy]);

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

  // krnl:ensure-visible — commandDispatch fires this after spawning a task
  // (todo.add, task.addSubtask, task.addNext) so the camera pans if the
  // newly-created node is offscreen. Station mode: no-op (mothers/tasks are
  // already framed by the panel layout; yanking the embedded canvas would
  // disorient).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onEnsureVisible = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number; width: number; height: number }>).detail;
      if (!detail) return;
      if (isStationShown(useBoardStore.getState().board?.layoutMode)) return;
      ensureVisible(detail);
    };
    window.addEventListener('krnl:ensure-visible', onEnsureVisible);
    return () => window.removeEventListener('krnl:ensure-visible', onEnsureVisible);
  }, [ensureVisible]);

  // While a mouse button is held (dragging nodes, a marquee, panning), embedded
  // pages (YouTube, websites) must not catch the mouse: an iframe swallows the
  // mouse-up when the cursor is over it, so the drag never ended. Clicks that
  // start inside an iframe never reach this document, so using the embed is
  // unaffected.
  useEffect(() => {
    const root = document.documentElement;
    const hold = () => root.classList.add('krnl-pointer-held');
    const release = () => root.classList.remove('krnl-pointer-held');
    window.addEventListener('pointerdown', hold, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    return () => {
      release();
      window.removeEventListener('pointerdown', hold, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', release);
    };
  }, []);

  useLayoutEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      updateCanvasRect(r.left, r.top);
      // Keep the camera centred on the same spot when the canvas area changes
      // size: switching Station ↔ Canvas (a new canvas mounts in a different
      // box) or resizing the window. Without this the view stays pinned to the
      // top-left corner, so what was in the middle of one mode lands off to
      // the side in the other.
      if (r.width < 1 || r.height < 1) return;
      const prev = lastCanvasSize;
      lastCanvasSize = { w: r.width, h: r.height };
      if (!prev || (prev.w === r.width && prev.h === r.height)) return;
      const dx = (r.width - prev.w) / 2;
      const dy = (r.height - prev.h) / 2;
      // Next frame: on mount React Flow applies its starting viewport first.
      requestAnimationFrame(() => {
        const v = getViewport();
        const next = { x: v.x + dx, y: v.y + dy, zoom: v.zoom };
        void setRfViewport(next);
        updateViewport(next.x, next.y, next.zoom);
        setViewport(next);
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mouse-wheel = zoom (canvas-app convention). The trackpad-first config
  // below uses `panOnScroll`, which makes RF treat every wheel event as a
  // pan gesture — that's right for two-finger trackpad scroll, wrong for a
  // notched mouse wheel where users expect zoom. We intercept in the capture
  // phase, detect mouse-wheel events heuristically, and apply a cursor-anchored
  // zoom directly through RF's viewport API. Trackpad events fall through
  // untouched and keep panning. Pinch (ctrlKey synthesised by the OS) is also
  // left for RF's `zoomOnPinch` to handle.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // pinch-zoom or explicit modifier — let RF handle
      // Mouse-wheel heuristic: large integer deltaY, no horizontal component,
      // or non-pixel deltaMode (lines/pages). Trackpads emit small fractional
      // values, often with a deltaX component during inertia.
      const isMouseWheel =
        e.deltaMode !== 0 ||
        (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
      if (!isMouseWheel) return;
      // Inside a window that scrolls (habit list, week grid, a note, the
      // terminal: marked .nowheel) the wheel scrolls it, as on a trackpad.
      if (e.target instanceof Element && e.target.closest('.nowheel, .krnl-popover')) return;
      e.preventDefault();
      e.stopPropagation();
      const vp = getViewport();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Exponential zoom feels right across delta magnitudes; 0.0015 per delta
      // unit gives ~17% per notch on a typical 120-unit wheel tick.
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.min(4, Math.max(0.25, vp.zoom * factor));
      if (nextZoom === vp.zoom) return;
      const k = nextZoom / vp.zoom;
      const nextX = cx - (cx - vp.x) * k;
      const nextY = cy - (cy - vp.y) * k;
      setRfViewport({ x: nextX, y: nextY, zoom: nextZoom });
    };
    // Capture + non-passive so we beat RF's listener and can preventDefault.
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [getViewport, setRfViewport]);

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
    // Never below a readable size: six windows side by side fit at ~34%, where
    // no text can be read (new-user review). FIT and the minimap show them all.
    fitView({ padding: 0.15, includeHiddenNodes: false, nodes: motherIds, duration: 0, minZoom: 0.55 });
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

  // Empty-pane right-click menu — lets the user spawn a text / image / frame
  // node at the click point without reaching for the dock. Carries both
  // screen coords (for positioning the menu) and flow coords (for placing
  // the spawned node in the canvas coordinate space).
  const [paneCtxMenu, setPaneCtxMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const closePaneCtxMenu = useCallback(() => setPaneCtxMenu(null), []);

  // Pane right-click "+ Task" / "+ Habit" → inline name prompt portal.
  // window.prompt is blocked in Electron renderer, so a tiny styled input
  // replaces it. Anchored to the click point in viewport coords; flow coords
  // are carried through to the spawn so the new node lands where the user
  // actually clicked (not the default dock lane).
  const [paneNamePrompt, setPaneNamePrompt] = useState<{
    kind: 'task' | 'habit';
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const closePaneNamePrompt = useCallback(() => setPaneNamePrompt(null), []);

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

  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      // Close any other open menu so two never overlap.
      closeCtxMenu();
      setEdgeCtxMenu(null);
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setPaneCtxMenu({
        x: e.clientX,
        y: e.clientY,
        flowX: flow.x,
        flowY: flow.y,
      });
    },
    [closeCtxMenu, screenToFlowPosition],
  );

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
    const strokeIds = ctxMenu.nodeIds.filter(isStrokeId).map((id) => id.slice(STROKE_NODE_PREFIX.length));
    for (const id of ctxMenu.nodeIds) {
      if (isStrokeId(id)) continue;
      const node = currentBoard?.nodes.find((n) => n.id === id);
      if (node?.kind === 'todo.task') taskIds.push(id);
      else otherIds.push(id);
    }
    const count = ctxMenu.nodeIds.length;
    undoable(`Deleted ${count} item${count === 1 ? '' : 's'}`, () => {
      if (strokeIds.length) useBoardStore.getState().removeStrokes(strokeIds);
      if (taskIds.length > 0) deleteTaskNodesCascade(taskIds);
      for (const id of otherIds) removeNode(id);
    });
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
    closeCtxMenu();
  }, [ctxMenu, removeNode, closeCtxMenu]);

  // Canvas keys act only while the user is on the canvas: focus on the canvas
  // itself or on nothing in particular. In Station mode a selection survives
  // a click on a Todo / Habit panel, and Backspace there must not delete it.
  const onCanvas = (e: KeyboardEvent): boolean => {
    const t = e.target;
    return t === document.body || t === document.documentElement
      || (t instanceof HTMLElement && !!t.closest('.react-flow'));
  };

  // Enter / F2 with exactly one note selected opens it for editing, as a
  // click does (Tab-focused notes handle the key themselves).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Enter' && e.key !== 'F2') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (shortcutBlocked(e) || isControlTarget(e.target) || !onCanvas(e)) return;
      const selected = getNodes().filter((n) => n.selected && !isStrokeId(n.id));
      if (selected.length !== 1 || selected[0]!.type !== 'text') return;
      e.preventDefault();
      requestTextEdit(selected[0]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [getNodes]);

  // Delete / Backspace removes what is selected: drawings and free nodes
  // (tasks with their chain cascade, as from the right-click menu). Mother
  // nodes are fixed and never deleted. Ctrl+Z brings it back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (shortcutBlocked(e) || !onCanvas(e)) return;
      const board = useBoardStore.getState().board;
      const selected = getNodes().filter((n) => n.selected).map((n) => n.id);
      const strokeIds = selected.filter(isStrokeId).map((id) => id.slice(STROKE_NODE_PREFIX.length));
      const nodes = selected
        .filter((id) => !isStrokeId(id))
        .map((id) => board?.nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n && !n.isMother);
      if (!strokeIds.length && !nodes.length) return;
      e.preventDefault();
      const count = strokeIds.length + nodes.length;
      undoable(`Deleted ${count} item${count === 1 ? '' : 's'}`, () => {
        if (strokeIds.length) useBoardStore.getState().removeStrokes(strokeIds);
        const taskIds = nodes.filter((n) => n.kind === 'todo.task').map((n) => n.id);
        if (taskIds.length) deleteTaskNodesCascade(taskIds);
        for (const n of nodes) if (n.kind !== 'todo.task') removeNode(n.id);
      });
      const updated = useBoardStore.getState().board;
      if (updated && nodes.length) void saveBoard(updated);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [getNodes, removeNode]);

  // Global undo/redo: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z = redo.
  // Skipped when focus is on an editable surface so it doesn't fight inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (shortcutBlocked(e)) return;
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
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMediaPos = useRef<{ x: number; y: number } | null>(null);

  // One notice line for files that could not be added (drop, paste, picker).
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!fileNotice) return;
    const t = setTimeout(() => setFileNotice(null), 4500);
    return () => clearTimeout(t);
  }, [fileNotice]);

  const spawnImageNodeFromFile = useCallback(async (
    file: File,
    pos: { x: number; y: number },
  ) => {
    const reason = imageRejectReason(file);
    if (reason) { setFileNotice(`Couldn't add “${file.name}”: ${reason}`); return; }
    let result: Awaited<ReturnType<typeof ingestImageFile>> = null;
    try {
      result = await ingestImageFile(file);
    } catch (err) {
      console.warn('[image] could not store', file.name, err);
    }
    if (!result) { setFileNotice(`Couldn't add “${file.name}”`); return; }
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

  // ── Dock / pane-menu add-node handler — text/frame land in the dock-spawn
  //   lane below the mother row by default, OR at the caller-supplied `at`
  //   position (used by the empty-canvas right-click menu so spawns appear
  //   right where the user clicked). image opens the OS file picker; the
  //   `at` position is stashed in pendingImageDropPos so the spawn after the
  //   picker resolves at the click point too.
  // "Show on canvas" from the Calendar / Clock right-click menus (any surface,
  // no ReactFlow context needed there) — centre the node here.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      const n = id ? useBoardStore.getState().board?.nodes.find((x) => x.id === id) : undefined;
      if (!n) return;
      // A free node on another canvas: go to that canvas first (Decision 33).
      if (!isSharedNode(n) && n.canvasId) useBoardStore.getState().switchCanvas(n.canvasId);
      // Use the drawn position: the mother row is placed at render time.
      const at = getNodes().find((x) => x.id === n.id)?.position ?? n.position;
      if (n.isMother) setCenter(at.x + MOTHER_WIDTH / 2, at.y + MOTHER_HEIGHT / 2, { duration: 400, zoom: 0.9 });
      else setCenter(at.x + 110, at.y + 80, { duration: 400, zoom: 0.9 });
    };
    window.addEventListener(FOCUS_NODE_EVENT, onFocus);
    // The plan guide fits the Todo and the Calendar on screen together, so a
    // row can be dragged onto the grid (engagement.md F14).
    const onFit = (e: Event) => {
      const ids = (e as CustomEvent<{ nodeIds?: string[] }>).detail?.nodeIds ?? [];
      if (ids.length) fitView({ nodes: ids.map((id) => ({ id })), padding: 0.08, duration: 400, maxZoom: 1 });
    };
    window.addEventListener(FIT_NODES_EVENT, onFit);
    return () => {
      window.removeEventListener(FOCUS_NODE_EVENT, onFocus);
      window.removeEventListener(FIT_NODES_EVENT, onFit);
    };
  }, [setCenter, getNodes, fitView]);

  const handleAddNode = useCallback((args: { kind: NodeKind; at?: { x: number; y: number }; look?: TextLook }) => {
    // Auto-enable the layer filter for the spawned kind so the new node is
    // immediately visible. Without this, toggling TEXTS / IMAGES off on the
    // KRNL Dock then clicking "add text" silently spawned a hidden node and
    // looked broken.
    const layer = kindToLayer(args.kind);
    if (layer) useLayerVisibility.getState().setLayer(layer, true);

    if (args.kind === 'image') {
      // Stash the desired spawn position so onPickImageFile uses it instead
      // of the default dock lane. Cleared after the picker resolves.
      if (args.at) pendingImageDropPos.current = args.at;
      imageFileInputRef.current?.click();
      return;
    }
    // Decision 32 — Analytics is a fixed mother, never spawned. The dock button
    // (or 'A') toggles its window in Station mode (where it takes the canvas
    // panel) and brings it into view in Canvas mode (where it sits in the
    // mother row).
    if (args.kind === 'analytics') {
      const current = useBoardStore.getState().board;
      if (isStationShown(current?.layoutMode)) {
        toggleAnalyticsShown();
        return;
      }
      const mother = findAnalyticsMother(current);
      if (mother) {
        const y = motherRowY(current?.nodes ?? []);
        const rf = getNodes().find((n) => n.id === mother.id);
        setCenter((rf?.position.x ?? mother.position.x) + MOTHER_WIDTH / 2, y + MOTHER_HEIGHT / 2, { zoom: 1, duration: 380 });
      }
      return;
    }
    const pos = args.at ?? defaultDockSpawnPos();
    const defaultState: Record<NodeKind, Record<string, unknown>> = {
      pomo: {}, todo: {}, habit: {}, term: {}, calendar: {},
      // clock is a permanent mother — never spawnable via handleAddNode.
      // Entry required only for Record<NodeKind, ...> type completeness.
      clock: {},
      'pomo.session': {}, 'todo.task': {}, 'habit.day': {},
      // Sticky notes / shapes are text nodes with a look (Miro-style).
      text: args.look && args.look.kind !== 'note'
        ? { text: '', look: args.look, width: 200, height: args.look.kind === 'sticky' ? 200 : 140 }
        : { text: '' },
      image: {},
      frame: defaultFrameState() as unknown as Record<string, unknown>,
      // analytics is a permanent mother (Decision 32) — handled above.
      analytics: {},
      // media is created by dropping a file or link (dropMedia.ts).
      media: {},
    };
    const defaultConfigByKind: Partial<Record<NodeKind, Record<string, unknown>>> = {
      frame: defaultFrameConfig() as unknown as Record<string, unknown>,
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
    };
    const sz = sizes[args.kind];
    if (sz) ensureVisible({ x: pos.x, y: pos.y, width: sz.width, height: sz.height });
  }, [addNode, defaultDockSpawnPos, ensureVisible, setCenter]);

  // ── Pane-ctx "+ Task" / "+ Habit" — submit handlers ─────────────────────
  // Task: spawn at click flow pos, parent to todo mother (parentTodoId is a
  // required invariant), link bidirectionally via todoAdd/todoLinkTask. Skip
  // the chain edge to the previous sibling — that's the "not connected to the
  // one before" the user asked for.
  // Habit: dispatch habit.add on the habit mother, then spawn a habit.lane
  // for the new habit at the click pos (mirroring habit.spawnLane's lane node
  // shape but with custom position instead of laneCount slotting).
  const spawnTaskAtFlowPos = useCallback(
    (text: string, flowX: number, flowY: number, plannedMin?: number) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const board = useBoardStore.getState().board;
      if (!board) return;
      const todoMother = board.nodes.find((n) => n.kind === 'todo' && n.isMother === true);
      if (!todoMother) {
        emit('sys.error', 'No todo mother on board — cannot spawn task', { severity: 'err' });
        return;
      }
      const pomoMother = board.nodes.find((n) => n.kind === 'pomo');
      const cfg = (pomoMother?.config as PomoConfig | null) ?? defaultPomoConfig();
      const sessionMin = cfg.sessionMin;
      const effectivePlanned =
        typeof plannedMin === 'number' && Number.isFinite(plannedMin) && plannedMin >= 1
          ? Math.max(1, Math.min(480, Math.round(plannedMin)))
          : sessionMin;

      // todoAdd → grab the new TodoItem.id → todoLinkTask
      const prevTodoState = todoMother.state as TodoState;
      const taskNodeId = `task-${crypto.randomUUID()}`;
      let nextTodoState = todoAdd(prevTodoState, { text: trimmed });
      const newItem = nextTodoState.items[nextTodoState.items.length - 1];
      if (!newItem) return;
      nextTodoState = todoLinkTask(nextTodoState, { itemId: newItem.id, taskNodeId });

      const { updateNode } = useBoardStore.getState();
      updateNode(todoMother.id, { state: nextTodoState });

      // seq among root tasks under this todo (parentTaskId === null)
      const rootSiblings = board.nodes.filter((n) => {
        if (n.kind !== 'todo.task') return false;
        const ts = n.state as TaskState;
        return ts.parentTodoId === todoMother.id && ts.parentTaskId === null;
      });
      const seq = rootSiblings.length + 1;

      const taskState: TaskState = {
        text: trimmed,
        done: false,
        durationMin: sessionMin,
        eta: `~${effectivePlanned} min`,
        sequenceNumber: seq,
        layer: 0,
        createdAt: new Date().toISOString(),
        parentTodoId: todoMother.id,
        parentTaskId: null,
        todoItemId: newItem.id,
        pomoSessionsCompleted: 0,
        plannedMin: effectivePlanned,
        // No time given → open-ended (fades out on Calendar / Clock).
        ...(typeof plannedMin === 'number' && Number.isFinite(plannedMin) && plannedMin >= 1 ? {} : { timeOpen: true }),
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
        kind: 'event', // #180 — Todo creates events only (calendar renders events)
      };
      const newTask: KrnlNode = {
        id: taskNodeId,
        kind: 'todo.task',
        position: { x: flowX, y: flowY },
        isMother: false,
        state: taskState,
        config: { showDuration: true },
      };
      addNode(newTask);
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      emit('task.created', `task ${taskNodeId.slice(0, 10)} added (orphan @click)`, {
        refId: taskNodeId,
      });
      // Auto-enable the TASKS layer if it was hidden so the spawned task
      // doesn't silently disappear.
      const layer = kindToLayer('todo.task');
      if (layer) useLayerVisibility.getState().setLayer(layer, true);
      ensureVisible({ x: flowX, y: flowY, width: 240, height: 160 });
    },
    [addNode, ensureVisible],
  );

  const spawnHabitAtFlowPos = useCallback(
    (name: string, flowX: number, flowY: number) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const board = useBoardStore.getState().board;
      if (!board) return;
      const habitMother = board.nodes.find((n) => n.kind === 'habit' && n.isMother === true);
      if (!habitMother) {
        emit('sys.error', 'No habit mother on board — cannot spawn habit', { severity: 'err' });
        return;
      }

      // habit.add via mother's command handler (single source of truth).
      getCommandHandler(habitMother.id)('habit.add', { name: trimmed });

      // Re-read board: habitAdd appends, new habit is at .habits.at(-1).
      const fresh = useBoardStore.getState().board;
      if (!fresh) return;
      const motherAfter = fresh.nodes.find((n) => n.id === habitMother.id);
      const habits = (motherAfter?.state as HabitState | null)?.habits ?? [];
      const newHabit = habits.at(-1);
      if (!newHabit) return;

      // Decision 42 — habit.add already put the habit's card on the board;
      // here it goes where you clicked (never a second card).
      const existingCard = fresh.nodes.find((n) => n.kind === 'habit.lane' && (n.state as { habitId?: string }).habitId === newHabit.id);
      const lane: KrnlNode = existingCard ?? {
        id: `habit-lane-${crypto.randomUUID()}`,
        kind: 'habit.lane',
        position: { x: flowX, y: flowY },
        isMother: false,
        state: { habitId: newHabit.id } as unknown as Record<string, unknown>,
        config: { days: 28 },
      };
      if (existingCard) useBoardStore.getState().updateNode(existingCard.id, { position: { x: flowX, y: flowY } });
      else addNode(lane);
      const saved = useBoardStore.getState().board;
      if (saved) void saveBoard(saved);
      emit('node.added', `habit.lane spawned for habit ${newHabit.id.slice(0, 8)}`, {
        refId: lane.id,
      });
      // Auto-enable HABITS layer (same reason as task path).
      const layer = kindToLayer('habit.lane');
      if (layer) useLayerVisibility.getState().setLayer(layer, true);
      ensureVisible({ x: flowX, y: flowY, width: 480, height: 160 });
    },
    [addNode, ensureVisible],
  );

  // ── Drag-drop image files onto the canvas (image-node F1/F2) ──────────────
  // Drop anything: image / video / audio / PDF files, or a link
  // (YouTube, Vimeo, … embed; other URLs become a link card).
  const onDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes('Files') && !types.includes('text/uri-list') && !types.includes('text/plain')) return;
    if (types.includes('application/krnl-task')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const spawnMediaNode = useCallback((state: MediaState, pos: { x: number; y: number }) => {
    const size = MEDIA_SIZE[state.media];
    const newNode: KrnlNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'media',
      position: { x: pos.x, y: pos.y },
      state: { ...state, width: size.width, height: size.height },
      config: {},
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
    ensureVisible({ x: pos.x, y: pos.y, width: size.width, height: size.height });
  }, [addNode, ensureVisible]);

  // One path for every dropped / pasted / picked file.
  const spawnFile = useCallback(async (file: File, pos: { x: number; y: number }) => {
    const kind = classifyFile(file);
    if (kind === 'image') { await spawnImageNodeFromFile(file, pos); return; }
    const assetId = await ingestMediaFile(file);
    if (!assetId) { setFileNotice(`Couldn't add “${file.name}”`); return; }
    spawnMediaNode({ media: kind, src: assetId, title: file.name, size: file.size }, pos);
  }, [spawnImageNodeFromFile, spawnMediaNode]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('application/krnl-task')) return;
    const files = Array.from(e.dataTransfer.files);
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (files.length === 0) {
      const link = classifyUrl(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
      if (!link) return;
      e.preventDefault();
      spawnMediaNode({ media: link.media, src: link.url, title: new URL(link.url).hostname.replace(/^www\./, '') }, pos);
      return;
    }
    e.preventDefault();
    for (const file of files) {
      await spawnFile(file, pos);
      pos.x += 24;
      pos.y += 24;
    }
  }, [screenToFlowPosition, spawnFile, spawnMediaNode]);

  // ── Paste anything (Ctrl/Cmd+V) ────────────────────────────────────────────
  // Files → image / media nodes; a link → embedded player or website preview
  // (switch it to plain text from its header); other text → a text note.
  // Lands at the last pointer position over the canvas.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const spawnFiles = useCallback(async (files: File[], pos: { x: number; y: number }) => {
    for (const file of files) {
      await spawnFile(file, pos);
      pos = { x: pos.x + 24, y: pos.y + 24 };
    }
  }, [spawnFile]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) return;
      const data = e.clipboardData;
      if (!data) return;
      const at = lastPointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const pos = screenToFlowPosition(at);
      const files = Array.from(data.files);
      if (files.length > 0) {
        e.preventDefault();
        void spawnFiles(files, pos);
        return;
      }
      const text = data.getData('text/plain').trim();
      if (!text) return;
      e.preventDefault();
      const link = !/\s/.test(text) ? classifyUrl(text) : null;
      if (link) {
        spawnMediaNode({ media: link.media, src: link.url, title: new URL(link.url).hostname.replace(/^www\./, '') }, pos);
        return;
      }
      const lines = text.split('\n').length;
      addNode({
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'text',
        position: pos,
        state: { text, width: 280, height: Math.min(600, 60 + lines * 24) },
        config: {},
        isMother: false,
      });
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [screenToFlowPosition, spawnFiles, spawnMediaNode, addNode]);

  // Dropped a connection on a node's body instead of its dot → connect anyway,
  // keeping the direction of the handle the drag started from.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!pt) return;
    const id = targetNodeIdAt(pt.clientX, pt.clientY);
    if (!id || id === state.fromNode.id) return;
    const fromSource = state.fromHandle?.type !== 'target';
    onConnectRef.current({
      source: fromSource ? state.fromNode.id : id,
      target: fromSource ? id : state.fromNode.id,
      sourceHandle: null,
      targetHandle: null,
    });
  }, []);

  // ── onConnect — wire a visual link edge between two non-mother nodes ──────
  const onConnectRef = useRef<(c: Connection) => void>(() => {});
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
    // Easy mode: no task ↔ habit links (task chains still work).
    if (isTaskFlow && (srcIsHabitLane || tgtIsHabitLane) && isEasyBoard(board)) {
      emit('sys.error', 'Task–habit links are an Advanced feature (Settings → Mode)', { severity: 'warn' });
      return;
    }

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
    // A task.next loop leaves the chain with no start task, which makes every
    // task in it disappear from Calendar and Clock — refuse to close one.
    if (event === 'task.next' && wouldCreateChainCycle(existingEdges, conn.source, conn.target)) {
      emit('sys.error', 'link refused: it would make the task chain loop back on itself', { severity: 'warn' });
      return;
    }

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
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);

  // In station mode the mothers are rendered as station cells in
  // StationLayout — the embedded canvas must hide them (and their edges) so
  // they aren't drawn twice. ADR 0008 § 2.5.
  // The effective mode: below the station minimum size the window falls
  // back to the canvas, and the mothers must be drawn here (ADR 0008 § 9.5).
  const isStation = useStationViewportGate().effectiveMode === 'station';

  // ── Derive RF nodes from boardStore — memoized per-id ───────────────────
  // Stable RFNode identity unless the underlying KrnlNode reference changes.
  // Also appends swap-button pseudo-nodes between every adjacent mother pair
  // so the user can reorder mothers via a click instead of drag-and-drop.
  const derivedNodes = useMemo((): KrnlRFNode[] => {
    if (!board) return [];

    // Compute slot ordering for mother nodes (sorted by position.x). Mothers
    // hidden from the top-bar panel toggles disappear in canvas mode too, and
    // the visible ones close the gap: each is drawn at the next slot of the
    // mother row (render-only — persisted positions keep the order).
    const motherNodes = board.nodes
      .filter((n: KrnlNode) => n.isMother && !isStationHidden(n))
      .slice()
      .sort((a: KrnlNode, b: KrnlNode) => a.position.x - b.position.x);
    const rowStartX = Math.min(...motherNodes.map((n) => n.position.x), MOTHER_ROW_START_X);
    const displayX = new Map<string, number>(
      motherNodes.map((n, i) => [n.id, rowStartX + i * MOTHER_ROW_STEP]),
    );
    const rowY = motherRowY(board.nodes);
    const slotTotal = motherNodes.length;
    const slotIndexMap = new Map<string, number>(
      motherNodes.map((n: KrnlNode, i: number) => [n.id, i + 1])
    );

    // Source nodes for RF derivation — drop mothers entirely in station mode,
    // and free nodes that belong to another canvas (Decision 33).
    const canvasId = activeCanvasOf(board);
    const sourceNodes = (isStation
      ? board.nodes.filter((n) => !n.isMother)
      : board.nodes.filter((n) => !n.isMother || displayX.has(n.id))
    ).filter((n) => isOnCanvas(n, canvasId));

    const baseNodes: KrnlRFNode[] = sourceNodes.map((node: KrnlNode) => {
      const onCommand = getCommandHandler(node.id);
      const onSelect = getSelectHandler(node.id, selectNode);

      if (!node.isMother) {
        return getMemoizedRfNode(node, { onCommand, onSelect });
      }

      // Mother node: cache by (node ref, slotIndex, slotTotal).
      const slotIndex = slotIndexMap.get(node.id) ?? 1;
      const x = displayX.get(node.id) ?? node.position.x;
      const cached = rfMotherCache.get(node.id);
      if (
        cached &&
        cached.src === node &&
        cached.slotIndex === slotIndex &&
        cached.slotTotal === slotTotal &&
        cached.rf.position.x === x &&
        cached.rf.position.y === rowY
      ) {
        return cached.rf;
      }

      const shown = x === node.position.x && rowY === node.position.y ? node : { ...node, position: { x, y: rowY } };
      const rf = toRfNode(shown, {
        onCommand,
        onSelect,
        slotIndex,
        slotTotal,
      });
      rfMotherCache.set(node.id, { src: node, slotIndex, slotTotal, rf });
      return rf;
    });

    // SwapButton pseudo-nodes were removed 2026-05-18 in favour of HTML5
    // drag-and-drop from a top-edge grab handle inside each MotherFrame
    // (matches the station-mode swap UX). The button-between-pairs metaphor
    // didn't scale to non-adjacent swaps and forced users to step through
    // intermediates; drag-onto-target lets any pair swap in one gesture.
    const swapNodes: KrnlRFNode[] = [];

    // Apply canvas-wide layer filters from useLayerVisibility. Only nodes
    // whose kind has a registered layer (tasks / texts / images) are affected;
    // mothers + frames + habits stay visible regardless. Spread-clone only the
    // ones that need `hidden:true` so identity is preserved for unaffected nodes.
    const leftBoard = showFinished ? new Set<string>() : finishedTaskIds(board, finishedPolicy, Date.now());
    const filteredBase = baseNodes.map((rf, idx) => {
      const node = sourceNodes[idx];
      if (!node) return rf;
      if (leftBoard.has(node.id)) return { ...rf, hidden: true };
      const layer = kindToLayer(node.kind);
      if (!layer) return rf;
      const visible = layer === 'tasks' ? layerTasks
        : layer === 'texts' ? layerTexts
        : layerImages;
      if (visible) return rf;
      return { ...rf, hidden: true };
    });

    const strokeNodes = (board.drawings ?? []).filter((d) => isStrokeOnCanvas(d, canvasId)).map(strokeRfNode);
    // Hidden cards (finished, or a layer switched off) are left out of the
    // canvas, not handed to React Flow as `hidden`: RF keeps a hidden node's
    // old wire dots, so a new wire snapped onto an invisible card, and wires
    // between two hidden cards were still drawn.
    return [...filteredBase.filter((n) => !n.hidden), ...swapNodes, ...strokeNodes];
  }, [board, selectNode, layerTasks, layerTexts, layerImages, isStation, finishedPolicy, showFinished, finishedClock]);

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
    // In station mode, drop edges whose source or target is a mother — those
    // mothers are rendered as station cells and have no canvas counterpart.
    const motherIds = isStation
      ? new Set(board.nodes.filter((n) => n.isMother).map((n) => n.id))
      : null;
    // Only wires whose two ends are on the canvas right now (not hidden).
    const shownIds = new Set(derivedNodes.map((n) => n.id));
    const onCanvas = edgesOnCanvas(board.edges, visibleNodeIds(board.nodes, activeCanvasOf(board)))
      .filter((e) => shownIds.has(e.from.nodeId) && shownIds.has(e.to.nodeId));
    const withoutMothers = motherIds
      ? onCanvas.filter((e) => !motherIds.has(e.from.nodeId) && !motherIds.has(e.to.nodeId))
      : onCanvas;
    // Habit and event cards have no wire dots, so an old wire to one has
    // nothing to attach to: it is not drawn (it still exists in the board).
    const visibleEdges = withoutMothers.filter((e) => kindMap.get(e.from.nodeId) !== 'habit.lane' && kindMap.get(e.to.nodeId) !== 'habit.lane');
    return visibleEdges.map((edge) => {
      const srcKind = kindMap.get(edge.from.nodeId) ?? '';
      const tgtKind = kindMap.get(edge.to.nodeId) ?? '';
      return getMemoizedRfEdge(edge, srcKind, tgtKind);
    });
  }, [board, isStation, derivedNodes]);

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
  // (The bold set lives in BoldSetProvider: hovering a window re-renders only the wires.)

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

      const strokeMoves: Array<{ id: string; dx: number; dy: number }> = [];
      for (const change of changes) {
        if (change.type === 'position') {
          if (change.dragging === true) {
            isDraggingRef.current = true;
          } else if (change.dragging === false) {
            isDraggingRef.current = false;
            if (change.position && isStrokeId(change.id)) {
              // Strokes live on board.drawings: move their points by how far
              // the box moved. All strokes of one drag are one undo step.
              const sid = change.id.slice(STROKE_NODE_PREFIX.length);
              const s = useBoardStore.getState().board?.drawings?.find((d) => d.id === sid);
              if (s) {
                const b = strokeBox(s);
                strokeMoves.push({ id: sid, dx: change.position.x - b.x, dy: change.position.y - b.y });
              }
            } else if (change.position) {
              commitDragEnd(change.id);
            }
          }
        }
      }
      if (strokeMoves.length) useBoardStore.getState().moveStrokes(strokeMoves);
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
    // Where the store had it before this drag (for hidden frame children).
    const before = useBoardStore.getState().board?.nodes.find((n) => n.id === draggedId)?.position;

    // Align to grid: the drop settles on the nearest free grid spot (a frame
    // only snaps; its children move with it). Others moving in the same
    // gesture don't count as in the way.
    const alignOn = onGrid(gridScopeOf(useBoardStore.getState().board?.alignGrid), draggedKind, dragged.data?.node?.isMother === true);
    const pos = { ...dragged.position };
    if (alignOn) {
      const boxOf = (n: KrnlRFNode): Box => ({ x: n.position.x, y: n.position.y, w: (n.measured?.width ?? n.width ?? 0) as number, h: (n.measured?.height ?? n.height ?? 0) as number });
      if (draggedKind === 'frame') {
        pos.x = snapGrid(pos.x); pos.y = snapGrid(pos.y);
      } else {
        const obstacles = all
          .filter((n) => n.id !== draggedId && !n.selected && !n.dragging && n.data?.node?.kind !== 'frame' && !isStrokeId(n.id) && !n.hidden)
          .map(boxOf);
        Object.assign(pos, landing(boxOf(dragged), obstacles));
      }
      if (pos.x !== dragged.position.x || pos.y !== dragged.position.y) settleNodes([draggedId]);
    }
    const shift = { dx: pos.x - dragged.position.x, dy: pos.y - dragged.position.y };
    updateNode(draggedId, { position: pos });
    // The canvas keeps its own copy while dragging; move it there too (the
    // store may not change at all when the free spot is where it started).
    if (shift.dx || shift.dy) {
      const kids = new Set(draggedKind === 'frame' ? ((dragged.data.node.state as FrameState).childIds ?? []) : []);
      setNodes((nds) => nds.map((n) => (n.id === draggedId ? { ...n, position: pos }
        : kids.has(n.id) ? { ...n, position: { x: n.position.x + shift.dx, y: n.position.y + shift.dy } } : n)));
    }

    if (draggedKind === 'frame') {
      const fs = dragged.data.node.state as FrameState;
      // A child that is hidden (finished, layer off) is not on the canvas, so
      // the drag didn't move it: move it by the frame's whole drag.
      for (const cid of fs.childIds ?? []) {
        const child = all.find((n) => n.id === cid);
        if (child) updateNode(cid, { position: { x: child.position.x + shift.dx, y: child.position.y + shift.dy } });
        else if (before) {
          const stored = useBoardStore.getState().board?.nodes.find((n) => n.id === cid);
          if (stored) updateNode(cid, { position: { x: stored.position.x + pos.x - before.x, y: stored.position.y + pos.y - before.y } });
        }
      }
      if (shift.dx || shift.dy) settleNodes(fs.childIds ?? []);
    } else if (draggedKind && draggedKind !== 'frame') {
      // Skip mothers — they are not eligible to be soft-grouped.
      const isMother = dragged.data?.node?.isMother === true;
      if (!isMother) {
        const w = (dragged.measured?.width ?? dragged.width ?? 0) as number;
        const h = (dragged.measured?.height ?? dragged.height ?? 0) as number;
        const cx = pos.x + w / 2;
        const cy = pos.y + h / 2;
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
        // A node shown on several canvases (tasks) has one position: moved
        // here, it has left any frame on the other canvases too.
        const shown = new Set(all.map((n) => n.id));
        for (const f of useBoardStore.getState().board?.nodes ?? []) {
          if (f.kind !== 'frame' || shown.has(f.id)) continue;
          const fs = f.state as FrameState;
          if (fs.childIds?.includes(draggedId)) {
            updateNode(f.id, { state: { ...fs, childIds: fs.childIds.filter((id) => id !== draggedId) } });
          }
        }
      }
    }

    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
  }, [getNodes, updateNode, setNodes]);

  // ── Align to grid: turning it on tidies the canvas once ──────────────────
  // Fixed things (windows, frames and what is in them) stay; every other card,
  // note and image settles on its nearest free grid spot, in reading order.
  // One undo step. Runs on the switch going on (Settings or `krnl settings
  // grid on`), not on every load.
  const gridScope = useBoardStore((s) => gridScopeOf(s.board?.alignGrid));
  const gridWas = useRef<'cards' | 'all' | null | undefined>(undefined);
  useEffect(() => {
    const was = gridWas.current;
    gridWas.current = gridScope;
    // Only when it is switched on, or widened from cards to everything.
    if (was === undefined || !gridScope || was === gridScope || was === 'all') return;
    const all = getNodes() as KrnlRFNode[];
    const inFrame = new Set(all.flatMap((n) => (n.data?.node?.kind === 'frame' ? ((n.data.node.state as FrameState).childIds ?? []) : [])));
    const items = all.filter((n) => !isStrokeId(n.id) && !n.hidden).map((n) => ({
      id: n.id,
      box: { x: n.position.x, y: n.position.y, w: (n.measured?.width ?? n.width ?? 0) as number, h: (n.measured?.height ?? n.height ?? 0) as number },
      movable: onGrid(gridScope, n.data?.node?.kind, n.data?.node?.isMother === true) && n.data?.node?.kind !== 'frame' && !inFrame.has(n.id) && n.draggable !== false,
    }));
    const moves = alignAll(items);
    if (moves.size === 0) return;
    useBoardStore.getState().moveNodes([...moves].map(([id, p]) => ({ id, ...p })));
    settleNodes([...moves.keys()]);
  }, [gridScope, getNodes]);

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
      selectNode(nodes.length === 1 && !isStrokeId(nodes[0]!.id) ? nodes[0]!.id : null);
    },
    [selectNode]
  );

  return (
    <div ref={canvasContainerRef} style={{ width: '100%', height: '100%' }}>
    <BoldSetProvider>
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={ALL_NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      defaultViewport={initialViewport}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      // Easier wiring: snap to a handle from further away, and dropping
      // anywhere on a node (not just on its dot) still connects.
      connectionRadius={48}
      onConnectEnd={onConnectEnd}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={handleEdgeContextMenu}
      onPaneClick={() => { closeCtxMenu(); closePaneCtxMenu(); setEdgeCtxMenu(null); }}
      onPaneMouseMove={(e) => { lastPointer.current = { x: e.clientX, y: e.clientY }; }}
      // Right-click on empty canvas → wheel. Handled here, not via
      // onPaneContextMenu: with right-drag panning RF only fires that when the
      // mouse moved 0px, so any jitter swallowed the menu.
      onPointerDownCapture={(e: React.PointerEvent) => { if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY }; }}
      onContextMenu={(e: React.MouseEvent) => {
        const t = e.target as HTMLElement;
        if (!t.closest('.react-flow__pane') || t.closest('.react-flow__node, .react-flow__edge')) return;
        e.preventDefault();
        const d = rightDown.current;
        rightDown.current = null;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // that was a right-drag pan
        handlePaneContextMenu(e);
      }}
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
      //
      // `panOnScrollSpeed` is the wheel-delta → flow-units multiplier. macOS
      // trackpads emit small deltas (≈ 1-4 px / frame) so values < 1 feel
      // sluggish; 1.25 produces a snappy ratio that matches Figma / Miro on
      // the same hardware without overshooting on long flicks.
      panOnScroll
      panOnScrollSpeed={1.25}
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

      {/* Pen tool — strokes + capture layer while drawing */}
      <DrawLayer />

      {/* Left dock */}
      {/* Full-canvas, click-through box so the dock can snap to the top,
          middle or bottom of the left edge, or the bottom centre. */}
      {/* Not an RF <Panel>: Panel forces pointer-events:all, which made this
          full-canvas box swallow every click (incl. right-click). */}
      <div data-testid="dock-layer" style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
        <Dock onAddNode={handleAddNode} dockStyle={dockStyle} onDockStyleChange={setDockStyle} />
      </div>

      {/* Hidden file picker for the dock's "image" button (no placeholder
          node is ever created — the picker spawns a real ImageNode with an
          assetId in one step). */}
      {fileNotice && (
        <div role="status" data-testid="canvas-file-notice" style={{
          position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 50,
          padding: '8px 14px', borderRadius: 999, background: 'var(--paper-2)', border: '1px solid var(--rust)',
          color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, boxShadow: 'var(--shadow-1)',
        }}>{fileNotice}</div>
      )}

      {/* File picker for the wheel's Media → Video/PDF (any file works). */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept="*/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const pos = pendingMediaPos.current ?? defaultDockSpawnPos();
          pendingMediaPos.current = null;
          await spawnFile(file, pos);
        }}
        style={{ display: 'none' }}
        data-testid="canvas-media-file-input"
      />
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

      {/* Empty-pane right-click — quick spawn at the click point. Mirrors
          the dock's create buttons but anchors the new node to where the
          user actually right-clicked instead of the dock-spawn lane. */}
      {paneCtxMenu !== null && (
        <PieMenu
          testId="canvas-wheel"
          x={paneCtxMenu.x}
          y={paneCtxMenu.y}
          onClose={closePaneCtxMenu}
          items={canvasWheelItems({
            task: () => setPaneNamePrompt({ kind: 'task', x: paneCtxMenu.x, y: paneCtxMenu.y, flowX: paneCtxMenu.flowX, flowY: paneCtxMenu.flowY }),
            habit: () => setPaneNamePrompt({ kind: 'habit', x: paneCtxMenu.x, y: paneCtxMenu.y, flowX: paneCtxMenu.flowX, flowY: paneCtxMenu.flowY }),
            note: () => handleAddNode({ kind: 'text', at: { x: paneCtxMenu.flowX, y: paneCtxMenu.flowY } }),
            look: (look) => handleAddNode({ kind: 'text', look, at: { x: paneCtxMenu.flowX, y: paneCtxMenu.flowY } }),
            image: () => handleAddNode({ kind: 'image', at: { x: paneCtxMenu.flowX, y: paneCtxMenu.flowY } }),
            mediaFile: () => {
              pendingMediaPos.current = { x: paneCtxMenu.flowX, y: paneCtxMenu.flowY };
              mediaFileInputRef.current?.click();
            },
            frame: () => handleAddNode({ kind: 'frame', at: { x: paneCtxMenu.flowX, y: paneCtxMenu.flowY } }),
            pen: () => useDrawStore.getState().openWheel(paneCtxMenu.x, paneCtxMenu.y),
          })}
        />
      )}

      {paneNamePrompt !== null && (
        <PaneNamePrompt
          x={paneNamePrompt.x}
          y={paneNamePrompt.y}
          kind={paneNamePrompt.kind}
          onCommit={(text, durationMin) => {
            const np = paneNamePrompt;
            closePaneNamePrompt();
            if (np.kind === 'task') {
              spawnTaskAtFlowPos(text, np.flowX, np.flowY, durationMin);
            } else {
              spawnHabitAtFlowPos(text, np.flowX, np.flowY);
            }
          }}
          onCancel={closePaneNamePrompt}
        />
      )}

      {/* The app's shared menu (same look as every other right-click menu). */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onDismiss={closeCtxMenu}
          items={[{
            label: ctxMenu.nodeIds.length > 1 ? `Delete ${ctxMenu.nodeIds.length} items` : 'Delete',
            danger: true,
            onSelect: deleteFromCtxMenu,
          }]}
        />
      )}
    </ReactFlow>
    </BoldSetProvider>
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

/**
 * Which source nodes bold their outgoing wires while a window is hovered.
 * Its own component (#226): hovering a window used to re-render the whole
 * canvas on every enter/leave; now only the wires that read this re-render
 * (the canvas passed as children keeps its element identity).
 */
function BoldSetProvider({ children }: { children: React.ReactNode }) {
  const board = useBoardStore((s) => s.board);
  const hoveredNodeId = useBoardStore((s) => s.hoveredNodeId);
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
  return <BoldSetContext.Provider value={boldSet}>{children}</BoldSetContext.Provider>;
}

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

// PaneNamePrompt — small input portal anchored at viewport coords.
// For 'task' kind it is two-phase (name → duration) mirroring TaskNode's
// subtask/next inline input. For 'habit' it is single-phase (name only).
// Enter advances or commits; Escape backs up (duration → name) or cancels.
function PaneNamePrompt({
  x,
  y,
  kind,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  kind: 'task' | 'habit';
  onCommit: (text: string, durationMin?: number) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [phase, setPhase] = useState<'name' | 'duration'>('name');
  const [durationInvalid, setDurationInvalid] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [onCancel]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (phase === 'name') {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const t = name.trim();
        if (!t) {
          onCancel();
          return;
        }
        if (kind === 'habit') {
          onCommit(t);
        } else {
          setPhase('duration');
          setDuration('');
          setDurationInvalid(false);
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    } else {
      // duration phase (task only)
      if (e.key === 'Enter') {
        e.stopPropagation();
        // Time is optional (same as the Todo add row): empty → open-ended task.
        if (duration.trim() === '') { onCommit(name.trim()); return; }
        const parsed = parseInt(duration, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 480) {
          setDurationInvalid(false);
          onCommit(name.trim(), parsed);
        } else {
          setDurationInvalid(true);
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setPhase('name');
        setDuration('');
        setDurationInvalid(false);
      }
    }
  };

  // Clamp to viewport so the prompt is never clipped off-screen.
  const W = 220;
  const H = 36;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cx = Math.round(Math.min(Math.max(0, x), Math.max(0, vw - W)));
  const cy = Math.round(Math.min(Math.max(0, y), Math.max(0, vh - H)));

  const placeholder =
    phase === 'duration'
      ? 'how long? (min, optional — Enter to skip)'
      : kind === 'task'
        ? 'task name…'
        : 'habit name…';

  return createPortal(
    <div
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: cx,
        top: cy,
        width: W,
        zIndex: Z.topmost,
        background: 'var(--paper)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-1)',
        padding: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <input
        ref={inputRef}
        type={phase === 'duration' ? 'number' : 'text'}
        min={phase === 'duration' ? 1 : undefined}
        max={phase === 'duration' ? 480 : undefined}
        value={phase === 'name' ? name : duration}
        onChange={(e) => {
          if (phase === 'name') {
            setName(e.target.value);
          } else {
            setDuration(e.target.value);
            setDurationInvalid(false);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          background: 'var(--paper-2)',
          border: `1px solid ${durationInvalid ? 'var(--rust)' : 'var(--paper-3)'}`,
          borderRadius: 3,
          color: 'var(--ink)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          outline: 'none',
        }}
      />
    </div>,
    document.body,
  );
}
