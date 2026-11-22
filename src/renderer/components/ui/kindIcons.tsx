/**
 * One mark per kind of thing on the Calendar and the canvas (the owner: each
 * block and card says what it is in its top-right corner): a task, a one-time
 * event, a repeating event, a habit; a missed task shows "replan" instead.
 * Line icons in the app's style (no emoji). The drag ghost uses the same marks.
 */
export type ItemKind = 'task' | 'event' | 'repeat' | 'habit' | 'replan' | 'linked';

export const KIND_PATHS: Record<ItemKind, string> = {
  task: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  event: 'M5.5 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 10h17M8 3v4M16 3v4',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  habit: 'M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17zM8.5 12.5l2.5 2.5 4.5-5',
  replan: 'M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5',
  // Decision 64 — an event from another calendar (Google, iCloud, a link).
  linked: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  task: 'Task',
  event: 'Event',
  repeat: 'Repeating event',
  habit: 'Habit',
  replan: 'Missed: replan it',
  linked: 'From another calendar',
};

export function KindIcon({ kind, size = 12, strokeWidth = 2 }: { kind: ItemKind; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <path d={KIND_PATHS[kind]} />
    </svg>
  );
}

/** The same mark as markup (the drag ghost is drawn outside React). */
export function kindIconSvg(kind: ItemKind, size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${KIND_PATHS[kind]}"/></svg>`;
}
