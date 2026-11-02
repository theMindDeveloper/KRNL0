// Right-click menus for scheduled tasks and tracked pomo segments. The Calendar
// (week/day) and the Clock day view both build their menus here, so the same
// target offers the same actions on both surfaces.
//
// Every action has a CLI twin (see store/scheduleActions.ts):
//   Retag / Untag     → pomo retag <segmentId> <taskRef|none>
//   Delete segment    → pomo delete-segment <segmentId>
//   Start focus       → task pomo <ref>
//   Mark done / not   → task toggle <ref>
//   Unschedule        → task unschedule <ref>
// "Details…" and "Show on canvas" only open UI / move the camera.

import type { ContextMenuItem } from './index';
import {
  deleteSegment,
  retagSegment,
  unscheduleTask,
  toggleTaskDone,
  startFocusOnTask,
  focusNode,
} from '../../store/scheduleActions';

export interface MenuSegment {
  id: string;
  kind: 'work' | 'break';
  taskId: string | null;
  startMs: number;
  endMs: number;
  live: boolean;
}

export interface MenuTask {
  id: string;
  text: string;
  done: boolean;
  /** Wall-clock span for the header, when known. */
  startMs?: number;
  endMs?: number;
}

export interface RetagTarget {
  id: string;
  text: string;
}

/** Quick retag entries listed inline; the rest are in "Details…". */
export const MAX_RETAG_TARGETS = 6;
const LABEL_MAX = 28;

function hm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clip(text: string): string {
  const t = text.trim() || 'Untitled task';
  return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}…` : t;
}

export function segmentMenuItems(
  seg: MenuSegment,
  opts: { targets: readonly RetagTarget[]; onDetails?: () => void },
): ContextMenuItem[] {
  const isWork = seg.kind === 'work';
  const minutes = Math.max(1, Math.round((seg.endMs - seg.startMs) / 60_000));
  const items: ContextMenuItem[] = [
    {
      header: true,
      label: `${isWork ? 'Focus' : 'Break'} · ${hm(seg.startMs)}–${seg.live ? 'now' : hm(seg.endMs)} · ${minutes}m`,
      onSelect: () => {},
    },
  ];
  // Only finished focus spans carry a tag; the live span is tagged from the Pomo.
  if (isWork && !seg.live) {
    for (const t of opts.targets.filter((x) => x.id !== seg.taskId).slice(0, MAX_RETAG_TARGETS)) {
      items.push({ label: `Tag → ${clip(t.text)}`, onSelect: () => retagSegment(seg.id, t.id) });
    }
    if (seg.taskId) items.push({ label: 'Untag', onSelect: () => retagSegment(seg.id, null) });
  }
  if (opts.onDetails) items.push({ label: 'Details…', onSelect: opts.onDetails });
  items.push({
    label: 'Delete segment',
    danger: true,
    disabled: seg.live,
    onSelect: () => deleteSegment(seg.id),
  });
  return items;
}

export function taskMenuItems(
  task: MenuTask,
  opts: { onDetails?: () => void } = {},
): ContextMenuItem[] {
  const span = task.startMs !== undefined && task.endMs !== undefined
    ? ` · ${hm(task.startMs)}–${hm(task.endMs)}`
    : '';
  const items: ContextMenuItem[] = [
    { header: true, label: `${clip(task.text)}${span}`, onSelect: () => {} },
  ];
  if (opts.onDetails) items.push({ label: 'Details…', onSelect: opts.onDetails });
  items.push(
    { label: 'Start focus', disabled: task.done, onSelect: () => { void startFocusOnTask(task.id); } },
    { label: task.done ? 'Mark not done' : 'Mark done', onSelect: () => { void toggleTaskDone(task.id); } },
    { label: 'Show on canvas', onSelect: () => focusNode(task.id) },
    { label: 'Unschedule', danger: true, onSelect: () => unscheduleTask(task.id) },
  );
  return items;
}
