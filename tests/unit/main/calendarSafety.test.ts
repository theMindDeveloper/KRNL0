/** Decision 64 — the deep audit (2026-11-22): board switches, notes, refused items, names, and the board's own events and tasks. */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CalendarLinkService } from '../../../src/main/calendars/service';
import { applyEventOps } from '../../../src/main/calendars/local';
import { seedBoard } from '../../../src/main/persistence/board';
import type { RemoteAdapter, RemoteCal } from '../../../src/main/calendars/remote';
import type { MirrorItem, RemoteItem } from '../../../src/shared/calsync/mirror';
import type { Habit, HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

class Fake implements RemoteAdapter {
  cals: RemoteCal[] = [{ id: 'home', name: 'Home' }];
  store = new Map<string, Map<string, MirrorItem>>();
  refuse = new Set<string>();
  async listCalendars() { return this.cals; }
  async ensureCalendar(name: string) { let c = this.cals.find((x) => x.name === name); if (!c) { c = { id: `cal:${name}`, name }; this.cals.push(c); } return c; }
  async changeTag() { return null; }
  private objs(cal: string) { return this.store.get(cal) ?? this.store.set(cal, new Map()).get(cal)!; }
  async listMirror(cal: string): Promise<RemoteItem[]> { return [...this.objs(cal).entries()].map(([ref, item]) => ({ uid: item.uid, ref, item, readOnly: [] })); }
  async put(cal: string, item: MirrorItem, _tz: string, existing?: { ref: string }) {
    if (this.refuse.has(item.name)) throw new Error('400 bad request');
    const ref = existing?.ref ?? `${cal}/${item.uid}`;
    this.objs(cal).set(ref, item);
    return { ref };
  }
  async remove(cal: string, ref: string) { this.objs(cal).delete(ref); }
  async readEvents() { return []; }
}

function setup(boardName: string | null = null, others: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'krnl-safe-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()));
  const fake = new Fake();
  const svc = new CalendarLinkService({
    boardPath: () => boardPath, userDataDir: dir,
    secrets: { available: () => true, seal: (t) => t, open: (t) => t },
    notifyBoardChanged: () => {}, timeZone: () => 'Europe/Berlin',
    adapterFactory: () => fake, boardName: () => boardName, otherBoardPaths: () => others,
  });
  const cli = new SysFacade({ boardPath });
  const board = () => JSON.parse(readFileSync(boardPath, 'utf8')) as { calendarLinks?: Array<Record<string, unknown>>; nodes: Array<{ kind: string; isMother?: boolean; state: { habits?: Habit[] } }> };
  const habits = () => board().nodes.find((n) => n.kind === 'habit' && n.isMother)!.state.habits!;
  const mirrorId = () => String(board().calendarLinks!.find((l) => l['role'] === 'mirror')!['id']);
  return { dir, boardPath, svc, fake, cli, board, habits, mirrorId };
}

async function signIn(env: ReturnType<typeof setup>) {
  const res = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
  if (!res.ok) throw new Error(res.message);
  await env.svc.addAccountCalendars(res.accountId, [], true);
}

describe('the deep audit', () => {
  it('a sync that starts after the board was switched does nothing (no deletes in the old calendar, nothing pushed from the new board)', async () => {
    const env = setup();
    expect((await env.cli.run(['event', 'add', 'Choir', '--days', 'wed', '--at', '19:00', '--for', '90'])).ok).toBe(true);
    await signIn(env);
    const cal = 'cal:KRNL0';
    expect((await env.fake.listMirror(cal)).map((r) => r.item!.name)).toEqual(['Choir']);
    const link = env.board().calendarLinks!.find((l) => l['role'] === 'mirror')!;
    // The window switches to another board (its own events, no calendar links) just before the sync runs.
    const other = seedBoard() as Record<string, unknown>;
    writeFileSync(env.boardPath, JSON.stringify(other));
    expect((await new SysFacade({ boardPath: env.boardPath }).run(['event', 'add', 'Other board thing', '--on', '2026-11-27', '--at', '10:00'])).ok).toBe(true);
    await (env.svc as unknown as { checkAccountLink(l: unknown): Promise<void> }).checkAccountLink(link);
    expect((await env.fake.listMirror(cal)).map((r) => r.item!.name)).toEqual(['Choir']);
  });

  it('a place changed on the phone never overwrites the event note', () => {
    const h: Habit = { id: 'h1', name: 'Class', createdAt: '2026-11-01T10:00:00Z', log: [], archived: false, color: 'teal', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00', durationMin: 90 }, note: 'Bring the laptop\nand chapter 4 notes' };
    const item: MirrorItem = { id: 'h1', uid: 'h1@krnl0', name: 'Class', place: 'WH C 442', repeat: { kind: 'weekly', days: [1] }, at: '10:00', lengthMin: 90, startsOn: '2026-11-02', skips: [], moved: [] };
    const st = applyEventOps({ habits: [h] } as HabitState, [{ op: 'updateEvent', habitId: 'h1', item }]);
    expect(st.habits[0]!.note).toBe('Bring the laptop\nand chapter 4 notes');
    expect(st.habits[0]!.place).toBe('WH C 442');
    // The location removed on the phone: the event says "no place", the note still stays.
    const st2 = applyEventOps(st, [{ op: 'updateEvent', habitId: 'h1', item: { ...item, place: undefined } as MirrorItem }]);
    expect(st2.habits[0]!.place).toBe('');
    expect(st2.habits[0]!.note).toBe('Bring the laptop\nand chapter 4 notes');
  });

  it('one item the calendar refuses never stops the others', async () => {
    const env = setup();
    await env.cli.run(['event', 'add', 'Fine one', '--on', '2026-11-27', '--at', '10:00']);
    await env.cli.run(['event', 'add', 'Refused one', '--on', '2026-11-28', '--at', '10:00']);
    env.fake.refuse.add('Refused one');
    await signIn(env);
    expect((await env.fake.listMirror('cal:KRNL0')).map((r) => r.item!.name)).toEqual(['Fine one']);
    const link = env.board().calendarLinks!.find((l) => l['role'] === 'mirror')!;
    expect(link['state']).toBe('ok');
    // Accepted later: it goes out on the next sync.
    env.fake.refuse.clear();
    await env.svc.check(env.mirrorId());
    expect((await env.fake.listMirror('cal:KRNL0')).map((r) => r.item!.name).sort()).toEqual(['Fine one', 'Refused one']);
  });

  it('two boards with the same name never share a KRNL0 calendar', async () => {
    const first = setup('Uni');
    await signIn(first);
    const second = setup('Uni', [first.boardPath]);
    // The same account's calendars: the second board's service sees the first board's link.
    second.fake.cals = first.fake.cals;
    await signIn(second);
    const name = String(second.board().calendarLinks!.find((l) => l['role'] === 'mirror')!['name']);
    expect(name).toBe('KRNL0 · Uni (2)');
  });

  it('a weekly event with no day ticked sends nothing (no invalid rule)', async () => {
    const env = setup();
    const b = JSON.parse(readFileSync(env.boardPath, 'utf8')) as { nodes: Array<{ kind: string; isMother?: boolean; state: { habits: Habit[] } }> };
    b.nodes.find((n) => n.kind === 'habit' && n.isMother)!.state.habits.push({ id: 'x', name: 'Nothing', createdAt: '2026-11-01T10:00:00Z', log: [], archived: false, color: 'teal', kind: 'routine', schedule: { kind: 'weekly', days: [], timeOfDay: '10:00', durationMin: 30 } });
    writeFileSync(env.boardPath, JSON.stringify(b));
    await signIn(env);
    expect(await env.fake.listMirror('cal:KRNL0')).toEqual([]);
  });

  it('the same account signed in on a second computer (one board through the server) never makes a second two-way calendar or shows a calendar twice', async () => {
    const env = setup();
    await env.cli.run(['event', 'add', 'Choir', '--days', 'wed', '--at', '19:00', '--for', '90']);
    const resA = await env.svc.connectApple('me@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!resA.ok) throw new Error(resA.message);
    await env.svc.addAccountCalendars(resA.accountId, ['home'], true);
    // Computer B: same board file (synced), its own keychain, same account.
    const dirB = mkdtempSync(join(tmpdir(), 'krnl-safe-b-'));
    const svcB = new CalendarLinkService({
      boardPath: () => env.boardPath, userDataDir: dirB,
      secrets: { available: () => true, seal: (t) => t, open: (t) => t },
      notifyBoardChanged: () => {}, timeZone: () => 'Europe/Berlin', adapterFactory: () => env.fake,
    });
    const resB = await svcB.connectApple('ME@icloud.com', 'abcd-efgh-ijkl-mnop');
    if (!resB.ok) throw new Error(resB.message);
    expect(resB.sending).toBe(true);
    expect(resB.calendars.find((c) => c.id === 'home')?.added).toBe(true);
    const added = await svcB.addAccountCalendars(resB.accountId, ['home'], true);
    expect(added.message).toContain('kept in step by');
    const links = env.board().calendarLinks!;
    expect(links.filter((l) => l['role'] === 'mirror')).toHaveLength(1);
    expect(links.filter((l) => l['role'] === 'read')).toHaveLength(1);
    // B does not run A's calendar.
    expect(svcB.list().find((l) => l.role === 'mirror')!.here).toBe(false);
  });

  it('a board restored from a backup keeps what it restored (its old matching list is not trusted)', async () => {
    const env = setup();
    await env.cli.run(['event', 'add', 'Choir', '--days', 'wed', '--at', '19:00', '--for', '90']);
    await signIn(env);
    const backup = readFileSync(env.boardPath, 'utf8');
    // After the backup: Choir is deleted (on the phone too), and a new event is made.
    expect((await env.cli.run(['event', 'delete', 'Choir'])).ok).toBe(true);
    await env.cli.run(['event', 'add', 'Late thing', '--on', '2026-11-27', '--at', '10:00']);
    await env.svc.check(env.mirrorId());
    expect((await env.fake.listMirror('cal:KRNL0')).map((r) => r.item!.name)).toEqual(['Late thing']);
    // The backup is restored: Choir is back on the board with the old matching list.
    writeFileSync(env.boardPath, backup);
    await env.svc.check(env.mirrorId());
    expect(env.habits().some((h) => h.name === 'Choir')).toBe(true);
    expect((await env.fake.listMirror('cal:KRNL0')).map((r) => r.item!.name)).toEqual(['Choir']);
  });
});
