// @vitest-environment jsdom
/**
 * Decision 63 (performance) — React Flow gives a dragged node new position
 * props on every pointer move; the card draws only from its data and its
 * selection, so a move does not redraw it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { createNodeAdapter } from '../../../src/renderer/components/Canvas/rfAdapters';

describe('a card is not redrawn by a move', () => {
  it('position-only changes skip it; new data or a new selection draw it', () => {
    const inner = vi.fn(() => null);
    const Inner = (props: unknown) => { inner(props); return null; };
    const Adapter = createNodeAdapter(Inner as never) as unknown as React.ComponentType<Record<string, unknown>>;
    const data = { node: { id: 'n', kind: 'text', position: { x: 0, y: 0 }, isMother: false, state: {}, config: {} }, onCommand: () => undefined, onSelect: () => undefined };
    const base = { id: 'n', type: 'text', data, selected: false, dragging: true, zIndex: 0, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0 };
    // A note: no connection dots, so no React Flow store is needed.
    const view = (p: Record<string, unknown>) => <Adapter {...p} />;
    const { rerender } = render(view(base));
    expect(inner).toHaveBeenCalledTimes(1);
    for (let k = 1; k <= 5; k++) rerender(view({ ...base, positionAbsoluteX: k * 10, positionAbsoluteY: k * 4 }));
    expect(inner).toHaveBeenCalledTimes(1);
    rerender(view({ ...base, selected: true }));
    expect(inner).toHaveBeenCalledTimes(2);
    rerender(view({ ...base, selected: true, data: { ...data } }));
    expect(inner).toHaveBeenCalledTimes(3);
  });
});
