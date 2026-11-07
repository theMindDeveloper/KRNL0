// Whether the Pomo node is asking about time it couldn't see (useAwayGap).
// The node publishes it; the pocket bridge reads it into the snapshot, so the
// pocket shows "open KRNL0" instead of controls (pocket-timer.md F11).

let away = false;
const subs = new Set<() => void>();

export function setPocketAway(next: boolean): void {
  if (next === away) return;
  away = next;
  subs.forEach((fn) => fn());
}

export function getPocketAway(): boolean {
  return away;
}

export function subscribePocketAway(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
