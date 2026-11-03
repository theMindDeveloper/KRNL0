// @vitest-environment jsdom
/** Which keys a window-level shortcut may take. */
import { describe, it, expect, afterEach } from 'vitest';
import { isTypingTarget, isControlTarget, isModalOpen } from '../../../src/renderer/utils/keyboardTargets';

afterEach(() => { document.body.innerHTML = ''; });

const el = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  return document.body.querySelector('[data-t]') as HTMLElement;
};

describe('keyboard targets', () => {
  it('fields, selects and the terminal are typing targets', () => {
    expect(isTypingTarget(el('<input data-t>'))).toBe(true);
    expect(isTypingTarget(el('<select data-t></select>'))).toBe(true);
    expect(isTypingTarget(el('<div class="xterm"><span data-t></span></div>'))).toBe(true);
    expect(isTypingTarget(el('<div data-t></div>'))).toBe(false);
  });

  it('buttons and ARIA controls own Space (push-to-talk must not take it)', () => {
    expect(isControlTarget(el('<button data-t>x</button>'))).toBe(true);
    expect(isControlTarget(el('<div role="radio" data-t></div>'))).toBe(true);
    expect(isControlTarget(el('<button><span data-t>icon</span></button>'))).toBe(true);
    expect(isControlTarget(el('<div data-t></div>'))).toBe(false);
  });

  it('an aria-modal dialog counts as a modal', () => {
    el('<div data-t></div>');
    expect(isModalOpen()).toBe(false);
    el('<div role="dialog" aria-modal="true" data-t></div>');
    expect(isModalOpen()).toBe(true);
  });
});
