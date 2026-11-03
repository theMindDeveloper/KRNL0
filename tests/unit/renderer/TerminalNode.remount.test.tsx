// @vitest-environment jsdom
/** Switching layouts remounts the terminal; the shell and its output must survive. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TerminalNode } from '../../../src/renderer/components/nodes/TerminalNode';
import type { Node } from '../../../src/shared/types/node';
import type { TermState, TermConfig } from '../../../src/renderer/components/nodes/TerminalNode/types';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}

const node = { id: 'mother-term-remount', kind: 'term', isMother: true, position: { x: 0, y: 0 }, state: { sessionId: null, title: 'Terminal' }, config: { shell: 'default', fontSize: 13 } } as unknown as Node<TermState, TermConfig>;

const ptyCreate = vi.fn(async () => ({ sessionId: 'sid-live', motd: '' }));
const ptyKill = vi.fn();

beforeEach(() => {
  (window as unknown as { krnl: unknown }).krnl = {
    ptyCreate, ptyKill, ptyWrite: vi.fn(), ptyResize: vi.fn(),
    onPtyData: vi.fn(() => () => undefined), onPtyExit: vi.fn(() => () => undefined),
  };
});

const flushFrames = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
};

describe('terminal across remounts', () => {
  it('keeps one shell: unmount detaches, the next mount re-attaches', async () => {
    render(<TerminalNode node={node} onCommand={() => undefined} selected={false} onSelect={() => undefined} />);
    await flushFrames();
    expect(ptyCreate).toHaveBeenCalledTimes(1);
    cleanup(); // e.g. Ctrl+Shift+L
    expect(ptyKill).not.toHaveBeenCalled();
    render(<TerminalNode node={node} onCommand={() => undefined} selected={false} onSelect={() => undefined} />);
    await flushFrames();
    expect(ptyCreate).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.term-body > div')).toBeTruthy();
    cleanup();
  });
});
