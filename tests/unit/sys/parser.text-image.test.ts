import { describe, it, expect } from 'vitest';
import { SysParser } from '../../../src/sys/parser';

describe('SysParser — text commands', () => {
  it('parses text add with --text and --at', () => {
    expect(
      SysParser.parse(['text', 'add', '--text', 'hello', '--at', '100,200']),
    ).toEqual({
      kind: 'text',
      sub: 'add',
      text: 'hello',
      at: { x: 100, y: 200 },
    });
  });

  it('parses text add bare (no text, no position)', () => {
    expect(SysParser.parse(['text', 'add'])).toEqual({
      kind: 'text',
      sub: 'add',
      text: undefined,
      at: undefined,
    });
  });

  it('parses text set <id> --text "..."', () => {
    expect(
      SysParser.parse(['text', 'set', 'node-1', '--text', 'rewritten']),
    ).toEqual({
      kind: 'text',
      sub: 'set',
      id: 'node-1',
      text: 'rewritten',
    });
  });

  it('parses text resize with numeric flags', () => {
    expect(
      SysParser.parse(['text', 'resize', 'node-1', '--w', '400', '--h', '200']),
    ).toEqual({
      kind: 'text',
      sub: 'resize',
      id: 'node-1',
      w: 400,
      h: 200,
    });
  });
});

describe('SysParser — image commands', () => {
  it('parses image add <path> with --at', () => {
    expect(
      SysParser.parse(['image', 'add', 'C:/tmp/sample.png', '--at', '50,60']),
    ).toEqual({
      kind: 'image',
      sub: 'add',
      path: 'C:/tmp/sample.png',
      at: { x: 50, y: 60 },
    });
  });

  it('parses image replace <id> <path>', () => {
    expect(
      SysParser.parse(['image', 'replace', 'node-1', '/abs/path/img.svg']),
    ).toEqual({
      kind: 'image',
      sub: 'replace',
      id: 'node-1',
      path: '/abs/path/img.svg',
    });
  });

  it('parses image resize with --w/--h', () => {
    expect(
      SysParser.parse(['image', 'resize', 'node-1', '--w', '320', '--h', '240']),
    ).toEqual({
      kind: 'image',
      sub: 'resize',
      id: 'node-1',
      w: 320,
      h: 240,
    });
  });

  it('parses image clear <id>', () => {
    expect(SysParser.parse(['image', 'clear', 'node-1'])).toEqual({
      kind: 'image',
      sub: 'clear',
      id: 'node-1',
    });
  });
});
