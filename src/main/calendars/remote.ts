// Decision 64 P2/P4 — one face for every calendar account KRNL0 syncs with:
// iCloud and any CalDAV server (tsdav), and Google (its Calendar API). The
// two-way engine (shared/calsync/mirror.ts) only ever talks to this.

import type { LinkedEvent } from '../../shared/calsync/types';
import type { MirrorItem, RemoteItem } from '../../shared/calsync/mirror';

export interface RemoteCal {
  id: string;
  name: string;
  color?: string;
  /** Shared with you to read only: never the target of two-way sync. */
  readOnly?: boolean;
}

export interface RemoteAdapter {
  /** Every calendar of the account that holds events. */
  listCalendars(): Promise<RemoteCal[]>;
  /** The account's "KRNL0" calendar, made when it does not exist yet. */
  ensureCalendar(name: string, timeZone: string): Promise<RemoteCal>;
  /** A tag that changes whenever the calendar's content changes (null: unknown, always read it). */
  changeTag(calId: string): Promise<string | null>;
  /** The KRNL0 calendar's entries, read as KRNL0 items. */
  listMirror(calId: string, timeZone: string, nowMs: number): Promise<RemoteItem[]>;
  /** Create or replace one entry. */
  put(calId: string, item: MirrorItem, timeZone: string, existing?: { ref: string; etag?: string }): Promise<{ ref: string; etag?: string }>;
  remove(calId: string, ref: string, etag?: string): Promise<void>;
  /** Another calendar's events, a year back and a year ahead (read-only). */
  readEvents(calId: string, timeZone: string, nowMs: number): Promise<LinkedEvent[]>;
}

/** Thrown when the account no longer accepts the sign-in (F19): the link asks to sign in again. */
export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}
