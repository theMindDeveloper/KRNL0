/**
 * StationLayout — station-mode shell with resizable panels.
 *
 * ADR 0008 § 2.3 / § 2.4 / § 9.2.
 *
 * Layout (matches user-provided sketch):
 *   ┌─ DOCK TOP ─────────────────────────────────────────────┐
 *   │ [StationToolbar: panel-show/hide icons]                 │
 *   ├──────┬──────┬───────┬─────────────────────────────────┤
 *   │ Pomo │ Todo │ Habit │ Calendar                          │
 *   ├──────┴──────┴───────┴───────────────┬────────┬────────┤
 *   │      Embedded Canvas                │ Term   │ Clock  │
 *   └─ DOCK BOTTOM ──────────────────────────────────────────┘
 *
 * - Top row: 4 equal-width mother cells
 * - Bottom row: Canvas (60%) + Terminal (15%) + Clock (25%)
 * - StationToolbar (top strip) toggles each panel's visibility; hidden
 *   panels are OMITTED from the layout — neighbouring panels redistribute
 *   to fill the freed space (no empty windows).
 *
 * The whole shell is wrapped in `.dock-chassis dock-{style}` so the dock
 * chrome frames the entire layout. Variant-keyed padding clears the rails.
 *
 * NOTE: react-resizable-panels v4 requires Separators to be DIRECT children
 * of their parent Group — wrapping them in a div breaks push/pull drag.
 */

import { useRef, useCallback } from 'react';
import {
  Group,
  Panel,
  Separator,
  type GroupImperativeHandle,
  type Layout,
} from 'react-resizable-panels';
import { useBoardStore } from '../../store/boardStore';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { DOCK_REGISTRY } from '../ChassisLayer/dockRegistry';
import { StationCell } from './StationCell';
import { EmbeddedCanvasCell } from './EmbeddedCanvasCell';
import { StationToolbar } from './StationToolbar';
import { SLOT_DEFAULTS } from './SlotResolver';
import type { MotherNodeConfig, StationSlot } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';

const PANEL_IDS = {
  outerTop:    'station-top-row',
  outerBottom: 'station-bottom-row',
  colPomo:   'station-col-pomo',
  colTodo:   'station-col-todo',
  colHabit:  'station-col-habit',
  colCal:    'station-col-cal',
  bottomCanvas:   'station-bottom-canvas',
  bottomTerminal: 'station-bottom-terminal',
  bottomClock:    'station-bottom-clock',
} as const;

// Separator dimensions stay inline; background + interaction states live in
// chassis.css under `.station-splitter` so we can use :hover / :active /
// :focus pseudo-classes (inline styles can't). The focus rule resets the
// outline so clicked-and-released splitters don't keep glowing.
const verticalHandleStyle: React.CSSProperties = {
  width: 4,
  cursor: 'col-resize',
  flexShrink: 0,
};

const horizontalHandleStyle: React.CSSProperties = {
  height: 4,
  cursor: 'row-resize',
  flexShrink: 0,
};

// Top-row slot → (panel id, default size, station-cell slot prop)
const TOP_ROW_DEFS: ReadonlyArray<{
  panelId: string;
  defaultSize: number;
  slot: StationSlot;
}> = [
  { panelId: PANEL_IDS.colPomo,  defaultSize: SLOT_DEFAULTS.columns['top-left'],        slot: 'top-left' },
  { panelId: PANEL_IDS.colTodo,  defaultSize: SLOT_DEFAULTS.columns['top-center'],      slot: 'top-center' },
  { panelId: PANEL_IDS.colHabit, defaultSize: SLOT_DEFAULTS.columns['top-right-pre'],   slot: 'top-right-pre' },
  { panelId: PANEL_IDS.colCal,   defaultSize: SLOT_DEFAULTS.columns['top-right-upper'], slot: 'top-right-upper' },
];

// Terminal mother is default-hidden across every dock variant — users opt in
// via the StationToolbar toggle. Other mothers stay default-visible.
export function isStationHidden(node: Node | undefined): boolean {
  if (!node) return true; // missing == hidden
  const cfg = (node.config ?? {}) as MotherNodeConfig;
  if (cfg.stationHidden !== undefined) return !!cfg.stationHidden;
  if (node.kind === 'term') return true;
  return false;
}

