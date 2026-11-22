/** Decision 64 / calendar-sync P1 — the desktop runs calendar links (F2, F14, F19, F20, NF3, NF7). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CalendarLinkService } from '../../../src/main/calendars/service';
import { seedBoard } from '../../../src/main/persistence/board';

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Work',
  'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Team call', 'DTSTART;TZID=Europe/Berlin:20261123T090000', 'DTEND;TZID=Europe/Berlin:20261123T093000', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const URL_OK = 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics';

function setup(respond: (url: string, headers: Record<string, string>) => Response) {
  const dir = mkdtempSync(join(tmpdir(), 'krnl-cal-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()));
  const notify = vi.fn();
  const fetchFn = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => respond(url, init?.headers ?? {}));
  let now = Date.UTC(2026, 10, 22, 12, 0);
  const svc = new CalendarLinkService({
    boardPath: () => boardPath,
    userDataDir: dir,
    secrets: { available: () => true, seal: (t) => `sealed:${Buffer.from(t).toString('base64')}`, open: (s) => Buffer.from(s.slice(7), 'base64').toString() },
    notifyBoardChanged: notify,
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => now,
    timeZone: () => 'Europe/Berlin',
  });
  const board = () => JSON.parse(readFileSync(boardPath, 'utf8')) as { calendarLinks?: Array<Record<string, unknown> & { events: unknown[] }>; savedAt: string };
  const secrets = () => JSON.parse(readFileSync(join(dir, 'calendar-links.json'), 'utf8')) as { device: string; links: Record<string, string> };
  return { svc, board, secrets, notify, fetchFn, tick: (ms: number) => { now += ms; }, run: () => (svc as unknown as { tick(): Promise<void> }).tick() };
}

describe('CalendarLinkService', () => {
  let env: ReturnType<typeof setup>;
  let mode: 'ok' | '304' | 'fail' = 'ok';
  beforeEach(() => {
    mode = 'ok';
    env = setup(() => mode === 'fail' ? new Response('nope', { status: 500 }) : mode === '304' ? new Response(null, { status: 304 }) : new Response(ICS, { status: 200, headers: { etag: '"v1"' } }));
  });

  it('F2: add reads the calendar, keeps its address in the keychain only (NF3), and puts its events on the board', async () => {
    const res = await env.svc.add(URL_OK, { name: 'Work' });
    expect(res.ok).toBe(true);
    const link = env.board().calendarLinks![0]!;
    expect(link).toMatchObject({ name: 'Work', provider: 'google', on: true, color: 'lilac', timeZone: 'Europe/Berlin', state: 'ok' });
    expect(link.events).toEqual([{ id: 'a@once', title: 'Team call', start: '2026-11-23T09:00', end: '2026-11-23T09:30' }]);
    expect(JSON.stringify(env.board())).not.toContain('private-y');
    expect(Object.values(env.secrets().links)[0]).toMatch(/^sealed:/);
    expect(env.svc.list()[0]!.here).toBe(true);
  });

  it('preview says what is wrong with a Google sharing page', async () => {
    mode = 'ok';
    const env2 = setup(() => new Response('<html>calendar</html>', { status: 200 }));
    const pre = await env2.svc.preview('https://calendar.google.com/calendar/embed?src=x');
    expect(pre).toMatchObject({ ok: false, reason: 'googleSharePage' });
    expect((await env2.svc.preview('hello')).ok).toBe(false);
  });

  it('NF7: an unchanged calendar is no board write; 15 minutes later it is asked with its ETag', async () => {
    await env.svc.add(URL_OK);
    const saved = env.board().savedAt;
    env.notify.mockClear();
    mode = '304';
    env.tick(16 * 60_000);
    await env.run();
    const last = env.fetchFn.mock.calls.at(-1)!;
    expect((last[1] as { headers: Record<string, string> }).headers['If-None-Match']).toBe('"v1"');
    expect(env.board().savedAt).toBe(saved);
    expect(env.notify).not.toHaveBeenCalled();
    // Not due yet: not fetched at all.
    const calls = env.fetchFn.mock.calls.length;
    env.tick(60_000);
    await env.run();
    expect(env.fetchFn.mock.calls.length).toBe(calls);
  });

  it('F19: after three failed checks in a row it says it no longer answers; the events stay', async () => {
    await env.svc.add(URL_OK);
    mode = 'fail';
    for (let i = 0; i < 3; i++) { env.tick(16 * 60_000); await env.run(); }
    const link = env.board().calendarLinks![0]!;
    expect(link['state']).toBe('unreachable');
    expect(link.events).toHaveLength(1);
    mode = 'ok';
    await env.svc.check(String(link['id']));
    expect(env.board().calendarLinks![0]!['state']).toBe('ok');
  });

  it('set hides and renames; F20: remove forgets the address and takes its events off', async () => {
    await env.svc.add(URL_OK);
    const id = String(env.board().calendarLinks![0]!['id']);
    await env.svc.set('work', { on: false, name: 'Office', color: 'teal' });
    expect(env.board().calendarLinks![0]).toMatchObject({ on: false, name: 'Office', color: 'teal' });
    const res = await env.svc.remove('office');
    expect(res.ok).toBe(true);
    expect(env.board().calendarLinks).toBeUndefined();
    expect(env.secrets().links[id]).toBeUndefined();
  });

  it('F14: a link whose address is on another computer is not checked here', async () => {
    await env.svc.add(URL_OK);
    // A second computer: same board, its own keychain (no address there).
    const svc2 = new CalendarLinkService({
      boardPath: () => (env.svc as unknown as { deps: { boardPath: () => string } }).deps.boardPath(),
      userDataDir: mkdtempSync(join(tmpdir(), 'krnl-cal2-')),
      secrets: { available: () => true, seal: (t) => t, open: (t) => t },
      notifyBoardChanged: () => {},
      fetchFn: (async () => new Response(ICS)) as unknown as typeof fetch,
    });
    expect(svc2.list()[0]!.here).toBe(false);
    expect((await svc2.check()).message).toBe('No calendars to check on this computer.');
  });
});
