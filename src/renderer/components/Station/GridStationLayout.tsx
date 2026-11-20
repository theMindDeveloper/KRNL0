/**
 * GridStationLayout — the Station's Grid preset (Decision 52).
 *
 *   ┌─ DOCK TOP ─────────────────────────────────────────┐
 *   │ [StationToolbar]                                    │
 *   ├─────────────┬─────────────┬────────────────────────┤
 *   │ Timer       │ Todos       │ Habits                 │
 *   ├─────────────┴─────────────┴──────────┬─────────────┤
 *   │ Calendar                             │ Clock       │
 *   └─ DOCK BOTTOM ──────────────────────────────────────┘
 *
 * The same windows (StationCell) as the Classic preset, arranged as the owner
 * picked on the design board. The canvas has its own view (top-bar CANVAS);
 * terminal and analytics belong to Classic. Panel sizes are saved apart
 * (`layoutGeometry.station.grid`), so switching presets never disturbs either.
 */

import { useCallback, useMemo } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useBoardStore } from '../../store/boardStore';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { DOCK_REGISTRY } from '../ChassisLayer/dockRegistry';
import { useFrameTheme } from '../../themes/useFrameTheme';
import { StationCell } from './StationCell';
import { StationToolbar } from './StationToolbar';
import { isStationHidden } from './stationVisibility';
import { CellWrapper, EmptyShellHint } from './StationShell';
import { restoredSizes } from './restoredSizes';
import { useSnapshot } from './layoutGeometry';
import type { MotherNodeConfig, StationSlot } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';

export const GRID_DEFAULTS = {
  rowPercent: 52,
  minRow: 22,
  minColumn: 14,
  top: [100 / 3, 100 / 3, 100 / 3],
  bottom: [66.67, 33.33],
} as const;

const TOP: ReadonlyArray<{ id: string; slot: StationSlot }> = [
  { id: 'grid-top-pomo', slot: 'top-left' },
  { id: 'grid-top-todo', slot: 'top-center' },
  { id: 'grid-top-habit', slot: 'top-right-pre' },
];
const BOTTOM: ReadonlyArray<{ id: string; slot: StationSlot }> = [
  { id: 'grid-bottom-calendar', slot: 'top-right-upper' },
  { id: 'grid-bottom-clock', slot: 'top-right-lower' },
];
const ROW_TOP = 'grid-row-top';
const ROW_BOTTOM = 'grid-row-bottom';

const vHandle: React.CSSProperties = { width: 9, margin: '0 -4px', cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 3 };
const hHandle: React.CSSProperties = { height: 9, margin: '-4px 0', cursor: 'row-resize', flexShrink: 0, position: 'relative', zIndex: 3 };

const near = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) < 0.002;

