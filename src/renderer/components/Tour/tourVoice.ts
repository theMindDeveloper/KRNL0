// The guide's voice for tour steps. Each step's words, as said in the user's
// mode, map to one recorded clip in ./voice/<key>.mp3, named by a short hash
// of exactly those words: rewording a step needs a new clip, an unchanged step
// keeps its own. Clips are made by `scripts/gen-tour-voice.ts` (ElevenLabs);
// a step without a clip is simply silent.

/** The timer's name as its window shows it: Record (Easy), Pomo (Advanced,
 *  Pomodoro sessions) or Observe (Advanced, the stopwatch). */
export function timerName(mode: 'easy' | 'advanced', timer: 'stopwatch' | 'pomo' = 'pomo'): string {
  return mode === 'easy' ? 'Record' : timer === 'stopwatch' ? 'Observe' : 'Pomo';
}

/** `{mode}` and `{pomo}` in a tour's words, title or badge, for this user. */
export function fillTour(t: string, mode: 'easy' | 'advanced', timer: 'stopwatch' | 'pomo' = 'pomo'): string {
  return t.split('{mode}').join(mode === 'easy' ? 'Easy' : 'Advanced').split('{pomo}').join(timerName(mode, timer));
}
const fill = fillTour;

type BoardLike = { uiMode?: string; nodes: Array<{ kind: string; isMother?: boolean; config?: unknown }> } | null | undefined;
/** A tour's name for this board (menus): "Pomo — …" reads "Record — …" in Easy, "Observe — …" with the stopwatch. */
export function tourTitleOn(title: string, board: BoardLike): string {
  const mode = board?.uiMode === 'easy' ? 'easy' : 'advanced';
  const cfg = board?.nodes.find((n) => n.kind === 'pomo' && n.isMother)?.config as { mode?: string } | undefined;
  return fillTour(title, mode, mode === 'easy' || cfg?.mode === 'observe' ? 'stopwatch' : 'pomo');
}

/**
 * What the guide says for a step: its `say` script (audio tags kept, for
 * Eleven v4), else the shown text cleaned up to be read aloud — no markup,
 * keys and arrows as words, button names in capitals said as words.
 */
export function spokenText(text: string, mode: 'easy' | 'advanced', say?: string, timer: 'stopwatch' | 'pomo' = 'pomo'): string {
  if (say) return fill(say, mode, timer).replace(/\s+/g, ' ').trim();
  return fill(text, mode, timer)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\bEsc\b/g, 'Escape')
    .replace(/\bCtrl\b/g, 'Control')
    .replace(/\b([A-Z]{2,}(?: [A-Z]{2,})*)\b/g, (w) => `"${w.charAt(0)}${w.slice(1).toLowerCase()}"`)
    .replace(/\s*→\s*/g, ', ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/…/g, '...')
    .replace(/\s=\s/g, ' means ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short stable name for a clip (FNV-1a, 32-bit, hex). */
export function voiceKey(spoken: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < spoken.length; i++) {
    h ^= spoken.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
