// The running calendar service, for the IPC handlers and the CLI's RPC server.
// Kept apart from `./index` so importing it does not load tsdav, ical.js and the
// Google client (the board handlers import this on every start and in tests).

import type { CalendarLinksPort } from '../../shared/calsync/port';

let current: CalendarLinksPort | null = null;

export function setCalendars(port: CalendarLinksPort | null): void {
  current = port;
}

/** The running service (krnl cal link …, board:save nudges). Undefined before init. */
export function getCalendars(): CalendarLinksPort | undefined {
  return current ?? undefined;
}
