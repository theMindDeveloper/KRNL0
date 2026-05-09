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
