/**
 * Sticky notes / shapes, drop-anything classification, dock snapping,
 * analytics page layout, and the CLI verbs for them.
 */
import { describe, it, expect, vi } from 'vitest';
import { textSetLook } from '../../../src/renderer/components/nodes/TextNode/commands';
import { classifyFile, classifyUrl } from '../../../src/renderer/components/Canvas/dropMedia';
import { anchorFor } from '../../../src/renderer/components/Dock';
import { cardPlacement, cardsOfPage, pageOfCard, pageSelector, PAGES } from '../../../src/renderer/components/nodes/AnalyticsNode/guide';
import { strokesHit, strokePath } from '../../../src/renderer/components/Canvas/DrawLayer';
import { SysParser } from '../../../src/sys/parser';
import type { TextState } from '../../../src/renderer/components/nodes/TextNode/types';

describe('sticky notes and shapes', () => {
  const note: TextState = { text: 'idea' };
  it('turns a note into a sticky with a colour and back', () => {
    const sticky = textSetLook(note, { kind: 'sticky', color: '#ffe28a' });
    expect(sticky.look).toEqual({ kind: 'sticky', color: '#ffe28a' });
    expect(textSetLook(sticky, { kind: 'diamond' }).look).toEqual({ kind: 'diamond', color: '#ffe28a' });
    const plain = textSetLook({ text: 'x', look: { kind: 'rect' } }, { kind: 'note' });
    expect(plain.look).toBeUndefined();
  });
  it('ignores unknown shape kinds', () => {
    expect(textSetLook(note, { kind: 'star' as never }).look).toBeUndefined();
  });
  it('parses text add --sticky / --shape', () => {
    expect(SysParser.parse(['text', 'add', '--text', 'hi', '--sticky', '--color', '#ffb3c7'])).toMatchObject({ look: { kind: 'sticky', color: '#ffb3c7' } });
    expect(SysParser.parse(['text', 'add', '--shape', 'ellipse'])).toMatchObject({ look: { kind: 'ellipse' } });
  });
});

describe('drop anything', () => {
  it('classifies files by type and extension', () => {
    expect(classifyFile({ name: 'a.png', type: 'image/png' })).toBe('image');
    expect(classifyFile({ name: 'talk.mp4', type: 'video/mp4' })).toBe('video');
    expect(classifyFile({ name: 'song.mp3', type: '' })).toBe('audio');
    expect(classifyFile({ name: 'paper.pdf', type: 'application/pdf' })).toBe('pdf');
    // Windows often gives .mov / .wav an empty or odd MIME — the extension wins.
    expect(classifyFile({ name: 'clip.MOV', type: '' })).toBe('video');
    expect(classifyFile({ name: 'take.wav', type: 'audio/x-wav' })).toBe('audio');
    // Anything else becomes a file card.
    expect(classifyFile({ name: 'notes.docx', type: 'application/msword' })).toBe('file');
  });
  it('classifies links: players embed, the rest become link cards', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=abc')).toEqual({ media: 'embed', url: 'https://www.youtube.com/watch?v=abc' });
    expect(classifyUrl('https://youtu.be/abc')?.media).toBe('embed');
    expect(classifyUrl('https://example.com/clip.webm')?.media).toBe('embed');
    expect(classifyUrl('https://example.com/article')?.media).toBe('link');
    expect(classifyUrl('# comment\nhttps://vimeo.com/1')?.media).toBe('embed');
    expect(classifyUrl('javascript:alert(1)')).toBeNull();
    expect(classifyUrl('not a url')).toBeNull();
  });
  it('parses media add / list', () => {
    expect(SysParser.parse(['media', 'add', 'https://youtu.be/x', '--at', '10,20'])).toMatchObject({ kind: 'media', sub: 'add', url: 'https://youtu.be/x', at: { x: 10, y: 20 } });
    expect(SysParser.parse(['media', 'list', '--json'])).toMatchObject({ kind: 'media', sub: 'list', json: true });
  });
});

describe('dock snapping', () => {
  it('snaps to top / middle / bottom of the left edge or bottom centre', () => {
    expect(anchorFor(20, 50, 1000, 800)).toBe('top');
    expect(anchorFor(20, 400, 1000, 800)).toBe('middle');
    expect(anchorFor(20, 700, 1000, 800)).toBe('bottom');
    expect(anchorFor(500, 700, 1000, 800)).toBe('bottom-center');
  });
});

describe('analytics pages', () => {
  it('every page has a jump target and cards stay on their own page rows', () => {
    for (const p of PAGES) expect(pageSelector(p.id)).not.toBe('');
    expect(pageOfCard('calendar.heatmap')).toBe('year');
    expect(cardsOfPage('estimates')).toEqual(['estimates.kpis', 'estimates.mix', 'estimates.perTask', 'estimates.daily']);
    expect(cardPlacement('summary')).toEqual({ gridRow: '1 / span 2', gridColumn: '1 / span 6' });
    expect(cardPlacement('overview.dow')).toEqual({ gridRow: '8 / span 1', gridColumn: '1 / span 3' });
    expect(cardPlacement('overview.kpis')).toEqual({ display: 'none' });
  });
});

describe('pen arrow tool', () => {
  it('draws a closed arrow path and the eraser hits along the shaft', () => {
    const pts: Array<[number, number, number]> = [[0, 0, 0.5], [100, 0, 0.5]];
    expect(strokePath(pts, 3, 'arrow')).toMatch(/^M.*Z$/);
    const s = { id: 'a', tool: 'arrow' as const, color: '#fff', size: 3, createdAt: '', points: pts };
    expect(strokesHit([s], 50, 2, 3)).toEqual(['a']);
    expect(strokesHit([s], 50, 30, 3)).toEqual([]);
  });
});

import { canvasWheelItems } from '../../../src/renderer/components/Canvas/canvasWheel';

describe('canvas wheel', () => {
  it('first ring is a few categories; sub-panels hold the rest; shortcuts shown', () => {
    const noop = () => {};
    const pen = vi.fn();
    const items = canvasWheelItems({ task: noop, habit: noop, note: noop, look: noop, image: noop, mediaFile: noop, frame: noop, pen });
    expect(items.map((i) => i.key)).toEqual(['task', 'habit', 'note', 'sticky', 'shapes', 'media', 'frame', 'pen']);
    expect(items.find((i) => i.key === 'shapes')!.children!.map((c) => c.key)).toEqual(['rect', 'ellipse', 'diamond']);
    // Pen opens the one pen wheel (no separate sub-panel design).
    items.find((i) => i.key === 'pen')!.onSelect!();
    expect(pen).toHaveBeenCalled();
    expect(items.find((i) => i.key === 'note')!.shortcut).toBe('N');
  });
});

import { mediaSetAspect } from '../../../src/renderer/components/nodes/MediaNode/commands';

describe('media cards take the content shape', () => {
  it('fits height to the aspect at the current width, ignores junk', () => {
    const v = mediaSetAspect({ media: 'video', src: 'X', title: 'clip', width: 480, height: 300 }, { aspect: 16 / 9 });
    expect(v.aspect).toBeCloseTo(16 / 9);
    expect(v.height).toBe(Math.round((480 - 12) / (16 / 9) + 42));
    const portrait = mediaSetAspect(v, { aspect: 9 / 16 });
    expect(portrait.height).toBeGreaterThan(800);
    expect(mediaSetAspect(v, { aspect: Number.NaN })).toBe(v);
    expect(mediaSetAspect(v, { aspect: 16 / 9 })).toBe(v);
  });
});
