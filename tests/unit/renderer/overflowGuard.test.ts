// @vitest-environment jsdom
/** UI rule: a control's words stay inside it (docs/04-visual-system/design-tokens.md). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { findSpills } from '../../../src/renderer/dev/overflowGuard';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** jsdom has no layout: give the button a box and its text the rects we want. */
function button(html: string, box: DOMRect, textRects: DOMRect[]) {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild as HTMLElement;
  el.getBoundingClientRect = () => box;
  Object.defineProperty(el, 'innerText', { value: el.textContent, configurable: true });
  (Range.prototype as unknown as { getClientRects: () => DOMRect[] }).getClientRects = () => textRects;
  return el;
}

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('overflow guard', () => {
  it('flags a label that spills past its button', () => {
    button('<button data-testid="orb-chat-new">New chat</button>', rect(0, 0, 40, 22), [rect(4, 4, 60, 14)]);
    expect(findSpills()).toEqual([{ label: 'New chat', testId: 'orb-chat-new', problem: 'spills' }]);
  });
  it('flags a plain label that wraps onto two lines', () => {
    button('<button>New chat</button>', rect(0, 0, 40, 40), [rect(4, 4, 30, 14), rect(4, 20, 30, 14)]);
    expect(findSpills()[0]?.problem).toBe('wraps');
  });
  it('lets a title + description card wrap', () => {
    button('<button><span>Easy</span><span class="st-choice__hint">Plan your day and see where the time went</span></button>', rect(0, 0, 200, 60), [rect(4, 4, 150, 14), rect(4, 22, 150, 14)]);
    expect(findSpills()).toEqual([]);
  });
  it('passes a label that fits', () => {
    button('<button>Tours</button>', rect(0, 0, 60, 22), [rect(8, 4, 40, 14)]);
    expect(findSpills()).toEqual([]);
  });
  it('the CSS rule exists: plain controls keep one line', () => {
    const css = readFileSync(resolve(__dirname, '../../../src/renderer/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/:where\(button, \[role="button"\][^{]*\{\s*white-space: nowrap;/);
  });
});
