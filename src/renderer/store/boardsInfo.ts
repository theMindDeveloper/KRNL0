// Separate boards (Decision 49): what the open board needs to know about the
// others. One timer at a time across all boards: if one is still running in
// another board, starting one here is refused and the top-bar chip says why.

export interface OtherBoardRecording { boardId: string; name: string; startedAt: string; label: string }

/** Fired when the Timer refuses to start because another board is recording. */
export const BOARD_TIMER_BLOCKED_EVENT = 'krnl:board-timer-blocked';

let other: OtherBoardRecording | null = null;

export function setOtherBoardRecording(next: OtherBoardRecording | null): void {
  other = next;
}

export function otherBoardRecording(): OtherBoardRecording | null {
  return other;
}

/** True (and the chip is nudged) when a timer is running in another board. */
export function blockedByOtherBoard(): boolean {
  if (!other) return false;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BOARD_TIMER_BLOCKED_EVENT));
  return true;
}
