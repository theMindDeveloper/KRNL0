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

/** The title and place of an event, with its own `place` first (Decision 64), else the old rule. */
export function eventTitleAndPlaceOf(h: { name: string; note?: string | undefined; place?: string | undefined }): { title: string; place: string | null } {
  const tp = eventTitleAndPlace(h.name, h.note);
  return h.place !== undefined ? { title: tp.title, place: h.place.trim() || null } : tp;
}

export interface EventLines {
  /** Lines the name may use (0 = none fit). */
  titleLines: number;
  showTime: boolean;
  /** Lines the small time line may wrap onto (Decision 60: a narrow block wraps it). */
  metaLines: number;
  showPlace: boolean;
}

/** Type metrics of an event block (the reading font at 13 px; the time small, mono 10 px). */
export const EVENT_TEXT = { padY: 3, titleLine: 16, metaLine: 13, charPx: 7.1, metaCharPx: 6.1 } as const;

/**
 * How the block's height is shared out (Decision 60, the owner's pick: the
 * drag preview's look): the name first (up to three lines), then the time and
 * how often it repeats in small type (wrapping when the block is narrow), then
 * the rest of the name, then the place. Nothing is cut in half: a part shows
 * whole or not at all.
 */
export function eventLines(heightPx: number, textWidthPx: number, title: string, hasPlace: boolean, meta = '00:00–00:00'): EventLines {
  const { padY, titleLine, metaLine, charPx, metaCharPx } = EVENT_TEXT;
  let room = heightPx - 2 * padY;
  if (room < titleLine - 1 || textWidthPx < 14) return { titleLines: 0, showTime: false, metaLines: 0, showPlace: false };
  const needed = Math.max(1, Math.ceil((title.length * charPx) / Math.max(1, textWidthPx)));
  let titleLines = Math.max(1, Math.min(needed, 3, Math.floor(room / titleLine)));
  room -= titleLines * titleLine;
  const metaNeed = Math.max(1, Math.min(3, Math.ceil((meta.length * metaCharPx) / Math.max(1, textWidthPx))));
  // The time at least (one line), the rest of the line when it fits.
  const metaLines = textWidthPx >= 30 ? Math.max(0, Math.min(metaNeed, Math.floor(room / metaLine))) : 0;
  const showTime = metaLines > 0;
  room -= metaLines * metaLine;
  const more = Math.max(0, Math.min(needed - titleLines, Math.floor(room / titleLine)));
  titleLines += more;
  room -= more * titleLine;
  const showPlace = hasPlace && showTime && room >= metaLine;
  return { titleLines, showTime, metaLines, showPlace };
}
