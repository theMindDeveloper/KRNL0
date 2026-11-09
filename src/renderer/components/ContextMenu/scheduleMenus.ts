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

import { openRetagPicker } from '../ui/SpanEditor';
import type { ContextMenuItem } from './index';
import {
  deleteSegment,
  retagSegment,
  unscheduleTask,
  scheduleAnchorOf,
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
  /** #204 — name of the task the span counts toward (task text, else the
   *  span's own label when the task is gone). Shown as "Tagged: X". */
  taskName?: string | null;
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
  opts: { targets: readonly RetagTarget[]; onDetails?: () => void; easy?: boolean; at?: { x: number; y: number } },
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
  // #204 — say which task the span counts toward, so a tagged span never
  // reads as untagged (the header alone only gives kind and times).
  if (isWork && !opts.easy && seg.taskId && seg.taskName) {
    items.push({ header: true, label: `Tagged: ${clip(seg.taskName)}`, onSelect: () => {} });
  }
  // Only finished focus spans carry a tag; the live span is tagged from the Pomo.
  // Easy mode never links spans to tasks.
  if (isWork && !seg.live && !opts.easy) {
    // #207 UX — one entry that opens a searchable picker, instead of a
    // "Tag → <task>" line per task (the menu grew with every task).
    items.push({
      label: seg.taskId ? 'Change task…' : 'Count toward a task…',
      onSelect: () => {
        const at = opts.at ?? { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 3) };
        openRetagPicker({ segId: seg.id, taskId: seg.taskId ?? null, x: at.x, y: at.y });
      },
    });
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
  opts: { onDetails?: () => void; easy?: boolean } = {},
): ContextMenuItem[] {
  const span = task.startMs !== undefined && task.endMs !== undefined
    ? ` · ${hm(task.startMs)}–${hm(task.endMs)}`
    : '';
  const items: ContextMenuItem[] = [
    { header: true, label: `${clip(task.text)}${span}`, onSelect: () => {} },
  ];
  if (opts.onDetails) items.push({ label: 'Details…', onSelect: opts.onDetails });
  // Easy mode has no focus linking.
  if (!opts.easy) items.push({ label: 'Start focus', disabled: task.done, onSelect: () => { void startFocusOnTask(task.id); } });
  items.push(
    { label: task.done ? 'Mark not done' : 'Mark done', onSelect: () => { void toggleTaskDone(task.id); } },
    { label: 'Show on canvas', onSelect: () => focusNode(task.id) },
    {
      // A chain successor is placed by its anchor: unscheduling it takes the chain off.
      label: 'Unschedule',
      danger: true,
      onSelect: () => { void unscheduleTask(task.id); },
    },
  );
  return items;
}