export function StationLayout() {
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const storedGeometry = useBoardStore((s) => s.board?.layoutGeometry?.station);
  const board = useBoardStore((s) => s.board);
  const [dockStyle] = useDockStyle();

  const canvasHidden = storedGeometry?.canvasHidden ?? false;

  // Resolve mothers by slot so we can check visibility per top-row entry.
  const motherBySlot = new Map<StationSlot, Node>();
  for (const n of board?.nodes ?? []) {
    if (!n.isMother) continue;
    const slot = (n.config as MotherNodeConfig | undefined)?.stationSlot;
    if (slot) motherBySlot.set(slot, n);
  }

  const visibleTopDefs = TOP_ROW_DEFS.filter((d) => !isStationHidden(motherBySlot.get(d.slot)));
  const termHidden  = isStationHidden(motherBySlot.get('bottom-strip'));
  const clockHidden = isStationHidden(motherBySlot.get('top-right-lower'));
  const bottomVisible = {
    canvas:   !canvasHidden,
    terminal: !termHidden,
    clock:    !clockHidden,
  };
  const topRowVisible    = visibleTopDefs.length > 0;
  const bottomRowVisible = bottomVisible.canvas || bottomVisible.terminal || bottomVisible.clock;

  const outerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const topGroupRef = useRef<GroupImperativeHandle | null>(null);
  const bottomGroupRef = useRef<GroupImperativeHandle | null>(null);

  // ── Persistence callbacks ────────────────────────────────────────────────
  const onOuterLayoutChanged = useCallback((layout: Layout) => {
    const rowFraction = (layout[PANEL_IDS.outerTop] ?? SLOT_DEFAULTS.rowPercent) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction,
        columnFractions: current?.columnFractions ?? [],
        rightColumnSplit: current?.rightColumnSplit ?? SLOT_DEFAULTS.bottom.canvas / 100,
        ...(current?.canvasHidden !== undefined ? { canvasHidden: current.canvasHidden } : {}),
      },
    });
  }, [setLayoutGeometry]);

  const onTopLayoutChanged = useCallback((layout: Layout) => {
    const columnFractions = TOP_ROW_DEFS.map((d) => (layout[d.panelId] ?? d.defaultSize) / 100);
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions,
        rightColumnSplit: current?.rightColumnSplit ?? SLOT_DEFAULTS.bottom.canvas / 100,
        ...(current?.canvasHidden !== undefined ? { canvasHidden: current.canvasHidden } : {}),
      },
    });
  }, [setLayoutGeometry]);

  const onBottomLayoutChanged = useCallback((layout: Layout) => {
    const rightColumnSplit = (layout[PANEL_IDS.bottomCanvas] ?? SLOT_DEFAULTS.bottom.canvas) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions: current?.columnFractions ?? [],
        rightColumnSplit,
        ...(current?.canvasHidden !== undefined ? { canvasHidden: current.canvasHidden } : {}),
      },
    });
  }, [setLayoutGeometry]);

  const def = DOCK_REGISTRY[dockStyle];
  const padding = def.stationPadding;
  const Chrome = def.Chrome;

  // Build the top-row panel list: visible panels with separators between.
  const topRowChildren: React.ReactNode[] = [];
  visibleTopDefs.forEach((d, i) => {
    if (i > 0) topRowChildren.push(<Separator key={`sep-${d.panelId}`} className="station-splitter" style={verticalHandleStyle} />);
    topRowChildren.push(
      <Panel
        key={d.panelId}
        id={d.panelId}
        defaultSize={d.defaultSize}
        minSize={SLOT_DEFAULTS.minColumn}
      >
        <CellWrapper><StationCell slot={d.slot} /></CellWrapper>
      </Panel>
    );
  });

  // Bottom-row sizing — keep clock locked to the calendar's column width
  // (SLOT_DEFAULTS.columns['top-right-upper'] = 25%) whenever canvas is
  // visible, regardless of terminal visibility. Without this, hiding the
  // terminal causes RPL to normalize canvas:clock from 60:25 → 70.6:29.4
  // and the clock column slides out of alignment with the calendar above.
  const clockSize = SLOT_DEFAULTS.columns['top-right-upper'];
  const terminalSize = bottomVisible.terminal ? SLOT_DEFAULTS.bottom.terminal : 0;
  const canvasSize = bottomVisible.canvas
    ? Math.max(SLOT_DEFAULTS.minCanvas, 100 - clockSize - terminalSize)
    : 0;

  const bottomRowChildren: React.ReactNode[] = [];
  const bottomItems = [
    bottomVisible.canvas   && { id: PANEL_IDS.bottomCanvas,   size: canvasSize,   min: SLOT_DEFAULTS.minCanvas,  node: <EmbeddedCanvasCell /> },
    bottomVisible.terminal && { id: PANEL_IDS.bottomTerminal, size: terminalSize, min: SLOT_DEFAULTS.minColumn,  node: <CellWrapper><StationCell slot="bottom-strip" /></CellWrapper> },
    bottomVisible.clock    && { id: PANEL_IDS.bottomClock,    size: clockSize,    min: SLOT_DEFAULTS.minColumn,  node: <CellWrapper><StationCell slot="top-right-lower" /></CellWrapper> },
  ].filter(Boolean) as Array<{ id: string; size: number; min: number; node: React.ReactNode }>;
  bottomItems.forEach((it, i) => {
    if (i > 0) bottomRowChildren.push(<Separator key={`sep-${it.id}`} className="station-splitter" style={verticalHandleStyle} />);
    bottomRowChildren.push(
      <Panel key={it.id} id={it.id} defaultSize={it.size} minSize={it.min}>
        {it.node}
      </Panel>
    );
  });

  return (
    <div
      data-testid="station-layout"
      data-station="true"
      className={`dock-chassis dock-${dockStyle}`}
      style={{
        pointerEvents: 'auto',
        zIndex: 0,
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: dockStyle === 'classic' ? 'var(--paper)' : undefined,
      }}
    >
      {Chrome ? <Chrome /> : null}

      <div
        style={{
          position: 'absolute',
          top: padding.top,
          bottom: padding.bottom,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <StationToolbar />

        {/* If everything is hidden, show a hint instead of an empty Group
            (RPL crashes on zero panels). */}
        {!topRowVisible && !bottomRowVisible ? (
          <EmptyShellHint />
        ) : (
          <Group
            orientation="vertical"
            groupRef={outerGroupRef}
            onLayoutChanged={onOuterLayoutChanged}
            style={{ flex: 1, minHeight: 0 }}
          >
            {topRowVisible && (
              <Panel
                id={PANEL_IDS.outerTop}
                defaultSize={bottomRowVisible ? SLOT_DEFAULTS.rowPercent : 100}
                minSize={SLOT_DEFAULTS.minRow}
              >
                <Group
                  orientation="horizontal"
                  groupRef={topGroupRef}
                  onLayoutChanged={onTopLayoutChanged}
                  style={{ height: '100%' }}
                >
                  {topRowChildren}
                </Group>
              </Panel>
            )}

            {topRowVisible && bottomRowVisible && (
              <Separator className="station-splitter" style={horizontalHandleStyle} />
            )}

            {bottomRowVisible && (
              <Panel
                id={PANEL_IDS.outerBottom}
                defaultSize={topRowVisible ? SLOT_DEFAULTS.canvasPercent : 100}
                minSize={SLOT_DEFAULTS.minCanvas}
              >
                <Group
                  orientation="horizontal"
                  groupRef={bottomGroupRef}
                  onLayoutChanged={onBottomLayoutChanged}
                  style={{ height: '100%' }}
                >
                  {bottomRowChildren}
                </Group>
              </Panel>
            )}
          </Group>
        )}
      </div>
    </div>
  );
}

/** Thin wrapper that sizes a station cell to fill its panel. Transparent so
 *  the dock chrome's themed background shows between cards. */
function CellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        padding: 6,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

function EmptyShellHint() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        opacity: 0.6,
      }}
    >
      every panel is hidden — toggle one back on
    </div>
  );
}
