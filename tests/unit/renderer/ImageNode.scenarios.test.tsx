// @vitest-environment jsdom
/**
 * ImageNode Gherkin scenario tests — derived from docs/06-requirements/image-node.md
 *
 * F3 (krnl-asset:// src), F3b (placeholder), F5 (resize), F7 (alt edit),
 * F10 (connectable handles), F11 (broken asset gracefully).
 *
 * F1/F2 (drag-drop) are covered by integration tests on CanvasFlow.
 * F9 (sys image add) is covered in tests/unit/sys/commands.text-image.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import { ImageNode } from '../../../src/renderer/components/nodes/ImageNode';
import { createNodeAdapter } from '../../../src/renderer/components/Canvas/rfAdapters';
import type { Node } from '../../../src/shared/types/node';
import type {
  ImageState,
  ImageConfig,
} from '../../../src/renderer/components/nodes/ImageNode/types';

afterEach(() => cleanup());

function fixture(
  state: Partial<ImageState> = {},
): Node<ImageState, ImageConfig> {
  return {
    id: 'image-1',
    kind: 'image',
    position: { x: 0, y: 0 },
    isMother: false,
    state: {
      assetId: null,
      naturalWidth: null,
      naturalHeight: null,
      mimeType: null,
      alt: '',
      ...state,
    },
    config: {},
  };
}

const noop = () => undefined;

describe('ImageNode — F3 renders krnl-asset:// when assetId present', () => {
  it('emits <img> with the asset URL', () => {
    render(
      <ImageNode
        node={fixture({
          assetId: 'ABCDEFGHJKMNPQRSTVWXYZ0123',
          naturalWidth: 800,
          naturalHeight: 600,
          mimeType: 'image/png',
          alt: 'diagram',
        })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    const img = screen.getByTestId('image-node-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(
      'krnl-asset://ABCDEFGHJKMNPQRSTVWXYZ0123',
    );
    expect(img.getAttribute('alt')).toBe('diagram');
  });
});

describe('ImageNode — F3b placeholder when assetId is null', () => {
  it('renders placeholder, no <img>', () => {
    render(
      <ImageNode
        node={fixture({ assetId: null })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    expect(screen.queryByTestId('image-node-img')).toBeNull();
    expect(screen.getByTestId('image-node-placeholder')).toBeTruthy();
  });
});

describe('ImageNode — F5 resize dispatches image.setSize', () => {
  it('clicking the resizer stub fires setSize', () => {
    const onCommand = vi.fn();
    render(
      <ImageNode
        node={fixture({
          assetId: 'ABCDEFGHJKMNPQRSTVWXYZ0123',
          naturalWidth: 800,
          naturalHeight: 600,
        })}
        selected
        onCommand={onCommand}
        onSelect={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('rf-node-resizer'));
    expect(onCommand).toHaveBeenCalledWith('image.setSize', {
      width: 400,
      height: 200,
    });
  });
});

// F7 (alt-text caption edit) was dropped per visual review — caption row
// removed entirely from the node body. Alt text is still stored on state
// for accessibility (img.alt) but is no longer user-editable inline.
// `imageSetAlt` command remains and is covered by the pure-command tests.

describe('ImageNode — F10 handles are connectable', () => {
  it('createNodeAdapter wraps ImageNode with connectable handles', () => {
    const Adapter = createNodeAdapter(ImageNode);
    render(
      <Adapter
        id="image-1"
        type="image"
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        data={{
          node: fixture({ assetId: null }),
          onCommand: noop,
          onSelect: noop,
        }}
      />,
    );
    expect(screen.getByTestId('rf-handle-target-left')).toBeTruthy();
    expect(screen.getByTestId('rf-handle-source-right')).toBeTruthy();
  });
});

describe('ImageNode — F11 broken asset falls back to placeholder', () => {
  it('img onError swaps the frame to the placeholder visuals', () => {
    render(
      <ImageNode
        node={fixture({
          assetId: 'MISSINGASSETID000000000000',
        })}
        selected={false}
        onCommand={noop}
        onSelect={noop}
      />,
    );
    const img = screen.getByTestId('image-node-img');
    fireEvent.error(img);
    expect(screen.queryByTestId('image-node-img')).toBeNull();
    expect(screen.getByTestId('image-node-placeholder')).toBeTruthy();
  });
});
