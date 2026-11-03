// @vitest-environment jsdom
/**
 * themeEngine.test.tsx — ADR 0009 / docs/06-requirements/theme-engine.md
 * F1 manifests on the registry · F2 tokens on <html> · F3 Classic unchanged
 * F4 Pro style · F7 default face rule · F9 panel-toggle slot.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DOCK_REGISTRY, DOCK_STYLES, isDarkOnly } from '../../../src/renderer/components/ChassisLayer/dockRegistry';
import { FRAME_STYLES, FRAME_STYLE_IDS, isFrameStyleId } from '../../../src/shared/frameStyles';
import { MANIFESTS, CLASSIC_K } from '../../../src/renderer/themes/manifests';
import { applyFrameTheme, resetAppliedTokens, tokensFor, xtermFor } from '../../../src/renderer/themes/applyFrameTheme';

const root = () => document.documentElement;

beforeEach(() => {
  root().removeAttribute('style');
  root().removeAttribute('data-dock');
  resetAppliedTokens();
});

describe('F1 — every frame style has a manifest on the registry', () => {
  it('registry ids match the shared catalogue exactly', () => {
    expect([...DOCK_STYLES].sort()).toEqual([...FRAME_STYLE_IDS].sort());
  });

  it('every registry entry carries its manifest', () => {
    for (const id of DOCK_STYLES) {
      expect(DOCK_REGISTRY[id].manifest).toBe(MANIFESTS[id]);
    }
  });

  it('every manifest has tokens for each mode the style supports', () => {
    for (const f of FRAME_STYLES) {
      for (const mode of f.modes) {
        expect(MANIFESTS[f.id].tokens[mode], `${f.id}/${mode}`).toBeDefined();
      }
    }
  });

  it('isFrameStyleId accepts known ids and rejects others', () => {
    expect(isFrameStyleId('pro')).toBe(true);
    expect(isFrameStyleId('nope')).toBe(false);
    expect(isFrameStyleId(undefined)).toBe(false);
  });
});

describe('F2 — tokens are written on <html>', () => {
  it('applying Pro sets its tokens and data-dock', () => {
    applyFrameTheme('pro', 'dark');
    expect(root().style.getPropertyValue('--paper')).toBe('#0b0b0b');
    expect(root().style.getPropertyValue('--node-bg')).toBe('#181818');
    expect(root().getAttribute('data-dock')).toBe('pro');
  });

  it('switching back to Classic removes the previous style\'s tokens', () => {
    applyFrameTheme('pro', 'dark');
    applyFrameTheme('classic', 'dark');
    expect(root().style.getPropertyValue('--paper')).toBe('');
    expect(root().hasAttribute('data-dock')).toBe(false);
  });

  it('a dark-only style falls back to its dark tokens in light mode', () => {
    expect(tokensFor('submarine', 'light')).toBe(MANIFESTS.submarine.tokens.dark);
  });

  it('Pro has its own light tokens (light mode no longer swaps to another style)', () => {
    expect(tokensFor('pro', 'light')).toBe(MANIFESTS.pro.tokens.light);
    expect(tokensFor('pro', 'light')!['--node-bg']).not.toBe(MANIFESTS.pro.tokens.dark!['--node-bg']);
  });
});

describe('F3 — Classic keeps the original look', () => {
  it('Pro is the default style; Classic stays available', async () => {
    const { DEFAULT_DOCK_STYLE, DOCK_STYLES } = await import('../../../src/renderer/components/ChassisLayer/dockRegistry');
    expect(DEFAULT_DOCK_STYLE).toBe('pro');
    expect(DOCK_STYLES).toContain('classic');
  });

  it('Classic only sets --k-* tokens, never the existing palette', () => {
    applyFrameTheme('classic', 'dark');
    for (const key of Object.keys(CLASSIC_K)) expect(key.startsWith('--k-')).toBe(true);
    expect(root().style.getPropertyValue('--paper')).toBe('');
    expect(root().style.getPropertyValue('--k-now').trim()).toBe('#ef4444');
  });

  it('every --k-* fallback in the components equals its Classic value', () => {
    const src = (p: string) => readFileSync(join(__dirname, '../../../src/renderer/components/nodes', p), 'utf-8');
    const files = ['CalendarNode/NowLine.tsx', 'CalendarNode/WeekView.tsx', 'ClockNode/index.tsx', 'TerminalNode/index.tsx', 'MotherFrame/index.tsx'];
    const all = files.map(src).join('\n');
    for (const [key, value] of Object.entries(CLASSIC_K)) {
      expect(all, key).toContain(`var(${key}, ${value})`);
    }
  });

  it('Classic terminal colours equal the previous hard-coded theme', () => {
    expect(xtermFor('classic', 'dark')).toEqual({ background: '#05040a', foreground: '#d4cfc0', cursor: '#c9f158', cursorAccent: '#0e0d0b' });
  });
});

describe('F4 — Pro frame style', () => {
  it('exists, has light and dark, and is chromeless', () => {
    expect(DOCK_REGISTRY.pro.label).toBe('Pro');
    expect(isDarkOnly('pro')).toBe(false);
    expect(DOCK_REGISTRY.pro.Chrome).toBeUndefined();
  });
});

describe('F7 — default Pomo face', () => {
  it('Classic names no default face, so the existing vapor/blocks rule applies', () => {
    expect(MANIFESTS.classic.components.pomo.face).toBeUndefined();
  });

  it('Pro defaults to blocks', () => {
    expect(MANIFESTS.pro.components.pomo.face).toBe('blocks');
  });
});

describe('F9 — panel-toggle slot', () => {
  it('every style, Classic included, puts the toggles in the top bar', () => {
    for (const id of FRAME_STYLE_IDS) expect(MANIFESTS[id].slots.panelToggles, id).toBe('topbar');
  });
});
