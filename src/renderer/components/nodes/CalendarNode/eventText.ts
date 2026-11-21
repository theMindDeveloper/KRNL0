// What a repeating event shows in the Week and Day views (Decision 55,
// calendar-clock-visuals.md "Readable events"): the whole name over as many
// lines as the block has, then its time, then its place. Pure; exported for tests.

/**
 * The place, when the name ends with one after a long dash, the way timetables
 * write it ("B112 Front-End Development (PÜ) – WH C 442"): only a short tail
 * with a digit in it (a room), so "Talk — Design review" stays whole.
 * Otherwise the first line of the event's note, when it is short.
 */
export function eventTitleAndPlace(name: string, note?: string): { title: string; place: string | null } {
  const m = /^(.*\S)\s+[–—]\s+([^–—]{1,32})$/.exec(name.trim());
  if (m && /\d/.test(m[2]!)) return { title: m[1]!, place: m[2]!.trim() };
  const first = note?.split('\n')[0]?.trim() ?? '';
  return { title: name.trim(), place: first && first.length <= 40 ? first : null };
}

export interface EventLines {
  /** Lines the name may use (0 = none fit). */
  titleLines: number;
  showTime: boolean;
  showPlace: boolean;
}

/** Type metrics of an event block (the reading font at 12 px, mono at 11 px). */
export const EVENT_TEXT = { padY: 3, titleLine: 15, metaLine: 14, charPx: 6.6 } as const;

/**
 * How the block's height is shared out: the name first (up to two lines), then
 * the time, then the rest of the name, then the place. Nothing is cut in half:
 * a part shows whole or not at all.
 */
export function eventLines(heightPx: number, textWidthPx: number, title: string, hasPlace: boolean): EventLines {
  const { padY, titleLine, metaLine, charPx } = EVENT_TEXT;
  let room = heightPx - 2 * padY;
  if (room < titleLine - 1 || textWidthPx < 14) return { titleLines: 0, showTime: false, showPlace: false };
  const needed = Math.max(1, Math.ceil((title.length * charPx) / Math.max(1, textWidthPx)));
  let titleLines = Math.max(1, Math.min(needed, 2, Math.floor(room / titleLine)));
  room -= titleLines * titleLine;
  const showTime = textWidthPx >= 64 && room >= metaLine;
  if (showTime) room -= metaLine;
  const more = Math.max(0, Math.min(needed - titleLines, Math.floor(room / titleLine)));
  titleLines += more;
  room -= more * titleLine;
  const showPlace = hasPlace && showTime && room >= metaLine;
  return { titleLines, showTime, showPlace };
}
