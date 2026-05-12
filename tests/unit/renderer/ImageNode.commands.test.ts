import { describe, it, expect } from 'vitest';
import {
  imageSetAsset,
  imageSetSize,
  imageSetAlt,
  imageClear,
} from '../../../src/renderer/components/nodes/ImageNode/commands';
import type { ImageState } from '../../../src/renderer/components/nodes/ImageNode/types';

const empty: ImageState = {
  assetId: null,
  naturalWidth: null,
  naturalHeight: null,
  mimeType: null,
  alt: '',
};

describe('ImageNode commands', () => {
  describe('imageSetAsset', () => {
    it('writes assetId + natural dims + mime + alt and clears legacy src', () => {
      const next = imageSetAsset(
        { ...empty, src: 'data:foo' },
        {
          assetId: 'ABCDEFGHJKMNPQRSTVWXYZ0123',
          naturalWidth: 800,
          naturalHeight: 600,
          mimeType: 'image/png',
          alt: 'diagram',
        },
      );
      expect(next.assetId).toBe('ABCDEFGHJKMNPQRSTVWXYZ0123');
      expect(next.naturalWidth).toBe(800);
      expect(next.naturalHeight).toBe(600);
      expect(next.mimeType).toBe('image/png');
      expect(next.alt).toBe('diagram');
      expect(next.src).toBeNull();
    });
  });

  describe('imageSetSize', () => {
    it('rounds width and height', () => {
      const next = imageSetSize(empty, { width: 320.4, height: 240.9 });
      expect(next.width).toBe(320);
      expect(next.height).toBe(241);
    });
  });

  describe('imageSetAlt', () => {
    it('writes alt text', () => {
      const next = imageSetAlt(empty, { alt: 'updated' });
      expect(next.alt).toBe('updated');
    });
  });

  describe('imageClear', () => {
    it('nulls assetId and metadata; preserves alt + size', () => {
      const seeded: ImageState = {
        assetId: 'A',
        naturalWidth: 1,
        naturalHeight: 2,
        mimeType: 'image/png',
        alt: 'keep me',
        width: 100,
        height: 50,
      };
      const next = imageClear(seeded);
      expect(next.assetId).toBeNull();
      expect(next.naturalWidth).toBeNull();
      expect(next.naturalHeight).toBeNull();
      expect(next.mimeType).toBeNull();
      expect(next.alt).toBe('keep me');
      expect(next.width).toBe(100);
      expect(next.height).toBe(50);
    });
  });
});
