// Decision 64 / calendar-sync F5, F21 — `krnl cal link …`, `cal links`,
// `cal unlink`, `cal sync`, `cal export`, `cal import`. The Calendar's "Other
// calendars" card runs these same commands (sys:run), so the window and the
// terminal can do exactly the same things (hard rule 8).

import { readFileSync, writeFileSync } from 'fs';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { CalendarLinksPort } from '../../shared/calsync/port';
import { LINK_COLORS, linkMeta, providerLabel, type LinkColor } from '../../shared/calsync/types';
import { importSummary, planIcsImport, toIcs, type ExportEvent, type ExportTask, type ImportPlan } from '../../shared/calsync/krnlIcs';
import { selectSchedule } from '../../renderer/store/scheduleSelector';
import { habitAdd } from '../../renderer/components/nodes/HabitNode/commands';
import type { Habit, HabitState } from '../../renderer/components/nodes/HabitNode/types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import { eventTitleAndPlaceOf } from '../../renderer/components/nodes/CalendarNode/eventText';
import type { Board } from '../../shared/types';

export interface CalLinkCtx {
  boardPath: string;
  onBoardChanged?: () => void;
  calendars?: CalendarLinksPort;
}

const needsApp: SysResult = { ok: false, message: 'Calendar links run in the KRNL0 app — run this in its terminal with the app open.', data: { exitCode: 2 } };

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The local date of an ISO time (createdAt is in UTC: near midnight its date is another day here). */
function localYMD(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function asColor(c: string | undefined): LinkColor | undefined | 'bad' {
  if (c === undefined) return undefined;
  return LINK_COLORS.includes(c as LinkColor) ? (c as LinkColor) : 'bad';
}

/** `cal link ics <url> [--name n] [--color c]` — add a calendar link (F2). */
export async function calLinkAdd(ctx: CalLinkCtx, url: string | undefined, name: string | undefined, color: string | undefined, json = false): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (!url) return { ok: false, message: 'cal link ics <address> [--name "Work"] [--color lilac]' };
  const c = asColor(color);
  if (c === 'bad') return { ok: false, message: `--color must be one of ${LINK_COLORS.join(', ')}` };
  const res = await ctx.calendars.add(url, { ...(name ? { name } : {}), ...(c ? { color: c } : {}) });
  if (!res.ok) return { ok: false, message: res.message };
  const { events: _e, ...rest } = res.link;
  return { ok: true, message: json ? JSON.stringify(rest) : res.message, data: rest };
}

/**
 * `cal link apple --user <apple-id> --password <app-password>` ·
 * `cal link caldav <server> --user <u> --password <p>` · `cal link google`
 * (opens the browser), each `[--calendars "Work,Family"] [--no-send]`: sign
 * in, show the calendars named (all, without --calendars) and keep a KRNL0
 * calendar there the same both ways (unless --no-send). The app's card does
 * the same without the password ever being in a command line.
 */
export async function calLinkAccount(
  ctx: CalLinkCtx, mode: 'apple' | 'caldav' | 'google', server: string | undefined, user: string | undefined, password: string | undefined,
  calendars: string | undefined, send: boolean, json = false,
): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (mode === 'apple' && (!user || !password)) return { ok: false, message: 'cal link apple --user <apple-id-email> --password <app-specific password, abcd-efgh-ijkl-mnop> [--calendars "Work,Family"] [--no-send]' };
  if (mode === 'caldav' && (!server || !user || !password)) return { ok: false, message: 'cal link caldav <server> --user <name> --password <password> [--calendars "…"] [--no-send]' };
  const res = mode === 'apple' ? await ctx.calendars.connectApple(user!, password!)
    : mode === 'caldav' ? await ctx.calendars.connectCalDav(server!, user!, password!)
    : await ctx.calendars.connectGoogle();
  if (!res.ok) return { ok: false, message: res.message };
  const wanted = calendars?.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const pick = res.calendars.filter((c) => !wanted || wanted.includes(c.name.toLowerCase()));
  if (wanted && pick.length < wanted.length) {
    return { ok: false, message: `no calendar named ${wanted.filter((w) => !pick.some((c) => c.name.toLowerCase() === w)).join(', ')} in ${res.account}. It has: ${res.calendars.map((c) => c.name).join(', ')}` };
  }
  const added = await ctx.calendars.addAccountCalendars(res.accountId, pick.map((c) => c.id), send);
  const data = { accountId: res.accountId, account: res.account, calendars: pick.map((c) => c.name), send };
  if (!added.ok) return { ok: false, message: added.message };
  return { ok: true, message: json ? JSON.stringify(data) : `signed in as ${res.account}: ${added.message}`, data };
}

