// sys log — CLI reads from the in-renderer EventLog ring buffer (Decision 29 §6).
// RENDERER-REQUIRED: the EventLog buffer is in-renderer memory; it does not
// persist. These commands MUST route through cli:dispatch and exit 2 if detached.

import type { SysResult } from '../SysFacade';
import type { CliDispatchFn } from '../SysFacade';

export function requiresRenderer(command: string): SysResult {
  return {
    ok: false,
    message: `${command} reads the in-memory ring buffer (200 entries max, cleared on reload) and requires an open renderer window (exit 2 = no renderer).`,
    data: { exitCode: 2 },
  };
}

export async function logTail(
  cliDispatch: CliDispatchFn,
  opts: { limit?: number; json?: boolean },
): Promise<SysResult> {
  return cliDispatch('log.tail', { limit: opts.limit ?? 20, json: opts.json ?? false });
}

export async function logStats(
  cliDispatch: CliDispatchFn,
  opts: { json?: boolean },
): Promise<SysResult> {
  return cliDispatch('log.stats', { json: opts.json ?? false });
}
