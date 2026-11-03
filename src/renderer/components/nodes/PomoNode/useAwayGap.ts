// Time the app could not see while the pomo ran: the machine slept, or the
// app was closed with a span in flight. Elapsed time is always
// `now - startedAt`, so without this guard a laptop closed at 18:00 and opened
// at 09:00 books fifteen hours of work. A heartbeat (localStorage, per data
// folder — not board data) records when the window last saw the span live;
// a gap of AWAY_MS or more is offered to the user: keep it, or stop the span
// as of the moment they left (pomo.stop { atMs } · CLI: pomo stop --at).

import { useCallback, useEffect, useRef, useState } from 'react';

export const AWAY_MS = 15 * 60_000;
const BEAT_MS = 15_000;
const KEY = 'krnl0-pomo-seen';

export interface AwayGap {
  fromMs: number;
  toMs: number;
}

/** The unseen stretch of a live span, if it is long enough to ask about. */
export function awayGapFor(startedAtMs: number, lastSeenMs: number | null, nowMs: number): AwayGap | null {
  if (lastSeenMs === null || !Number.isFinite(lastSeenMs)) return null;
  const fromMs = Math.max(startedAtMs, lastSeenMs);
  return nowMs - fromMs >= AWAY_MS ? { fromMs, toMs: nowMs } : null;
}

function readSeen(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeSeen(ms: number): void {
  try { localStorage.setItem(KEY, String(ms)); } catch { /* storage unavailable */ }
}

/** `status` / `startedAt` of the pomo; only running and break spans grow unseen. */
export function useAwayGap(status: string, startedAt: string | null): { gap: AwayGap | null; dismiss: () => void } {
  const [gap, setGap] = useState<AwayGap | null>(null);
  const lastBeat = useRef<number | null>(null);
  const live = (status === 'running' || status === 'break') && startedAt !== null;
  const startMs = startedAt !== null ? Date.parse(startedAt) : NaN;

  useEffect(() => {
    if (!live || !Number.isFinite(startMs)) {
      setGap(null);
      lastBeat.current = null;
      return;
    }
    // On mount / a new span: was the app gone since it last saw this span?
    // Always replace: a prompt about the previous span (ended meanwhile by
    // the CLI, a break, an extend) must not be applied to this one.
    const now = Date.now();
    setGap(awayGapFor(startMs, readSeen(), now));
    lastBeat.current = now;
    writeSeen(now);
    const id = setInterval(() => {
      const t = Date.now();
      // A late beat means the process was suspended (sleep / hibernate).
      const slept = lastBeat.current !== null ? awayGapFor(startMs, lastBeat.current, t) : null;
      if (slept) setGap((g) => (g ? { fromMs: g.fromMs, toMs: t } : slept));
      lastBeat.current = t;
      writeSeen(t);
    }, BEAT_MS);
    return () => clearInterval(id);
  }, [live, startMs]);

  const dismiss = useCallback(() => setGap(null), []);
  return { gap, dismiss };
}
