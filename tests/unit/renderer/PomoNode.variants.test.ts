// @vitest-environment jsdom
/**
 * PomoNode variant tests — Decision #15.
 * Tests that config.variant routes rendering to the correct sub-component.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

import React from 'react';
import { VariantVapor } from '../../../src/renderer/components/nodes/PomoNode/VariantVapor';
import { VariantRing } from '../../../src/renderer/components/nodes/PomoNode/VariantRing';
import { VariantAscii } from '../../../src/renderer/components/nodes/PomoNode/VariantAscii';
import { VariantLcd } from '../../../src/renderer/components/nodes/PomoNode/VariantLcd';
import { VariantBlocks } from '../../../src/renderer/components/nodes/PomoNode/VariantBlocks';
import { PomoNode } from '../../../src/renderer/components/nodes/PomoNode';
import { defaultPomoState, defaultPomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { PomoState, PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

// Helper: build a minimal PomoNode Node with a given variant config
function makePomoNode(variant?: PomoConfig['variant']): Node<PomoState, PomoConfig> {
  const config: PomoConfig = { ...defaultPomoConfig(), ...(variant ? { variant } : {}) };
  return {
    id: 'pomo-test',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: defaultPomoState(),
    config,
  };
}

const noop = vi.fn();

// Helper props shared by all variants except Lcd (which has a narrower interface)
const baseProps = {
  state: defaultPomoState(),
  remainingPct: 80,
  clockText: '25:00',
  colonAnimation: 'none',
};

describe('PomoNode variants (Decision #15)', () => {
  describe('VariantVapor', () => {
    it('renders with data-testid="pomo-variant-vapor"', () => {
      const { queryByTestId } = render(React.createElement(VariantVapor, baseProps));
      expect(queryByTestId('pomo-variant-vapor')).not.toBeNull();
    });

    it('does NOT render ring, ascii, lcd, or blocks testids', () => {
      const { queryByTestId } = render(React.createElement(VariantVapor, baseProps));
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('renders clock text from clockText prop', () => {
      const { container } = render(React.createElement(VariantVapor, { ...baseProps, clockText: '17:34' }));
      expect(container.textContent).toContain('17');
      expect(container.textContent).toContain('34');
    });
  });

  describe('VariantRing', () => {
    it('renders with data-testid="pomo-variant-ring"', () => {
      const { queryByTestId } = render(React.createElement(VariantRing, baseProps));
      expect(queryByTestId('pomo-variant-ring')).not.toBeNull();
    });

    it('does NOT render vapor, ascii, lcd, or blocks testids', () => {
      const { queryByTestId } = render(React.createElement(VariantRing, baseProps));
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('renders clock text from clockText prop', () => {
      const { container } = render(React.createElement(VariantRing, { ...baseProps, clockText: '10:00' }));
      expect(container.textContent).toContain('10');
    });
  });

  describe('VariantAscii', () => {
    it('renders with data-testid="pomo-variant-ascii"', () => {
      const { queryByTestId } = render(React.createElement(VariantAscii, baseProps));
      expect(queryByTestId('pomo-variant-ascii')).not.toBeNull();
    });

    it('does NOT render vapor, ring, lcd, or blocks testids', () => {
      const { queryByTestId } = render(React.createElement(VariantAscii, baseProps));
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('renders a progress bar placeholder text', () => {
      const { container } = render(React.createElement(VariantAscii, { ...baseProps, remainingPct: 50 }));
      // ASCII bar uses '█' and '░' characters
      expect(container.textContent).toMatch(/[█░]/);
    });
  });

  describe('VariantLcd', () => {
    it('renders with data-testid="pomo-variant-lcd"', () => {
      const lcdProps = { state: defaultPomoState(), clockText: '25:00', colonAnimation: 'none' };
      const { queryByTestId } = render(React.createElement(VariantLcd, lcdProps));
      expect(queryByTestId('pomo-variant-lcd')).not.toBeNull();
    });

    it('does NOT render vapor, ring, ascii, or blocks testids', () => {
      const lcdProps = { state: defaultPomoState(), clockText: '25:00', colonAnimation: 'none' };
      const { queryByTestId } = render(React.createElement(VariantLcd, lcdProps));
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('renders clock text', () => {
      const lcdProps = { state: defaultPomoState(), clockText: '20:00', colonAnimation: 'none' };
      const { container } = render(React.createElement(VariantLcd, lcdProps));
      expect(container.textContent).toContain('20');
    });
  });

  describe('VariantBlocks', () => {
    it('renders with data-testid="pomo-variant-blocks"', () => {
      const { queryByTestId } = render(React.createElement(VariantBlocks, baseProps));
      expect(queryByTestId('pomo-variant-blocks')).not.toBeNull();
    });

    it('does NOT render vapor, ring, ascii, or lcd testids', () => {
      const { queryByTestId } = render(React.createElement(VariantBlocks, baseProps));
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
    });

    it('renders 25 block spans (TOTAL_BLOCKS = 25)', () => {
      const { container } = render(React.createElement(VariantBlocks, baseProps));
      // The block grid contains individual spans, one per block
      const grid = container.querySelector('[data-testid="pomo-variant-blocks"] div div');
      // Count children inside the grid div (the first div child of the root div)
      const blockGrid = container.querySelectorAll('[style*="grid"]')[0];
      expect(blockGrid?.children.length).toBe(25);
    });
  });

  // ── PomoNode dispatch tests — verifies index.tsx branching via real render ──────
  describe('PomoNode config.variant dispatch (index.tsx branching)', () => {
    it('variant "vapor" renders pomo-variant-vapor and no other variant', () => {
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode('vapor'), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-vapor')).not.toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('variant "ring" renders pomo-variant-ring and no other variant', () => {
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode('ring'), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-ring')).not.toBeNull();
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('variant "ascii" renders pomo-variant-ascii and no other variant', () => {
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode('ascii'), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-ascii')).not.toBeNull();
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('variant "lcd" renders pomo-variant-lcd and no other variant', () => {
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode('lcd'), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-lcd')).not.toBeNull();
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-blocks')).toBeNull();
    });

    it('variant "blocks" renders pomo-variant-blocks and no other variant', () => {
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode('blocks'), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-blocks')).not.toBeNull();
      expect(queryByTestId('pomo-variant-vapor')).toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
      expect(queryByTestId('pomo-variant-ascii')).toBeNull();
      expect(queryByTestId('pomo-variant-lcd')).toBeNull();
    });

    it('no variant in config (undefined) falls back to "vapor" (the ?? default)', () => {
      // makePomoNode with no argument leaves variant undefined → defaultPomoConfig() has no variant
      const { queryByTestId } = render(
        React.createElement(PomoNode, { node: makePomoNode(), selected: false, onCommand: noop, onSelect: noop })
      );
      expect(queryByTestId('pomo-variant-vapor')).not.toBeNull();
      expect(queryByTestId('pomo-variant-ring')).toBeNull();
    });
  });
});
