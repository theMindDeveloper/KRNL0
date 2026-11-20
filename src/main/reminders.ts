// Reminders (review 4.1) — the main process checks the board every 30 s and
// shows a system notification for each plan whose reminder time has come.
// Runs while KRNL0 runs, window open or closed to the tray.

import { Notification } from 'electron';
import { BOARD_DIR, readBoardFile } from './boardIo';
import { parkedBoards } from './persistence/boards';
import { getMainWindow } from './mainWindow';
import { dueReminders } from '../shared/reminders';
import type { Board } from '../shared/types';

const TICK_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startReminders(): void {
  if (timer) return;
  // Only from now on: opening the app never replays reminders that passed.
  let lastMs = Date.now();
  const shown = new Set<string>();
  const tick = () => {
    const now = Date.now();
    // Back from sleep: only the last tick's window counts, so plans that
    // started while the laptop slept are not announced late.
    if (now - lastMs > 2 * TICK_MS) lastMs = now - TICK_MS;
    let board: Board | null = null;
    // Unreadable right now (locked, or broken and kept aside): try again next
    // tick without moving the window, so no reminder is skipped.
    try { board = readBoardFile() as unknown as Board | null; } catch { return; }
    const due = dueReminders(board, lastMs, now);
    // A plan in a board that is not open reminds too, and says which board (boards.md F10).
    try {
      for (const other of parkedBoards(BOARD_DIR)) {
        try {
          for (const r of dueReminders(other.board as Board, lastMs, now)) {
            due.push({ ...r, key: `${other.id}:${r.key}`, body: r.body ? `${r.body} · in your board "${other.name}"` : `In your board "${other.name}"` });
          }
        } catch { /* a board stored by an older version: it reminds once it has been opened */ }
      }
    } catch { /* the list of boards is unreadable right now: the open board still reminds */ }
    for (const r of due) {
      if (shown.has(r.key)) continue;
      shown.add(r.key);
      if (!Notification.isSupported()) continue;
      const n = new Notification({ title: r.title, body: r.body, silent: false });
      n.on('click', () => {
        const win = getMainWindow();
        if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      });
      n.show();
    }
    lastMs = now;
  };
  timer = setInterval(tick, TICK_MS);
}

export function stopReminders(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