/** `cal accounts [--json]` — the accounts signed in on this computer (no passwords). */
export function calAccounts(ctx: CalLinkCtx, json = false): SysResult {
  if (!ctx.calendars) return needsApp;
  const rows = ctx.calendars.accounts();
  if (json) return { ok: true, message: JSON.stringify(rows), data: rows };
  if (!rows.length) return { ok: true, message: 'No accounts signed in. Sign in: cal link apple … or cal link google', data: [] };
  return { ok: true, message: rows.map((a) => `${a.account} (${providerLabel(a.provider)})  ${a.signedOut ? 'sign in again' : `${a.onBoard} calendar${a.onBoard === 1 ? '' : 's'} on this board${a.sending ? ' · KRNL0 both ways' : ''}`}`).join('\n'), data: rows };
}

/** `cal signout <account>` — forget a signed-in account (its calendars leave the board). */
export async function calSignOut(ctx: CalLinkCtx, ref: string | undefined): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (!ref) return { ok: false, message: 'cal signout <account email>' };
  return ctx.calendars.signOut(ref);
}

/** `cal link check <url> [--json]` — read an address without adding it (the "Found" step). */
export async function calLinkCheck(ctx: CalLinkCtx, url: string | undefined, json = false): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (!url) return { ok: false, message: 'cal link check <address> [--json]' };
  const pre = await ctx.calendars.preview(url);
  if (json) return { ok: true, message: JSON.stringify(pre), data: pre };
  if (!pre.ok) return { ok: false, message: pre.message };
  const next = pre.next ? ` · next: ${pre.next.title}, ${pre.next.allDay ? pre.next.start : pre.next.start.replace('T', ' ')}` : '';
  return { ok: true, message: `${pre.name ?? providerLabel(pre.provider)} · ${providerLabel(pre.provider)} · ${pre.count} events${next}`, data: pre };
}

/** `cal link set <ref> [--name n] [--color c] [--show|--hide]` — rename, recolour, show or hide. */
export async function calLinkSet(ctx: CalLinkCtx, ref: string | undefined, name: string | undefined, color: string | undefined, on: boolean | undefined): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (!ref) return { ok: false, message: 'cal link set <calendar> [--name "…"] [--color lilac] [--show|--hide]' };
  const c = asColor(color);
  if (c === 'bad') return { ok: false, message: `--color must be one of ${LINK_COLORS.join(', ')}` };
  if (name === undefined && c === undefined && on === undefined) return { ok: false, message: 'nothing to change: --name, --color, --show or --hide' };
  const res = await ctx.calendars.set(ref, { ...(name !== undefined ? { name } : {}), ...(c ? { color: c } : {}), ...(on !== undefined ? { on } : {}) });
  return res.ok ? { ok: true, message: res.message } : { ok: false, message: res.message };
}

/** `cal links [--json]` — the board's other calendars. */
export function calLinksList(ctx: CalLinkCtx, json = false): SysResult {
  if (!ctx.calendars) return needsApp;
  const rows = ctx.calendars.list();
  const brief = rows.map(({ events, ...r }) => ({ ...r, events: events.length }));
  if (json) return { ok: true, message: JSON.stringify(brief), data: brief };
  if (!rows.length) return { ok: true, message: 'No other calendars. Add one: cal link ics <address>', data: [] };
  const now = Date.now();
  return {
    ok: true,
    message: rows.map((r) => `${r.id}  ${r.name} (${r.color})  ${linkMeta(r, now, r.here)} · ${r.events.length} events`).join('\n'),
    data: brief,
  };
}

/** `cal unlink <ref>` — stop showing a calendar and forget its address (F20). */
export async function calUnlink(ctx: CalLinkCtx, ref: string | undefined): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  if (!ref) return { ok: false, message: 'cal unlink <calendar>' };
  const res = await ctx.calendars.remove(ref);
  return { ok: res.ok, message: res.message };
}

/** `cal sync [<ref>]` — check now. */
export async function calSync(ctx: CalLinkCtx, ref: string | undefined): Promise<SysResult> {
  if (!ctx.calendars) return needsApp;
  return ctx.calendars.check(ref);
}

// ── Export / import (F5) ───────────────────────────────────────────────────

const habitsOf = (board: Board): Array<{ nodeId: string; state: HabitState }> =>
  board.nodes.filter((n) => n.kind === 'habit' && n.isMother).map((n) => ({ nodeId: n.id, state: (n.state ?? { habits: [] }) as HabitState }));

