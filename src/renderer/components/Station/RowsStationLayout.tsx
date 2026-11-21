/**
 * RowsStationLayout — the Station's fixed presets (Decision 54): two rows of
 * windows in a set order, picked from the top bar's layout menu.
 *
 *   Grid                                   Planner
 *   ┌────────┬────────┬────────┐           ┌──────┬──────┬──────┬──────┐
 *   │ Timer  │ Todos  │ Habits │           │Timer │Todos │Habits│Clock │
 *   ├────────┴────────┼────────┤           ├──────┴──────┴──────┴──────┤
 *   │ Calendar        │ Clock  │           │ Calendar                   │
 *   └─────────────────┴────────┘           └────────────────────────────┘
 *
 * The windows are the same as Classic's (StationCell), found by kind, so a
 * preset always looks the way its name says, whatever was swapped in Classic.
 * Each preset saves its own panel sizes (`layoutGeometry.station.<preset>`),
 * so switching never disturbs another one. A hidden window lets its
 * neighbours fill the row; an empty row gives its height to the other.
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
import { ROWS_PRESETS, withPreset, type RowsPreset } from '../../../shared/stationLayouts';
import type { StationGridGeometry } from '../../../shared/types';

export const ROWS_LIMITS = { minRow: 20, minColumn: 12 } as const;

const vHandle: React.CSSProperties = { width: 9, margin: '0 -4px', cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 3 };
const hHandle: React.CSSProperties = { height: 9, margin: '-4px 0', cursor: 'row-resize', flexShrink: 0, position: 'relative', zIndex: 3 };

const near = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) < 0.002;

type Which = 'top' | 'bottom';

export function RowsStationLayout({ preset: id }: { preset: RowsPreset['id'] }) {
  const def = ROWS_PRESETS[id];
  const panelSlot = useFrameTheme().manifest.slots.panelToggles;
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const nodes = useBoardStore((s) => s.board?.nodes);
  const saved = useBoardStore((s) => s.board?.layoutGeometry?.station?.[id]);
  const [dockStyle] = useDockStyle();

  const ids = (which: Which) => def[which].map((kind) => `${id}-${which}-${kind}`);
  const shown = (which: Which) => def[which]
    .map((kind, i) => ({ kind, i, panelId: ids(which)[i]! }))
    .filter((d) => {
      const node = nodes?.find((n) => n.isMother && n.kind === d.kind);
      return !!node && !isStationHidden(node);
    });
  const top = shown('top');
  const bottom = shown('bottom');

  /** Saves one part of this preset's sizes, keeping everything else the Station saved (NF1). */
  const save = useCallback((patch: Partial<StationGridGeometry>) => {
    const current = useBoardStore.getState().board?.layoutGeometry?.station;
    setLayoutGeometry({ station: { ...withPreset(current, id), [id]: { ...current?.[id], ...patch } } });
  }, [setLayoutGeometry, id]);

  const rowTop = `${id}-row-top`;
  const rowBottom = `${id}-row-bottom`;
  const onRows = useCallback((layout: Layout) => {
    const t = layout[rowTop];
    if (t === undefined || layout[rowBottom] === undefined) return;
    const f = t / 100;
    if (near(useBoardStore.getState().board?.layoutGeometry?.station?.[id]?.rowFraction, f)) return;
    save({ rowFraction: f });
  }, [save, id, rowTop, rowBottom]);

  const onRow = useCallback((which: Which) => (layout: Layout) => {
    const prev = useBoardStore.getState().board?.layoutGeometry?.station?.[id]?.[which];
    const fallback = which === 'top' ? def.topSizes : def.bottomSizes;
    const next = ids(which).map((pid, i) => (layout[pid] !== undefined ? layout[pid]! / 100 : (prev?.[i] ?? fallback[i]! / 100)));
    if (prev && prev.length === next.length && prev.every((v, i) => near(v, next[i]!))) return;
    save({ [which]: next });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, id, def]);
  const onTop = useMemo(() => onRow('top'), [onRow]);
  const onBottom = useMemo(() => onRow('bottom'), [onRow]);

  // Sizes are read once per set of visible windows (layoutGeometry.ts, issue #199).
  const has = saved ? 'saved' : 'none';
  const rowPercent = useSnapshot(`${id}|${top.length > 0}|${bottom.length > 0}|${has}`, () => {
    const f = saved?.rowFraction;
    return typeof f === 'number' && Number.isFinite(f)
      ? Math.min(100 - ROWS_LIMITS.minRow, Math.max(ROWS_LIMITS.minRow, f * 100))
      : def.rowPercent;
  });
  const sizesFor = (which: Which, visible: Array<{ panelId: string; i: number }>) => {
    const fallback = which === 'top' ? def.topSizes : def.bottomSizes;
    const all = ids(which);
    const stored = saved?.[which];
    const savedMap = stored && stored.length === all.length ? Object.fromEntries(all.map((pid, i) => [pid, stored[i]!])) : undefined;
    // Defaults scaled to fill the row with only the visible windows.
    const raw = visible.map((d) => fallback[d.i]!);
    const sum = raw.reduce((a, v) => a + v, 0) || 1;
    return restoredSizes(visible.map((d) => d.panelId), raw.map((v) => (v / sum) * 100), visible.map(() => ROWS_LIMITS.minColumn), savedMap);
  };
  const topSizes = useSnapshot(`${id}|${top.map((d) => d.panelId).join(',')}|${has}`, () => sizesFor('top', top));
  const bottomSizes = useSnapshot(`${id}|${bottom.map((d) => d.panelId).join(',')}|${has}`, () => sizesFor('bottom', bottom));

  const row = (visible: Array<{ panelId: string; kind: string }>, sizes: number[]) => {
    const out: React.ReactNode[] = [];
    visible.forEach((d, i) => {
      if (i > 0) out.push(<Separator key={`sep-${d.panelId}`} className="station-splitter" style={vHandle} />);
      out.push(
        <Panel key={d.panelId} id={d.panelId} defaultSize={sizes[i]} minSize={ROWS_LIMITS.minColumn}>
          <CellWrapper><StationCell kind={d.kind} /></CellWrapper>
        </Panel>,
      );
    });
    return out;
  };

  const dock = DOCK_REGISTRY[dockStyle];
  const padding = dock.stationPadding;
  const Chrome = dock.Chrome;
  const hasTop = top.length > 0;
  const hasBottom = bottom.length > 0;

  return (
    <div
      data-testid="station-layout"
      data-station="true"
      data-station-preset={id}
      className={`dock-chassis dock-${dockStyle}`}
      style={{ pointerEvents: 'auto', zIndex: 0, position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: dockStyle === 'classic' ? 'var(--paper)' : undefined }}
    >
      {Chrome ? <Chrome /> : null}
      <div style={{ position: 'absolute', top: padding.top, bottom: padding.bottom, left: 0, right: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
        {panelSlot === 'row' && <StationToolbar />}
        {!hasTop && !hasBottom ? (
          <EmptyShellHint />
        ) : (
          // Keyed by preset: switching Grid ↔ Planner mounts fresh panels with that preset's sizes.
          <Group key={id} orientation="vertical" onLayoutChanged={onRows} style={{ flex: 1, minHeight: 0 }}>
            {hasTop && (
              <Panel id={rowTop} defaultSize={hasBottom ? rowPercent : 100} minSize={ROWS_LIMITS.minRow}>
                <Group orientation="horizontal" onLayoutChanged={onTop} style={{ height: '100%' }}>
                  {row(top, topSizes)}
                </Group>
              </Panel>
            )}
            {hasTop && hasBottom && <Separator className="station-splitter" style={hHandle} />}
            {hasBottom && (
              <Panel id={rowBottom} defaultSize={hasTop ? 100 - rowPercent : 100} minSize={ROWS_LIMITS.minRow}>
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
