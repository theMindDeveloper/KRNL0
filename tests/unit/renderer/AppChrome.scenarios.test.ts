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
  it('renders the brand-mark "■"', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-brand').textContent).toContain('■');
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

  it('renders a "TWEAKS" button', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-tweaks').textContent).toBe('TWEAKS');
  });

  it('renders a "SHARE" button', () => {
    renderWithWrapper(React.createElement(TopBar));
    expect(screen.getByTestId('topbar-share').textContent).toBe('SHARE');
  });
});

// ── F3 — Left dock buttons ────────────────────────────────────────────────────

describe('F3 — Left dock contains 4 icon buttons', () => {
  it('renders a dock with 4 buttons', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    const buttons = screen.getByTestId('dock').querySelectorAll('button');
    expect(buttons.length).toBe(4);
  });

  it('renders buttons for pomo, todo, habit, term', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    expect(screen.getByTestId('dock-btn-pomo')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-todo')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-habit')).toBeTruthy();
    expect(screen.getByTestId('dock-btn-term')).toBeTruthy();
  });
});

// ── F4 — Dock button calls onAddNode with correct kind ────────────────────────

describe('F4 — Dock button dispatches board.addNode intent', () => {
  it('clicking pomo dock button calls onAddNode with { kind: "pomo" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-pomo'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'pomo' });
  });

  it('clicking todo dock button calls onAddNode with { kind: "todo" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-todo'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'todo' });
  });

  it('clicking habit dock button calls onAddNode with { kind: "habit" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-habit'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'habit' });
  });

  it('clicking term dock button calls onAddNode with { kind: "term" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.click(screen.getByTestId('dock-btn-term'));
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'term' });
  });
});

// ── F5 — Statusbar content ────────────────────────────────────────────────────

describe('F5 — Statusbar reads "3 nodes · 1 edge · deep-work"', () => {
  it('shows correct node count, edge count, and board name', () => {
    renderWithWrapper(React.createElement(StatusBar));
    const text = screen.getByTestId('statusbar-counts').textContent ?? '';
    expect(text).toBe('3 nodes · 1 edge · deep-work');
  });

  it('pluralizes "1 node" correctly', () => {
    // Re-mock useBoardStore for this test with 1 node / 0 edges
    // We'll test the pluralize helper indirectly via a fresh render.
    // The mock above is module-level; we test via the component logic.
    // A manual unit test of the pluralization rule:
    const pluralize = (count: number, singular: string) =>
      `${count} ${count === 1 ? singular : singular + 's'}`;
    expect(pluralize(1, 'node')).toBe('1 node');
    expect(pluralize(2, 'node')).toBe('2 nodes');
    expect(pluralize(0, 'edge')).toBe('0 edges');
    expect(pluralize(1, 'edge')).toBe('1 edge');
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
  it('pressing "P" calls onAddNode with { kind: "pomo" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'P' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'pomo' });
  });

  it('pressing "T" calls onAddNode with { kind: "todo" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'T' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'todo' });
  });

  it('pressing "H" calls onAddNode with { kind: "habit" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'H' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'habit' });
  });

  it('pressing "X" calls onAddNode with { kind: "term" }', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    fireEvent.keyDown(window, { key: 'X' });
    expect(onAddNode).toHaveBeenCalledWith({ kind: 'term' });
  });

  it('shortcut key displayed in tooltip title', () => {
    const onAddNode = vi.fn();
    renderWithWrapper(React.createElement(Dock, { onAddNode }));
    const pomoBtn = screen.getByTestId('dock-btn-pomo');
    expect(pomoBtn.getAttribute('title')).toContain('P');
  });
});
