// Decision 64 P4 — Google Calendar: "Sign in with Google" (OAuth for installed
// apps: the browser opens, Google sends the owner back to 127.0.0.1, PKCE) and
// the Calendar API (free). The OAuth client of the owner's Google Cloud project
// comes from the build (KRNL0_GOOGLE_CLIENT_ID / _SECRET; for an installed app
// the "secret" is not secret, Google says so) — without one, Google sign-in
// says it is not set up in this build.

import { createHash, randomBytes } from 'crypto';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import ICAL from 'ical.js';
import { utcToWall, wallToUtc } from '../../shared/calsync/ics';
import type { ExportEvent } from '../../shared/calsync/krnlIcs';
import type { MirrorItem, RemoteItem } from '../../shared/calsync/mirror';
import type { LinkedEvent } from '../../shared/calsync/types';
import { SignInError, type RemoteAdapter, type RemoteCal } from './remote';

declare const __KRNL0_GOOGLE_CLIENT__: { id: string; secret: string } | undefined;

const SCOPE = 'openid email https://www.googleapis.com/auth/calendar';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleClient { id: string; secret: string }

/** The owner's OAuth client (environment first, then the build). Null: Google sign-in is not set up. */
export function googleClient(): GoogleClient | null {
  const envId = process.env['KRNL0_GOOGLE_CLIENT_ID'];
  if (envId) return { id: envId, secret: process.env['KRNL0_GOOGLE_CLIENT_SECRET'] ?? '' };
  const built = typeof __KRNL0_GOOGLE_CLIENT__ !== 'undefined' ? __KRNL0_GOOGLE_CLIENT__ : undefined;
  return built && built.id ? built : null;
}

