/** Decision 64 P2 — sign in to an account, show its calendars, keep a KRNL0 calendar there the same both ways. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CalendarLinkService, normalizeAppPassword } from '../../../src/main/calendars/service';
import { seedBoard } from '../../../src/main/persistence/board';
import type { RemoteAdapter, RemoteCal } from '../../../src/main/calendars/remote';
import { SignInError } from '../../../src/main/calendars/remote';
import type { MirrorItem, RemoteItem } from '../../../src/shared/calsync/mirror';
import type { LinkedEvent } from '../../../src/shared/calsync/types';
import { SysFacade } from '../../../src/sys/SysFacade';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

/** A pretend iCloud account: calendars in memory. */
class FakeAccount implements RemoteAdapter {
  cals: RemoteCal[] = [{ id: 'work', name: 'Work', color: '#9c8ec4' }, { id: 'family', name: 'Family' }];
  store = new Map<string, Map<string, { item: MirrorItem; etag: string }>>();
  readOnlyEvents: LinkedEvent[] = [{ id: 'call@1', title: 'Team call', start: '2026-11-23T09:00', end: '2026-11-23T09:30' }];
  tag = 1;
  password = 'abcd-efgh-ijkl-mnop';
  constructor(public given: string) {}
  async listCalendars() { if (this.given !== this.password) throw new SignInError('no'); return this.cals; }
  async ensureCalendar(name: string) {
    let c = this.cals.find((x) => x.name === name);
    if (!c) { c = { id: `cal-${name}`, name }; this.cals.push(c); }
    return c;
  }
  async changeTag() { return String(this.tag); }
  private objs(cal: string) { return this.store.get(cal) ?? this.store.set(cal, new Map()).get(cal)!; }
  async listMirror(cal: string): Promise<RemoteItem[]> {
    return [...this.objs(cal).entries()].map(([ref, o]) => ({ uid: o.item.uid, ref, etag: o.etag, item: o.item, readOnly: [] }));
  }
  async put(cal: string, item: MirrorItem, _tz: string, existing?: { ref: string }) {
    const ref = existing?.ref ?? `${cal}/${item.uid}.ics`;
    this.objs(cal).set(ref, { item, etag: `"${++this.tag}"` });
    return { ref, etag: `"${this.tag}"` };
  }
  async remove(cal: string, ref: string) { this.objs(cal).delete(ref); this.tag++; }
  async readEvents() { return this.readOnlyEvents; }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'krnl-acct-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()));
  let fake: FakeAccount | null = null;
  const svc = new CalendarLinkService({
    boardPath: () => boardPath,
    userDataDir: dir,
    secrets: { available: () => true, seal: (t) => Buffer.from(t).toString('base64'), open: (s) => Buffer.from(s, 'base64').toString() },
    notifyBoardChanged: vi.fn(),
    timeZone: () => 'Europe/Berlin',
    adapterFactory: (acct) => {
      const pw = acct.kind === 'caldav' ? acct.password : '';
      if (!fake) fake = new FakeAccount(pw); else fake.given = pw;
      return fake;
    },
  });
  type B = { calendarLinks?: Array<Record<string, unknown>>; nodes: Array<{ kind: string; isMother?: boolean; state: { habits?: Array<{ id: string; name: string; icsUid?: string; kind?: string; startsOn?: string }> } }> };
  const board = () => JSON.parse(readFileSync(boardPath, 'utf8')) as B;
  const habits = () => board().nodes.find((n) => n.kind === 'habit' && n.isMother)!.state.habits!;
  const sync = async () => { for (const l of svc.list()) await svc.check(String(l.id)); };
  return { svc, board, habits, fake: () => fake!, sync, boardPath };
}

describe('app passwords', () => {
  it('accepts Apple\'s format in any spacing, refuses a normal password', () => {
    expect(normalizeAppPassword('ABCD EFGH IJKL MNOP')).toBe('abcd-efgh-ijkl-mnop');
    expect(normalizeAppPassword('abcdefghijklmnop')).toBe('abcd-efgh-ijkl-mnop');
    expect(normalizeAppPassword('MyDog2024!')).toBeNull();
  });
});

