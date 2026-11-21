/**
 * RowsStationLayout — the Station's Grid and Planner presets (Decision 54,
 * Decision 58): two rows of windows that start in the preset's arrangement
 *
 *   Grid                                   Planner
 *   ┌────────┬────────┬────────┐           ┌──────┬──────┬──────┬──────┐
 *   │ Timer  │ Todos  │ Habits │           │Timer │Clock │Todos │Habits│
 *   ├────────┴────────┼────────┤           ├──────┴──────┴──────┴──────┤
 *   │ Calendar        │ Clock  │           │ Calendar                   │
 *   └─────────────────┴────────┘           └────────────────────────────┘
 *
 * and are yours from there: drag a window onto another to swap them (the
 * preset keeps its own order, `station.<preset>.order`), show any window from
 * the top bar (one the preset does not place joins the bottom row), resize
 * every seam. Each preset keeps its own sizes, so switching never disturbs
 * another. A hidden window lets its neighbours fill the row; an empty row
 * gives its height to the other.
 */

import { useCallback, useMemo } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useBoardStore } from '../../store/boardStore';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { DOCK_REGISTRY } from '../ChassisLayer/dockRegistry';
import { useFrameTheme } from '../../themes/useFrameTheme';
import { StationCell } from './StationCell';
import { EmbeddedCanvasCell } from './EmbeddedCanvasCell';
import { StationToolbar } from './StationToolbar';
import { isStationHidden } from './stationVisibility';
import { CellWrapper, EmptyShellHint } from './StationShell';
import { restoredSizes } from './restoredSizes';
import { useSnapshot } from './layoutGeometry';
import { ROWS_PRESETS, presetRows, withPreset, type RowsPreset, type StationWindow } from '../../../shared/stationLayouts';
import type { StationGridGeometry } from '../../../shared/types';

export const ROWS_LIMITS = { minRow: 20, minColumn: 10 } as const;

const vHandle: React.CSSProperties = { width: 9, margin: '0 -4px', cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 3 };
const hHandle: React.CSSProperties = { height: 9, margin: '-4px 0', cursor: 'row-resize', flexShrink: 0, position: 'relative', zIndex: 3 };

const near = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) < 0.002;

/** A window's default weight in its row: the Calendar and the canvas take more. */
const WEIGHT: Partial<Record<StationWindow, number>> = { calendar: 2, canvas: 2 };

type Which = 'top' | 'bottom';

export function RowsStationLayout({ preset: id }: { preset: RowsPreset['id'] }) {
  const def = ROWS_PRESETS[id];
  const panelSlot = useFrameTheme().manifest.slots.panelToggles;
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const nodes = useBoardStore((s) => s.board?.nodes);
  const geo = useBoardStore((s) => s.board?.layoutGeometry?.station);
  const saved = geo?.[id];
  const canvasHidden = geo?.canvasHidden ?? false;
  const [dockStyle] = useDockStyle();

  const rows = presetRows(id, saved?.order);
  const pid = (k: StationWindow) => `${id}-${k}`;
  const shown = (k: StationWindow): boolean => {
    if (k === 'canvas') return !canvasHidden;
    const node = nodes?.find((n) => n.isMother && n.kind === k);
    return !!node && !isStationHidden(node);
  };
  const top = rows.top.filter(shown);
  const bottom = rows.bottom.filter(shown);

  /** Saves one part of this preset's geometry, keeping everything else the Station saved (NF1). */
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

  // Each window's share of its row, by window: it keeps its width when you move it or show another.
  const onRow = useCallback((layout: Layout) => {
    const prev = useBoardStore.getState().board?.layoutGeometry?.station?.[id]?.sizes ?? {};
    const next: Record<string, number> = { ...prev };
    let changed = false;
    for (const [panel, size] of Object.entries(layout)) {
      if (!panel.startsWith(`${id}-`) || panel.startsWith(`${id}-row-`)) continue;
      const k = panel.slice(id.length + 1);
      const f = size / 100;
      if (!near(prev[k], f)) { next[k] = f; changed = true; }
    }
    if (changed) save({ sizes: next });
  }, [save, id]);

  // Sizes are read once per set and order of visible windows (layoutGeometry.ts, issue #199).
  const has = saved ? 'saved' : 'none';
  const rowPercent = useSnapshot(`${id}|${top.length > 0}|${bottom.length > 0}|${has}`, () => {
    const f = saved?.rowFraction;
    return typeof f === 'number' && Number.isFinite(f)
      ? Math.min(100 - ROWS_LIMITS.minRow, Math.max(ROWS_LIMITS.minRow, f * 100))
      : def.rowPercent;
  });
  const sizesFor = (visible: readonly StationWindow[]) => {
    const raw = visible.map((k) => WEIGHT[k] ?? 1);
    const sum = raw.reduce((a, v) => a + v, 0) || 1;
    const defaults = raw.map((v) => (v / sum) * 100);
    const map = saved?.sizes;
    const savedMap = map && visible.every((k) => typeof map[k] === 'number') ? Object.fromEntries(visible.map((k) => [pid(k), map[k]!])) : undefined;
    return restoredSizes(visible.map(pid), defaults, visible.map(() => ROWS_LIMITS.minColumn), savedMap);
  };
  const topKey = top.join(',');
  const bottomKey = bottom.join(',');
  const topSizes = useSnapshot(`${id}|${topKey}|${has}`, () => sizesFor(top));
  const bottomSizes = useSnapshot(`${id}|${bottomKey}|${has}`, () => sizesFor(bottom));
  const onRowMemo = useMemo(() => onRow, [onRow]);

  const row = (visible: readonly StationWindow[], sizes: number[]) => {
    const out: React.ReactNode[] = [];
    visible.forEach((k, i) => {
      if (i > 0) out.push(<Separator key={`sep-${k}`} className="station-splitter" style={vHandle} />);
      out.push(
        <Panel key={pid(k)} id={pid(k)} defaultSize={sizes[i]} minSize={ROWS_LIMITS.minColumn}>
          <CellWrapper>{k === 'canvas' ? <EmbeddedCanvasCell /> : <StationCell kind={k} />}</CellWrapper>
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
          // Keyed by preset and order: a swap or a shown window mounts the rows fresh with their sizes.
          <Group key={`${id}|${topKey}|${bottomKey}`} orientation="vertical" onLayoutChanged={onRows} style={{ flex: 1, minHeight: 0 }}>
            {hasTop && (
              <Panel id={rowTop} defaultSize={hasBottom ? rowPercent : 100} minSize={ROWS_LIMITS.minRow}>
                <Group orientation="horizontal" onLayoutChanged={onRowMemo} style={{ height: '100%' }}>
                  {row(top, topSizes)}
                </Group>
              </Panel>
            )}
            {hasTop && hasBottom && <Separator className="station-splitter" style={hHandle} />}
            {hasBottom && (
              <Panel id={rowBottom} defaultSize={hasTop ? 100 - rowPercent : 100} minSize={ROWS_LIMITS.minRow}>
                <Group orientation="horizontal" onLayoutChanged={onRowMemo} style={{ height: '100%' }}>
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
