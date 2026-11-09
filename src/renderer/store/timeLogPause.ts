// Decision 35 — boards the renderer adopts rather than changes must not be
// time-logged: the initial load, a reload after a CLI write (main already
// logged that change), a factory reset and "clear focus history". boardStore
// wraps those set() calls; Zustand runs listeners synchronously inside set(),
// so the time-log subscriber (store/timeLog.ts) sees the flag.
//
// A separate module so boardStore needs no import of timeLog.ts (which
// imports boardStore).

let depth = 0;

export function withoutTimeLog<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
  }
}

// A guided tour with practice steps: what the user makes during it is
// practice, so it is not logged while the tour runs. At the end it is either
// removed (nothing to log) or kept and logged in one go (store/tourPractice.ts).
let practice = false;

export function setPracticePause(on: boolean): void {
  practice = on;
}

export function isTimeLogPaused(): boolean {
  return depth > 0 || practice;
}
