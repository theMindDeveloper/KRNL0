import { describe, it, expect } from 'vitest';
import { applyCommand } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Node } from '../../../src/shared/types/node';
import type { TextState } from '../../../src/renderer/components/nodes/TextNode/types';

function makeTextNode(content: string, fontSize = 18): Node {
  return {
    id: 'text-1',
    kind: 'text',
    position: { x: 0, y: 0 },
    isMother: false,
    state: { content, fontSize } as TextState,
    config: { placeholder: 'Start writing…' },
  };
}

describe('TextNode commands (Decision #14)', () => {
  describe('text.setContent', () => {
    it('updates content field', () => {
      const node = makeTextNode('hello');
      const next = applyCommand(node, 'text.setContent', { content: 'world' }) as TextState;
      expect(next.content).toBe('world');
    });

    it('sets content to empty string', () => {
      const node = makeTextNode('hello');
      const next = applyCommand(node, 'text.setContent', { content: '' }) as TextState;
      expect(next.content).toBe('');
    });

    it('preserves fontSize when updating content', () => {
      const node = makeTextNode('hello', 24);
      const next = applyCommand(node, 'text.setContent', { content: 'new content' }) as TextState;
      expect(next.fontSize).toBe(24);
    });

    it('updates to a long multi-line content string', () => {
      const node = makeTextNode('');
      const multi = 'Line one\nLine two\nLine three';
      const next = applyCommand(node, 'text.setContent', { content: multi }) as TextState;
      expect(next.content).toBe(multi);
    });
  });

  describe('text.setFontSize', () => {
    it('updates fontSize field', () => {
      const node = makeTextNode('hello', 18);
      const next = applyCommand(node, 'text.setFontSize', { size: 32 }) as TextState;
      expect(next.fontSize).toBe(32);
    });

    it('preserves content when updating fontSize', () => {
      const node = makeTextNode('my content', 18);
      const next = applyCommand(node, 'text.setFontSize', { size: 14 }) as TextState;
      expect(next.content).toBe('my content');
    });

    it('allows very small font size (edge: 1)', () => {
      const node = makeTextNode('x', 18);
      const next = applyCommand(node, 'text.setFontSize', { size: 1 }) as TextState;
      expect(next.fontSize).toBe(1);
    });

    it('allows very large font size (edge: 200)', () => {
      const node = makeTextNode('x', 18);
      const next = applyCommand(node, 'text.setFontSize', { size: 200 }) as TextState;
      expect(next.fontSize).toBe(200);
    });
  });

  describe('unknown text command', () => {
    it('returns null for an unrecognized text command', () => {
      const node = makeTextNode('hello');
      const result = applyCommand(node, 'text.unknownOp', {});
      expect(result).toBeNull();
    });
  });
});
