/**
 * rafBatcher — single shared rAF loop for imperative DOM position tracking.
 *
 * Problem: multiple components each running their own rAF + getBoundingClientRect
 * interleaved with style writes = layout thrashing (N layout flushes per frame).
 *
 * Fix: one shared loop. All read() callbacks fire before any write() callback
 * so the browser only needs one layout calculation per frame regardless of
 * how many trackers are registered.
 */

interface Batch {
  read: () => void;
  write: () => void;
}

const batches = new Set<Batch>();
let rafId: number | null = null;

function tick() {
  for (const b of batches) b.read();
  for (const b of batches) b.write();
  rafId = requestAnimationFrame(tick);
}

export function scheduleBatch(batch: Batch): () => void {
  batches.add(batch);
  if (rafId === null) rafId = requestAnimationFrame(tick);
  return () => {
    batches.delete(batch);
    if (batches.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
