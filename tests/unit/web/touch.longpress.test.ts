// @vitest-environment jsdom
/**
 * Decision 56 — a long-press on a touch screen is the right-click menu and
 * nothing else: one menu, no text selection, no tap after it (phone-web.md F3–F5).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installLongPressMenu, HOLD_MS } from '../../../src/web/touch';

type Pt = { x: number; y: number };

function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', fingers: Pt[], changed: Pt[] = fingers): TouchEvent {
  const mk = (p: Pt, i: number) => ({ identifier: i, target, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, screenX: p.x, screenY: p.y }) as unknown as Touch;
  const ev = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(ev, 'touches', { value: fingers.map(mk) });
  Object.defineProperty(ev, 'changedTouches', { value: changed.map(mk) });
  target.dispatchEvent(ev);
  return ev;
}

/** A trusted-looking event (what the phone itself sends). */
function native<T extends Event>(target: Element, ev: T): T {
  Object.defineProperty(ev, 'isTrusted', { value: true });
  target.dispatchEvent(ev);
  return ev;
}

let off: () => void;
let dial: HTMLElement;
let menus: MouseEvent[];

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="clock"><span id="num">12</span></div><input id="field" value="hello" /><button id="row">Row</button>';
  dial = document.getElementById('num')!;
  menus = [];
  document.addEventListener('contextmenu', (e) => { if (!e.defaultPrevented) menus.push(e as MouseEvent); });
  off = installLongPressMenu(document);
});
afterEach(() => { off(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('long-press on a touch screen', () => {
  it('opens one right-click menu at the finger after the hold', () => {
    touch(dial, 'touchstart', [{ x: 40, y: 50 }]);
    vi.advanceTimersByTime(HOLD_MS - 10);
    expect(menus).toHaveLength(0);
    vi.advanceTimersByTime(20);
    expect(menus).toHaveLength(1);
    expect(menus[0]!.clientX).toBe(40);
    expect(menus[0]!.target).toBe(dial);
  });

  it('drops the phone\'s own right-click, before and after ours: one menu', () => {
    touch(dial, 'touchstart', [{ x: 40, y: 50 }]);
    vi.advanceTimersByTime(300);
    const early = native(dial, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(early.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(HOLD_MS);
    const late = native(dial, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(late.defaultPrevented).toBe(true);
    expect(menus).toHaveLength(1);
  });

  it('selects no text: selection cannot start while the finger is down, and is cleared when the menu opens', () => {
    touch(dial, 'touchstart', [{ x: 40, y: 50 }]);
    const sel = native(dial, new Event('selectstart', { bubbles: true, cancelable: true }));
    expect(sel.defaultPrevented).toBe(true);
    // Whatever the phone selected anyway goes when the menu opens.
    const range = document.createRange();
    range.selectNodeContents(dial);
    document.getSelection()!.addRange(range);
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(document.getSelection()!.toString()).toBe('');
  });

  it('the lift is not a tap: its touchend is cancelled and its click at the finger is dropped', () => {
    const row = document.getElementById('row')!;
    const clicks = vi.fn();
    row.addEventListener('click', clicks);
    touch(row, 'touchstart', [{ x: 10, y: 10 }]);
    vi.advanceTimersByTime(HOLD_MS + 5);
    const end = touch(row, 'touchend', [], [{ x: 11, y: 10 }]);
    expect(end.defaultPrevented).toBe(true);
    native(row, new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 11, clientY: 10 }));
    expect(clicks).not.toHaveBeenCalled();
    // A real tap somewhere else right after still works.
    native(row, new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 300 }));
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('a short tap stays a tap', () => {
    const row = document.getElementById('row')!;
    touch(row, 'touchstart', [{ x: 10, y: 10 }]);
    vi.advanceTimersByTime(120);
    const end = touch(row, 'touchend', [], [{ x: 10, y: 10 }]);
    expect(end.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(HOLD_MS);
    expect(menus).toHaveLength(0);
  });

  it('a move (drag or pan) or a second finger (pinch) cancels it', () => {
    touch(dial, 'touchstart', [{ x: 40, y: 50 }]);
    touch(dial, 'touchmove', [{ x: 60, y: 50 }]);
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(menus).toHaveLength(0);
    touch(dial, 'touchstart', [{ x: 40, y: 50 }]);
    touch(dial, 'touchstart', [{ x: 40, y: 50 }, { x: 140, y: 150 }]);
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(menus).toHaveLength(0);
  });

  it('fields keep the system long-press (select, paste)', () => {
    const field = document.getElementById('field')!;
    touch(field, 'touchstart', [{ x: 5, y: 5 }]);
    const sel = native(field, new Event('selectstart', { bubbles: true, cancelable: true }));
    expect(sel.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(menus).toHaveLength(0);
    const own = native(field, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(own.defaultPrevented).toBe(false);
  });
});
