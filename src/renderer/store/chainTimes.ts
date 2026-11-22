/**
 * Decision 63 — connections are only drawn; they no longer place tasks.
 *
 * Before, a task with no time of its own could still be on the Calendar: the
 * chain it was connected into put it after the one before it. So that nothing
 * moves when this changes, such a task is given that time as its own, once,
 * when the board opens (from migrateBoard). The time is computed by the old
 * rule (`buildWithChains`), kept only for this step. A board with no such
 * task is returned unchanged, so this is safe to run on every load.
 */
import { buildWithChains } from './scheduleSelector';
import { defaultPomoConfig, type PomoConfig } from '../components/nodes/PomoNode/types';
import type { Board } from '../../shared/types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

/** The tasks the old rule placed by a chain only (no time of their own): id → start. */
export function chainOnlyTimes(board: Board): Map<string, string> {
  const pomo = board.nodes.find((n) => n.kind === 'pomo');
  const cfg = (pomo?.config as PomoConfig | null | undefined) ?? defaultPomoConfig();
  const out = new Map<string, string>();
  if (!board.edges.some((e) => e.from.event === 'task.next')) return out;
  for (const p of buildWithChains(board, cfg).placements.values()) {
    if (!p.isAnchor) out.set(p.taskId, p.startISO);
  }
  return out;
}

/**
 * The migration: each task placed only by its chain gets that start as its
 * own `scheduledFor`. A length it had stored but the chain ignored is dropped,
 * so its block keeps the length it was drawn with. Its Todo row gets the same
 * time, as every time a task is scheduled (todoSetItemSchedule: a time is its
 * When, so an any-time day goes).
 */
export function migrateChainTimes(raw: unknown): unknown {
  if (!isRec(raw) || !Array.isArray(raw['nodes']) || !Array.isArray(raw['edges'])) return raw;
  const board = raw as unknown as Board;
  let times: Map<string, string>;
  try {
    times = chainOnlyTimes(board);
  } catch {
    return raw; // never block opening a board
  }
  if (times.size === 0) return raw;
  const nodes = (raw['nodes'] as unknown[]).map((n) => {
    if (!isRec(n) || !isRec(n['state'])) return n;
    // A Todo row of such a task: the same time.
    if (n['kind'] === 'todo' && Array.isArray(n['state']['items'])) {
      let changed = false;
      const items = (n['state']['items'] as unknown[]).map((it) => {
        if (!isRec(it) || typeof it['taskNodeId'] !== 'string' || !times.has(it['taskNodeId'])) return it;
        changed = true;
        const { onDay: _anyDay, ...timed } = it;
        void _anyDay;
        return { ...timed, scheduledFor: times.get(it['taskNodeId']) };
      });
      return changed ? { ...n, state: { ...n['state'], items } } : n;
    }
    if (typeof n['id'] !== 'string' || !times.has(n['id'])) return n;
    const { scheduledDurationMin: _ignored, ...state } = n['state'];
    void _ignored;
    return { ...n, state: { ...state, scheduledFor: times.get(n['id']) } };
  });
  return { ...raw, nodes };
}
