// Decision 64 / calendar-sync P1 — the desktop runs calendar links.
//
// Each link's address lives here, sealed in the OS keychain (NF3: Google's
// secret address works like a password); the board holds only the link's
// name, colour, state and the events it brought in. Every minute the service
// looks for links of the open board that this device runs and that are due
// (15 minutes, F2), fetches them (ETag / If-Modified-Since), reads them and
// writes the board through the same file path the CLI uses — so the window
// merges it like any `krnl` change (Decision 34). Nothing is written when
// nothing changed (NF7).

import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadBoardFrom, saveBoardTo, writeFileAtomic } from '../persistence/board';
import type { SecretBox } from '../sync/service';
import { readIcs } from '../../shared/calsync/ics';
import {
  CHECK_EVERY_MS, FAILS_BEFORE_UNREACHABLE, LINK_COLORS, linksOf, looksLikeGoogleSharePage, normalizeIcsUrl, providerLabel, providerOf,
  type CalendarLink, type LinkColor, type LinkedEvent,
} from '../../shared/calsync/types';
import type { AccountCalendar, AccountRow, CalendarLinksPort, ConnectResult, LinkPreview, LinkResult, LinkRow } from '../../shared/calsync/port';
import { nextEvent, utcToWall } from '../../shared/calsync/ics';
import { hashItem, reconcile, type LocalOp, type MapEntry } from '../../shared/calsync/mirror';
import type { Board } from '../../shared/types';
import { CalDavAdapter, ICLOUD_SERVER } from './caldav';
import { GoogleAdapter, googleClient, signInGoogle } from './google';
import { SignInError, type RemoteAdapter } from './remote';
import { applyEventOps, applyTaskOps, localItems } from './local';
import type { HabitState } from '../../renderer/components/nodes/HabitNode/types';

/** A signed-in account, kept sealed on this device (NF3). */
export type AccountSecret =
  | { kind: 'caldav'; provider: 'icloud' | 'caldav'; server: string; user: string; password: string }
  | { kind: 'google'; email: string; refreshToken: string };

