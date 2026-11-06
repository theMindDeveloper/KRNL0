// Launch-experience commands (launch-experience.md F7, F15, F19, F23, F24):
//   krnl whatsnew [show]        krnl catchup [show]       krnl share streak|sessions|list
//   krnl feedback ["title"]     krnl app status|backups|celebrations on|off
// Read-only parts run headless against board.json; anything that opens a
// dialog goes to the open window through cliDispatch.

import { describeWhatsNew, latestNotes } from '../../shared/whatsnew';
import { buildIssueUrl, isFeedbackKind, type FeedbackKind } from '../../shared/feedback';
import { describeAway, type AppStatePort } from '../../shared/appState';
import { computeCatchup, describeCatchup, type CatchupBoard } from '../../renderer/launch/catchup';
import { STREAK_MILESTONES, SESSION_MILESTONES, focusStats, habitStreaks } from '../../renderer/launch/milestones';
import type { SysResult } from '../SysFacade';

export function todayYMD(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function whatsnewPrint(json: boolean): SysResult {
  const notes = latestNotes();
  if (!notes) return { ok: true, message: 'No release notes in this build.' };
  return json ? { ok: true, message: JSON.stringify(notes), data: notes } : { ok: true, message: describeWhatsNew(notes), data: notes };
}

export function catchupPrint(board: CatchupBoard, json: boolean, today = todayYMD()): SysResult {
  const c = computeCatchup(board, today);
  return json ? { ok: true, message: JSON.stringify(c), data: c } : { ok: true, message: describeCatchup(c), data: c };
}

/** Next milestone above `n`, or null past the last one. */
function nextOf(list: readonly number[], n: number): number | null {
  return list.find((m) => m > n) ?? null;
}

export function shareList(nodes: CatchupBoard['nodes'], json: boolean, today = todayYMD()): SysResult {
  const streaks = habitStreaks(nodes, today).map((h) => ({ ...h, next: nextOf(STREAK_MILESTONES, h.current) }));
  const { sessions } = focusStats(nodes);
  const data = { streaks, sessions: { count: sessions, next: nextOf(SESSION_MILESTONES, sessions) } };
  if (json) return { ok: true, message: JSON.stringify(data), data };
  const lines = ['Streaks:'];
  if (streaks.length === 0) lines.push('  (no habits yet)');
  for (const s of streaks) lines.push(`  ${s.name}: ${s.current} in a row · best ${s.best}${s.next ? ` · next card at ${s.next}` : ''}`);
  lines.push(`Focus sessions: ${sessions}${data.sessions.next ? ` · next card at ${data.sessions.next}` : ''}`);
  lines.push('Open a card: krnl share streak "<habit>" | krnl share sessions');
  return { ok: true, message: lines.join('\n'), data };
}

export function feedbackLink(title: string, kind: string | undefined): SysResult {
  const k: FeedbackKind = isFeedbackKind(kind) ? kind : 'bug';
  const url = buildIssueUrl({ kind: k, title, text: '', diagnostics: null, includeErrors: false });
  return { ok: true, message: `Open this link to file it on GitHub:\n${url}`, data: { url } };
}

export function appStatus(port: AppStatePort, json: boolean): SysResult {
  const info = port.launch();
  if (!info) return { ok: false, message: 'Launch info is not ready yet.' };
  if (json) return { ok: true, message: JSON.stringify(info), data: info };
  const lines = [
    `KRNL0 ${info.version}${info.previousVersion ? ` (updated from ${info.previousVersion}, ${info.kind})` : ''}`,
    `Board backups: ${info.backups.length === 0 ? 'none yet' : info.backups.join(', ')}`,
    `  folder: ${info.backupDir}`,
    `Before this launch: ${info.awayMs === null ? 'first run' : describeAway(info.awayMs)}`,
    `Celebrations: ${info.prefs.celebrations ? 'on' : 'off'}`,
    `What's new seen: ${info.prefs.whatsNewSeen ?? 'not yet'}`,
  ];
  return { ok: true, message: lines.join('\n'), data: info };
}

export function appBackups(port: AppStatePort, json: boolean): SysResult {
  const info = port.launch();
  if (!info) return { ok: false, message: 'Launch info is not ready yet.' };
  const data = { folder: info.backupDir, files: info.backups };
  if (json) return { ok: true, message: JSON.stringify(data), data };
  return {
    ok: true,
    message: info.backups.length === 0
      ? `No board backups yet. One is made before every update, in ${info.backupDir}`
      : [`${info.backups.length} board backup(s) in ${info.backupDir}:`, ...info.backups.map((b) => `  ${b}`)].join('\n'),
    data,
  };
}

export function appCelebrations(port: AppStatePort, on: boolean | undefined): SysResult {
  if (on === undefined) {
    const cur = port.launch()?.prefs.celebrations ?? true;
    return { ok: true, message: `Celebrations are ${cur ? 'on' : 'off'}.`, data: { celebrations: cur } };
  }
  port.setPrefs({ celebrations: on });
  return { ok: true, message: on ? 'Celebrations on: milestone cards will show.' : 'Celebrations off: no milestone cards.', data: { celebrations: on } };
}
