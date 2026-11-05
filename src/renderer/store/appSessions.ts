// App session markers (#207 follow-up): when KRNL0 was opened and closed,
// read from the time log (main writes `app.opened` at start, `app.closed` on
// quit). Drawn as thin lines on the Calendar and ticks on the Clock.

import { useEffect, useState } from 'react';
import type { TimeLogEntry } from '../../shared/timelog';
import { queryTimeLog } from './timeLog';

export interface AppMarker { ms: number; kind: 'open' | 'close' }

/** Pure: open/close markers whose time falls on local days [from, to]. */
export function appMarkersFrom(entries: readonly TimeLogEntry[], fromYMD: string, toYMD: string): AppMarker[] {
  const out: AppMarker[] = [];
  for (const e of entries) {
    if (e.type !== 'app.opened' && e.type !== 'app.closed') continue;
    const ms = Date.parse(e.at);
    const d = new Date(ms);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (ymd < fromYMD || ymd > toYMD) continue;
    out.push({ ms, kind: e.type === 'app.opened' ? 'open' : 'close' });
  }
  // Per day: only the first start and the last shutdown (#207 — markers, not a log).
  const byDay = new Map<string, { open?: number; close?: number }>();
  for (const m of out) {
    const d = new Date(m.ms);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const v = byDay.get(k) ?? {};
    if (m.kind === 'open') v.open = v.open === undefined ? m.ms : Math.min(v.open, m.ms);
    else v.close = v.close === undefined ? m.ms : Math.max(v.close, m.ms);
    byDay.set(k, v);
  }
  const res: AppMarker[] = [];
  for (const v of byDay.values()) {
    if (v.open !== undefined) res.push({ ms: v.open, kind: 'open' });
    // A shutdown before the day's first start (overnight) or a close while the
    // app is open again later still reads as that day's last shutdown.
    if (v.close !== undefined && (v.open === undefined || v.close > v.open)) res.push({ ms: v.close, kind: 'close' });
  }
  return res.sort((a, b) => a.ms - b.ms);
}

/** Markers for a range of local days; re-read when the range changes. */
export function useAppMarkers(fromYMD: string, toYMD: string): AppMarker[] {
  const [markers, setMarkers] = useState<AppMarker[]>([]);
  useEffect(() => {
    let alive = true;
    void queryTimeLog(fromYMD, toYMD).then((entries) => {
      if (alive) setMarkers(appMarkersFrom(entries, fromYMD, toYMD));
    }).catch(() => { /* no log yet — no markers */ });
    return () => { alive = false; };
  }, [fromYMD, toYMD]);
  return markers;
}
