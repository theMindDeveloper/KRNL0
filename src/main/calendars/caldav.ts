// Decision 64 P2 — iCloud (caldav.icloud.com) and any CalDAV server, through
// tsdav (MIT). iCloud wants the Apple ID and an app-specific password (Basic
// auth); tsdav finds the account's own server (p…-caldav.icloud.com) itself.

import { randomUUID } from 'crypto';
import { DAVClient, type DAVCalendar } from 'tsdav';
import { readIcs } from '../../shared/calsync/ics';
import { icsToMirror, mirrorToIcs } from '../../shared/calsync/krnlIcs';
import type { MirrorItem, RemoteItem } from '../../shared/calsync/mirror';
import type { LinkedEvent } from '../../shared/calsync/types';
import { SignInError, type RemoteAdapter, type RemoteCal } from './remote';

export const ICLOUD_SERVER = 'https://caldav.icloud.com';

const nameOf = (c: DAVCalendar): string => (typeof c.displayName === 'string' && c.displayName.trim() ? c.displayName.trim() : 'Calendar');
const holdsEvents = (c: DAVCalendar): boolean => !c.components || c.components.length === 0 || c.components.includes('VEVENT');

/** "abc-def.ics" safe file name for a UID. */
function fileFor(uid: string): string {
  return `${uid.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)}.ics`;
}

export class CalDavAdapter implements RemoteAdapter {
  private client: DAVClient | null = null;
  private cals: DAVCalendar[] = [];

  constructor(private readonly server: string, private readonly username: string, private readonly password: string, private readonly fetchFn?: typeof fetch) {}

  private async connect(): Promise<DAVClient> {
    if (this.client) return this.client;
    const c = new DAVClient({
      serverUrl: this.server,
      credentials: { username: this.username, password: this.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
      ...(this.fetchFn ? { fetch: this.fetchFn } : {}),
    });
    try {
      await c.login();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|403|unauthori[sz]ed|invalid credentials|forbidden/i.test(msg)) throw new SignInError('The account did not accept this email and password.');
      throw err;
    }
    this.client = c;
    return c;
  }

  private async calendars(refresh = false): Promise<DAVCalendar[]> {
    const c = await this.connect();
    if (refresh || !this.cals.length) this.cals = await c.fetchCalendars();
    return this.cals;
  }

  private async cal(id: string): Promise<DAVCalendar> {
    let found = (await this.calendars()).find((c) => c.url === id);
    if (!found) found = (await this.calendars(true)).find((c) => c.url === id);
    if (!found) throw new Error('This calendar is no longer in the account.');
    return found;
  }

  async listCalendars(): Promise<RemoteCal[]> {
    return (await this.calendars(true)).filter(holdsEvents).map((c) => ({
      id: c.url,
      name: nameOf(c),
      ...(typeof c.calendarColor === 'string' ? { color: c.calendarColor } : {}),
    }));
  }

  async ensureCalendar(name: string, _timeZone: string): Promise<RemoteCal> {
    const existing = (await this.calendars(true)).find((c) => nameOf(c) === name && holdsEvents(c));
    if (existing) return { id: existing.url, name };
    const client = await this.connect();
    const home = client.account?.homeUrl;
    if (!home) throw new Error('The account did not say where its calendars live.');
    const url = `${home.endsWith('/') ? home : `${home}/`}${randomUUID()}/`;
    await client.makeCalendar({
      url,
      props: {
        'd:displayname': name,
        'c:supported-calendar-component-set': { 'c:comp': { _attributes: { name: 'VEVENT' } } },
        'ca:calendar-color': '#C9F158',
      },
    });
    const made = (await this.calendars(true)).find((c) => c.url === url || nameOf(c) === name);
    if (!made) throw new Error('The calendar could not be made in the account.');
    return { id: made.url, name };
  }

  async changeTag(calId: string): Promise<string | null> {
    const found = (await this.calendars(true)).find((c) => c.url === calId);
    return found?.ctag ?? found?.syncToken ?? null;
  }

  async listMirror(calId: string, timeZone: string, nowMs: number): Promise<RemoteItem[]> {
    const client = await this.connect();
    const objects = await client.fetchCalendarObjects({ calendar: await this.cal(calId) });
    const out: RemoteItem[] = [];
    for (const o of objects) {
      const raw = typeof o.data === 'string' ? o.data : '';
      const read = icsToMirror(raw, timeZone);
      if (!read) continue;
      const shown = read.item ? [] : (() => { const r = readIcs(raw, timeZone, nowMs); return 'error' in r ? [] : r.events; })();
      out.push({ uid: read.uid, ref: o.url, ...(o.etag ? { etag: o.etag } : {}), item: read.item, readOnly: shown });
    }
    return out;
  }

  async put(calId: string, item: MirrorItem, timeZone: string, existing?: { ref: string; etag?: string }): Promise<{ ref: string; etag?: string }> {
    const client = await this.connect();
    const data = mirrorToIcs(item, timeZone);
    if (existing?.ref) {
      const res = await client.updateCalendarObject({ calendarObject: { url: existing.ref, data, ...(existing.etag ? { etag: existing.etag } : {}) } });
      if (!res.ok && res.status !== 204) throw new Error(`the calendar answered ${res.status}`);
      const etag = res.headers.get('etag') ?? undefined;
      return { ref: existing.ref, ...(etag ? { etag } : {}) };
    }
    const cal = await this.cal(calId);
    const filename = fileFor(item.uid);
    const res = await client.createCalendarObject({ calendar: cal, filename, iCalString: data });
    if (!res.ok && res.status !== 204) throw new Error(`the calendar answered ${res.status}`);
    const base = cal.url.endsWith('/') ? cal.url : `${cal.url}/`;
    const etag = res.headers.get('etag') ?? undefined;
    return { ref: new URL(filename, base).toString(), ...(etag ? { etag } : {}) };
  }

  async remove(_calId: string, ref: string, etag?: string): Promise<void> {
    const client = await this.connect();
    const res = await client.deleteCalendarObject({ calendarObject: { url: ref, ...(etag ? { etag } : {}) } });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`the calendar answered ${res.status}`);
  }

  async readEvents(calId: string, timeZone: string, nowMs: number): Promise<LinkedEvent[]> {
    const client = await this.connect();
    const day = 86_400_000;
    const objects = await client.fetchCalendarObjects({
      calendar: await this.cal(calId),
      timeRange: { start: new Date(nowMs - 366 * day).toISOString(), end: new Date(nowMs + 366 * day).toISOString() },
    });
    const out: LinkedEvent[] = [];
    for (const o of objects) {
      const r = readIcs(typeof o.data === 'string' ? o.data : '', timeZone, nowMs);
      if (!('error' in r)) out.push(...r.events);
    }
    out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
    return out;
  }
}