/** iCloud app-specific passwords look like abcd-efgh-ijkl-mnop. */
export function normalizeAppPassword(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  const bare = s.replace(/-/g, '');
  if (!/^[a-z]{16}$/.test(bare)) return null;
  return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8, 12)}-${bare.slice(12)}`;
}

const accountOf = (s: AccountSecret): string => (s.kind === 'google' ? s.email : s.user);

/** The same account, whichever device signed in: kind + email. */
function sameAccount(l: CalendarLink, kind: AccountSecret['kind'], account: string): boolean {
  return l.kind === kind && !!l.account && l.account.toLowerCase() === account.toLowerCase();
}

/** "KRNL0" or "KRNL0 · Board": a calendar KRNL0 made for two-way sync. */
export function isKrnlCalendar(name: string): boolean {
  return /^KRNL0( · .+)?$/.test(name.trim());
}

/** F13 — the KRNL0 calendar is synced every 2 minutes (and a few seconds after a change here). */
export const MIRROR_EVERY_MS = 2 * 60_000;
/** Read-only calendars of an account are read every 5 minutes. */
export const ACCOUNT_READ_EVERY_MS = 5 * 60_000;

interface SecretFile {
  /** This install, so a board can say which device checks a link (F14). */
  device: string;
  /** Link id → its address, sealed. */
  links: Record<string, string>;
  /** Account id → its sign-in (AccountSecret as JSON), sealed. */
  accounts: Record<string, string>;
  /** Mirror link id → the last `rev` this device wrote (a board behind it was restored). */
  revs?: Record<string, number>;
}

type Fetched =
  | { status: 'ok'; text: string; etag?: string; lastModified?: string }
  | { status: 'notModified' }
  | { status: 'failed'; message: string };

export interface CalendarLinkDeps {
  boardPath: () => string;
  userDataDir: string;
  secrets: SecretBox;
  notifyBoardChanged: () => void;
  fetchFn?: typeof fetch;
  now?: () => number;
  timeZone?: () => string;
  log?: (msg: string) => void;
  /** How to reach an account (tests give a fake calendar). */
  adapterFactory?: (acct: AccountSecret) => RemoteAdapter;
  /** Opens Google's sign-in page (the system browser). */
  openBrowser?: (url: string) => Promise<unknown>;
  /** The open board's name, when there are several (its own "KRNL0 · Name" calendar). */
  boardName?: () => string | null;
  /** The board files of the boards that are not open (signing out cleans them too). */
  otherBoardPaths?: () => string[];
}

const MAX_BYTES = 15 * 1024 * 1024;

export class CalendarLinkService implements CalendarLinksPort {
  private readonly deps: CalendarLinkDeps;
  private readonly file: string;
  private store: SecretFile;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly busy = new Set<string>();
  /** Each link's last check on this device (kept off the board, NF7). */
  private readonly seen = new Map<string, { checkedAt: string; okAt?: string | undefined }>();

  constructor(deps: CalendarLinkDeps) {
    this.deps = deps;
    this.file = join(deps.userDataDir, 'calendar-links.json');
    this.store = this.readStore();
  }

  /** Check due links now and every minute after. */
  start(): void {
    if (this.timer) return;
    setTimeout(() => { void this.tick(); }, 3_000);
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── secrets ───────────────────────────────────────────────────────────────

  private readStore(): SecretFile {
    try {
      if (existsSync(this.file)) {
        const j = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SecretFile>;
        if (typeof j.device === 'string' && j.device) return { device: j.device, links: j.links && typeof j.links === 'object' ? j.links : {}, accounts: j.accounts && typeof j.accounts === 'object' ? j.accounts : {}, revs: j.revs && typeof j.revs === 'object' ? j.revs : {} };
      }
    } catch { /* a damaged file: start over (the links ask to be added again) */ }
    const fresh: SecretFile = { device: randomUUID(), links: {}, accounts: {} };
    try { writeFileAtomic(this.file, JSON.stringify(fresh, null, 2)); } catch { /* kept in memory */ }
    return fresh;
  }

  private writeStore(): void {
    writeFileAtomic(this.file, JSON.stringify(this.store, null, 2));
  }

  private urlOf(id: string): string | null {
    const sealed = this.store.links[id];
    if (!sealed) return null;
    try { return this.deps.secrets.open(sealed); } catch { return null; }
  }

  // ── board ─────────────────────────────────────────────────────────────────

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private zone(): string { return this.deps.timeZone?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'; }

  private readLinks(): CalendarLink[] {
    try { return linksOf(loadBoardFrom(this.deps.boardPath())); } catch { return []; }
  }

  /** Load the board, change its links, save only when something changed. */
  private writeLinks(change: (links: CalendarLink[]) => CalendarLink[]): CalendarLink[] {
    return this.writeBoard((_board, links) => change(links)).links;
  }

  /**
   * Load the board, change its links (and, for two-way sync, its events), save
   * only when something changed, and tell the window.
   */
  private writeBoard(change: (board: Record<string, unknown>, links: CalendarLink[]) => CalendarLink[], events?: (st: HabitState) => HabitState, mustHave?: string): { links: CalendarLink[]; wrote: boolean } {
    const path = this.deps.boardPath();
    const board = loadBoardFrom(path, { seedIfCorrupt: false }) as Record<string, unknown>;
    const before = linksOf(board);
    // Its link is not on this board (it was switched): nothing of it is written here.
    if (mustHave && !before.some((l) => l.id === mustHave)) return { links: before, wrote: false };
    const after = change(board, before.map((l) => ({ ...l })));
    let nodes = board['nodes'] as Array<Record<string, unknown>> | undefined;
    let nodesChanged = false;
    if (events && Array.isArray(nodes)) {
      nodes = nodes.map((n) => {
        if (n['kind'] !== 'habit' || n['isMother'] !== true) return n;
        const st = (n['state'] ?? { habits: [] }) as HabitState;
        const next = events(st);
        if (next === st) return n;
        nodesChanged = true;
        return { ...n, state: next };
      });
    }
    if (!nodesChanged && JSON.stringify(after) === JSON.stringify(before)) return { links: after, wrote: false };
    const next: Record<string, unknown> = { ...board, ...(nodesChanged ? { nodes } : {}), savedAt: new Date(this.now()).toISOString() };
    if (after.length) next['calendarLinks'] = after; else delete next['calendarLinks'];
    saveBoardTo(path, next);
    this.deps.notifyBoardChanged();
    return { links: after, wrote: true };
  }

  private here(l: CalendarLink): boolean {
    return l.kind === 'ics' ? !!this.store.links[l.id] : !!(l.accountId && this.store.accounts[l.accountId]);
  }

  private resolve(ref: string): CalendarLink | string {
    const r = ref.trim().toLowerCase();
    if (!r) return 'which calendar? give its name or id (krnl cal links)';
    const links = this.readLinks();
    const exact = links.filter((l) => l.id === ref.trim() || l.name.toLowerCase() === r);
    if (exact.length === 1) return exact[0]!;
    const loose = links.filter((l) => l.id.startsWith(ref.trim()) || l.name.toLowerCase().startsWith(r));
    if (loose.length === 1) return loose[0]!;
    return loose.length > 1 ? `"${ref}" matches more than one calendar` : `no calendar "${ref}" (krnl cal links)`;
  }

  // ── fetching ──────────────────────────────────────────────────────────────

  private async fetchIcs(url: string, prev?: { etag?: string; lastModified?: string }): Promise<Fetched> {
    const f = this.deps.fetchFn ?? fetch;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const headers: Record<string, string> = { 'User-Agent': 'KRNL0 calendar', Accept: 'text/calendar, */*;q=0.5' };
      if (prev?.etag) headers['If-None-Match'] = prev.etag;
      if (prev?.lastModified) headers['If-Modified-Since'] = prev.lastModified;
      const res = await f(url, { headers, signal: ctl.signal, redirect: 'follow' });
      if (res.status === 304) return { status: 'notModified' };
      if (!res.ok) return { status: 'failed', message: `the server answered ${res.status}` };
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) return { status: 'failed', message: 'the calendar is too large (over 15 MB)' };
      const text = await res.text();
      if (text.length > MAX_BYTES) return { status: 'failed', message: 'the calendar is too large (over 15 MB)' };
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      return { status: 'ok', text, ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) };
    } catch (err) {
      return { status: 'failed', message: err instanceof Error && err.name === 'AbortError' ? 'no answer in 20 seconds' : 'no answer' };
    } finally {
      clearTimeout(t);
    }
  }

  // ── the port ──────────────────────────────────────────────────────────────

  async preview(raw: string): Promise<LinkPreview> {
    const url = normalizeIcsUrl(raw);
    if (!url) return { ok: false, reason: 'notAddress', message: 'That is not a web address. A calendar address starts with https:// or webcal://.' };
    const got = await this.fetchIcs(url);
    if (got.status !== 'ok') {
      if (looksLikeGoogleSharePage(url)) return { ok: false, reason: 'googleSharePage', message: googleHelp };
      return { ok: false, reason: 'unreachable', message: 'This address did not answer. Check that you copied all of it.' };
    }
    const read = readIcs(got.text, this.zone(), this.now());
    if ('error' in read) {
      return looksLikeGoogleSharePage(url)
        ? { ok: false, reason: 'googleSharePage', message: googleHelp }
        : { ok: false, reason: 'notCalendar', message: 'This address is not a calendar file. Look for an address that ends in .ics, or one that starts with webcal://.' };
    }
    return { ok: true, url, name: read.name, provider: providerOf(url), count: read.count, next: nextEvent(read.events, utcToWall(this.now(), this.zone())) };
  }

  async add(raw: string, opts: { name?: string; color?: LinkColor } = {}): Promise<LinkResult> {
    if (!this.deps.secrets.available()) return { ok: false, message: 'This computer cannot keep the calendar address safe (no keychain), so it was not added.' };
    const pre = await this.preview(raw);
    if (!pre.ok) return { ok: false, message: pre.message };
    const id = `cal-${randomUUID().slice(0, 8)}`;
    // A new link takes the first colour no other calendar uses.
    const used = new Set(this.readLinks().map((l) => l.color));
    const color = opts.color && LINK_COLORS.includes(opts.color) ? opts.color : LINK_COLORS.find((c) => !used.has(c)) ?? 'lilac';
    const name = (opts.name ?? '').trim() || pre.name || providerLabel(pre.provider);
    this.store.links[id] = this.deps.secrets.seal(pre.url);
    this.writeStore();
    const link: CalendarLink = {
      id, kind: 'ics', name, color, on: true, provider: pre.provider, timeZone: this.zone(),
      device: this.store.device, deviceName: hostname(), events: [],
    };
    this.writeLinks((links) => [...links, link]);
    await this.checkOne(link.id);
    const saved = this.readLinks().find((l) => l.id === id) ?? link;
    return { ok: true, link: saved, message: `added "${saved.name}" (${providerLabel(saved.provider)}, ${saved.events.length} events this year)` };
  }

  async set(ref: string, patch: { name?: string; color?: LinkColor; on?: boolean }): Promise<LinkResult> {
    const found = this.resolve(ref);
    if (typeof found === 'string') return { ok: false, message: found };
    if (patch.color !== undefined && !LINK_COLORS.includes(patch.color)) return { ok: false, message: `colour must be one of ${LINK_COLORS.join(', ')}` };
    if (patch.name !== undefined && !patch.name.trim()) return { ok: false, message: 'a calendar needs a name' };
    const links = this.writeLinks((ls) => ls.map((l) => l.id === found.id ? {
      ...l,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.on !== undefined ? { on: patch.on } : {}),
    } : l));
    const link = links.find((l) => l.id === found.id)!;
    // Shown again: bring it up to date at once.
    if (patch.on === true && !found.on) void this.checkOne(link.id);
    return { ok: true, link, message: `"${link.name}" · ${link.color} · ${link.on ? 'shown' : 'hidden'}` };
  }

  async remove(ref: string): Promise<LinkResult> {
    const found = this.resolve(ref);
    if (typeof found === 'string') return { ok: false, message: found };
    delete this.store.links[found.id];
    this.writeLinks((ls) => ls.filter((l) => l.id !== found.id));
    // An account's sign-in stays (other boards may show it): Sign out forgets it.
    this.writeStore();
    return { ok: true, link: found, message: `removed "${found.name}" (its events left the Calendar; the calendar itself is untouched)` };
  }

  async check(ref?: string): Promise<{ ok: boolean; message: string }> {
    const links = this.readLinks();
    let targets: CalendarLink[];
    if (ref) {
      const found = this.resolve(ref);
      if (typeof found === 'string') return { ok: false, message: found };
      targets = [found];
    } else {
      targets = links.filter((l) => this.here(l));
    }
    if (!targets.length) return { ok: true, message: 'No calendars to check on this computer.' };
    const lines: string[] = [];
    for (const l of targets) {
      if (!this.here(l)) { lines.push(`${l.name}: checked on ${l.deviceName ?? 'another computer'}`); continue; }
      await this.checkOne(l.id, true);
      const now = this.readLinks().find((x) => x.id === l.id);
      const what = now?.role === 'mirror' ? `in step (${now.map?.length ?? 0} items)` : `${now?.events.length ?? 0} events`;
      lines.push(`${l.name}: ${now?.state === 'ok' || now?.state === undefined ? what : now?.state === 'notCalendar' ? 'not a calendar file' : now?.state === 'signedOut' ? 'sign in again' : 'no answer'}`);
    }
    return { ok: true, message: lines.join('\n') };
  }

  /** The board's links, with this device's latest check times (NF7 keeps those off the board). */
  list(): LinkRow[] {
    return this.readLinks().map((l) => {
      const seen = this.seen.get(l.id);
      return { ...l, ...(seen?.checkedAt ? { checkedAt: seen.checkedAt } : {}), ...(seen?.okAt ? { okAt: seen.okAt } : {}), here: this.here(l) };
    });
  }

  // ── P2/P4: signed-in accounts ────────────────────────────────────────────

  private readonly adapters = new Map<string, RemoteAdapter>();
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  private secretOf(accountId: string): AccountSecret | null {
    const sealed = this.store.accounts[accountId];
    if (!sealed) return null;
    try { return JSON.parse(this.deps.secrets.open(sealed)) as AccountSecret; } catch { return null; }
  }

  private makeAdapter(acct: AccountSecret): RemoteAdapter {
    if (this.deps.adapterFactory) return this.deps.adapterFactory(acct);
    if (acct.kind === 'google') return new GoogleAdapter({ refreshToken: acct.refreshToken }, this.deps.fetchFn ?? fetch);
    return new CalDavAdapter(acct.server, acct.user, acct.password, this.deps.fetchFn);
  }

  private adapterFor(accountId: string): RemoteAdapter | null {
    const cached = this.adapters.get(accountId);
    if (cached) return cached;
    const acct = this.secretOf(accountId);
    if (!acct) return null;
    const a = this.makeAdapter(acct);
    this.adapters.set(accountId, a);
    return a;
  }

  /** Keep a sign-in (one per account: signing in again replaces it) and list the account's calendars. */
  private async connect(acct: AccountSecret, account: string, provider: CalendarLink['provider']): Promise<ConnectResult> {
    if (!this.deps.secrets.available()) return { ok: false, reason: 'unreachable', message: 'This computer cannot keep the sign-in safe (no keychain), so it was not added.' };
    const adapter = this.makeAdapter(acct);
    let cals;
    try {
      cals = await adapter.listCalendars();
    } catch (err) {
      if (err instanceof SignInError) return { ok: false, reason: 'signIn', message: provider === 'icloud' ? 'Apple did not accept this email and app password. Check the email, or make a new app password.' : err.message };
      return { ok: false, reason: 'unreachable', message: provider === 'icloud' ? 'iCloud did not answer. Check the internet connection and try again.' : `The calendar server did not answer (${err instanceof Error ? err.message : String(err)}).` };
    }
    // One account, one sign-in on this device: the same account again (kind + email) takes its earlier
    // id. Never another device's id: that would make this device a second runner of its calendars.
    const links = this.readLinks();
    const mine = Object.keys(this.store.accounts).find((id) => { const s = this.secretOf(id); return !!s && s.kind === acct.kind && accountOf(s).toLowerCase() === account.toLowerCase(); });
    const fromBoard = links.find((l) => sameAccount(l, acct.kind, account) && l.accountId && l.device === this.store.device);
    const accountId = mine ?? fromBoard?.accountId ?? `acct-${randomUUID().slice(0, 8)}`;
    this.store.accounts[accountId] = this.deps.secrets.seal(JSON.stringify(acct));
    this.writeStore();
    this.adapters.set(accountId, adapter);
    // A sign-in that had stopped working is fine again.
    this.writeLinks((ls) => ls.map((l) => (l.accountId === accountId && l.state === 'signedOut' ? { ...l, state: 'ok' } : l)));
    return { ok: true, accountId, account, provider, calendars: this.markAdded(accountId, cals), sending: links.some((l) => (l.accountId === accountId || sameAccount(l, acct.kind, account)) && l.role === 'mirror') };
  }

  /** This board's links of an account: its own, and the same account's from another device (kind + email). */
  private accountLinks(accountId: string): CalendarLink[] {
    const s = this.secretOf(accountId);
    return this.readLinks().filter((l) => l.accountId === accountId || (!!s && sameAccount(l, s.kind, accountOf(s))));
  }

  private markAdded(accountId: string, cals: AccountCalendar[]): AccountCalendar[] {
    const links = this.accountLinks(accountId);
    const mirror = new Set(links.filter((l) => l.role === 'mirror').map((l) => l.remoteId));
    // KRNL0's own two-way calendars (this board's and other boards') are never outside calendars: they would show plans twice.
    return cals
      .filter((c) => !mirror.has(c.id) && !isKrnlCalendar(c.name))
      .map((c) => ({ ...c, ...(links.some((l) => l.remoteId === c.id && l.role === 'read') ? { added: true } : {}) }));
  }

  async connectApple(email: string, appPassword: string): Promise<ConnectResult> {
    const user = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return { ok: false, reason: 'signIn', message: 'Type the email of your Apple ID.' };
    const pw = normalizeAppPassword(appPassword);
    if (!pw) return { ok: false, reason: 'notAppPassword', message: 'This is not an app password. Apple makes one for you: it looks like abcd-efgh-ijkl-mnop. Your normal Apple ID password does not work here.' };
    return this.connect({ kind: 'caldav', provider: 'icloud', server: ICLOUD_SERVER, user, password: pw }, user, 'icloud');
  }

  async connectCalDav(server: string, user: string, password: string): Promise<ConnectResult> {
    let url: string;
    try { url = new URL(server.trim().startsWith('http') ? server.trim() : `https://${server.trim()}`).toString(); } catch { return { ok: false, reason: 'unreachable', message: 'That is not a server address.' }; }
    if (!user.trim() || !password) return { ok: false, reason: 'signIn', message: 'Type the user name and password of the calendar account.' };
    const provider = providerOf(url) === 'icloud' ? 'icloud' : 'caldav';
    return this.connect({ kind: 'caldav', provider, server: url, user: user.trim(), password }, user.trim(), provider);
  }

  async connectGoogle(): Promise<ConnectResult> {
    if (!googleClient()) return { ok: false, reason: 'notSetUp', message: 'Google sign-in is not set up in this KRNL0 build yet. Add your Google calendar with its secret address (Calendar link) for now.' };
    if (!this.deps.openBrowser) return { ok: false, reason: 'notSetUp', message: 'Google sign-in opens your browser: run it in the KRNL0 app.' };
    let got;
    try {
      got = await signInGoogle(this.deps.openBrowser, this.deps.fetchFn ?? fetch);
    } catch (err) {
      return { ok: false, reason: 'signIn', message: err instanceof Error ? err.message : String(err) };
    }
    return this.connect({ kind: 'google', email: got.email, refreshToken: got.refreshToken }, got.email, 'google');
  }

  async accountCalendars(accountId: string): Promise<ConnectResult> {
    const acct = this.secretOf(accountId);
    const adapter = this.adapterFor(accountId);
    if (!acct || !adapter) return { ok: false, reason: 'signIn', message: 'This account is signed in on another computer.' };
    try {
      const cals = await adapter.listCalendars();
      const account = acct.kind === 'google' ? acct.email : acct.user;
      const provider = acct.kind === 'google' ? 'google' : acct.provider;
      return { ok: true, accountId, account, provider, calendars: this.markAdded(accountId, cals), sending: this.accountLinks(accountId).some((l) => l.role === 'mirror') };
    } catch (err) {
      return { ok: false, reason: err instanceof SignInError ? 'signIn' : 'unreachable', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async addAccountCalendars(accountId: string, show: string[], send: boolean): Promise<{ ok: boolean; message: string }> {
    const acct = this.secretOf(accountId);
    const adapter = this.adapterFor(accountId);
    if (!acct || !adapter) return { ok: false, message: 'Sign in to the account first.' };
    const account = acct.kind === 'google' ? acct.email : acct.user;
    const provider: CalendarLink['provider'] = acct.kind === 'google' ? 'google' : acct.provider;
    let cals;
    try { cals = await adapter.listCalendars(); } catch (err) { return { ok: false, message: err instanceof Error ? err.message : String(err) }; }
    const tz = this.zone();
    const base = { kind: acct.kind, provider, account, accountId, timeZone: tz, device: this.store.device, deviceName: hostname(), on: true, events: [] as LinkedEvent[] };
    // The calendars to show (read-only), each once; the ones unticked leave.
    const want = new Set(show);
    // The account's calendars already on this board, whichever device added them: never twice.
    const existing = this.accountLinks(accountId);
    const mine = (l: CalendarLink) => l.accountId === accountId || sameAccount(l, acct.kind, account);
    const added: CalendarLink[] = [];
    const used = new Set(this.readLinks().map((l) => l.color));
    for (const c of cals) {
      if (!want.has(c.id) || isKrnlCalendar(c.name) || existing.some((l) => l.remoteId === c.id && l.role === 'read')) continue;
      const color = LINK_COLORS.find((x) => !used.has(x)) ?? 'lilac';
      used.add(color);
      added.push({ ...base, id: `cal-${randomUUID().slice(0, 8)}`, name: c.name, color, remoteId: c.id, role: 'read' });
    }
    let mirror: CalendarLink | null = null;
    if (send && !existing.some((l) => l.role === 'mirror')) {
      const others = this.deps.boardName?.();
      let name = others ? `KRNL0 · ${others}` : 'KRNL0';
      // Another board already sends to a calendar of that name in this account: this one gets its own.
      const taken = new Set<string>();
      for (const p of this.deps.otherBoardPaths?.() ?? []) {
        try { for (const l of linksOf(loadBoardFrom(p))) if (l.role === 'mirror' && (l.accountId === accountId || (l.kind === acct.kind && l.account?.toLowerCase() === account.toLowerCase()))) taken.add(l.name); } catch { /* unreadable: skip */ }
      }
      for (let n = 2; taken.has(name) && n < 50; n++) name = `${others ? `KRNL0 · ${others}` : 'KRNL0'} (${n})`;
      try {
        const cal = await adapter.ensureCalendar(name, tz);
        mirror = { ...base, id: `cal-${randomUUID().slice(0, 8)}`, name: cal.name, color: 'teal', remoteId: cal.id, role: 'mirror', map: [] };
      } catch (err) {
        return { ok: false, message: `The KRNL0 calendar could not be made in the account: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    this.writeLinks((ls) => [
      ...ls.filter((l) => !(mine(l) && ((l.role === 'read' && !want.has(l.remoteId ?? '')) || (l.role === 'mirror' && !send)))),
      ...added,
      ...(mirror ? [mirror] : []),
    ]);
    for (const l of [...added, ...(mirror ? [mirror] : [])]) await this.checkOne(l.id, true);
    // Say what was found, so an empty week never looks broken.
    const now = this.accountLinks(accountId);
    const parts = now.filter((l) => l.role === 'read').map((l) => `${l.name}: ${l.state === 'signedOut' ? 'sign in again' : l.events.length === 0 ? 'no events this year' : `${l.events.length} event${l.events.length === 1 ? '' : 's'} this year`}`);
    const m = now.find((l) => l.role === 'mirror');
    if (m && m.device !== this.store.device) parts.push(`"${m.name}" is kept in step by ${m.deviceName ?? 'another computer'}`);
    else if (m) parts.push(`${m.map?.length ?? 0} of your events and planned tasks sent to "${m.name}" (new ones follow by themselves)`);
    return { ok: true, message: parts.join(' · ') || 'Nothing to show yet' };
  }

  accounts(): AccountRow[] {
    const links = this.readLinks();
    const out: AccountRow[] = [];
    for (const id of Object.keys(this.store.accounts)) {
      const s = this.secretOf(id);
      if (!s) continue;
      const mine = links.filter((l) => l.accountId === id || sameAccount(l, s.kind, accountOf(s)));
      out.push({
        accountId: id,
        account: s.kind === 'google' ? s.email : s.user,
        provider: s.kind === 'google' ? 'google' : s.provider,
        onBoard: mine.filter((l) => l.role === 'read').length,
        sending: mine.some((l) => l.role === 'mirror'),
        signedOut: mine.some((l) => l.state === 'signedOut'),
      });
    }
    return out;
  }

  async signOut(ref: string): Promise<{ ok: boolean; message: string }> {
    const r = ref.trim().toLowerCase();
    const acct = this.accounts().find((a) => a.accountId === ref.trim() || a.account.toLowerCase() === r);
    if (!acct) return { ok: false, message: `no signed-in account "${ref}" (krnl cal accounts)` };
    const id = acct.accountId;
    delete this.store.accounts[id];
    this.adapters.delete(id);
    this.writeStore();
    this.writeLinks((ls) => ls.filter((l) => l.accountId !== id));
    // The boards that are not open forget its calendars too.
    for (const path of this.deps.otherBoardPaths?.() ?? []) {
      try {
        const b = loadBoardFrom(path, { seedIfCorrupt: false }) as Record<string, unknown>;
        const before = linksOf(b);
        const after = before.filter((l) => l.accountId !== id);
        if (after.length === before.length) continue;
        const next: Record<string, unknown> = { ...b };
        if (after.length) next['calendarLinks'] = after; else delete next['calendarLinks'];
        saveBoardTo(path, next);
      } catch { /* a board that cannot be read keeps its rows; they say "checked on another computer" */ }
    }
    return { ok: true, message: `signed out of ${acct.account}: its calendars left the Calendar (nothing in the account was deleted)` };
  }

  nudge(): void {
    if (!this.readLinks().some((l) => l.role === 'mirror' && l.on && this.here(l))) return;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      for (const l of this.readLinks()) if (l.role === 'mirror' && l.on && this.here(l) && l.state !== 'signedOut' && !this.busy.has(l.id)) void this.checkAccountLink(l, true);
    }, 5_000);
  }

  /** A calendar of a signed-in account: read it (read-only) or keep it the same both ways (mirror). */
  private async checkAccountLink(link: CalendarLink, onlyIfLocalChanged = false): Promise<void> {
    if (this.busy.has(link.id) || !link.accountId || !link.remoteId) return;
    const adapter = this.adapterFor(link.accountId);
    if (!adapter) return;
    this.busy.add(link.id);
    const stamp = new Date(this.now()).toISOString();
    try {
      if (link.role === 'mirror') await this.syncMirror(link, adapter, onlyIfLocalChanged);
      else {
        const tag = await adapter.changeTag(link.remoteId);
        if (!(tag && tag === link.ctag && link.events.length)) {
          const events = await adapter.readEvents(link.remoteId, link.timeZone || this.zone(), this.now());
          // NF7 — Google has no change tag: the events are read every time, but the
          // board is written only when they (or the state) changed.
          this.writeLinks((ls) => ls.map((l) => {
            if (l.id !== link.id) return l;
            const same = l.state === 'ok' && !l.failures && (!tag || l.ctag === tag) && JSON.stringify(l.events) === JSON.stringify(events);
            if (same) return l;
            const { failures: _f, ...rest } = l;
            return { ...rest, events, state: 'ok', ...(tag ? { ctag: tag } : {}), okAt: stamp, checkedAt: stamp };
          }));
        } else if (link.failures || link.state !== 'ok') {
          this.writeLinks((ls) => ls.map((l) => { if (l.id !== link.id) return l; const { failures: _f, ...rest } = l; return { ...rest, state: 'ok' }; }));
        }
      }
      this.seen.set(link.id, { checkedAt: stamp, okAt: stamp });
    } catch (err) {
      this.deps.log?.(`calendar ${link.id}: ${err instanceof Error ? err.message : String(err)}`);
      const signedOut = err instanceof SignInError;
      if (signedOut) this.adapters.delete(link.accountId);
      this.seen.set(link.id, { checkedAt: stamp, okAt: this.seen.get(link.id)?.okAt });
      this.writeLinks((ls) => ls.map((l) => {
        if (l.id !== link.id) return l;
        if (signedOut) return { ...l, state: 'signedOut' };
        const failures = (l.failures ?? 0) + 1;
        return { ...l, failures, state: failures >= FAILS_BEFORE_UNREACHABLE ? 'unreachable' : l.state ?? 'ok' };
      }));
    } finally {
      this.busy.delete(link.id);
    }
  }

  /** F9–F12 — the board and the KRNL0 calendar made the same, both ways. */
  private async syncMirror(link: CalendarLink, adapter: RemoteAdapter, onlyIfLocalChanged = false): Promise<void> {
    const path = this.deps.boardPath();
    const tz = link.timeZone || this.zone();
    const board = loadBoardFrom(path, { seedIfCorrupt: false }) as Board;
    // The board was switched since this link was read: its items are not this calendar's.
    const fresh = linksOf(board).find((l) => l.id === link.id);
    if (!fresh) return;
    const local = localItems(board);
    // A board behind what this device last wrote was restored (a backup, `krnl board load`): its map is
    // older than the calendar. Matching starts over (by UID and content), so nothing restored is deleted.
    const lastRev = this.store.revs?.[link.id] ?? 0;
    const boardRev = fresh.rev ?? 0;
    const map = boardRev < lastRev ? [] : fresh.map ?? [];
    // Nothing changed on either side since the last sync: no reading the calendar.
    const byId = new Map(map.map((m) => [m.id, m]));
    const sameHere = local.length === map.length && local.every((l) => byId.get(l.item.uid)?.l === hashItem(l.item));
    // A save here that changed nothing the calendar holds (a drag on the canvas, a tick): no call at all.
    if (onlyIfLocalChanged && sameHere) return;
    const tag = await adapter.changeTag(link.remoteId!);
    if (tag && tag === fresh.ctag && sameHere) return;

    const remote = await adapter.listMirror(link.remoteId!, tz, this.now());
    const plan = reconcile(local, remote, map);
    const entries = new Map(plan.map.map((m) => [m.id, m]));
    let refused = 0;
    for (const op of plan.remote) {
      try {
        if (op.op === 'put') {
          const res = await adapter.put(link.remoteId!, op.item, tz, op.ref ? { ref: op.ref, ...(op.etag ? { etag: op.etag } : {}) } : undefined);
          const e = entries.get(op.uid);
          if (e) { e.ref = res.ref; if (res.etag) e.etag = res.etag; else delete e.etag; }
        } else {
          await adapter.remove(link.remoteId!, op.ref, op.etag);
        }
      } catch (err) {
        if (err instanceof SignInError) throw err;
        // That one item is tried again next time (its old match stays); the rest go on.
        refused++;
        const old = map.find((m) => m.id === op.uid);
        if (old) entries.set(op.uid, old); else entries.delete(op.uid);
        this.deps.log?.(`calendar ${link.id}: ${op.op} ${op.uid} refused: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (refused && refused === plan.remote.length && plan.remote.length > 0) throw new Error(`the calendar refused all ${refused} changes`);
    // The board was switched meanwhile (its file now holds another board): the rest waits for next time.
    if (this.deps.boardPath() !== path || !this.readLinks().some((l) => l.id === link.id)) return;
    const taskOps = plan.local.filter((o) => o.op === 'updateTask' || o.op === 'unscheduleTask');
    const eventOps: LocalOp[] = plan.local.filter((o) => o.op === 'addEvent' || o.op === 'updateEvent' || o.op === 'deleteEvent');
    if (taskOps.length) { await applyTaskOps(path, taskOps, board); this.deps.notifyBoardChanged(); }
    const newTag = plan.remote.length ? await adapter.changeTag(link.remoteId!) : tag;
    const newMap: MapEntry[] = [...entries.values()];
    const nextRev = Math.max(boardRev, lastRev) + 1;
    let bumped = false;
    this.writeBoard(
      (_b, ls) => ls.map((l) => {
        if (l.id !== link.id) return l;
        const { failures: _f, rev: _r, ...rest } = l;
        const next = { ...rest, map: newMap, events: plan.readOnly, state: 'ok' as const, ...(newTag ? { ctag: newTag } : {}) };
        const { failures: _f2, rev: _r2, ...was } = l;
        if (JSON.stringify(next) === JSON.stringify(was)) return l;
        bumped = true;
        return { ...next, rev: nextRev };
      }),
      eventOps.length ? (st) => applyEventOps(st, eventOps) : undefined,
      link.id,
    );
    if (bumped) { this.store.revs = { ...(this.store.revs ?? {}), [link.id]: nextRev }; this.writeStore(); }
  }

  // ── checking ──────────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const now = this.now();
    // A KRNL0 two-way calendar shown as an outside calendar (an earlier build offered them): taken off.
    // A Google main calendar still named after the email (an earlier build): "Google Calendar".
    const cur = this.readLinks();
    if (cur.some((l) => (l.role === 'read' && isKrnlCalendar(l.name)) || (l.kind === 'google' && l.role === 'read' && l.name === l.remoteId && l.name === l.account))) {
      this.writeLinks((ls) => ls
        .filter((l) => !(l.role === 'read' && isKrnlCalendar(l.name)))
        .map((l) => (l.kind === 'google' && l.role === 'read' && l.name === l.remoteId && l.name === l.account ? { ...l, name: 'Google Calendar' } : l)));
    }
    for (const l of this.readLinks()) {
      if (!l.on || !this.here(l) || l.state === 'signedOut') continue;
      const at = this.seen.get(l.id)?.checkedAt ?? l.checkedAt;
      const last = at ? new Date(at).getTime() : 0;
      const every = l.kind === 'ics' ? CHECK_EVERY_MS : l.role === 'mirror' ? MIRROR_EVERY_MS : ACCOUNT_READ_EVERY_MS;
      if (now - last >= every) await this.checkOne(l.id);
    }
  }

  /** Fetch one link and write what changed. `force` skips the ETag (Check now). */
  private async checkOne(id: string, force = false): Promise<void> {
    if (this.busy.has(id)) return;
    const acct = this.readLinks().find((l) => l.id === id);
    if (acct && acct.kind !== 'ics') { await this.checkAccountLink(acct); return; }
    const url = this.urlOf(id);
    const link = this.readLinks().find((l) => l.id === id);
    if (!url || !link) return;
    this.busy.add(id);
    try {
      const got = await this.fetchIcs(url, force || !link.events.length ? undefined : { ...(link.etag ? { etag: link.etag } : {}), ...(link.lastModified ? { lastModified: link.lastModified } : {}) });
      const stamp = new Date(this.now()).toISOString();
      let events: LinkedEvent[] | null = null;
      let state: CalendarLink['state'] = 'ok';
      if (got.status === 'ok') {
        const read = readIcs(got.text, link.timeZone || this.zone(), this.now());
        if ('error' in read) state = 'notCalendar'; else events = read.events;
      }
      const prev = this.seen.get(id);
      this.seen.set(id, { checkedAt: stamp, okAt: got.status === 'failed' || state !== 'ok' ? prev?.okAt ?? link.okAt : stamp });
      // NF7 — the board changes only when what it shows changes (events, state,
      // failures); the check times live here, so an unchanged calendar is no write.
      const without = (l: CalendarLink) => { const { checkedAt: _c, okAt: _o, etag: _e, lastModified: _m, ...r } = l; return JSON.stringify(r); };
      this.writeLinks((ls) => ls.map((l) => {
        if (l.id !== id) return l;
        let next: CalendarLink;
        if (got.status === 'failed') {
          const failures = (l.failures ?? 0) + 1;
          next = { ...l, failures, state: failures >= FAILS_BEFORE_UNREACHABLE ? 'unreachable' : l.state ?? 'ok' };
        } else {
          const { failures: _f, ...rest } = l;
          if (got.status === 'notModified') next = { ...rest, state: 'ok' };
          else if (state === 'notCalendar') next = { ...rest, state };
          else next = { ...rest, state: 'ok', events: events ?? [], ...(got.etag ? { etag: got.etag } : {}), ...(got.lastModified ? { lastModified: got.lastModified } : {}) };
        }
        if (without(next) === without(l)) return l;
        return { ...next, checkedAt: stamp, ...(next.state === 'ok' ? { okAt: stamp } : {}) };
      }));
    } catch (err) {
      this.deps.log?.(`calendar link ${id}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy.delete(id);
    }
  }
}

const googleHelp = "This is Google's page for sharing a calendar, not the calendar file. In the calendar's settings, copy \"Secret address in iCal format\" instead: it ends in .ics.";
