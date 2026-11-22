// Decision 64 — calendar sync, the shared part (no Node or Electron imports).
// A board's other calendars: what each link is, and the events it brought in.
// The link's address is NOT here: it works like a password (Google's secret
// address), so it stays in the keychain of the device that checks it.

export type LinkColor = 'lilac' | 'amber' | 'teal' | 'rose' | 'moss' | 'sand';
export const LINK_COLORS: readonly LinkColor[] = ['lilac', 'amber', 'teal', 'rose', 'moss', 'sand'];

export type LinkProvider = 'google' | 'icloud' | 'outlook' | 'caldav' | 'link';
/** Last check: fine, no answer (3 times in a row), or the address is not a calendar file. */
export type LinkState = 'ok' | 'unreachable' | 'notCalendar' | 'signedOut';

/**
 * One occurrence of an event from another calendar. Times are wall-clock in
 * the link's time zone: `YYYY-MM-DDTHH:MM` (timed) or `YYYY-MM-DD` with
 * `allDay` (then `end` is the day after the last day, as in iCalendar).
 */
export interface LinkedEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: true;
  place?: string;
}

/** Decision 64 P2/P4 — what was matched between the board and the KRNL0 calendar (mirror.ts). */
export interface LinkMapEntry {
  id: string;
  key: string;
  ref: string;
  etag?: string;
  l: string;
  r: string;
}

export interface CalendarLink {
  id: string;
  /** 'ics': a calendar link (read-only). 'caldav' (iCloud and others) and 'google': a signed-in account. */
  kind: 'ics' | 'caldav' | 'google';
  /** Account links: the account's email (shown) and the key of its sign-in on the device that runs it. */
  account?: string;
  accountId?: string;
  /** Account links: the calendar in the account (its CalDAV address or Google id). */
  remoteId?: string;
  /** Account links: 'read' shows it read-only; 'mirror' is the KRNL0 calendar, kept the same both ways. */
  role?: 'read' | 'mirror';
  /** Mirror: what was matched last time. */
  map?: LinkMapEntry[];
  /** Mirror: bumped by the runner on every change of `map`. A board whose rev is behind what the
   *  runner last wrote was restored (a backup, `krnl board load`): its map is not trusted. */
  rev?: number;
  /** CalDAV: the calendar's change tag at the last check. */
  ctag?: string;
  name: string;
  color: LinkColor;
  /** Shown on the Calendar. */
  on: boolean;
  provider: LinkProvider;
  /** IANA zone of the device that made it (F18): events are read in it. */
  timeZone: string;
  /** The device that holds the address and checks it (F14). */
  device: string;
  deviceName?: string;
  checkedAt?: string;
  okAt?: string;
  state?: LinkState;
  failures?: number;
  etag?: string;
  lastModified?: string;
  events: LinkedEvent[];
}

/** F2 — a link is checked every 15 minutes. */
export const CHECK_EVERY_MS = 15 * 60_000;
/** F19 — after this many failed checks in a row the link says it no longer answers. */
export const FAILS_BEFORE_UNREACHABLE = 3;
/** F4 — events are kept a year back and a year ahead. */
export const WINDOW_DAYS = 366;
/** A cap so one huge calendar cannot bloat the board. */
export const MAX_EVENTS = 6000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The board's links, read defensively (an older or hand-edited board may hold anything). */
export function linksOf(board: unknown): CalendarLink[] {
  const raw = isObj(board) ? board['calendarLinks'] : undefined;
  if (!Array.isArray(raw)) return [];
  const out: CalendarLink[] = [];
  for (const l of raw) {
    if (!isObj(l) || typeof l['id'] !== 'string' || typeof l['name'] !== 'string') continue;
    const color = LINK_COLORS.includes(l['color'] as LinkColor) ? (l['color'] as LinkColor) : 'lilac';
    const events = Array.isArray(l['events'])
      ? (l['events'] as unknown[]).filter((e): e is LinkedEvent => isObj(e) && typeof e['id'] === 'string' && typeof e['start'] === 'string' && typeof e['end'] === 'string' && typeof e['title'] === 'string')
      : [];
    const kind = l['kind'] === 'caldav' || l['kind'] === 'google' ? l['kind'] : 'ics';
    out.push({ ...(l as unknown as CalendarLink), kind, color, on: l['on'] !== false, events });
  }
  return out;
}