export function GridStationLayout() {
  const panelSlot = useFrameTheme().manifest.slots.panelToggles;
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const board = useBoardStore((s) => s.board);
  const grid = useBoardStore((s) => s.board?.layoutGeometry?.station?.grid);
  const [dockStyle] = useDockStyle();

  const motherBySlot = new Map<StationSlot, Node>();
  for (const n of board?.nodes ?? []) {
    if (!n.isMother) continue;
    const slot = (n.config as MotherNodeConfig | undefined)?.stationSlot;
    if (slot) motherBySlot.set(slot, n);
  }
  const top = TOP.map((d, i) => ({ ...d, i })).filter((d) => !isStationHidden(motherBySlot.get(d.slot)));
  const bottom = BOTTOM.map((d, i) => ({ ...d, i })).filter((d) => !isStationHidden(motherBySlot.get(d.slot)));

  /** Saves one part of the Grid geometry, keeping everything else the Station saved. */
  const save = useCallback((patch: Partial<NonNullable<typeof grid>>) => {
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    const nextGrid = { ...current?.grid, ...patch };
    setLayoutGeometry({
      station: {
        ...current,
        rowFraction: current?.rowFraction ?? 0.35,
        columnFractions: current?.columnFractions ?? [],
        rightColumnSplit: current?.rightColumnSplit ?? 0.6,
        preset: 'grid',
        grid: nextGrid,
      },
    });
  }, [setLayoutGeometry]);

  const onRows = useCallback((layout: Layout) => {
    const t = layout[ROW_TOP];
    if (t === undefined || layout[ROW_BOTTOM] === undefined) return;
    const f = t / 100;
    if (near(useBoardStore.getState().board?.layoutGeometry?.station?.grid?.rowFraction, f)) return;
    save({ rowFraction: f });
  }, [save]);

  const onRow = useCallback((which: 'top' | 'bottom', defs: ReadonlyArray<{ id: string }>) => (layout: Layout) => {
    const prev = useBoardStore.getState().board?.layoutGeometry?.station?.grid?.[which];
    const fallback = which === 'top' ? GRID_DEFAULTS.top : GRID_DEFAULTS.bottom;
    const next = defs.map((d, i) => (layout[d.id] !== undefined ? layout[d.id]! / 100 : (prev?.[i] ?? fallback[i]! / 100)));
    if (prev && prev.length === next.length && prev.every((v, i) => near(v, next[i]!))) return;
    save({ [which]: next });
  }, [save]);

  const onTop = useMemo(() => onRow('top', TOP), [onRow]);
  const onBottom = useMemo(() => onRow('bottom', BOTTOM), [onRow]);

  const saved = grid ? 'saved' : 'none';
  const rowPercent = useSnapshot(`${top.length > 0}|${bottom.length > 0}|${saved}`, () => {
    const f = grid?.rowFraction;
    return typeof f === 'number' && Number.isFinite(f)
      ? Math.min(100 - GRID_DEFAULTS.minRow, Math.max(GRID_DEFAULTS.minRow, f * 100))
      : GRID_DEFAULTS.rowPercent;
  });
  const sizesFor = (which: 'top' | 'bottom', visible: Array<{ id: string; i: number }>, defs: ReadonlyArray<{ id: string }>) => {
    const fallback = which === 'top' ? GRID_DEFAULTS.top : GRID_DEFAULTS.bottom;
    const stored = grid?.[which];
    const savedMap = stored && stored.length === defs.length ? Object.fromEntries(defs.map((d, i) => [d.id, stored[i]!])) : undefined;
    return restoredSizes(visible.map((d) => d.id), visible.map((d) => fallback[d.i]!), visible.map(() => GRID_DEFAULTS.minColumn), savedMap);
  };
  const topSizes = useSnapshot(`${top.map((d) => d.id).join(',')}|${saved}`, () => sizesFor('top', top, TOP));
  const bottomSizes = useSnapshot(`${bottom.map((d) => d.id).join(',')}|${saved}`, () => sizesFor('bottom', bottom, BOTTOM));

  const row = (visible: Array<{ id: string; slot: StationSlot }>, sizes: number[]) => {
    const out: React.ReactNode[] = [];
    visible.forEach((d, i) => {
      if (i > 0) out.push(<Separator key={`sep-${d.id}`} className="station-splitter" style={vHandle} />);
      out.push(
        <Panel key={d.id} id={d.id} defaultSize={sizes[i]} minSize={GRID_DEFAULTS.minColumn}>
          <CellWrapper><StationCell slot={d.slot} /></CellWrapper>
        </Panel>,
      );
    });
    return out;
  };

  const def = DOCK_REGISTRY[dockStyle];
  const padding = def.stationPadding;
  const Chrome = def.Chrome;
  const hasTop = top.length > 0;
  const hasBottom = bottom.length > 0;

  return (
    <div
      data-testid="station-layout"
      data-station="true"
      data-station-preset="grid"
      className={`dock-chassis dock-${dockStyle}`}
      style={{ pointerEvents: 'auto', zIndex: 0, position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: dockStyle === 'classic' ? 'var(--paper)' : undefined }}
    >
      {Chrome ? <Chrome /> : null}
      <div style={{ position: 'absolute', top: padding.top, bottom: padding.bottom, left: 0, right: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
        {panelSlot === 'row' && <StationToolbar />}
        {!hasTop && !hasBottom ? (
          <EmptyShellHint />
        ) : (
          <Group orientation="vertical" onLayoutChanged={onRows} style={{ flex: 1, minHeight: 0 }}>
            {hasTop && (
              <Panel id={ROW_TOP} defaultSize={hasBottom ? rowPercent : 100} minSize={GRID_DEFAULTS.minRow}>
                <Group orientation="horizontal" onLayoutChanged={onTop} style={{ height: '100%' }}>
                  {row(top, topSizes)}
                </Group>
              </Panel>
            )}
            {hasTop && hasBottom && <Separator className="station-splitter" style={hHandle} />}
            {hasBottom && (
              <Panel id={ROW_BOTTOM} defaultSize={hasTop ? 100 - rowPercent : 100} minSize={GRID_DEFAULTS.minRow}>
                <Group orientation="horizontal" onLayoutChanged={onBottom} style={{ height: '100%' }}>
                  {row(bottom, bottomSizes)}
                </Group>
              </Panel>
            )}
          </Group>
        )}
      </div>
    </div>
  );
}
