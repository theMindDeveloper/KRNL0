import type { SysResult } from '../SysFacade';

// TODO (Week 4): read/write board.json Pomodoro state
export async function pomoStart(label?: string, minutes?: number): Promise<SysResult> {
  return {
    ok: true,
    message: `[stub] pomo start — label="${label ?? ''}" minutes=${minutes ?? 25}`,
  };
}

export async function pomoStop(): Promise<SysResult> {
  return { ok: true, message: '[stub] pomo stop' };
}

export async function pomoStatus(): Promise<SysResult> {
  return { ok: true, message: '[stub] pomo status — no active session' };
}

// Decision 9 Addendum (2026-05-12) — sys CLI surface for the gear settings.
// Write paths still TODO (Week 4); the parser/route/dispatch chain is wired so
// the surface exists and is testable.
export interface PomoConfigSetOpts {
  session?: number | undefined;
  breakMin?: number | undefined;
  longBreak?: number | undefined;
  longBreakEvery?: number | undefined;
}

export async function pomoConfigSet(opts: PomoConfigSetOpts): Promise<SysResult> {
  const parts: string[] = [];
  if (opts.session !== undefined) parts.push(`session=${opts.session}`);
  if (opts.breakMin !== undefined) parts.push(`break=${opts.breakMin}`);
  if (opts.longBreak !== undefined) parts.push(`longBreak=${opts.longBreak}`);
  if (opts.longBreakEvery !== undefined) parts.push(`longBreakEvery=${opts.longBreakEvery}`);
  return {
    ok: true,
    message: `[stub] pomo config set — ${parts.length ? parts.join(' ') : '<no fields>'}`,
  };
}

export async function pomoTaskStart(id: string | undefined): Promise<SysResult> {
  if (!id) {
    return { ok: false, message: 'pomo task start — missing task id' };
  }
  return { ok: true, message: `[stub] pomo task start — id=${id}` };
}