describe('iCloud account', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => { env = setup(); });

  it('F6: a normal password is refused before Apple is asked; a wrong app password says so', async () => {
    const r1 = await env.svc.connectApple('me@icloud.com', 'MyDog2024!');
    expect(r1).toMatchObject({ ok: false, reason: 'notAppPassword' });
    const r2 = await env.svc.connectApple('me@icloud.com', 'zzzz-zzzz-zzzz-zzzz');
    expect(r2).toMatchObject({ ok: false, reason: 'signIn' });
  });

  it('F6, F9, F10: sign in, show two calendars, and keep KRNL0 the same both ways', async () => {
    const res = await env.svc.connectApple('me@icloud.com', 'abcd efgh ijkl mnop');
    if (!res.ok) throw new Error(res.message);
    expect(res.calendars.map((c) => c.name)).toEqual(['Work', 'Family']);
    // An event on the board before signing in.
    expect((await new SysFacade({ boardPath: env.boardPath }).run(['event', 'add', 'Dentist', '--on', '2026-11-27', '--at', '15:00', '--for', '60'])).ok).toBe(true);
    const added = await env.svc.addAccountCalendars(res.accountId, res.calendars.map((c) => c.id), true);
    expect(added.ok).toBe(true);
    const links = env.board().calendarLinks!;
    expect(links.filter((l) => l['role'] === 'read')).toHaveLength(2);
    const mirror = links.find((l) => l['role'] === 'mirror')!;
    expect(mirror['name']).toBe('KRNL0');
    // Read-only calendars brought their events.
    expect((links.find((l) => l['name'] === 'Work')!['events'] as unknown[]).length).toBe(1);
    // The board's event went to the KRNL0 calendar.
    const sent = await env.fake().listMirror('cal-KRNL0');
    expect(sent.map((r) => r.item!.name)).toEqual(['Dentist']);
    // Nothing secret on the board.
    expect(readFileSync(env.boardPath, 'utf8')).not.toContain('abcd-efgh');

    // Made on the phone: becomes a KRNL0 event (never a task).
    await env.fake().put('cal-KRNL0', { id: 'phone-1', uid: 'phone-1', name: 'Haircut', repeat: { kind: 'weekly', days: [6] }, at: '11:00', lengthMin: 45, startsOn: '2026-11-28', endsOn: '2026-11-28', skips: [], moved: [] }, 'Europe/Berlin');
    await env.sync();
    const haircut = env.habits().find((h) => h.icsUid === 'phone-1');
    expect(haircut).toMatchObject({ name: 'Haircut', kind: 'routine', startsOn: '2026-11-28' });

    // Moved on the phone: the board follows.
    const dentist = (await env.fake().listMirror('cal-KRNL0')).find((r) => r.item!.name === 'Dentist')!;
    await env.fake().put('cal-KRNL0', { ...dentist.item!, at: '16:00' }, 'Europe/Berlin', { ref: dentist.ref });
    await env.sync();
    const d = env.board().nodes.find((n) => n.kind === 'habit' && n.isMother)!.state.habits!.find((h) => h.name === 'Dentist') as unknown as { schedule: { timeOfDay: string } };
    expect(d.schedule.timeOfDay).toBe('16:00');

    // Deleted on the phone: gone from the board too.
    await env.fake().remove('cal-KRNL0', dentist.ref);
    await env.sync();
    expect(env.habits().some((h) => h.name === 'Dentist')).toBe(false);
  });

  it('F19: a sign-in that stopped working says "sign in again"; signing out forgets it all', async () => {
    const res = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!res.ok) throw new Error(res.message);
    await env.svc.addAccountCalendars(res.accountId, ['work'], false);
    env.fake().password = 'other-pass-word-xxxx';
    // Its adapter is cached; a new one sees the new password rule.
    (env.svc as unknown as { adapters: Map<string, unknown> }).adapters.clear();
    env.fake().readEvents = async () => { throw new SignInError('expired'); };
    env.fake().tag++; // something changed there, so it is read

    await env.sync();
    expect(env.board().calendarLinks![0]!['state']).toBe('signedOut');
    const out = await env.svc.signOut('me@icloud.com');
    expect(out.ok).toBe(true);
    expect(env.board().calendarLinks).toBeUndefined();
  });

  it('NF7: a calendar without a change tag (Google) is read each time, but the board is written only when its events change', async () => {
    const res = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!res.ok) throw new Error(res.message);
    await env.svc.addAccountCalendars(res.accountId, ['work'], false);
    env.fake().changeTag = async () => null;
    const saved = readFileSync(env.boardPath, 'utf8');
    await env.sync();
    await env.sync();
    expect(readFileSync(env.boardPath, 'utf8')).toBe(saved);
    env.fake().readOnlyEvents = [...env.fake().readOnlyEvents, { id: 'new@1', title: 'Lunch', start: '2026-11-24T12:00', end: '2026-11-24T13:00' }];
    await env.sync();
    expect((env.board().calendarLinks![0]!['events'] as unknown[]).length).toBe(2);
  });

  it('a board switched while a sync waits on the network gets nothing of it', async () => {
    const res = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!res.ok) throw new Error(res.message);
    await env.svc.addAccountCalendars(res.accountId, [], true);
    await env.fake().put('cal-KRNL0', { id: 'p', uid: 'phone-2', name: 'Dinner', repeat: { kind: 'weekly', days: [5] }, at: '19:00', lengthMin: 60, startsOn: '2026-11-27', endsOn: '2026-11-27', skips: [], moved: [] }, 'Europe/Berlin');
    // While the calendar is being read, the window switches to another board (no calendar links on it).
    const real = env.fake().listMirror.bind(env.fake());
    env.fake().listMirror = async (cal: string) => {
      const out = await real(cal);
      const other = JSON.parse(readFileSync(env.boardPath, 'utf8')) as Record<string, unknown>;
      delete other['calendarLinks'];
      writeFileSync(env.boardPath, JSON.stringify(other));
      return out;
    };
    await (env.svc as unknown as { checkOne(id: string, force?: boolean): Promise<void> }).checkOne(String((await env.svc.list()).find((l) => l.role === 'mirror')!.id), true);
    expect(env.habits().some((h) => h.name === 'Dinner')).toBe(false);
  });

  it('a save here that changes nothing the calendar holds makes no call', async () => {
    const res = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!res.ok) throw new Error(res.message);
    await env.svc.addAccountCalendars(res.accountId, [], true);
    const spy = vi.spyOn(env.fake(), 'listMirror');
    const mirror = env.svc.list().find((l) => l.role === 'mirror')!;
    await (env.svc as unknown as { checkAccountLink(l: unknown, only: boolean): Promise<void> }).checkAccountLink(mirror, true);
    expect(spy).not.toHaveBeenCalled();
  });
});
