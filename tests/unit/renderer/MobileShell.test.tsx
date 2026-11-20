// @vitest-environment jsdom
// The web app's phone / iPad shell (Decision 51, designs Phone*/Tablet*).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
// The real canvas needs a browser; its view is covered by the web simulation in headless Chrome.
vi.mock('../../../src/renderer/components/Station/EmbeddedCanvasCell', () => ({ EmbeddedCanvasCell: () => null }));
import { MobileShell } from '../../../src/renderer/components/Mobile/MobileShell';
import { formFactorFor } from '../../../src/renderer/components/Mobile/useFormFactor';
import { isStationShown } from '../../../src/renderer/components/Station/useStationViewportGate';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function setBoard(items: Array<Record<string, unknown>> = []): void {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'station',
    // A Plans window only (state read for the headline); the others are absent, so no window renders.
    nodes: [{ id: 'mother-todo', kind: 'todo-x', isMother: true, position: { x: 0, y: 0 }, state: { items }, config: {} }],
  } as unknown as Board);
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* none */ } setBoard(); });
afterEach(() => cleanup());

describe('form factor', () => {
  it('phone below 700, iPad below 1200, desktop above', () => {
    expect(formFactorFor(390)).toBe('phone');
    expect(formFactorFor(699)).toBe('phone');
    expect(formFactorFor(700)).toBe('tablet');
    expect(formFactorFor(1180)).toBe('tablet');
    expect(formFactorFor(1200)).toBe('desktop');
  });
});

describe('MobileShell', () => {
  it('phone: five views in a tab bar, Today first; the choice is kept for this browser session', () => {
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-shell-phone')).toBeTruthy();
    for (const v of ['today', 'calendar', 'habits', 'insights', 'canvas']) expect(screen.getByTestId(`m-nav-${v}`)).toBeTruthy();
    expect(screen.getByTestId('m-nav-today').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('m-today')).toBeTruthy();
    fireEvent.click(screen.getByTestId('m-nav-habits'));
    expect(screen.getByTestId('m-nav-habits').getAttribute('aria-current')).toBe('page');
    expect(sessionStorage.getItem('krnl0-web-view')).toBe('habits');
    cleanup();
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-nav-habits').getAttribute('aria-current')).toBe('page');
  });

  it('iPad: the same views in a side rail, named as in the design (Week)', () => {
    render(<MobileShell ff="tablet" />);
    expect(screen.getByTestId('m-shell-tablet')).toBeTruthy();
    expect(screen.getByTestId('m-nav-calendar').textContent).toContain('Week');
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeTruthy();
  });

  it('while the shell is up, the canvas shows only free cards (the windows have their own views)', () => {
    expect(isStationShown('canvas')).toBe(false);
    render(<MobileShell ff="phone" />);
    expect(isStationShown('canvas')).toBe(true);
    cleanup();
    expect(isStationShown('canvas')).toBe(false);
  });

  it('no Focus while the timer is idle', () => {
    render(<MobileShell ff="phone" />);
    expect(screen.queryByTestId('m-focus-open')).toBeNull();
  });

  it('the Calendar view offers the Clock beside it', () => {
    render(<MobileShell ff="phone" />);
    fireEvent.click(screen.getByTestId('m-nav-calendar'));
    expect(screen.getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Clock' }));
    expect(screen.getByRole('tab', { name: 'Clock' }).getAttribute('aria-selected')).toBe('true');
  });

  it('has a settings button on the phone', () => {
    setBoard([{ id: 'a', text: 'Gym', done: false, createdAt: '', completedAt: null, taskNodeId: null, scheduledFor: `${today()}T17:30` }]);
    render(<MobileShell ff="phone" />);
    expect(screen.getByTestId('m-settings')).toBeTruthy();
  });
});
