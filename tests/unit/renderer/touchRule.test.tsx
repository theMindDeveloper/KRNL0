// @vitest-environment jsdom
// One touch rule for every window (Decision 68; phone-web F16–F22; #305, #306, #307).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { installTouchGuard, ownTouch, isTouchOwned, resetTouchOwners } from '../../../src/renderer/components/ui/touchGesture';
import { beginCalendarDrag, edgeZonePx, isCalendarDragging } from '../../../src/renderer/components/nodes/CalendarNode/calendarDrag';
import { HOLD_MS } from '../../../src/renderer/components/nodes/CalendarNode/holdToDraw';
import { claimOverlay } from '../../../src/renderer/components/ui/oneOverlay';
import { installLongPressMenu } from '../../../src/web/touch';
import { installKeyboardLift } from '../../../src/web/keyboard';
import { migrateBoard, seedBoard } from '../../../src/shared/boardMigrate';
import { CLASSIC_SLOTS } from '../../../src/shared/stationLayouts';

const pointer = (type: string, x: number, y: number, extra: Record<string, unknown> = {}): void => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  for (const [k, v] of Object.entries({ pointerId: 3, ...extra })) Object.defineProperty(ev, k, { value: v });
  act(() => { window.dispatchEvent(ev); });
};
const touchmove = (): Event => { const e = new Event('touchmove', { bubbles: true, cancelable: true }); window.dispatchEvent(e); return e; };

beforeEach(() => { vi.useFakeTimers(); installTouchGuard(); resetTouchOwners(); });
afterEach(() => { vi.useRealTimers(); resetTouchOwners(); document.body.innerHTML = ''; });

describe('a gesture KRNL0 owns stops the page and the canvas (F16)', () => {
  it('while owned, a touch move neither scrolls nor reaches the canvas; after, it does', () => {
    const behind = vi.fn();
    document.body.addEventListener('touchmove', behind);
    expect(touchmove().defaultPrevented).toBe(false);
    const release = ownTouch();
    expect(isTouchOwned()).toBe(true);
    const e = touchmove();
    expect(e.defaultPrevented).toBe(true);
    release();
    release(); // once only
    expect(isTouchOwned()).toBe(false);
    expect(touchmove().defaultPrevented).toBe(false);
  });
});

describe('hold to pick up (F17)', () => {
  const el = (): HTMLDivElement => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
  const press = (target: HTMLElement): void => beginCalendarDrag({ clientX: 100, clientY: 100, button: 0, pointerType: 'touch', pointerId: 3, currentTarget: target } as never, { item: { kind: 'task', id: 't1', name: 'Study', tone: 'var(--acid)', lenMin: 30 } });

  it('a finger that moves at once is a scroll: nothing is picked up', () => {
    press(el());
    pointer('pointermove', 100, 130);
    act(() => { vi.advanceTimersByTime(HOLD_MS + 50); });
    expect(isCalendarDragging()).toBe(false);
    pointer('pointerup', 100, 130);
  });

  it('held still, the box shows at once and the finger owns the gesture; lifted elsewhere, it is carried', () => {
    const menu = vi.fn();
    const target = el();
    target.addEventListener('contextmenu', menu);
    press(target);
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(isCalendarDragging()).toBe(true);
    expect(isTouchOwned()).toBe(true);
    pointer('pointermove', 100, 200);
    pointer('pointerup', 100, 200);
    expect(isCalendarDragging()).toBe(false);
    expect(isTouchOwned()).toBe(false);
    expect(menu).not.toHaveBeenCalled();
  });

  it('held and lifted where it was picked up: its long-press menu, not a move', () => {
    const menu = vi.fn();
    const target = el();
    target.addEventListener('contextmenu', menu);
    press(target);
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10); });
    pointer('pointerup', 102, 101);
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it('a mouse still picks up at once, with no hold', () => {
    beginCalendarDrag({ clientX: 10, clientY: 10, button: 0, pointerType: 'mouse' } as never, { item: { kind: 'task', id: 't2', name: 'A', tone: 'x', lenMin: 30 } });
    pointer('pointermove', 10, 40, { pointerType: 'mouse' });
    expect(isCalendarDragging()).toBe(true);
    pointer('pointerup', 10, 40, { pointerType: 'mouse' });
  });
});

describe('edges a finger can grab (F18)', () => {
  it('7 px for a mouse; 16 px for a finger; a short block: its lower half', () => {
    expect(edgeZonePx(false, 60)).toEqual({ bottom: 7, top: 7 });
    expect(edgeZonePx(false, 12).top).toBe(0);
    expect(edgeZonePx(true, 60)).toEqual({ bottom: 16, top: 16 });
    expect(edgeZonePx(true, 30)).toEqual({ bottom: 13.5, top: 0 });
  });
});

