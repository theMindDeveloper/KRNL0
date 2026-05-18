/**
 * StationLayout — station-mode shell with resizable panels.
 *
 * ADR 0008 § 2.3 / § 2.4 / § 9.2.
 *
 * Layout (matches user-provided sketch):
 *   ┌─ DOCK TOP ─────────────────────────────────────┐
 *   │ Pomo │ Todo │ Habit │ Calendar                  │
 *   ├──────┴──────┴───────┴─────────────────┬────────┤
 *   │         Embedded Canvas               │ Clock  │
 *   └─ DOCK BOTTOM ──────────────────────────────────┘
 *
 *   - Top row: 4 equal-width mother cells
 *   - Bottom row: Canvas (~75%) + Clock (~25%)
 *   - Outer horizontal divider runs straight across both rows
 *
 * The whole shell is wrapped in `.dock-chassis dock-{style}` so the dock
 * chrome frames the entire layout. Variant-keyed padding clears the rails.
 *
 * NOTE: react-resizable-panels v4 requires Separators to be DIRECT children
 * of their parent Group — wrapping them in a div breaks push/pull drag.
 * The Separator carries the visible style.
 *
 * NOTE 2: The .dock-chassis class sets pointer-events:none + z-index:-1
 * for canvas mode where the chassis is a decorative backdrop. Station mode
 * IS the foreground — override both inline so panels/splitters/content
 * receive events.
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

// Panel IDs for imperative layout reset.
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

// Rail padding per dock style — top/bottom in pixels so the layout doesn't
// overlap the chassis chrome rails.
const RAIL_PADDING: Record<DockStyle, { top: number; bottom: number }> = {
  classic:     { top: 0,   bottom: 0   },
  synthesizer: { top: 50,  bottom: 88  },
  telemetry:   { top: 76,  bottom: 70  },
  'krnl-dock': { top: 102, bottom: 102 },
};

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
    [PANEL_IDS.outerTop]:    SLOT_DEFAULTS.rowPercent,
    [PANEL_IDS.outerBottom]: SLOT_DEFAULTS.canvasPercent,
  };
  const defaultTopLayout: Layout = {
    [PANEL_IDS.colPomo]:  SLOT_DEFAULTS.columns['top-left'],
    [PANEL_IDS.colTodo]:  SLOT_DEFAULTS.columns['top-center'],
    [PANEL_IDS.colHabit]: SLOT_DEFAULTS.columns['top-right-pre'],
    [PANEL_IDS.colCal]:   SLOT_DEFAULTS.columns['top-right-upper'],
  };
  const defaultBottomLayout: Layout = {
    [PANEL_IDS.bottomCanvas]:   SLOT_DEFAULTS.bottom.canvas,
    [PANEL_IDS.bottomTerminal]: SLOT_DEFAULTS.bottom.terminal,
    [PANEL_IDS.bottomClock]:    SLOT_DEFAULTS.bottom.clock,
  };

  const outerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const topGroupRef = useRef<GroupImperativeHandle | null>(null);
  const bottomGroupRef = useRef<GroupImperativeHandle | null>(null);
  void outerGroupRef; void topGroupRef; void bottomGroupRef;

  // Derive defaultLayout from stored geometry (if present).
  const outerDefaultLayout: Layout | undefined = storedGeometry?.rowFraction != null
    ? {
        [PANEL_IDS.outerTop]:    Math.round(storedGeometry.rowFraction * 100),
        [PANEL_IDS.outerBottom]: Math.round((1 - storedGeometry.rowFraction) * 100),
      }
    : undefined;

  const topDefaultLayout: Layout | undefined = storedGeometry?.columnFractions != null
    ? {
        [PANEL_IDS.colPomo]:  Math.round((storedGeometry.columnFractions[0] ?? SLOT_DEFAULTS.columns['top-left']  / 100) * 100),
        [PANEL_IDS.colTodo]:  Math.round((storedGeometry.columnFractions[1] ?? SLOT_DEFAULTS.columns['top-center'] / 100) * 100),
        [PANEL_IDS.colHabit]: Math.round((storedGeometry.columnFractions[2] ?? SLOT_DEFAULTS.columns['top-right-pre'] / 100) * 100),
        [PANEL_IDS.colCal]:   Math.round((storedGeometry.columnFractions[3] ?? SLOT_DEFAULTS.columns['top-right-upper'] / 100) * 100),
      }
    : undefined;

  const bottomDefaultLayout: Layout | undefined = storedGeometry?.rightColumnSplit != null
    ? {
        // rightColumnSplit is reused as canvas-vs-clock split for the bottom row.
        [PANEL_IDS.bottomCanvas]: Math.round(storedGeometry.rightColumnSplit * 100),
        [PANEL_IDS.bottomClock]:  Math.round((1 - storedGeometry.rightColumnSplit) * 100),
      }
    : undefined;

  // ── Persistence callbacks ────────────────────────────────────────────────

  const onOuterLayoutChanged = useCallback((layout: Layout) => {
    const rowFraction = (layout[PANEL_IDS.outerTop] ?? SLOT_DEFAULTS.rowPercent) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction,
        columnFractions: current?.columnFractions
          ?? Object.values(defaultTopLayout).map((v) => v / 100),
        rightColumnSplit: current?.rightColumnSplit
          ?? SLOT_DEFAULTS.bottom.canvas / 100,
      },
    });
  }, [setLayoutGeometry, defaultTopLayout]);

  const onTopLayoutChanged = useCallback((layout: Layout) => {
    const columnFractions = [
      (layout[PANEL_IDS.colPomo]  ?? SLOT_DEFAULTS.columns['top-left'])  / 100,
      (layout[PANEL_IDS.colTodo]  ?? SLOT_DEFAULTS.columns['top-center']) / 100,
      (layout[PANEL_IDS.colHabit] ?? SLOT_DEFAULTS.columns['top-right-pre']) / 100,
      (layout[PANEL_IDS.colCal]   ?? SLOT_DEFAULTS.columns['top-right-upper']) / 100,
    ];
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions,
        rightColumnSplit: current?.rightColumnSplit ?? SLOT_DEFAULTS.bottom.canvas / 100,
      },
    });
  }, [setLayoutGeometry]);

  const onBottomLayoutChanged = useCallback((layout: Layout) => {
    const rightColumnSplit = (layout[PANEL_IDS.bottomCanvas] ?? SLOT_DEFAULTS.bottom.canvas) / 100;
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({
      station: {
        rowFraction: current?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
        columnFractions: current?.columnFractions
          ?? Object.values(defaultTopLayout).map((v) => v / 100),
        rightColumnSplit,
      },
    });
  }, [setLayoutGeometry, defaultTopLayout]);

  void defaultOuterLayout; void defaultBottomLayout; // silence unused — defaults
  // are applied via Panel defaultSize, the Layout literals above are reserved
  // for an imperative reset path that's not wired yet.

  const padding = RAIL_PADDING[dockStyle];

  return (
    <div
      data-testid="station-layout"
      data-station="true"
      className={`dock-chassis dock-${dockStyle}`}
      style={{
        // .dock-chassis defaults pointer-events:none + z-index:-1 (canvas
        // mode wants it behind nodes). Station mode IS the foreground.
        pointerEvents: 'auto',
        zIndex: 0,
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
        {/* Outer vertical group — top row (mothers) vs bottom row (canvas + clock) */}
        <Group
          orientation="vertical"
          groupRef={outerGroupRef}
          onLayoutChanged={onOuterLayoutChanged}
          defaultLayout={outerDefaultLayout}
          style={{ flex: 1, minHeight: 0 }}
        >
          {/* TOP ROW — 4 equal-width mothers */}
          <Panel
            id={PANEL_IDS.outerTop}
            defaultSize={SLOT_DEFAULTS.rowPercent}
            minSize={SLOT_DEFAULTS.minRow}
          >
            <Group
              orientation="horizontal"
              groupRef={topGroupRef}
              onLayoutChanged={onTopLayoutChanged}
              defaultLayout={topDefaultLayout}
              style={{ height: '100%' }}
            >
              <Panel
                id={PANEL_IDS.colPomo}
                defaultSize={SLOT_DEFAULTS.columns['top-left']}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="top-left" /></CellWrapper>
              </Panel>

              <Separator style={verticalHandleStyle} />

              <Panel
                id={PANEL_IDS.colTodo}
                defaultSize={SLOT_DEFAULTS.columns['top-center']}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="top-center" /></CellWrapper>
              </Panel>

              <Separator style={verticalHandleStyle} />

              <Panel
                id={PANEL_IDS.colHabit}
                defaultSize={SLOT_DEFAULTS.columns['top-right-pre']}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="top-right-pre" /></CellWrapper>
              </Panel>

              <Separator style={verticalHandleStyle} />

              <Panel
                id={PANEL_IDS.colCal}
                defaultSize={SLOT_DEFAULTS.columns['top-right-upper']}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="top-right-upper" /></CellWrapper>
              </Panel>
            </Group>
          </Panel>

          {/* Single horizontal divider running straight across — splits top
              row of mothers from bottom row of canvas+clock. */}
          <Separator style={horizontalHandleStyle} />

          {/* BOTTOM ROW — embedded canvas (wide) + clock (narrow) */}
          <Panel
            id={PANEL_IDS.outerBottom}
            defaultSize={SLOT_DEFAULTS.canvasPercent}
            minSize={SLOT_DEFAULTS.minCanvas}
          >
            <Group
              orientation="horizontal"
              groupRef={bottomGroupRef}
              onLayoutChanged={onBottomLayoutChanged}
              defaultLayout={bottomDefaultLayout}
              style={{ height: '100%' }}
            >
              <Panel
                id={PANEL_IDS.bottomCanvas}
                defaultSize={SLOT_DEFAULTS.bottom.canvas}
                minSize={SLOT_DEFAULTS.minCanvas}
              >
                <EmbeddedCanvasCell />
              </Panel>

              <Separator style={verticalHandleStyle} />

              <Panel
                id={PANEL_IDS.bottomTerminal}
                defaultSize={SLOT_DEFAULTS.bottom.terminal}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="bottom-strip" /></CellWrapper>
              </Panel>

              <Separator style={verticalHandleStyle} />

              <Panel
                id={PANEL_IDS.bottomClock}
                defaultSize={SLOT_DEFAULTS.bottom.clock}
                minSize={SLOT_DEFAULTS.minColumn}
              >
                <CellWrapper><StationCell slot="top-right-lower" /></CellWrapper>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  );
}

/** Thin wrapper that sizes a station cell to fill its panel. Transparent
 *  background so the dock chrome's themed background shows through the gaps
 *  between mother cards. */
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
