// @vitest-environment jsdom
// A phone on its side, windows you choose, More as a popup (Decision 67,
// phone-web F10–F14; design "KRNL0 phone sideways · Dock", direction D).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
vi.mock('../../../src/renderer/components/Station/EmbeddedCanvasCell', () => ({ EmbeddedCanvasCell: () => null }));
import { MobileShell } from '../../../src/renderer/components/Mobile/MobileShell';
import { formFactorFor } from '../../../src/renderer/components/Mobile/useFormFactor';
import { chooseSlot, readSlots, useSlots } from '../../../src/renderer/components/Mobile/WindowSlots';
import { WindowName, WindowPickContext } from '../../../src/renderer/components/nodes/WindowName';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function setBoard(withPomo = false): void {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'station',
    // No real windows render (unknown kinds); the Timer's state only, for the pill.
    nodes: [
      { id: 'mother-todo', kind: 'todo-x', isMother: true, position: { x: 0, y: 0 }, state: { items: [] }, config: {} },
      ...(withPomo ? [{ id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, state: { status: 'idle', startedAt: null, activeTaskId: null, label: '', pausedAt: null, history: [] }, config: { mode: 'observe' } }] : []),
    ],
  } as unknown as Board);
}

beforeEach(() => { try { sessionStorage.clear(); localStorage.clear(); } catch { /* none */ } setBoard(); });
afterEach(() => cleanup());

describe('form factor: a phone on its side is the dock (F10)', () => {
  it('a touch screen wider than tall and at most 500 px tall', () => {
    expect(formFactorFor(844, 390, true)).toBe('dock');
    expect(formFactorFor(667, 375, true)).toBe('dock');
    expect(formFactorFor(932, 430, true)).toBe('dock');
    expect(formFactorFor(390, 844, true)).toBe('phone');
    expect(formFactorFor(1024, 768, true)).toBe('tablet'); // an iPad on its side has room
    expect(formFactorFor(844, 390, false)).toBe('tablet'); // a short desktop window is not a phone
    expect(formFactorFor(1400)).toBe('desktop');
  });
});

describe('slots (F11)', () => {
  it('a window already shown elsewhere swaps places, so none is shown twice', () => {
    expect(chooseSlot(['todo', 'clock'], 0, 'pomo')).toEqual(['pomo', 'clock']);
    expect(chooseSlot(['todo', 'clock'], 0, 'clock')).toEqual(['clock', 'todo']);
    expect(chooseSlot(['todo', 'clock'], 1, 'clock')).toEqual(['todo', 'clock']);
  });
  it('a stored choice is used only if it is whole and sound', () => {
    const d = ['todo', 'clock'] as const;
    expect(readSlots('["habit","pomo"]', d)).toEqual(['habit', 'pomo']);
    expect(readSlots('["habit","habit"]', d)).toEqual(['todo', 'clock']);
    expect(readSlots('["habit"]', d)).toEqual(['todo', 'clock']);
    expect(readSlots('["terminal","pomo"]', d)).toEqual(['todo', 'clock']);
    expect(readSlots('not json', d)).toEqual(['todo', 'clock']);
    expect(readSlots(null, d)).toEqual(['todo', 'clock']);
  });
  it('the choice stays on this device', () => {
    let pick: ((i: number, k: 'pomo') => void) | null = null;
    function Probe() { const [s, c] = useSlots('k', ['todo', 'clock']); pick = c; return <span data-testid="s">{s.join(',')}</span>; }
    render(<Probe />);
    act(() => { pick!(1, 'pomo'); });
    expect(screen.getByTestId('s').textContent).toBe('todo,pomo');
    expect(localStorage.getItem('k')).toBe('["todo","pomo"]');
  });
  it("a window's name is a button with the list only where its place can be chosen", () => {
    render(<WindowName>Todos</WindowName>);
    expect(screen.getByText('Todos').tagName).toBe('SPAN');
    cleanup();
    const open = vi.fn();
    render(<WindowPickContext.Provider value={open}><WindowName>Todos</WindowName></WindowPickContext.Provider>);
    const b = screen.getByRole('button', { name: /Todos/ });
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(b);
    expect(open).toHaveBeenCalledWith(b);
  });
});

describe('the dock (F10, F12)', () => {
  it('no header and no tab bar: a rail of five, and two windows (Todo, Clock)', () => {
    render(<MobileShell ff="dock" />);
    expect(screen.getByTestId('m-shell-dock')).toBeTruthy();
    expect(document.querySelector('.m-head')).toBeNull();
    expect(document.querySelector('.m-tabbar')).toBeNull();
    for (const v of ['today', 'todos', 'calendar', 'habits', 'more']) expect(screen.getByTestId(`m-nav-${v}`)).toBeTruthy();
    expect(screen.getByTestId('m-slot-0').getAttribute('data-kind')).toBe('todo');
    expect(screen.getByTestId('m-slot-1').getAttribute('data-kind')).toBe('clock');
  });
  it('the Timer pill: Start while idle, and gone while a window shows the Timer', () => {
    setBoard(true);
    render(<MobileShell ff="dock" />);
    expect(screen.getByTestId('m-pill-start')).toBeTruthy();
    cleanup();
    localStorage.setItem('krnl0-web-dock-slots', '["pomo","clock"]');
    render(<MobileShell ff="dock" />);
    expect(screen.queryByTestId('m-pill')).toBeNull();
  });
});

describe('More is a small popup (F13)', () => {
  it('opens at its tab, opens the pick, and is never a page', () => {
    sessionStorage.setItem('krnl0-web-view', 'more');
    render(<MobileShell ff="phone" />);
    expect(screen.queryByTestId('m-more')).toBeNull(); // an old "More" page opens Today
    expect(screen.getByTestId('m-today')).toBeTruthy();
    fireEvent.click(screen.getByTestId('m-nav-more'));
    expect(screen.getByRole('menu', { name: 'More' })).toBeTruthy();
    expect(screen.queryByTestId('m-more-settings')).toBeNull(); // the phone has its gear in the header
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('m-more')).toBeNull();
  });
  it('on its side, More also holds Settings (no header there)', () => {
    render(<MobileShell ff="dock" />);
    fireEvent.click(screen.getByTestId('m-nav-more'));
    fireEvent.click(screen.getByTestId('m-more-settings'));
    expect(screen.queryByTestId('m-more')).toBeNull();
    expect(document.querySelector('.st')).toBeTruthy();
  });
});

describe('iPad Today: four windows you choose (F14)', () => {
  it('Timer and Plans, Calendar and Habits by default; a stored choice is used', () => {
    render(<MobileShell ff="tablet" />);
    expect([0, 1, 2, 3].map((i) => screen.getByTestId(`m-slot-${i}`).getAttribute('data-kind'))).toEqual(['pomo', 'todo', 'calendar', 'habit']);
    cleanup();
    localStorage.setItem('krnl0-web-tablet-slots', '["pomo","todo","calendar","clock"]');
    render(<MobileShell ff="tablet" />);
    expect(screen.getByTestId('m-slot-3').getAttribute('data-kind')).toBe('clock');
  });
});