/** `webcal://` → `https://`; only http(s) addresses are calendar links. Null when it is not an address. */
export function normalizeIcsUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^webcals?:\/\//i.test(s) ? s.replace(/^webcals?:\/\//i, 'https://') : s;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function providerOf(url: string): LinkProvider {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'link'; }
  if (host === 'calendar.google.com' || host.endsWith('.google.com')) return 'google';
  if (host === 'icloud.com' || host.endsWith('.icloud.com')) return 'icloud';
  if (host.endsWith('outlook.live.com') || host.endsWith('outlook.office365.com') || host.endsWith('outlook.office.com')) return 'outlook';
  return 'link';
}

export function providerLabel(p: LinkProvider): string {
  return p === 'google' ? 'Google' : p === 'icloud' ? 'iCloud' : p === 'outlook' ? 'Outlook' : p === 'caldav' ? 'CalDAV' : 'Calendar link';
}

/**
 * F2 error help: a Google page for sharing a calendar (not its file). The
 * owner pasted the wrong one of Google's addresses.
 */
export function looksLikeGoogleSharePage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'calendar.google.com' && !/\.ics$/i.test(u.pathname) && !u.pathname.includes('/ical/');
  } catch {
    return false;
  }
}

/** Minutes from midnight of a `YYYY-MM-DDTHH:MM` wall time. */
export function minuteOfDay(wall: string): number {
  const t = wall.slice(11, 16);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** The next day of a `YYYY-MM-DD`. */
export function nextYMD(ymd: string, n = 1): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** A timed event's part on one day, in minutes (end may be 1440). Null when it is not on that day. */
export function partOnDay(ev: LinkedEvent, day: string): { startMin: number; endMin: number; fullStart: string; fullEnd: string } | null {
  if (ev.allDay) return null;
  const sDay = ev.start.slice(0, 10);
  const eDay = ev.end.slice(0, 10);
  if (day < sDay || day > eDay) return null;
  const startMin = day === sDay ? minuteOfDay(ev.start) : 0;
  const endMin = day === eDay ? minuteOfDay(ev.end) : 1440;
  if (endMin <= startMin && !(day === sDay && ev.start === ev.end)) return null;
  return { startMin, endMin: Math.max(endMin, startMin), fullStart: ev.start, fullEnd: ev.end };
}

/** Is an all-day event on this day? (`end` is the day after its last day.) */
export function allDayOn(ev: LinkedEvent, day: string): boolean {
  return !!ev.allDay && ev.start <= day && day < (ev.end > ev.start ? ev.end : nextYMD(ev.start));
}

/** "Google · checked 2 min ago" — the line under a link's name (F1). */
export function linkMeta(link: CalendarLink, nowMs: number, here: boolean): string {
  const src = link.role === 'mirror' ? `${providerLabel(link.provider)} · both ways` : providerLabel(link.provider);
  if (!link.on) return `${src} · hidden`;
  if (link.state === 'notCalendar') return `${src} · this address is not a calendar file`;
  if (link.state === 'unreachable') return `${src} · ${link.kind === 'ics' ? 'this link no longer answers' : 'no answer from the account'}`;
  if (link.state === 'signedOut') return `${src} · sign in again`;
  if (!here) return `${src} · checked on ${link.deviceName ?? 'another computer'}`;
  if (!link.okAt) return `${src} · checking…`;
  const min = Math.max(0, Math.round((nowMs - new Date(link.okAt).getTime()) / 60_000));
  const ago = min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 60 * 24 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
  return `${src} · checked ${ago}`;
}