describe('the long-press menu (F19)', () => {
  const touch = (type: string, x: number, y: number): void => {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown; changedTouches: unknown };
    const list = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
    Object.defineProperty(ev, 'touches', { value: Object.assign(list, { length: list.length }) });
    Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
    act(() => { document.body.dispatchEvent(ev); });
  };
  it('does not open while a held finger carries something', () => {
    const off = installLongPressMenu(document, { isNative: () => false });
    const menu = vi.fn();
    document.body.addEventListener('contextmenu', menu);
    const release = ownTouch();
    touch('touchstart', 50, 50);
    act(() => { vi.advanceTimersByTime(600); });
    expect(menu).not.toHaveBeenCalled();
    release();
    touch('touchend', 50, 50);
    off();
  });
  it('opened, then the finger moves on: it closes (a drag, not a choice)', () => {
    const off = installLongPressMenu(document, { isNative: () => false });
    const close = vi.fn();
    document.body.addEventListener('contextmenu', () => { claimOverlay(close); });
    touch('touchstart', 50, 50);
    act(() => { vi.advanceTimersByTime(600); });
    touch('touchmove', 50, 90);
    expect(close).toHaveBeenCalled();
    touch('touchend', 50, 90);
    off();
  });
});

describe('the on-screen keyboard (F20)', () => {
  it('the shell ends above it, and a card with the field moves up; both go back with it', () => {
    const vv = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const win = { visualViewport: vv, innerHeight: 800, document, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) } as unknown as Window;
    const card = document.createElement('div');
    card.style.position = 'fixed';
    const field = document.createElement('input');
    card.appendChild(field);
    document.body.appendChild(card);
    card.getBoundingClientRect = () => ({ top: 500, bottom: 700, left: 0, right: 300, width: 300, height: 200, x: 0, y: 500, toJSON: () => ({}) });
    field.getBoundingClientRect = () => ({ top: 640, bottom: 680, left: 0, right: 300, width: 300, height: 40, x: 0, y: 640, toJSON: () => ({}) });
    const off = installKeyboardLift(win);
    field.focus();
    vv.height = 450; // the keyboard: 350 px
    vv.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('350px');
    expect(card.style.translate).toBe('0 -262px');
    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('0px');
    expect(card.style.translate).toBe('');
    off();
  });
});

describe('the first layout is the one Reset makes (F21)', () => {
  type N = { kind: string; isMother?: boolean; config?: Record<string, unknown> };
  const slots = (b: { nodes: N[] }): Record<string, unknown> => Object.fromEntries(b.nodes.filter((n) => n.isMother).map((n) => [n.kind, n.config?.['stationSlot']]));
  it('a new board opens on My layout as Reset arranges it', () => {
    const b = migrateBoard(seedBoard()) as { layoutMode: string; layoutGeometry: { station: { preset: string; canvasHidden: boolean } }; nodes: N[] };
    expect(b.layoutMode).toBe('station');
    expect(b.layoutGeometry.station.preset).toBe('classic');
    expect(b.layoutGeometry.station.canvasHidden).toBe(true);
    for (const [kind, slot] of Object.entries(slots(b))) if (CLASSIC_SLOTS[kind]) expect(slot).toBe(CLASSIC_SLOTS[kind]);
    expect(b.nodes.find((n) => n.kind === 'habit')?.config?.['stationHidden']).toBe(true);
    expect(b.nodes.find((n) => n.kind === 'calendar')?.config?.['stationHidden']).toBe(false);
  });
  it('a board arriving on a device with no layout of its own gets the same', () => {
    const synced = migrateBoard(seedBoard()) as Record<string, unknown> & { nodes: N[] };
    // What sync sends: the device keys left out (layout, window places).
    delete synced['layoutMode'];
    delete synced['layoutGeometry'];
    for (const n of synced.nodes) if (n.config) { delete n.config['stationSlot']; delete n.config['stationHidden']; }
    const b = migrateBoard(synced) as { layoutMode: string; nodes: N[] };
    expect(b.layoutMode).toBe('station');
    expect(slots(b)['clock']).toBe(CLASSIC_SLOTS['clock']);
  });
  it('a board from before the Station keeps its canvas; a device with its own layout keeps it', () => {
    const old = migrateBoard({ version: 1, nodes: [{ id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, state: {}, config: {} }], edges: [] }) as { layoutMode: string };
    expect(old.layoutMode).toBe('canvas');
    const mine = migrateBoard(seedBoard()) as Record<string, unknown> & { nodes: N[] };
    mine['layoutMode'] = 'canvas';
    mine.nodes.find((n) => n.kind === 'pomo')!.config!['stationSlot'] = 'top-right-pre';
    const again = migrateBoard(mine) as { layoutMode: string; nodes: N[] };
    expect(again.layoutMode).toBe('canvas');
    expect(again.nodes.find((n) => n.kind === 'pomo')?.config?.['stationSlot']).toBe('top-right-pre');
  });
});
