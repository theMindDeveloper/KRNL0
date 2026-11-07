// `sys finished …` and `sys recap …` in the renderer (docs/06-requirements/
// engagement.md F6, F11). They read and write the same stores as Settings and
// the recap card, so the window shows what the CLI did.

import type { Board } from '../../shared/types';
import { addDays } from '../analytics/dateRange';
import { fmtMinutes } from '../analytics/summary';
import { FINISHED_POLICIES, finishedTaskIds, isFinishedPolicy, useFinishedCards } from './finishedCards';
import { dayHeadline, daySummary, mondayOf, weekHeadline, weekSummary, ymdOf, type DaySummary } from './dayRecap';

function finishedStatus(board: Board | null): string {
  const { policy, showFinished } = useFinishedCards.getState();
  const hidden = finishedTaskIds(board, policy, Date.now()).size;
  const when = policy === 'overnight' ? 'leave overnight' : policy === 'hour' ? 'leave after 1 hour' : 'kept';
  return `finished cards: ${when}${showFinished ? ' · shown anyway' : ''} · ${hidden} off the board now`;
}

function dayLines(label: string, d: DaySummary): string {
  const lines = [`${label} (${d.date}): ${dayHeadline(d)}`];
  if (d.planned > 0) lines.push(`  planned: ${d.plannedDone}/${d.planned} done · plan ${fmtMinutes(d.plannedMin)} · real ${fmtMinutes(d.focusMin)}`);
  if (d.topStreak) lines.push(`  top streak: ${d.topStreak.label} ▲ ${d.topStreak.streak}`);
  return lines.join('\n');
}

export function runEngagementCommand(command: string, args: Record<string, unknown>, board: Board | null): { ok: boolean; message: string } {
  const fin = useFinishedCards.getState();
  const today = ymdOf(Date.now());
  switch (command) {
    case 'finished.status':
      return { ok: true, message: finishedStatus(board) };
    case 'finished.show':
      fin.setShowFinished(true);
      return { ok: true, message: finishedStatus(board) };
    case 'finished.hide':
      fin.setShowFinished(false);
      return { ok: true, message: finishedStatus(board) };
    case 'finished.policy': {
      const p = args['policy'];
      if (!isFinishedPolicy(p)) return { ok: false, message: `Unknown policy "${String(p)}" (use: ${FINISHED_POLICIES.join(', ')}, show, hide)` };
      fin.setPolicy(p);
      return { ok: true, message: finishedStatus(board) };
    }
    case 'recap.today':
    case 'recap.yesterday':
    case 'recap.week':
    case 'recap.show': {
      if (!board) return { ok: false, message: 'No board loaded' };
      if (command === 'recap.week') {
        const w = weekSummary(board, addDays(mondayOf(today), -7));
        const days = w.days.map((d) => `  ${d.date}: ${d.done} done · ${fmtMinutes(d.focusMin)}`).join('\n');
        return { ok: true, message: `last week (${w.start} – ${w.end}): ${weekHeadline(w)}\n${days}` };
      }
      if (command === 'recap.yesterday') return { ok: true, message: dayLines('yesterday', daySummary(board, addDays(today, -1))) };
      if (command === 'recap.show') window.dispatchEvent(new CustomEvent('krnl:recap-show'));
      return { ok: true, message: dayLines('today', daySummary(board, today)) };
    }
    default:
      return { ok: false, message: `Unknown command: ${command}` };
  }
}
