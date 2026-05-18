/**
 * StationLayout — station-mode shell with resizable panels.
 *
 * ADR 0008 § 2.3 / § 2.4 / § 9.2.
 *
 * Layout: 4-column top row (Pomo / Todo / Habit / right-rail-stacked
 * Calendar-over-Clock), embedded canvas below.  All dividers are resizable
 * via react-resizable-panels v4.
 *
 * Persistence: onLayoutChanged callbacks route into boardStore.setLayoutGeometry.
 * The library's built-in storage is NOT used — board.json is the single source
 * of truth (ADR § 9.2).
 *
 * Double-click reset: Separator has built-in double-click-to-reset behaviour in v4.
 *
 * Styling: splitter handles use var(--line) inline; no new CSS file (NF4).
 *
 * NOTE: react-resizable-panels v4 uses:
 *   Group (was PanelGroup), Panel (same), Separator (was PanelResizeHandle).
 *   Layout is { [panelId: string]: number } (0..100 percentages).
 *   GroupImperativeHandle is accessed via the groupRef prop (not ref).
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
import { StationCell } from './StationCell';
import { EmbeddedCanvasCell } from './EmbeddedCanvasCell';
import { SLOT_DEFAULTS } from './SlotResolver';

// Panel IDs for imperative layout reset. Must match the id prop on each Panel.
const PANEL_IDS = {
  outerRow:  'station-top-row',
  outerCanvas: 'station-canvas',
  colPomo:   'station-col-pomo',
  colTodo:   'station-col-todo',
  colHabit:  'station-col-habit',
  colRail:   'station-col-rail',
  railCal:   'station-rail-cal',
  railClock: 'station-rail-clock',
} as const;

// Default layouts in v4 format (panelId → percentage 0..100).
const defaultOuterLayout: Layout = {
  [PANEL_IDS.outerRow]:    SLOT_DEFAULTS.rowPercent,
  [PANEL_IDS.outerCanvas]: SLOT_DEFAULTS.canvasPercent,
};
const defaultColLayout: Layout = {
  [PANEL_IDS.colPomo]:  SLOT_DEFAULTS.columns['top-left'],
  [PANEL_IDS.colTodo]:  SLOT_DEFAULTS.columns['top-center'],
  [PANEL_IDS.colHabit]: SLOT_DEFAULTS.columns['top-right-pre'],
  [PANEL_IDS.colRail]:  SLOT_DEFAULTS.columns['right-rail'],
};
const defaultRailLayout: Layout = {
  [PANEL_IDS.railCal]:   SLOT_DEFAULTS.rightColumn.upper,
  [PANEL_IDS.railClock]: SLOT_DEFAULTS.rightColumn.lower,
};

// Splitter handle appearance — uses --line token for theme parity (NF4).
const verticalHandleStyle: React.CSSProperties = {
  width: 4,
  background: 'var(--line, var(--paper-3))',
  cursor: 'col-resize',
  flexShrink: 0,
};

const horizontalHandleStyle: React.CSSProperties = {
  height: 4,
  background: 'var(--line, var(--paper-3))',
  cursor: 'row-resize',
  flexShrink: 0,
};

export function StationLayout() {
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const storedGeometry = useBoardStore((s) => s.board?.layoutGeometry?.station);

  // Refs for programmatic layout reset via double-click.
  const outerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const innerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const rightGroupRef = useRef<GroupImperativeHandle | null>(null);

  // Derive defaultLayout from stored geometry (if present).
  const outerDefaultLayout: Layout | undefined = storedGeometry?.rowFraction != null
    ? {
        [PANEL_IDS.outerRow]:    Math.round(storedGeometry.rowFraction * 100),
        [PANEL_IDS.outerCanvas]: Math.round((1 - storedGeometry.rowFraction) * 100),
      }
    : undefined;

  const colDefaultLayout: Layout | undefined = storedGeometry?.columnFractions != null
    ? {
        [PANEL_IDS.colPomo]:  Math.round(storedGeometry.columnFractions[0] ?? SLOT_DEFAULTS.columns['top-left'] / 100),
        [PANEL_IDS.colTodo]:  Math.round(storedGeometry.columnFractions[1] ?? SLOT_DEFAULTS.columns['top-center'] / 100),
        [PANEL_IDS.colHabit]: Math.round(storedGeometry.columnFractions[2] ?? SLOT_DEFAULTS.columns['top-right-pre'] / 100),
        [PANEL_IDS.colRail]:  Math.round(storedGeometry.columnFractions[3] ?? SLOT_DEFAULTS.columns['right-rail'] / 100),
      }
    : undefined;

  const railDefaultLayout: Layout | undefined = storedGeometry?.rightColumnSplit != null
    ? {
        [PANEL_IDS.railCal]:   Math.round(storedGeometry.rightColumnSplit * 100),
        [PANEL_IDS.railClock]: Math.round((1 - storedGeometry.rightColumnSplit) * 100),
      }
    : undefined;

  // ── Persistence callbacks ────────────────────────────────────────────────

  const onRowLayoutChanged = useCallback((layout: Layout) => {
    const rowFraction = (layout[PANEL_IDS.outerRow] ?? SLOT_DEFAULTS.rowPercent) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction,
        columnFractions: current?.columnFractions
          ?? Object.values(defaultColLayout).map((v) => v / 100),
        rightColumnSplit: current?.rightColumnSplit
          ?? SLOT_DEFAULTS.rightColumn.upper / 100,
      },
    });
  }, [setLayoutGeometry]);

  const onColumnLayoutChanged = useCallback((layout: Layout) => {
    const columnFractions = [
      (layout[PANEL_IDS.colPomo]  ?? SLOT_DEFAULTS.columns['top-left'])  / 100,
      (layout[PANEL_IDS.colTodo]  ?? SLOT_DEFAULTS.columns['top-center']) / 100,
      (layout[PANEL_IDS.colHabit] ?? SLOT_DEFAULTS.columns['top-right-pre']) / 100,
      (layout[PANEL_IDS.colRail]  ?? SLOT_DEFAULTS.columns['right-rail']) / 100,
    ];
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions,
        rightColumnSplit: current?.rightColumnSplit ?? SLOT_DEFAULTS.rightColumn.upper / 100,
      },
    });
  }, [setLayoutGeometry]);

  const onRailLayoutChanged = useCallback((layout: Layout) => {
    const rightColumnSplit = (layout[PANEL_IDS.railCal] ?? SLOT_DEFAULTS.rightColumn.upper) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions: current?.columnFractions
          ?? Object.values(defaultColLayout).map((v) => v / 100),
        rightColumnSplit,
      },
    });
  }, [setLayoutGeometry]);

  // ── Double-click reset (wrap each Separator for onDoubleClick) ───────────

  const resetOuterRow = useCallback(() => {
    outerGroupRef.current?.setLayout(defaultOuterLayout);
  }, []);

  const resetColumns = useCallback(() => {
    innerGroupRef.current?.setLayout(defaultColLayout);
  }, []);

  const resetRailColumn = useCallback(() => {
    rightGroupRef.current?.setLayout(defaultRailLayout);
  }, []);

  return (
    <div
      data-testid="station-layout"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--paper)',
      }}
    >
      {/* Outer vertical group — top row vs canvas */}
      <Group
        orientation="vertical"
        groupRef={outerGroupRef}
        onLayoutChanged={onRowLayoutChanged}
        defaultLayout={outerDefaultLayout}
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* Top row */}
        <Panel
          id={PANEL_IDS.outerRow}
          defaultSize={SLOT_DEFAULTS.rowPercent}
          minSize={SLOT_DEFAULTS.minRow}
        >
          {/* Horizontal column group */}
          <Group
            orientation="horizontal"
            groupRef={innerGroupRef}
            onLayoutChanged={onColumnLayoutChanged}
            defaultLayout={colDefaultLayout}
            style={{ height: '100%' }}
          >
            {/* Pomo */}
            <Panel
              id={PANEL_IDS.colPomo}
              defaultSize={SLOT_DEFAULTS.columns['top-left']}
              minSize={SLOT_DEFAULTS.minColumn}
            >
              <CellWrapper>
                <StationCell slot="top-left" />
              </CellWrapper>
            </Panel>

            <div style={verticalHandleStyle} onDoubleClick={resetColumns}>
              <Separator style={{ width: '100%', height: '100%', background: 'transparent' }} />
            </div>

            {/* Todo */}
            <Panel
              id={PANEL_IDS.colTodo}
              defaultSize={SLOT_DEFAULTS.columns['top-center']}
              minSize={SLOT_DEFAULTS.minColumnWide}
            >
              <CellWrapper>
                <StationCell slot="top-center" />
              </CellWrapper>
            </Panel>

            <div style={verticalHandleStyle} onDoubleClick={resetColumns}>
              <Separator style={{ width: '100%', height: '100%', background: 'transparent' }} />
            </div>

            {/* Habit — OQ-1.A option A: own column */}
            <Panel
              id={PANEL_IDS.colHabit}
              defaultSize={SLOT_DEFAULTS.columns['top-right-pre']}
              minSize={SLOT_DEFAULTS.minColumn}
            >
              <CellWrapper>
                <StationCell slot="top-right-pre" />
              </CellWrapper>
            </Panel>

            <div style={verticalHandleStyle} onDoubleClick={resetColumns}>
              <Separator style={{ width: '100%', height: '100%', background: 'transparent' }} />
            </div>

            {/* Right rail: Calendar over Clock */}
            <Panel
              id={PANEL_IDS.colRail}
              defaultSize={SLOT_DEFAULTS.columns['right-rail']}
              minSize={SLOT_DEFAULTS.minColumnWide}
            >
              <Group
                orientation="vertical"
                groupRef={rightGroupRef}
                onLayoutChanged={onRailLayoutChanged}
                defaultLayout={railDefaultLayout}
                style={{ height: '100%' }}
              >
                {/* Calendar */}
                <Panel
                  id={PANEL_IDS.railCal}
                  defaultSize={SLOT_DEFAULTS.rightColumn.upper}
                  minSize={SLOT_DEFAULTS.minRailCell}
                >
                  <CellWrapper>
                    <StationCell slot="top-right-upper" />
                  </CellWrapper>
                </Panel>

                <div style={horizontalHandleStyle} onDoubleClick={resetRailColumn}>
                  <Separator style={{ width: '100%', height: '100%', background: 'transparent' }} />
                </div>

                {/* Clock */}
                <Panel
                  id={PANEL_IDS.railClock}
                  defaultSize={SLOT_DEFAULTS.rightColumn.lower}
                  minSize={SLOT_DEFAULTS.minRailCell}
                >
                  <CellWrapper>
                    <StationCell slot="top-right-lower" />
                  </CellWrapper>
                </Panel>
              </Group>
            </Panel>
          </Group>
        </Panel>

        {/* Splitter between top row and canvas */}
        <div style={horizontalHandleStyle} onDoubleClick={resetOuterRow}>
          <Separator style={{ width: '100%', height: '100%', background: 'transparent' }} />
        </div>

        {/* Canvas panel */}
        <Panel
          id={PANEL_IDS.outerCanvas}
          defaultSize={SLOT_DEFAULTS.canvasPercent}
          minSize={SLOT_DEFAULTS.minCanvas}
        >
          <EmbeddedCanvasCell />
        </Panel>
      </Group>
    </div>
  );
}

/** Thin wrapper that sizes a station cell to fill its panel. */
function CellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRight: '1px solid var(--paper-3)',
      }}
    >
      {children}
    </div>
  );
}
