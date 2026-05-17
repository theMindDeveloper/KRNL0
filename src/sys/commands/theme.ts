// sys theme show — read-only from settings.theme in board.json (Decision 29 §7).
// Headless-capable. Note: the spec §1 lists theme show under renderer-required
// in one place but §7 and the "pure read commands work file-only" rule
// both say headless is fine — decision: headless-capable (read, no mutation).

import { loadBoardFrom } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';

export interface ThemeCtx {
  boardPath: string;
}

export async function themeShow(ctx: ThemeCtx, json = false): Promise<SysResult> {
  const raw = loadBoardFrom(ctx.boardPath);
  const board = (typeof raw === 'object' && raw !== null) ? raw as Record<string, unknown> : {};
  const theme = (typeof board['theme'] === 'string') ? board['theme'] : 'unknown';

  if (json) {
    const payload = { theme };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }
  return { ok: true, message: `theme: ${theme}`, data: { theme } };
}
