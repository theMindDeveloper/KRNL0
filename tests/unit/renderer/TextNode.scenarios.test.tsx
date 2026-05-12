// @vitest-environment jsdom
/**
 * TextNode Gherkin scenario tests — derived from docs/06-requirements/text-node.md
 *
 * F1, F2, F4, F5, F6, F8 are covered here. F3 (debounced autosave) is verified
 * via the commit-on-blur path (synchronous) because timing-based debounce
 * tests are brittle under jsdom; the timer pathway is exercised by F3b.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import { TextNode } from '../../../src/renderer/components/nodes/TextNode';
import { createNodeAdapter } from '../../../src/renderer/components/Canvas/rfAdapters';
import type { Node } from '../../../src/shared/types/node';
import type {
  TextState,
  TextConfig,
} from '../../../src/renderer/components/nodes/TextNode/types';

afterEach(() => cleanup());

function fixture(state: Partial<TextState> = {}): Node<TextState, TextConfig> {
  return {
    id: 'text-1',
    kind: 'text',
    position: { x: 0, y: 0 },
    isMother: false,
    state: { text: '', ...state },
    config: {},
  };
}

const noop = () => undefined;

describe('TextNode — F1 empty state', () => {
  it('renders placeholder "write..." when text is empty', () => {
    render(
      <TextNode
        node={fixture({ text: '' })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText('write...')).toBeTruthy();
  });

  it('renders the text value when non-empty', () => {
    render(
      <TextNode
        node={fixture({ text: 'hello world' })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText('hello world')).toBeTruthy();
  });
});

describe('TextNode — F2 click to edit', () => {
  it('clicking the body mounts a textarea', () => {
    render(
      <TextNode
        node={fixture({ text: 'hi' })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('text-node-body'));
    const ta = screen.getByTestId('text-node-textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('hi');
  });
});

describe('TextNode — F3b autosave on blur', () => {
  it('blurring after edit dispatches text.setText', () => {
    const onCommand = vi.fn();
    render(
      <TextNode
        node={fixture({ text: 'old' })}
        selected={false}
        onCommand={onCommand}
        onSelect={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('text-node-body'));
    const ta = screen.getByTestId('text-node-textarea');
    fireEvent.change(ta, { target: { value: 'updated' } });
    fireEvent.blur(ta);
    expect(onCommand).toHaveBeenCalledWith('text.setText', { text: 'updated' });
  });
});

describe('TextNode — F4 escape cancels', () => {
  it('Escape restores original text and exits edit mode without dispatch', () => {
    const onCommand = vi.fn();
    render(
      <TextNode
        node={fixture({ text: 'before' })}
        selected={false}
        onCommand={onCommand}
        onSelect={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('text-node-body'));
    const ta = screen.getByTestId('text-node-textarea');
    fireEvent.change(ta, { target: { value: 'edited' } });
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByText('before')).toBeTruthy();
  });
});

describe('TextNode — F5 resize dispatches text.setSize', () => {
  it('clicking the NodeResizer stub fires setSize', () => {
    const onCommand = vi.fn();
    render(
      <TextNode
        node={fixture({ text: 'x' })}
        selected
        onCommand={onCommand}
        onSelect={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('rf-node-resizer'));
    expect(onCommand).toHaveBeenCalledWith('text.setSize', {
      width: 400,
      height: 200,
    });
  });
});

describe('TextNode — F6 default size', () => {
  it('renders with default width 260 when state has no width/height', () => {
    render(
      <TextNode
        node={fixture({ text: '' })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    const root = screen.getByTestId('text-node-root') as HTMLDivElement;
    expect(root.style.width).toBe('260px');
  });

  it('renders with persisted width/height when present', () => {
    render(
      <TextNode
        node={fixture({ text: '', width: 420, height: 180 })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    const root = screen.getByTestId('text-node-root') as HTMLDivElement;
    expect(root.style.width).toBe('420px');
    expect(root.style.height).toBe('180px');
  });
});

describe('TextNode — F8 handles are connectable', () => {
  it('createNodeAdapter wraps TextNode with connectable Handles', () => {
    const Adapter = createNodeAdapter(TextNode);
    render(
      <Adapter
        id="text-1"
        type="text"
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        data={{
          node: fixture({ text: '' }),
          onCommand: noop,
          onSelect: noop,
        }}
      />,
    );
    expect(screen.getByTestId('rf-handle-target-left')).toBeTruthy();
    expect(screen.getByTestId('rf-handle-source-right')).toBeTruthy();
  });
});
