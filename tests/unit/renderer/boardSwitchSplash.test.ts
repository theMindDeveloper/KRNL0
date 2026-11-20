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
  it('the launch dialogs do not open after a switch', () => {
    expect(read('renderer/App.tsx')).toContain('if (!window.__krnlBoardSwitch) window.setTimeout(runLaunchFlow, 500)');
  });
});
