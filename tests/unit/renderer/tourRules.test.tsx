// @vitest-environment jsdom
/**
 * Tour engine rules (the bugs that must never come back):
 *  1. Settings opens on the page that holds what a step talks about.
 *  2. When a step names an item, the spotlight finds that item (or its row).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { findTarget } from '../../../src/renderer/components/Tour/TourHost';
import { settingsSectionFor } from '../../../src/renderer/components/TopBar/SettingsModal';

afterEach(() => { document.body.innerHTML = ''; });

describe('rule 1 — Settings opens on the right page', () => {
  it.each([
    ['[data-testid="settings-sounds"]', 'sounds'],
    ['[data-testid="settings-finished"]', 'finished'],
    ['[data-testid="settings-pocket-look-dial"]', 'timer'],
    ['[data-testid="settings-updates-check"]', 'updates'],
    ['[role="radiogroup"][aria-label="Easy or Advanced"]', 'general'],
    [undefined, 'general'],
  ] as const)('%s → %s', (sel, section) => {
    expect(settingsSectionFor(sel)).toBe(section);
  });
});

describe('rule 2 — the named item, not the first match', () => {
  it('picks the card whose text names the item', () => {
    document.body.innerHTML = `
      <div data-testid="task-node-root">Groceries</div>
      <div data-testid="task-node-root">Demo · tick me</div>`;
    const t = findTarget('[data-testid="task-node-root"]', null, 'Demo · tick me');
    expect(t?.el.textContent).toBe('Demo · tick me');
  });
  it('finds a button by the row it sits in', () => {
    document.body.innerHTML = `
      <div class="row"><span>Read chapter A</span><button data-testid="todo-plan-1">PLAN</button></div>
      <div class="row"><span>Demo · plan me</span><button data-testid="todo-plan-2">PLAN</button></div>`;
    const t = findTarget('[data-testid^="todo-plan-"]', null, 'Demo · plan me');
    expect(t?.el.getAttribute('data-testid')).toBe('todo-plan-2');
  });
  it('falls back to every match when nothing has the name', () => {
    document.body.innerHTML = `<div data-testid="x">A</div>`;
    expect(findTarget('[data-testid="x"]', null, 'nope')?.el.textContent).toBe('A');
  });
});
