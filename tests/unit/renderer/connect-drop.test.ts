// @vitest-environment jsdom
/** Easier wiring: dropping a connection on a node's body connects to that node. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { targetNodeIdAt } from '../../../src/renderer/components/Canvas/connectTarget';

afterEach(() => { document.body.innerHTML = ''; });

describe('targetNodeIdAt', () => {
  it('finds the node under the pointer, even on an inner element', () => {
    document.body.innerHTML = '<div class="react-flow__node" data-id="task-1"><div><span id="inner">x</span></div></div>';
    const inner = document.getElementById('inner')!;
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = vi.fn(() => [inner, document.body]);
    expect(targetNodeIdAt(10, 10)).toBe('task-1');
  });
  it('returns null over empty canvas', () => {
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = vi.fn(() => [document.body]);
    expect(targetNodeIdAt(10, 10)).toBeNull();
  });
});
