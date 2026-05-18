/**
 * StationLayout — station-mode shell with resizable panels.
 *
 * ADR 0008 § 2.3 / § 2.4 / § 9.2.
 *
 * Layout: 4-column top row (Pomo / Todo / Habit / right-rail-stacked
 * Calendar-over-Clock), embedded canvas below.  All dividers are resizable
 * via react-resizable-panels v4.
 *
 * The whole shell is wrapped in `.dock-chassis dock-{style}` so the dock
 * chrome (top rail + bottom rail + themed middle) frames the entire layout.
 * Variant-keyed padding clears the rails so panels don't sit under them.
 *
 * NOTE: react-resizable-panels v4 requires Separators to be DIRECT DOM
 * children of their parent Group — wrapping them in a div breaks push/pull
 * drag and leaves gaps.  The Separator itself carries the visible style.
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
import { useDockStyle, type DockStyle } from '../ChassisLayer/useDockStyle';
import { SynthesizerChrome } from '../ChassisLayer/SynthesizerChrome';
import { TelemetryChrome } from '../ChassisLayer/TelemetryChrome';
import { KrnlDockChrome } from '../ChassisLayer/KrnlDockChrome';
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

// Rail padding per dock style — top/bottom in pixels so the layout doesn't
// overlap the chassis chrome rails.  Numbers come from chassis.css (md-tel-top
// 6+64=70 ≈76 with extra breathing, md-synth-top 6+38=44, dk-rail 96, etc.).
const RAIL_PADDING: Record<DockStyle, { top: number; bottom: number }> = {
  classic:     { top: 0,  bottom: 0  },
  synthesizer: { top: 50, bottom: 88 },
  telemetry:   { top: 76, bottom: 70 },
  'krnl-dock': { top: 102, bottom: 102 },
};

// Splitter handle appearance — uses --line token for theme parity (NF4).
// Style is applied directly to <Separator> since the library mandates it must
// be a direct child of Group.
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
  const [dockStyle] = useDockStyle();

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
        [PANEL_IDS.colPomo]:  Math.round((storedGeometry.columnFractions[0] ?? SLOT_DEFAULTS.columns['top-left']  / 100) * 100),
        [PANEL_IDS.colTodo]:  Math.round((storedGeometry.columnFractions[1] ?? SLOT_DEFAULTS.columns['top-center'] / 100) * 100),
        [PANEL_IDS.colHabit]: Math.round((storedGeometry.columnFractions[2] ?? SLOT_DEFAULTS.columns['top-right-pre'] / 100) * 100),
        [PANEL_IDS.colRail]:  Math.round((storedGeometry.columnFractions[3] ?? SLOT_DEFAULTS.columns['right-rail'] / 100) * 100),
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
  }, [setLayoutGeometry, defaultColLayout]);

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
  }, [setLayoutGeometry, defaultColLayout]);

  const padding = RAIL_PADDING[dockStyle];

  return (
    <div
      data-testid="station-layout"
      className={`dock-chassis dock-${dockStyle}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: dockStyle === 'classic' ? 'var(--paper)' : undefined,
      }}
    >
      {/* Dock chrome rails — positioned absolute inside .dock-chassis */}
      {dockStyle === 'synthesizer' && <SynthesizerChrome />}
      {dockStyle === 'telemetry' && <TelemetryChrome />}
      {dockStyle === 'krnl-dock' && <KrnlDockChrome />}

      {/* Station content — inset to clear top/bottom rails */}
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

              <Separator style={verticalHandleStyle} />

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

              <Separator style={verticalHandleStyle} />

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

              <Separator style={verticalHandleStyle} />

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

                  <Separator style={horizontalHandleStyle} />

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
          <Separator style={horizontalHandleStyle} />

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
        background: 'var(--node-bg, var(--paper))',
        border: '1px solid var(--paper-3)',
      }}
    >
      {children}
    </div>
  );
}
