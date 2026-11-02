// sys theme show — read-only from settings.theme in board.json (Decision 29 §7).
// Headless-capable. Note: the spec §1 lists theme show under renderer-required
// in one place but §7 and the "pure read commands work file-only" rule
// both say headless is fine — decision: headless-capable (read, no mutation).
//
// ADR 0009 adds frame styles: `theme frames` lists them (headless, from the
// shared catalogue) and `theme show` reports the active frame when a renderer
// window answered the query.

import { loadBoardFrom } from '../../main/persistence/board';
import { FRAME_STYLES } from '../../shared/frameStyles';
import type { SysResult } from '../SysFacade';

export interface ThemeCtx {
  boardPath: string;
  /** Active frame style, when a renderer window reported it. */
  frame?: string;
  /** light / dark, when a renderer window reported it. */
  theme?: string;
}

export async function themeShow(ctx: ThemeCtx, json = false): Promise<SysResult> {
  const raw = loadBoardFrom(ctx.boardPath);
  const board = (typeof raw === 'object' && raw !== null) ? raw as Record<string, unknown> : {};
  const theme = ctx.theme ?? ((typeof board['theme'] === 'string') ? board['theme'] : 'unknown');
  const frame = ctx.frame ?? 'unknown';

  if (json) {
    const payload = { theme, frame };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }
  return { ok: true, message: `theme: ${theme}\nframe: ${frame}`, data: { theme, frame } };
}

export function themeFrames(json = false): SysResult {
  const frames = FRAME_STYLES.map((f) => ({ id: f.id, label: f.label, sublabel: f.sublabel, modes: [...f.modes] }));
  if (json) {
    return { ok: true, message: JSON.stringify(frames), data: { frames } };
  }
  const lines = frames.map((f) => `  ${f.id.padEnd(12)} ${f.label} · ${f.sublabel}  [${f.modes.join('/')}]`);
  return { ok: true, message: ['frame styles:', ...lines].join('\n'), data: { frames } };
}
