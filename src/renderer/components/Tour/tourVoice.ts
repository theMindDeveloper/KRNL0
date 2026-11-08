// The guide's voice for tour steps. Each step's words, as said in the user's
// mode, map to one recorded clip in ./voice/<key>.mp3, named by a short hash
// of exactly those words: rewording a step needs a new clip, an unchanged step
// keeps its own. Clips are made by `scripts/gen-tour-voice.ts` (ElevenLabs);
// a step without a clip is simply silent.

const fill = (t: string, mode: 'easy' | 'advanced'): string => t
  .split('{mode}').join(mode === 'easy' ? 'Easy' : 'Advanced')
  .split('{pomo}').join(mode === 'easy' ? 'Record' : 'Pomo');

/**
 * What the guide says for a step: its `say` script (audio tags kept, for
 * Eleven v4), else the shown text cleaned up to be read aloud — no markup,
 * keys and arrows as words, button names in capitals said as words.
 */
export function spokenText(text: string, mode: 'easy' | 'advanced', say?: string): string {
  if (say) return fill(say, mode).replace(/\s+/g, ' ').trim();
  return fill(text, mode)
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
