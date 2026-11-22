// Decision 64 — what the CLI (`krnl cal link …`) and the Calendar's "Other
// calendars" card ask of the host that runs calendar links (the desktop app's
// main process in P1; the KRNL0 server in P3).

import type { CalendarLink, LinkColor, LinkedEvent, LinkProvider } from './types';

export type LinkPreview =
  | { ok: true; url: string; name: string | null; provider: LinkProvider; count: number; next: LinkedEvent | null }
  | { ok: false; reason: 'notAddress' | 'notCalendar' | 'googleSharePage' | 'unreachable'; message: string };

export interface LinkRow extends CalendarLink {
  /** This device holds its address and checks it. */
  here: boolean;
}

export type LinkResult = { ok: true; link: CalendarLink; message: string } | { ok: false; message: string };

/** A calendar of a signed-in account (the picker after signing in). */
export interface AccountCalendar {
  id: string;
  name: string;
  color?: string;
  /** Shared with you to read only. */
  readOnly?: boolean;
  /** Already shown on this board. */
  added?: boolean;
}

/** A signed-in account on this device (`krnl cal accounts`): shown on every board, so you always see it and can sign out. */
export interface AccountRow {
  accountId: string;
  account: string;
  provider: LinkProvider;
  /** Its calendars shown on the open board. */
  onBoard: number;
  /** It holds the open board's two-way KRNL0 calendar. */
  sending: boolean;
  signedOut: boolean;
}

export type ConnectResult =
  | { ok: true; accountId: string; account: string; provider: LinkProvider; calendars: AccountCalendar[]; /** Already sending to a KRNL0 calendar there. */ sending: boolean }
  | { ok: false; reason: 'notAppPassword' | 'signIn' | 'notSetUp' | 'unreachable'; message: string };

export interface CalendarLinksPort {
  /** P2 — sign in to iCloud with the Apple ID and an app-specific password; lists its calendars. */
  connectApple(email: string, appPassword: string): Promise<ConnectResult>;
  /** P2 — any CalDAV server (Nextcloud, Fastmail…). */
  connectCalDav(server: string, user: string, password: string): Promise<ConnectResult>;
  /** P4 — Sign in with Google (the browser opens). */
  connectGoogle(): Promise<ConnectResult>;
  /** The calendars of an account already signed in (to change which are shown). */
  accountCalendars(accountId: string): Promise<ConnectResult>;
  /** Show these calendars read-only, and (send) keep a KRNL0 calendar there the same both ways. */
  addAccountCalendars(accountId: string, show: string[], send: boolean): Promise<{ ok: boolean; message: string }>;
  /** Every account signed in on this device. */
  accounts(): AccountRow[];
  /** Forget an account: its calendars leave the board, its sign-in is deleted. */
  signOut(ref: string): Promise<{ ok: boolean; message: string }>;
  /** The board changed here: sync the KRNL0 calendars in a few seconds (F13). */
  nudge(): void;
  /** Fetch and read an address without adding it (the "Found" step, F2). */
  preview(url: string): Promise<LinkPreview>;
  add(url: string, opts?: { name?: string; color?: LinkColor }): Promise<LinkResult>;
  /** Rename, recolour, show or hide. */
  set(ref: string, patch: { name?: string; color?: LinkColor; on?: boolean }): Promise<LinkResult>;
  remove(ref: string): Promise<LinkResult>;
  /** Check now (one link, or every link this device runs). */
  check(ref?: string): Promise<{ ok: boolean; message: string }>;
  list(): LinkRow[];
}
