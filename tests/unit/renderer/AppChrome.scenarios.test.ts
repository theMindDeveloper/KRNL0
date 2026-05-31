// @vitest-environment jsdom
/**
 * AppChrome Gherkin scenarios — Issue #44, Phase 5.
 *
 * These tests verify the intent of each F# requirement from
 * docs/06-requirements/app-chrome.md WITHOUT mounting the full React tree
 * (that would require electron IPC stubs, xterm, node-pty, etc.).
 *
 * Strategy:
 *  - F1/F2/F3/F5: Test rendering of individual chrome components in isolation
 *    using testing-library + a minimal ReactFlowProvider mock.
 *  - F4/F8: Test that the Dock onAddNode prop is called with the correct args.
 *  - F6/F6b: Test the theme toggle logic (DOM + localStorage).
 *  - F7: Test that TopBar's FIT button calls fitView with correct options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Clean up rendered components after each test to prevent element leakage.
afterEach(cleanup);

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock @xyflow/react so we can test TopBar/StatusBar without a real RF provider.
const mockFitView = vi.fn();
const mockGetViewport = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: mockFitView,
    getViewport: mockGetViewport,
  }),
  // useStore reads RF's internal transform; return a fixed 1.0 zoom in tests.
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, 1] }),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Panel: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'rf-panel' }, children),
}));

// Mock boardStore to control node/edge counts.
vi.mock('../../../src/renderer/store/boardStore', () => ({
  useBoardStore: (selector: (s: {
    board: { nodes: unknown[]; edges: unknown[] } | null;
    viewport: { x: number; y: number; zoom: number };
  }) => unknown) => {
    const state = {
      board: {
        nodes: [{ id: '1' }, { id: '2' }, { id: '3' }],
        edges: [{ id: 'e1' }],
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    return selector(state);
  },
}));

// ── Import components after mocks ─────────────────────────────────────────────
import { TopBar } from '../../../src/renderer/components/TopBar';
import { StatusBar } from '../../../src/renderer/components/StatusBar';
import { Dock } from '../../../src/renderer/components/Dock';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithWrapper(element: React.ReactElement) {
  return render(element);
}

// ── F1 — Topbar left content ──────────────────────────────────────────────────

describe('F1 — Topbar left content', () => {
  // Wave C (LifeOS UI refresh) — the brand mark is now an SVG with a dashed
  // halo + rounded mark block + ■ glyph inside (variant switches per theme).
  it('renders the brand-mark as an SVG with multiple shape children', () => {
    renderWithWrapper(React.createElement(TopBar));
    const mark = screen.getByTestId('topbar-brand-mark');
    expect(mark).toBeTruthy();
    expect(mark.tagName.toLowerCase()).toBe('svg');
    // halo rect + mark rect + glyph text → at least 3 shape children.
    expect(mark.children.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the wordmark "KRNL0"', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-brand').textContent).toContain('KRNL0');
  });

  it('renders breadcrumb text "∷ ~/krnl0 / boards / deep-work"', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-breadcrumb').textContent).toBe(
      '∷ ~/krnl0 / boards / deep-work'
    );
  });

  it('renders badge text "◆ live"', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-live-badge').textContent).toBe('◆ live');
  });
});

// ── F2 — Topbar right buttons ─────────────────────────────────────────────────

describe('F2 — Topbar right buttons present', () => {
  it('renders a "FIT" button', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-fit').textContent).toBe('FIT');
  });

  it('renders a theme toggle button', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-theme-toggle')).toBeTruthy();
  });
});

// ── F3 — Left dock buttons ────────────────────────────────────────────────────

describe('F3 — Left dock contains 5 icon buttons', () => {
  it('renders a dock with 5 buttons', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    const buttons = screen.getByTestId('dock').querySelectorAll('button');
    expect(buttons.length).toBe(5);
  });

  it('renders buttons for select, text, image, analytics, frame', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    expect(screen.getByTestId('dock-btn-select')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-text')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-image')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-analytics')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-frame')).toBeTruthy();
  });
});

// ── F4 — Dock button calls onAddNode with correct kind ────────────────────────

describe('F4 — Dock button dispatches board.addNode intent', () => {
  it('clicking text dock button calls onAddNode with { kind: "text" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-text'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'text' });
  });

  it('clicking image dock button calls onAddNode with { kind: "image" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-image'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'image' });
  });

  it('clicking select button calls onToolChange with "select"', () => {
    const onAddNode = vi.fn();
    const onToolChange = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode, onToolChange }));
    fireEvent.click(screen.getByTestId('dock-btn-select'));
    expect(onToolChange).toHaveBeenCalledWith('select');
    expect(onAddNode).not.toHaveBeenCalled();
  });

  it('clicking analytics dock button calls onAddNode with { kind: "analytics" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-analytics'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'analytics' });
  });

  it('clicking frame dock button calls onAddNode with { kind: "frame" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-frame'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'frame' });
  });
});

// ── F5 — Statusbar content ────────────────────────────────────────────────────

describe('F5 — Statusbar items', () => {
  // PR3 (LifeOS UI refresh) — statusbar split from a single counts string
  // into discrete items: workspace · claude · pomo · day · nodes · edges
  // · zoom · version. Tests now check each item by its testid.
  it('shows node count "3"', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-nodes').textContent ?? '').toContain('3');
  });

  it('shows edge count "1"', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-edges').textContent ?? '').toContain('1');
  });

  it('shows workspace path containing the board name', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-workspace').textContent ?? '').toContain('deep-work');
  });

  it('shows zoom percentage with %', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-zoom').textContent ?? '').toContain('100%');
  });

  it('shows claude connection status', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-claude').textContent ?? '').toContain('connected');
  });

  it('shows pomo state defaulting to "idle"', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-pomo').textContent ?? '').toContain('idle');
  });

  it('shows current day label', () => {
    renderWithWrapper(React.createElement(StatusBar));
    const day = screen.getByTestId('statusbar-day').textContent ?? '';
    // toLocaleDateString returns "MAY 15" / "JAN 03" etc — month abbrev + day.
    expect(day.length).toBeGreaterThan(0);
  });

  it('shows app version', () => {
    renderWithWrapper(React.createElement(StatusBar));
    expect(screen.getByTestId('statusbar-version').textContent ?? '').toContain('v0.');
  });
});

// ── F6 — Theme toggle ─────────────────────────────────────────────────────────

describe('F6 — Theme toggle persists to localStorage', () => {
  beforeEach(() => {
    // Start with dark theme
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('krnl0-theme', 'dark');
  });

  afterEach(() => {
    localStorage.removeItem('krnl0-theme');
  });

  it('toggles data-theme from dark to light and writes to localStorage', () => {
    renderWithWrapper(React.createElement(TopBar));
    const toggleBtn = screen.getByTestId('topbar-theme-toggle');

    // Initial state: dark, button shows ☾ DARK
    expect(toggleBtn.textContent).toContain('DARK');

    fireEvent.click(toggleBtn);

    // After toggle: light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('krnl0-theme')).toBe('light');
    expect(toggleBtn.textContent).toContain('LIGHT');
  });

  it('button label shows ☾ DARK when theme is dark', () => {
    localStorage.setItem('krnl0-theme', 'dark');
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-theme-toggle').textContent).toContain('☾');
  });

  it('button label shows ☀ LIGHT when theme is light', () => {
    localStorage.setItem('krnl0-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-theme-toggle').textContent).toContain('☀');
  });
});

// ── F6b — Theme restored from localStorage on boot ────────────────────────────

describe('F6b — Theme restored from localStorage on boot', () => {
  afterEach(() => {
    localStorage.removeItem('krnl0-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('data-theme matches localStorage value before any React effect', () => {
    // The module-scope IIFE in App.tsx runs at import time and sets data-theme.
    // In this test environment the module is already imported, so we verify
    // that if localStorage has "light", TopBar reads it and applies it.
    localStorage.setItem('krnl0-theme', 'light');
    // Simulate a fresh TopBar mount that reads localStorage:
    renderWithWrapper(React.createElement(TopBar));
    // useEffect fires after render — the attribute should be set to "light".
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

// ── F7 — FIT button calls fitView ────────────────────────────────────────────

describe('F7 — FIT button calls fitView', () => {
  beforeEach(() => {
    mockFitView.mockClear();
  });

  it('calls rf.fitView with { padding: 0.2, duration: 300 }', () => {
    renderWithWrapper(React.createElement(TopBar));
    fireEvent.click(screen.getByTestId('topbar-fit'));
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 300 });
  });
});

// ── F8 — Dock keyboard shortcuts ─────────────────────────────────────────────

describe('F8 — Dock keyboard shortcuts fire onAddNode', () => {
  it('pressing "N" calls onAddNode with { kind: "text" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'N' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'text' });
  });

  it('pressing "n" (lowercase) calls onAddNode with { kind: "text" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'n' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'text' });
  });

  it('pressing "I" calls onAddNode with { kind: "image" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'I' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'image' });
  });

  it('pressing "i" (lowercase) calls onAddNode with { kind: "image" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'i' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'image' });
  });

  it('pressing "V" sets select tool, does not call onAddNode', () => {
    const onAddNode = vi.fn();
    const onToolChange = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode, onToolChange }));
    fireEvent.keyDown(window, { key: 'V' });
    expect(onToolChange).toHaveBeenCalledWith('select');
    expect(onAddNode).not.toHaveBeenCalled();
  });

  it('shortcut key displayed in tooltip title for text button', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    const textBtn = screen.getByTestId('dock-btn-text');
    expect(textBtn.getAttribute('title')).toContain('N');
  });
});
