/**
 * boards.md F9: a switch to another board is not a start. The window reloads,
 * but the start-up screen and the launch dialogs stay away. This reads the
 * three places that carry the mark from the main process to the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string): string => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
const MARK = 'krnl0-board-switch';

describe('F9: switching boards skips the start-up screen', () => {
  it('the main process marks the reload as a board switch', () => {
    const main = read('main/ipc/handlers.ts');
    const fn = main.slice(main.indexOf('export function switchBoardAndReload'));
    expect(fn.indexOf(MARK)).toBeGreaterThan(0);
    // The reload runs only after the mark is written (or could not be).
    expect(fn.indexOf(MARK)).toBeLessThan(fn.indexOf('.then(reload, reload)'));
  });
  it('the page removes the start-up screen before it paints, and clears the mark', () => {
    const page = read('renderer/index.html');
    expect(page).toContain(`sessionStorage.getItem('${MARK}')`);
    expect(page).toContain(`sessionStorage.removeItem('${MARK}')`);
    expect(page).toContain('if (boardSwitch || ');
  });
  it('the AI does not say hello after a switch', () => {
    const orb = read('renderer/components/Orb/index.tsx');
    const at = orb.indexOf('greetedRef.current = true;');
    expect(orb.slice(at, at + 220)).toContain('if (window.__krnlBoardSwitch) return;');
  });
  it('the launch dialogs do not open after a switch', () => {
    expect(read('renderer/App.tsx')).toContain('if (!window.__krnlBoardSwitch) window.setTimeout(runLaunchFlow, 500)');
  });
});

describe('a plan card keeps what was changed when you click elsewhere', () => {
  it('the backdrop saves a touched card; Escape and the close button still cancel', () => {
    const card = read('renderer/components/ui/WhenPopover.tsx');
    expect(card).toContain('if (touched.current && !onChange) apply(); else onClose();');
    expect(card).toContain("if (e.key === 'Escape') { if (pickerOpen()) return; e.stopPropagation(); onClose(); }");
    expect(card).toContain('<CardClose onClick={onClose} />');
  });
});

describe('Decision 50 and the narrow-window header', () => {
  it('only task cards draw connector dots', () => {
    expect(read('renderer/components/Canvas/rfAdapters.tsx')).toContain("const showHandles = node.kind === 'todo.task';");
  });
  it('a narrow header never shortens the name, and gives way in order', () => {
    const css = read('renderer/styles/window-frame.css');
    expect(css).toContain('.kw-head, .kw-range { container-type: inline-size; }');
    expect(css).toContain('.kw-head:has(.kw-views) .kw-ctx { display: none; }');
    expect(css).toContain('.kw-title { flex-shrink: 0; overflow: visible; }');
  });
  it('the tour step "onto today" asks the Calendar for its hours', () => {
    expect(read('renderer/components/Tour/TourHost.tsx')).toContain("layout('grid');");
    expect(read('renderer/components/Tour/tours.ts')).not.toContain('Pomo mode"]');
  });
});
