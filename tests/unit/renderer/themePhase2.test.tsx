// @vitest-environment jsdom
/**
 * themePhase2.test.tsx — ADR 0009 phase 2.
 * F6 the Clock keeps the same features in every frame style.
 * F7 new Pomo faces (vu, outline) render the same detail as Blocks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { ClockBezel } from '../../../src/renderer/components/nodes/ClockNode/ClockBezel';
import { Vu } from '../../../src/renderer/components/nodes/PomoNode/variants/Vu';
import { Outline } from '../../../src/renderer/components/nodes/PomoNode/variants/Outline';
import { TIMER_FACES } from '../../../src/renderer/components/nodes/PomoNode/types';
import { setDockStyle } from '../../../src/renderer/components/ChassisLayer/useDockStyle';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { MANIFESTS, CLASSIC_CLOCK } from '../../../src/renderer/themes/manifests';
import { FRAME_STYLE_IDS } from '../../../src/shared/frameStyles';
import type { ClockState, ClockConfig } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { Node } from '../../../src/shared/types/node';

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const clockNode: Node<ClockState, ClockConfig> = {
  id: 'mother-clock',
  kind: 'clock',
  position: { x: 0, y: 0 },
  isMother: true,
  state: { linkedTodoId: null, viewWindow: 0, selectedDate: today },
  config: {},
};

function renderClock() {
  useBoardStore.setState({
    board: { version: 1, schemaVersion: 1, savedAt: `${today}T08:00:00.000Z`, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [clockNode as Node], edges: [] },
  });
  return render(React.createElement(ClockNode, { node: clockNode, onCommand: () => undefined, slotIndex: 6, slotTotal: 6 }));
}

/** Feature signature of the dial: everything a style must never drop. */
function dialFeatures(container: HTMLElement) {
  const svg = container.querySelector('svg[viewBox="0 0 240 240"]')!;
  const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
  return {
    numerals: texts.filter((t) => /^(1[0-2]|[1-9])$/.test(t)).length,
    readout: texts.some((t) => /^\d\d:\d\d$/.test(t)),
    ticks: svg.querySelectorAll('line').length,
  };
}

afterEach(() => {
  cleanup();
  setDockStyle('classic');
  useBoardStore.setState({ board: null });
});

describe('F6 — Clock features are identical in every frame style', () => {
  it('every manifest declares a clock skin', () => {
    for (const id of FRAME_STYLE_IDS) expect(MANIFESTS[id].components.clock).toBeDefined();
  });

  it('Classic draws the original dial: no bezel, line hands, bare readout', () => {
    expect(MANIFESTS.classic.components.clock).toEqual(CLASSIC_CLOCK);
    const { container } = renderClock();
    expect(container.querySelector('[data-testid="clock-bezel"]')).toBeNull();
    expect(container.querySelector('[data-testid="clock-readout-window"]')).toBeNull();
  });

  it('Pro adds a bezel and readout window but keeps every feature', () => {
    const classic = dialFeatures(renderClock().container);
    cleanup();
    setDockStyle('pro');
    const { container } = renderClock();
    expect(container.querySelector('[data-testid="clock-bezel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="clock-readout-window"]')).not.toBeNull();
    const pro = dialFeatures(container);
    expect(pro.numerals).toBe(12);
    expect(pro.readout).toBe(true);
    expect(pro).toEqual({ ...classic, ticks: pro.ticks });
    expect(pro.ticks).toBeGreaterThanOrEqual(classic.ticks);
  });

  it.each(['ring', 'metal', 'brass', 'line', 'pixel'] as const)('bezel "%s" renders', (kind) => {
    const { container } = render(
      React.createElement('svg', null, React.createElement(ClockBezel, { kind, outerR: 110 })),
    );
    expect(container.querySelector('[data-testid="clock-bezel"]')).not.toBeNull();
  });

  it('bezel "none" renders nothing', () => {
    const { container } = render(React.createElement('svg', null, React.createElement(ClockBezel, { kind: 'none', outerR: 110 })));
    expect(container.querySelector('[data-testid="clock-bezel"]')).toBeNull();
  });
});

describe('F7 — new Pomo faces', () => {
  it('TIMER_FACES lists the new faces next to the original four', () => {
    expect(TIMER_FACES).toEqual(['ascii', 'lcd', 'blocks', 'vapor', 'vu', 'outline']);
  });

  it.each([['vu', Vu], ['outline', Outline]] as const)('%s renders 25 minute bars and the readout', (name, Face) => {
    const { container, getByText } = render(
      React.createElement(Face, { m: '13', s: '48', elapsedPct: 48, remainingPct: 52, running: true }),
    );
    const bars = container.querySelector(`[data-testid="pomo-face-${name}"]`)!;
    const grid = name === 'vu' ? bars : bars.firstElementChild!;
    expect(grid.children).toHaveLength(25);
    expect(getByText(/min 13 \/ 25/i)).toBeTruthy();
  });
});

describe('F7 — "auto" hands the face back to the frame style', () => {
  it('pomoSetFace({face:"auto"}) clears the saved face', async () => {
    const { pomoSetFace } = await import('../../../src/renderer/components/nodes/PomoNode/commands');
    const next = pomoSetFace({ sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4, face: 'blocks' }, { face: 'auto' });
    expect(next.face).toBeUndefined();
    expect(next.sessionMin).toBe(25);
  });
});
