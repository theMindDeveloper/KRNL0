// @vitest-environment jsdom
/**
 * Smooth canvas (Decision 65, docs/06-requirements/canvas-smoothness.md):
 * the viewport is one steady GPU layer, a rested zoom is drawn sharp once,
 * the layer sits on whole pixels, the dot grid slides instead of redrawing,
 * and ending a pan does not re-render the canvas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, render, renderHook } from '@testing-library/react';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { createCanvasLayer, pixelSnapOffset, snapViewportToPixels } from '../../../src/renderer/components/Canvas/canvasLayer';
import { CanvasGrid, gridOffset } from '../../../src/renderer/components/Canvas/CanvasGrid';
import { useViewportPersistence } from '../../../src/renderer/store/useViewportPersistence';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

function canvasWithViewport(): { container: HTMLDivElement; viewport: HTMLDivElement } {
  const container = document.createElement('div');
  container.className = 'krnl-canvas';
  const viewport = document.createElement('div');
  viewport.className = 'react-flow__viewport';
  container.appendChild(viewport);
  document.body.appendChild(container);
  return { container, viewport };
}

describe('F1 — the viewport is one layer all the time', () => {
  const css = read('src/renderer/styles/reactflow-theme.css');
  it('will-change sits on the canvas viewport permanently, not per gesture', () => {
    expect(css).toMatch(/\.krnl-canvas \.react-flow__viewport \{ will-change: opacity; \}/);
    expect(css).not.toContain('is-canvas-moving');
  });
  it('the hint is never transform (that layer keeps its old scale: soft while zooming, then a sharp snap)', () => {
    expect(css).not.toMatch(/react-flow__viewport[^{]*\{[^}]*will-change:\s*transform/);
    expect(css).not.toContain('is-canvas-resharpen');
  });
  it('the canvas container carries the class; no class is toggled while it pans', () => {
    const src = read('src/renderer/components/Canvas/CanvasFlow.tsx');
    expect(src).toContain('className="krnl-canvas"');
    expect(src).not.toContain('is-canvas-moving');
  });
});

describe('F2 — zooming stays sharp: nothing is switched or redrawn on a timer', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('a move, pan or zoom, only lands the layer on whole pixels; no class is set, no timer runs', () => {
    vi.useFakeTimers();
    try {
      const { container, viewport } = canvasWithViewport();
      const layer = createCanvasLayer(() => container);
      layer.moved(10.4, 0, 1.3);
      layer.moved(12.4, 0, 1.6);
      expect(viewport.style.translate).toBe('-0.4px 0px');
      expect(vi.getTimerCount()).toBe(0);
      expect(container.className).toBe('krnl-canvas');
      layer.dispose();
    } finally { vi.useRealTimers(); }
  });
});

describe('F3 — the layer lands on whole device pixels', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('takes back the fraction of a pixel', () => {
    expect(pixelSnapOffset(10.3, -4.7, 1)).toEqual({ x: -0.3, y: -0.3 });
    expect(pixelSnapOffset(12, 40, 1)).toEqual({ x: 0, y: 0 });
    // At 150 % scaling a device pixel is 2/3 of a CSS pixel.
    const o = pixelSnapOffset(10.5, 0, 1.5);
    expect(Math.abs(((10.5 + o.x) * 1.5) - Math.round((10.5 + o.x) * 1.5))).toBeLessThan(0.01);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(1 / 3);
  });
  it('snaps the place on the screen, also when the canvas itself sits between pixels (Station)', () => {
    // The canvas starts half a pixel in: the layer still lands on a whole pixel.
    const o = pixelSnapOffset(10, 0, 1, 0.5, 0);
    expect(Number.isInteger(0.5 + 10 + o.x)).toBe(true);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(0.5);
    const g = gridOffset(170, -30, 1, 1, 0.25, 0);
    expect(Number.isInteger(0.25 + g.x)).toBe(true);
  });
  it('writes the CSS translate on the viewport, and clears it on whole pixels', () => {
    const { container, viewport } = canvasWithViewport();
    snapViewportToPixels(container, 10.25, 3);
    expect(viewport.style.translate).toBe('-0.25px 0px');
    snapViewportToPixels(container, 10, 3);
    expect(viewport.style.translate).toBe('');
  });
});

describe('F4 — the dot grid slides instead of redrawing', () => {
  it('the layer sits one tile up-left, on the viewport phase', () => {
    expect(gridOffset(170, -30, 1)).toEqual({ x: -150, y: -30 });
    expect(gridOffset(0, 0, 1)).toEqual({ x: -160, y: -160 });
    expect(gridOffset(100, 100, 0.5)).toEqual({ x: -60, y: -60 });
  });

  it('a pan only moves the layer; a zoom redraws the dots at their new size', () => {
    let api: ReturnType<typeof useStoreApi> | null = null;
    const Probe = (): null => { api = useStoreApi(); return null; };
    const { getByTestId } = render(<ReactFlowProvider><Probe /><CanvasGrid /></ReactFlowProvider>);
    const svg = getByTestId('canvas-grid');
    const minorWidth = (): string | null => svg.querySelector('[data-grid="krnl-grid-minor"]')!.getAttribute('width');
    expect(minorWidth()).toBe('32');
    act(() => { api!.setState({ transform: [170, -30, 1] }); });
    expect(svg.style.transform).toBe('translate3d(-150px, -30px, 0)');
    expect(minorWidth()).toBe('32');
    act(() => { api!.setState({ transform: [170, -30, 2] }); });
    expect(minorWidth()).toBe('64');
    expect(svg.querySelector('[data-grid="krnl-grid-major"]')!.getAttribute('width')).toBe('320');
  });

  it('CanvasFlow draws the grid with CanvasGrid, not React Flow\'s Background', () => {
    const src = read('src/renderer/components/Canvas/CanvasFlow.tsx');
    expect(src).toContain('<CanvasGrid />');
    expect(src).not.toMatch(/<Background\b/);
  });

  it('the grid can still be turned off', () => {
    expect(read('src/renderer/styles/chassis.css')).toContain('html[data-grid="off"] .react-flow__background { display: none !important; }');
    expect(read('src/renderer/components/Canvas/CanvasGrid.tsx')).toContain('react-flow__background');
  });
});

describe('F6 — a class change never re-checks the whole page', () => {
  const cssFiles = (dir: string): string[] => {
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const out: string[] = [];
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) out.push(...cssFiles(p));
      else if (p.endsWith('.css')) out.push(p);
    }
    return out;
  };
  it('no :has() in the app tests a class with [class*=], [class^=] or [class$=]', () => {
    for (const file of cssFiles(join(root, 'src/renderer'))) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const bad = css.match(/:has\([^{]*\[class[*^$|~]?=/g);
      expect(bad, file).toBeNull();
    }
  });
  it('the one-line rule and the dev guard name the same wrap parts', async () => {
    const { WRAP_PARTS } = await import('../../../src/renderer/dev/overflowGuard');
    const css = read('src/renderer/styles/tokens.css');
    const m = css.match(/:where\(:not\(:has\(([^)]*)\)\):not\(\[data-wrap\]\)\)/);
    expect(m?.[1]).toBe(WRAP_PARTS);
  });
});

describe('F7 — nothing reacts to hover mid-drag; the embed guard only with embeds', () => {
  it('a window sets the hovered id only when no button is held', () => {
    const src = read('src/renderer/components/nodes/MotherFrame/index.tsx');
    expect(src).toContain('onMouseEnter={(e) => { if (e.buttons === 0) setHoveredNodeId(nodeId); }}');
  });
  it('krnl-pointer-held goes on <html> only when the page holds an iframe', () => {
    const src = read('src/renderer/components/Canvas/CanvasFlow.tsx');
    expect(src).toContain("if (iframes.length > 0) root.classList.add('krnl-pointer-held');");
  });
});

describe('F5 — ending a pan does not re-render the canvas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('the viewport is saved once after 500 ms, without re-rendering the host', () => {
    const save = vi.fn();
    vi.stubGlobal('krnl', { boardSaveViewport: save });
    useBoardStore.setState({ board: { nodes: [], edges: [] } as unknown as NonNullable<ReturnType<typeof useBoardStore.getState>['board']> });
    let renders = 0;
    renderHook(() => { renders++; useViewportPersistence(); });
    const before = renders;
    act(() => {
      useBoardStore.getState().setViewport({ x: 10, y: 20, zoom: 1 });
      useBoardStore.getState().setViewport({ x: 30, y: 40, zoom: 1.5 });
    });
    expect(renders).toBe(before);
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ x: 30, y: 40, zoom: 1.5 });
  });

  it('CanvasFlow reads the saved viewport once instead of subscribing to it', () => {
    const src = read('src/renderer/components/Canvas/CanvasFlow.tsx');
    expect(src).not.toMatch(/useBoardStore\(\(s\) => s\.viewport\)/);
    expect(src).toContain('initialViewport={useBoardStore.getState().viewport}');
  });
});
