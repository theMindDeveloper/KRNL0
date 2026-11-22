// @vitest-environment jsdom
/**
 * Decision 61 — the hours are sized by CSS from their box (so a resize redraws
 * them in the same frame and can never leave a gap), and what is carried from
 * outside is a package that packs over the Calendar and unpacks on the drop.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { endCarry, moveCarry, startCarry } from '../DropGhost';
import type { CalendarState, CalendarConfig } from '../types';

const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };
const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 2 };
const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

describe('the hours are sized by CSS (Decision 61)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], layoutMode: 'canvas' } });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useBoardStore.setState({ board: null }); });

  it('the hours box defines one hour from its own height, and every row uses it', () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const body = document.querySelector('[data-testid="calendar-grid-body"]') as HTMLElement;
    expect(body.getAttribute('data-css-rows')).toBe('true');
    expect(body.getAttribute('style')).toContain('--rh: calc(100cqh / 24 * 1)');
    expect(body.getAttribute('style')).toContain('container-type: size');
    const cell = document.querySelector('[data-testid="week-cell-2026-05-14-10"]') as HTMLElement;
    expect(cell.getAttribute('style')).toContain('var(--rh)');
  });
});

describe('the package (Decision 61)', () => {
  afterEach(() => { endCarry(); });
  const box = () => document.querySelector('[data-testid="carry-box"]') as HTMLElement;

  it('is a parcel, shown while carried', async () => {
    startCarry(null, 'var(--acid)', 'always');
    moveCarry(200, 200, false);
    await wait();
    expect(box().querySelector('svg.krnl-pkg')).toBeTruthy();
    expect(box().classList.contains('is-shown')).toBe(true);
  });

  it('let go on the Calendar: it unpacks; let go elsewhere: it just goes', async () => {
    startCarry(null, 'var(--acid)', 'always');
    moveCarry(200, 200, true);
    await wait();
    endCarry({ unpack: true });
    expect(box().classList.contains('is-unpacking')).toBe(true);
    expect(box().classList.contains('is-shown')).toBe(false);
    startCarry(null, 'var(--acid)', 'always');
    expect(box().classList.contains('is-unpacking')).toBe(false);
    moveCarry(200, 200, false);
    await wait();
    endCarry();
    expect(box().classList.contains('is-unpacking')).toBe(false);
  });

  it('a canvas card only becomes a package over the Calendar', async () => {
    startCarry(null, 'var(--acid)', 'onCalendar');
    moveCarry(200, 200, false);
    await wait();
    expect(box().classList.contains('is-shown')).toBe(false);
    moveCarry(220, 200, true);
    await wait();
    expect(box().classList.contains('is-shown')).toBe(true);
  });
});