function eachDay(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < max; i++) {
    const s = d.toISOString().slice(0, 10);
    if (s > to) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** The board's events and planned tasks, as plain data for the .ics writer. */
export function exportData(board: Board): { events: ExportEvent[]; tasks: ExportTask[] } {
  const events: ExportEvent[] = [];
  for (const { state } of habitsOf(board)) {
    for (const h of state.habits ?? []) {
      if (h.kind !== 'routine' || h.archived || !h.schedule?.timeOfDay) continue;
      const s = h.schedule;
      // A weekly event with no day ticked happens never: nothing to send (it would be an invalid rule).
      if (s.kind === 'weekly' && !s.days.length) continue;
      const repeat: ExportEvent['repeat'] = s.kind === 'daily' ? { kind: 'daily' } : s.kind === 'weekdays' ? { kind: 'weekdays' } : { kind: 'weekly', days: s.days };
      const skips = (h.exceptions ?? []).filter((e) => e.skip).map((e) => e.date);
      for (const p of h.pauses ?? []) skips.push(...eachDay(p.from, p.to));
      const { title, place } = eventTitleAndPlaceOf(h);
      events.push({
        id: h.id, uid: h.icsUid ?? `${h.id}@krnl0`, name: title, ...(place ? { place } : {}), repeat, at: s.timeOfDay!, lengthMin: s.durationMin ?? 60,
        startsOn: h.startsOn ?? localYMD(h.createdAt), ...(h.endsOn ? { endsOn: h.endsOn } : {}),
        skips: [...new Set(skips)], moved: (h.exceptions ?? []).filter((e) => !e.skip && e.at).map((e) => ({ date: e.date, at: e.at! })),
      });
    }
  }
  const tasks: ExportTask[] = [];
  const { placements } = selectSchedule(board);
  for (const p of placements.values()) {
    const node = board.nodes.find((n) => n.id === p.taskId);
    const st = node?.state as TaskState | undefined;
    if (!st || st.done) continue;
    tasks.push({ id: p.taskId, uid: `${p.taskId}@krnl0`, title: st.text, start: p.startISO.slice(0, 16), end: p.endISO.slice(0, 16) });
  }
  return { events, tasks };
}

/** `cal export [--out <file>]` — save the board's events and planned tasks as an .ics file. */
export function calExport(ctx: CalLinkCtx, out: string | undefined): SysResult {
  const board = loadBoardFrom(ctx.boardPath) as Board;
  const { events, tasks } = exportData(board);
  const text = toIcs(events, tasks, zone());
  if (!out) return { ok: true, message: text, data: { events: events.length, tasks: tasks.length } };
  try {
    writeFileSync(out, text, 'utf8');
  } catch (err) {
    return { ok: false, message: `could not write ${out}: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, message: `saved ${events.length} events and ${tasks.length} planned tasks to ${out}`, data: { events: events.length, tasks: tasks.length, path: out } };
}

/** `cal import <file> [--dry-run] [--json]` — add a file's events as KRNL0 events (never tasks). */
export function calImport(ctx: CalLinkCtx, file: string | undefined, dryRun = false, json = false): SysResult {
  if (!file) return { ok: false, message: 'cal import <file.ics> [--dry-run] [--json]' };
  let raw: string;
  try { raw = readFileSync(file, 'utf8'); } catch { return { ok: false, message: `cannot read ${file}` }; }
  const board = loadBoardFrom(ctx.boardPath, { seedIfCorrupt: false }) as Board;
  const mothers = habitsOf(board);
  const mother = mothers[0];
  if (!mother) return { ok: false, message: 'No Habits window on this board to keep events in.' };
  const existing = new Set<string>();
  for (const m of mothers) for (const h of m.state.habits ?? []) if (h.icsUid) existing.add(h.icsUid);
  const plan = planIcsImport(raw, zone(), existing);
  if ('error' in plan) return { ok: false, message: 'This file is not a calendar file (.ics).' };
  const summary = { ...plan, items: plan.items.length, adds: plan.items.length };
  if (dryRun) return { ok: true, message: json ? JSON.stringify(summary) : `would add ${plan.items.length} events: ${importSummary(plan)}`, data: summary };
  if (!plan.items.length) return { ok: true, message: json ? JSON.stringify(summary) : `nothing to add: ${importSummary(plan)}`, data: summary };
  mother.state = applyImport(mother.state, plan);
  board.nodes = board.nodes.map((n) => n.id === mother.nodeId ? { ...n, state: mother.state } : n);
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
  return { ok: true, message: json ? JSON.stringify(summary) : `added ${plan.items.length} events: ${importSummary(plan)}`, data: summary };
}

/** Add a plan's events to the Habits window's state (pure; exported for tests). */
export function applyImport(state: HabitState, plan: ImportPlan): HabitState {
  let st = state;
  for (const it of plan.items) {
    const before = new Set(st.habits.map((h) => h.id));
    const schedule = it.kind === 'once'
      ? { kind: 'weekly', days: [1], timeOfDay: it.at, durationMin: it.lengthMin }
      : { ...it.schedule, timeOfDay: it.at, durationMin: it.lengthMin };
    st = habitAdd(st, { name: it.name, kind: 'routine', schedule, ...(it.kind === 'once' ? { on: it.on } : {}) });
    const added = st.habits.find((h) => !before.has(h.id));
    if (!added) continue;
    const patch: Partial<Habit> = { icsUid: it.uid, ...(it.place ? { place: it.place } : {}) };
    if (it.kind === 'repeat') {
      patch.startsOn = it.startsOn;
      if (it.endsOn) patch.endsOn = it.endsOn;
      if (it.skips.length) patch.exceptions = it.skips.map((date) => ({ date, skip: true as const }));
    }
    st = { ...st, habits: st.habits.map((h) => h.id === added.id ? { ...h, ...patch } : h) };
  }
  return st;
}
