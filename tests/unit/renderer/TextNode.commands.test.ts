import { describe, it, expect } from 'vitest';
import {
  textSetText,
  textSetSize,
} from '../../../src/renderer/components/nodes/TextNode/commands';

describe('TextNode commands', () => {
  describe('textSetText (F3)', () => {
    it('returns a new state with the given text', () => {
      const next = textSetText({ text: 'old' }, { text: 'new' });
      expect(next.text).toBe('new');
    });

    it('preserves width/height', () => {
      const next = textSetText(
        { text: 'a', width: 300, height: 150 },
        { text: 'b' },
      );
      expect(next).toEqual({ text: 'b', width: 300, height: 150 });
    });

    it('does not mutate the input', () => {
      const src = { text: 'a' };
      textSetText(src, { text: 'b' });
      expect(src.text).toBe('a');
    });
  });

  describe('textSetSize (F5)', () => {
    it('writes rounded width/height', () => {
      const next = textSetSize({ text: '' }, { width: 412.7, height: 99.4 });
      expect(next.width).toBe(413);
      expect(next.height).toBe(99);
    });

    it('preserves text', () => {
      const next = textSetSize({ text: 'hi' }, { width: 200, height: 100 });
      expect(next.text).toBe('hi');
    });
  });
});