export interface GoogleTokens {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const DONE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>KRNL0</title></head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#ebe1c2;color:#1a1612;font-family:system-ui,sans-serif">
<div style="text-align:center"><h1 style="font-size:22px;margin:0 0 8px">You're signed in</h1><p style="margin:0;color:#554b38">Go back to KRNL0. You can close this tab.</p></div></body></html>`;
const FAIL_PAGE = DONE_PAGE.replace("You're signed in", 'Sign-in did not finish').replace('Go back to KRNL0. You can close this tab.', 'Go back to KRNL0 and try again.');

/**
 * F8 — opens Google's sign-in in the browser and waits (5 minutes at most) for
 * Google to send the owner back to this computer. Returns the account's email
 * and tokens.
 */
export async function signInGoogle(openBrowser: (url: string) => Promise<unknown>, fetchFn: typeof fetch = fetch): Promise<GoogleTokens & { email: string }> {
  const client = googleClient();
  if (!client) throw new Error('Google sign-in is not set up in this KRNL0 build yet.');
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  let server: Server | null = null;
  try {
    const { code, redirect } = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Google sign-in took too long. Try again.')), 5 * 60_000);
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
        const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(ok ? DONE_PAGE : FAIL_PAGE);
        clearTimeout(timer);
        if (!ok) { reject(new Error(url.searchParams.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in did not finish.')); return; }
        const port = (server!.address() as AddressInfo).port;
        resolve({ code: url.searchParams.get('code')!, redirect: `http://127.0.0.1:${port}/callback` });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = (server!.address() as AddressInfo).port;
        const q = new URLSearchParams({
          client_id: client.id, redirect_uri: `http://127.0.0.1:${port}/callback`, response_type: 'code', scope: SCOPE,
          code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent',
        });
        openBrowser(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`).catch((err) => { clearTimeout(timer); reject(err); });
      });
      server.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    const res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }).toString(),
    });
    const j = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error_description?: string };
    if (!res.ok || !j.refresh_token) throw new Error(j.error_description ?? 'Google did not give KRNL0 access.');
    let email = 'Google account';
    try {
      const payload = JSON.parse(Buffer.from((j.id_token ?? '').split('.')[1] ?? '', 'base64').toString('utf8')) as { email?: string };
      if (payload.email) email = payload.email;
    } catch { /* keep the generic name */ }
    return { email, refreshToken: j.refresh_token, ...(j.access_token ? { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 } : {}) };
  } finally {
    (server as Server | null)?.close();
  }
}

interface GEvent {
  id: string;
  iCalUID?: string;
  etag?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string };
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const clampLen = (min: number) => Math.min(720, Math.max(5, Math.round(min)));

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}
function addMin(date: string, at: string, min: number): { date: string; at: string } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d, Number(at.slice(0, 2)), Number(at.slice(3, 5)) + min));
  return { date: t.toISOString().slice(0, 10), at: t.toISOString().slice(11, 16) };
}
/** A Google time → wall clock in `tz` (`YYYY-MM-DDTHH:MM`), or a date for all-day. */
function wallOfG(t: { date?: string; dateTime?: string } | undefined, tz: string): string | null {
  if (!t) return null;
  if (t.dateTime) return utcToWall(Date.parse(t.dateTime), tz);
  return t.date ?? null;
}
const local = (date: string, at: string) => `${date.replace(/-/g, '')}T${at.replace(':', '')}00`;

export class GoogleAdapter implements RemoteAdapter {
  constructor(private tokens: GoogleTokens, private readonly fetchFn: typeof fetch = fetch) {}

  private async token(force = false): Promise<string> {
    if (!force && this.tokens.accessToken && (this.tokens.expiresAt ?? 0) > Date.now() + 60_000) return this.tokens.accessToken;
    const client = googleClient();
    if (!client) throw new SignInError('Google sign-in is not set up in this KRNL0 build.');
    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: this.tokens.refreshToken, grant_type: 'refresh_token' }).toString(),
    });
    const j = await res.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !j.access_token) {
      if (j.error === 'invalid_grant') throw new SignInError('Google sign-in expired: sign in again.');
      throw new Error(`Google answered ${res.status}`);
    }
    this.tokens = { ...this.tokens, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  private async api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.fetchFn(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await this.token(attempt > 0)}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204 || (method === 'DELETE' && (res.status === 404 || res.status === 410))) return undefined as T;
      if (!res.ok) throw new Error(`Google answered ${res.status}`);
      return await res.json() as T;
    }
    throw new SignInError('Google sign-in expired: sign in again.');
  }

  private async pages(path: string): Promise<GEvent[]> {
    const out: GEvent[] = [];
    let token: string | undefined;
    for (let i = 0; i < 40; i++) {
      const sep = path.includes('?') ? '&' : '?';
      const page = await this.api<{ items?: GEvent[]; nextPageToken?: string }>('GET', `${path}${token ? `${sep}pageToken=${encodeURIComponent(token)}` : ''}`);
      out.push(...(page.items ?? []));
      token = page.nextPageToken;
      if (!token) break;
    }
    return out;
  }

  async listCalendars(): Promise<RemoteCal[]> {
    const j = await this.api<{ items?: Array<{ id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; accessRole?: string; primary?: boolean }> }>('GET', '/users/me/calendarList?maxResults=250');
    return (j.items ?? []).map((c) => ({
      // The main calendar is named after the email; people call it Google Calendar.
      id: c.id, name: c.summaryOverride ?? (c.primary ? 'Google Calendar' : c.summary ?? c.id),
      ...(c.backgroundColor ? { color: c.backgroundColor } : {}),
      readOnly: c.accessRole !== 'owner' && c.accessRole !== 'writer',
    }));
  }

  async ensureCalendar(name: string, timeZone: string): Promise<RemoteCal> {
    const found = (await this.listCalendars()).find((c) => c.name === name && !c.readOnly);
    if (found) return found;
    const made = await this.api<{ id: string; summary: string }>('POST', '/calendars', { summary: name, timeZone });
    return { id: made.id, name: made.summary };
  }

  async changeTag(): Promise<string | null> {
    return null;
  }

  private toItem(master: GEvent, exceptions: GEvent[], tz: string): MirrorItem | null {
    const uid = master.iCalUID ?? master.id;
    const s = wallOfG(master.start, tz);
    const e = wallOfG(master.end, tz);
    if (!s || !master.start?.dateTime) return null; // all-day: read-only
    const lengthMin = clampLen(e && e.length > 10 ? (Date.parse(`${e}:00`) - Date.parse(`${s}:00`)) / 60_000 : 60);
    const date = s.slice(0, 10);
    const base = { id: uid, uid, name: (master.summary ?? '').trim() || '(no title)', ...(master.location ? { place: master.location.trim() } : {}), at: s.slice(11, 16), lengthMin, skips: [] as string[], moved: [] as Array<{ date: string; at: string }> };
    if (!master.recurrence?.length) return { ...base, repeat: { kind: 'weekly', days: [isoDow(date)] }, startsOn: date, endsOn: date };
    const rrule = master.recurrence.find((l) => l.startsWith('RRULE:'));
    if (!rrule || master.recurrence.some((l) => l.startsWith('RDATE'))) return null;
    let rule: InstanceType<typeof ICAL.Recur>;
    try { rule = ICAL.Recur.fromString(rrule.slice(6)); } catch { return null; }
    const parts = (rule.parts ?? {}) as Record<string, unknown[] | undefined>;
    const keys = Object.keys(parts).filter((k) => (parts[k]?.length ?? 0) > 0);
    const byDay = (parts['BYDAY'] ?? []) as string[];
    const simple = (rule.interval ?? 1) === 1 && !rule.count
      && ((rule.freq === 'DAILY' && keys.length === 0) || (rule.freq === 'WEEKLY' && keys.every((k) => k === 'BYDAY') && byDay.every((d) => DAY_CODES.includes(d))));
    if (!simple) return null;
    const skips: string[] = [];
    for (const line of master.recurrence.filter((l) => l.startsWith('EXDATE'))) {
      const tzid = /TZID=([^;:]+)/.exec(line)?.[1] ?? master.start.timeZone ?? tz;
      for (const v of line.slice(line.indexOf(':') + 1).split(',')) {
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/.exec(v.trim());
        if (!m) continue;
        if (!m[4]) { skips.push(`${m[1]}-${m[2]}-${m[3]}`); continue; }
        const ms = m[6] ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4], +m[5]!) : wallToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4], +m[5]!, tzid);
        skips.push(utcToWall(ms, tz).slice(0, 10));
      }
    }
    const moved: Array<{ date: string; at: string }> = [];
    for (const ex of exceptions) {
      const orig = wallOfG(ex.originalStartTime, tz);
      if (!orig) continue;
      const origDate = orig.slice(0, 10);
      if (ex.status === 'cancelled') { skips.push(origDate); continue; }
      const ns = wallOfG(ex.start, tz);
      if (ns && ns.length > 10 && ns.slice(0, 10) === origDate) moved.push({ date: origDate, at: ns.slice(11, 16) });
      else skips.push(origDate);
    }
    const until = rule.until ? (rule.until.isDate ? `${rule.until.year}-${pad(rule.until.month)}-${pad(rule.until.day)}` : utcToWall(Date.UTC(rule.until.year, rule.until.month - 1, rule.until.day, rule.until.hour, rule.until.minute), tz).slice(0, 10)) : undefined;
    const repeat: ExportEvent['repeat'] = rule.freq === 'DAILY' ? { kind: 'daily' } : { kind: 'weekly', days: byDay.length ? [...new Set(byDay.map((d) => DAY_CODES.indexOf(d) + 1))].sort() : [isoDow(date)] };
    return { ...base, repeat, startsOn: date, ...(until ? { endsOn: until } : {}), skips: [...new Set(skips)].sort(), moved };
  }

  private toLinked(ev: GEvent, tz: string): LinkedEvent | null {
    if (ev.status === 'cancelled') return null;
    const s = wallOfG(ev.start, tz);
    const e = wallOfG(ev.end, tz);
    if (!s) return null;
    const title = (ev.summary ?? '').trim() || '(no title)';
    const place = ev.location?.trim();
    if (s.length === 10) return { id: `${ev.iCalUID ?? ev.id}@${s}`, title, start: s, end: e && e > s ? e : s, allDay: true, ...(place ? { place } : {}) };
    return { id: `${ev.iCalUID ?? ev.id}@${s}`, title, start: s, end: e && e.length > 10 ? e : s, ...(place ? { place } : {}) };
  }

  async listMirror(calId: string, timeZone: string, nowMs: number): Promise<RemoteItem[]> {
    const all = await this.pages(`/calendars/${encodeURIComponent(calId)}/events?singleEvents=false&showDeleted=true&maxResults=2500`);
    const exByMaster = new Map<string, GEvent[]>();
    for (const ev of all) if (ev.recurringEventId) (exByMaster.get(ev.recurringEventId) ?? exByMaster.set(ev.recurringEventId, []).get(ev.recurringEventId)!).push(ev);
    const out: RemoteItem[] = [];
    for (const ev of all) {
      if (ev.recurringEventId || ev.status === 'cancelled') continue;
      const item = this.toItem(ev, exByMaster.get(ev.id) ?? [], timeZone);
      let readOnly: LinkedEvent[] = [];
      if (!item) {
        if (ev.recurrence?.length) {
          const day = 86_400_000;
          const inst = await this.pages(`/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ev.id)}/instances?timeMin=${encodeURIComponent(new Date(nowMs - 366 * day).toISOString())}&timeMax=${encodeURIComponent(new Date(nowMs + 366 * day).toISOString())}&maxResults=2500`);
          readOnly = inst.map((x) => this.toLinked(x, timeZone)).filter((x): x is LinkedEvent => !!x);
        } else {
          const one = this.toLinked(ev, timeZone);
          readOnly = one ? [one] : [];
        }
      }
      out.push({ uid: ev.iCalUID ?? ev.id, ref: ev.id, ...(ev.etag ? { etag: ev.etag } : {}), item, readOnly });
    }
    return out;
  }

  async put(calId: string, item: MirrorItem, timeZone: string, existing?: { ref: string; etag?: string }): Promise<{ ref: string; etag?: string }> {
    const once = !!item.endsOn && item.endsOn === item.startsOn;
    let first = item.startsOn;
    const days = item.repeat.kind === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : item.repeat.kind === 'weekdays' ? [1, 2, 3, 4, 5] : item.repeat.days;
    if (!once) for (let i = 0; i < 7 && !days.includes(isoDow(first)); i++) first = addMin(first, '00:00', 1440).date;
    const end = addMin(first, item.at, item.lengthMin);
    const body: Record<string, unknown> = {
      iCalUID: item.uid,
      summary: item.name,
      ...(item.place ? { location: item.place } : {}),
      start: { dateTime: `${first}T${item.at}:00`, timeZone },
      end: { dateTime: `${end.date}T${end.at}:00`, timeZone },
    };
    if (!once) {
      const byDay = item.repeat.kind === 'daily' ? '' : `;BYDAY=${[...days].sort().map((d) => DAY_CODES[d - 1]).join(',')}`;
      const until = item.endsOn ? `;UNTIL=${new Date(wallToUtc(+item.endsOn.slice(0, 4), +item.endsOn.slice(5, 7), +item.endsOn.slice(8, 10), 23, 59, timeZone)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}` : '';
      const skips = item.skips.filter((d) => d >= first);
      body['recurrence'] = [`RRULE:FREQ=${item.repeat.kind === 'daily' ? 'DAILY' : 'WEEKLY'}${byDay}${until}`, ...(skips.length ? [`EXDATE;TZID=${timeZone}:${skips.map((d) => local(d, item.at)).join(',')}`] : [])];
    }
    const cal = encodeURIComponent(calId);
    let saved: GEvent;
    if (existing?.ref) {
      saved = await this.api<GEvent>('PUT', `/calendars/${cal}/events/${encodeURIComponent(existing.ref)}`, body, existing.etag ? { 'If-Match': existing.etag } : {});
    } else {
      try {
        saved = await this.api<GEvent>('POST', `/calendars/${cal}/events/import`, body);
      } catch (err) {
        // Google keeps a deleted event's UID: made again (an edit beat a delete, or sending was
        // turned back on), the import is refused. The deleted one is brought back instead.
        if (!/answered 409/.test(err instanceof Error ? err.message : '')) throw err;
        const found = await this.api<{ items?: GEvent[] }>('GET', `/calendars/${cal}/events?iCalUID=${encodeURIComponent(item.uid)}&showDeleted=true`);
        const old = (found.items ?? []).find((e) => !e.recurringEventId);
        if (!old) throw err;
        saved = await this.api<GEvent>('PUT', `/calendars/${cal}/events/${encodeURIComponent(old.id)}`, { ...body, status: 'confirmed' });
      }
    }
    // A day moved to another time: that one occurrence changes.
    for (const m of once ? [] : item.moved) {
      if (m.date < first || item.skips.includes(m.date)) continue;
      const orig = new Date(wallToUtc(+m.date.slice(0, 4), +m.date.slice(5, 7), +m.date.slice(8, 10), +item.at.slice(0, 2), +item.at.slice(3, 5), timeZone)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const e2 = addMin(m.date, m.at, item.lengthMin);
      try {
        await this.api('PATCH', `/calendars/${cal}/events/${encodeURIComponent(`${saved.id}_${orig}`)}`, { start: { dateTime: `${m.date}T${m.at}:00`, timeZone }, end: { dateTime: `${e2.date}T${e2.at}:00`, timeZone } });
      } catch { /* that day stays as it was */ }
    }
    return { ref: saved.id, ...(saved.etag ? { etag: saved.etag } : {}) };
  }

  async remove(calId: string, ref: string): Promise<void> {
    await this.api('DELETE', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ref)}`);
  }

  async readEvents(calId: string, timeZone: string, nowMs: number): Promise<LinkedEvent[]> {
    const day = 86_400_000;
    const evs = await this.pages(`/calendars/${encodeURIComponent(calId)}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(new Date(nowMs - 366 * day).toISOString())}&timeMax=${encodeURIComponent(new Date(nowMs + 366 * day).toISOString())}`);
    return evs.map((e) => this.toLinked(e, timeZone)).filter((x): x is LinkedEvent => !!x).sort((a, b) => a.start.localeCompare(b.start));
  }

  /** The access token now in use (the service keeps the refresh token only). */
  current(): GoogleTokens { return this.tokens; }
}
