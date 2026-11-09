// Quick add (new-user review 6.1): people type plans the way they say them —
// "Call mom tomorrow at 5pm", "Gym 18:00 1h", "Pay rent friday". This pulls
// the day, the time and the length out of the words. The Todo shows the
// result under the field before Enter, so nothing happens unseen.

export interface QuickAdd {
  /** The plan's name with the parsed words taken out. */
  text: string;
  /** YYYY-MM-DD when a day was named (or a time was given: today / tomorrow). */
  day?: string;
  /** HH:MM when a time was named. */
  time?: string;
  durationMin?: number;
  /** True when a time was given without a day and had already passed today. */
  rolledToTomorrow?: boolean;
  /** Something typed that quick add can't do, said in words (nothing else is read then). */
  hint?: string;
  /** Decision 40 — "by fri", "due 21.11": the plan's Deadline (YYYY-MM-DD). `day` is its When. */
  deadline?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEADLINE_RE = /\b(?:by|due|before|deadline)\s+((?:on\s+)?(?:next\s+)?(?:today|tonight|tomorrow|tmrw|tmr|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\d{1,2}[./]\d{1,2}\.?|the\s+\d{1,2}(?:st|nd|rd|th)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*))\b/i;
const DAY_RE = /\b(?:on\s+)?(next\s+)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;

export function parseQuickAdd(raw: string, now: Date = new Date()): QuickAdd {
  let s = ` ${raw} `;
  const out: QuickAdd = { text: raw.trim() };
  // "every day", "every monday": a plan happens once. Something that repeats
  // is a habit with a time (ticked) or a routine (just happens), so read none
  // of it rather than make a one-off plan that looks like a series.
  if (/\bevery\s+(?:day|morning|evening|night|week|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)/i.test(s)) {
    return { text: raw.trim(), hint: 'a plan happens once. Something that repeats is a habit (in Habits) or a repeating event (on the Calendar)' };
  }
  const cut = (m: RegExpExecArray) => { s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); };

  // A deadline first ("by fri", "due 21.11", "before Nov 20th"), so its day
  // is not read as the plan's When.
  const dl = DEADLINE_RE.exec(s);
  if (dl) {
    const day = parseQuickAdd(dl[1]!, now).day;
    if (day) { out.deadline = day; cut(dl); }
  }

  // "in 2 hours", "in 30 min": a start time from now (rounded up to 5 min).
  const rel = /\bin\s+(\d{1,3})\s?(min|mins|minutes|m|h|hr|hrs|hour|hours)\b/i.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const mins = /^h/i.test(rel[2]!) ? n * 60 : n;
    if (mins >= 1 && mins <= 24 * 60) {
      const at = new Date(now.getTime() + mins * 60_000);
      const rounded = Math.ceil((at.getHours() * 60 + at.getMinutes()) / 5) * 5;
      const day = new Date(at); if (rounded >= 24 * 60) day.setDate(day.getDate() + 1);
      const r = rounded % (24 * 60);
      out.time = `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
      out.day = ymd(day);
      s = s.slice(0, rel.index) + ' ' + s.slice(rel.index + rel[0].length);
    }
  }

  // A range first: "14:00-15:30", "6pm-7pm", "9-10am" — the start and the length.
  let m: RegExpExecArray | null = out.time ? null : /\b(?:from\s+)?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)?\s?(?:-|–|to)\s?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)?\b/i.exec(s);
  if (m && (m[2] || m[5] || m[3] || m[6])) {
    const endAp = m[6] ?? m[3];
    const to24 = (h: number, ap?: string) => (ap ? (h % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0) : h);
    const h1 = to24(Number(m[1]), m[3] ?? endAp);
    const h2 = to24(Number(m[4]), endAp);
    const a1 = h1 * 60 + Number(m[2] ?? 0);
    const a2 = h2 * 60 + Number(m[5] ?? 0);
    if (h1 <= 23 && h2 <= 23 && a2 > a1) {
      out.time = `${pad(h1)}:${pad(Number(m[2] ?? 0))}`;
      out.durationMin = a2 - a1;
      cut(m);
    }
  }

  // Time ("5pm" must not be read as 5 minutes).
  m = out.time ? null : /\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)\b/i.exec(s);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3]!.toLowerCase() === 'pm') h += 12;
    if (Number(m[1]) <= 12) { out.time = `${pad(h)}:${m[2] ?? '00'}`; cut(m); }
  } else if (!out.time) {
    m = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(s);
    if (m) { out.time = `${pad(Number(m[1]))}:${m[2]}`; cut(m); }
    else {
      m = /\bat\s+([01]?\d|2[0-3])\b(?!\s*(?:min|h\b|hr|hour))/i.exec(s);
      // "at 3" means 3 pm to almost everyone; 1–7 without am/pm read as afternoon.
      if (m) { const n = Number(m[1]); out.time = `${pad(n >= 1 && n <= 7 ? n + 12 : n)}:00`; cut(m); }
    }
  }

  // "noon" / "midday": 12:00.
  if (!out.time && (m = /\b(?:at\s+)?(?:noon|midday)\b/i.exec(s))) { out.time = '12:00'; cut(m); }

  // Length: "1h30", "1.5h", "2 hours", "45m", "45 min" (a range already gave one).
  m = out.durationMin !== undefined ? null : /\b(\d{1,2})h([0-5]\d)\b/i.exec(s);
  if (m) { out.durationMin = Number(m[1]) * 60 + Number(m[2]); cut(m); }
  else if (out.durationMin === undefined) {
    m = /\b(?:for\s+)?(\d{1,2}(?:\.\d)?)\s?(?:h|hr|hrs|hour|hours)\b/i.exec(s);
    if (m) { out.durationMin = Math.round(Number(m[1]) * 60); cut(m); }
    else {
      m = /\b(?:for\s+)?(\d{1,3})(?:\s?(?:min|mins|minute|minutes)|m)\b/i.exec(s);
      if (m) { out.durationMin = Number(m[1]); cut(m); }
    }
  }
  if (out.durationMin !== undefined && !(out.durationMin >= 1 && out.durationMin <= 480)) delete out.durationMin;

  const today = ymd(now);

  // Day.
  let weekdayNamed = false;
  m = /\b(today|tonight)\b/i.exec(s);
  if (m) { out.day = today; cut(m); }
  else if ((m = /\b(tomorrow|tmrw|tmr)\b/i.exec(s))) {
    const d = new Date(now); d.setDate(d.getDate() + 1); out.day = ymd(d); cut(m);
  } else if ((m = DAY_RE.exec(s))) {
    weekdayNamed = true;
    const want = DAYS.findIndex((w) => w.startsWith(m![2]!.toLowerCase().slice(0, 3)));
    let add = (want - now.getDay() + 7) % 7;
    if (m[1]) add += add === 0 ? 7 : 7; // "next friday" is the one after this week's
    const d = new Date(now); d.setDate(d.getDate() + add); out.day = ymd(d); cut(m);
  }

  // A date: "15.11", "15/11", "Nov 20", "20 November", "the 15th" (day
  // before month, as written in Germany). A date already past this year is
  // next year's; "the 15th" alone is this month's, or next month's if past.
  if (!out.day) {
    const dm = parseDate(s, now);
    if (dm) { out.day = dm.day; s = s.slice(0, dm.index) + ' ' + s.slice(dm.index + dm.length); }
  }

  // Today's weekday named with a time already past ("gym fri 18:00" on
  // Friday at 19:00): next week's, not a plan in the past.
  if (out.time && out.day === today && weekdayNamed) {
    const [h, mm] = out.time.split(':').map(Number) as [number, number];
    if (h * 60 + mm <= now.getHours() * 60 + now.getMinutes()) {
      const d = new Date(now); d.setDate(d.getDate() + 7); out.day = ymd(d);
    }
  }

  // A time with no day: today, or tomorrow if it has passed.
  if (out.time && !out.day) {
    const [h, mm] = out.time.split(':').map(Number) as [number, number];
    if (h * 60 + mm <= now.getHours() * 60 + now.getMinutes()) {
      const d = new Date(now); d.setDate(d.getDate() + 1); out.day = ymd(d); out.rolledToTomorrow = true;
    } else out.day = today;
  }

  const text = s.replace(/\s+/g, ' ').replace(/\s+(?:at|on|for|by)\s*$/i, '').trim();
  out.text = text || raw.trim();
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';

/** A real calendar day (no 31.02), as YYYY-MM-DD, or null. */
function realDay(y: number, m: number, d: number): string | null {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

function parseDate(s: string, now: Date): { day: string; index: number; length: number } | null {
  const today = ymd(now);
  const y = now.getFullYear();
  const pick = (m: number, d: number) => {
    const here = realDay(y, m, d);
    if (here && here >= today) return here;
    return realDay(y + 1, m, d);
  };
  let m: RegExpExecArray | null;
  // 15.11 / 15.11. / 15/11 (not "1.5h", not a version like 2.5.1)
  if ((m = /(?<![\d./])\b(?:on\s+)?(\d{1,2})[./](\d{1,2})\.?(?![\d./]|\s?(?:h|hr|hrs|hour|hours|min|m)\b)/i.exec(s))) {
    const day = pick(Number(m[2]), Number(m[1]));
    if (day) return { day, index: m.index, length: m[0].length };
  }
  // Nov 20 / November 20th
  if ((m = new RegExp(`\\b(?:on\\s+)?${MON}\\s+${ORD}\\b`, 'i').exec(s))) {
    const day = pick(MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1, Number(m[2]));
    if (day) return { day, index: m.index, length: m[0].length };
  }
  // 20 Nov / 20th of November
  if ((m = new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?${ORD}(?:\\s+of)?\\s+${MON}\\b`, 'i').exec(s))) {
    const day = pick(MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1, Number(m[1]));
    if (day) return { day, index: m.index, length: m[0].length };
  }
  // the 15th / on the 3rd: this month, or next month once it has passed
  if ((m = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(s))) {
    const d = Number(m[1]);
    for (let k = 0; k < 3; k++) {
      const t = new Date(y, now.getMonth() + k, 1);
      const day = realDay(t.getFullYear(), t.getMonth() + 1, d);
      if (day && day >= today) return { day, index: m.index, length: m[0].length };
    }
  }
  return null;
}

/** "tomorrow 17:00 · 30 min", "due Fri", "45 min" — what Enter will do, in words. */
export function describeQuickAdd(q: QuickAdd, now: Date = new Date()): string | null {
  const parts: string[] = [];
  if (q.day) {
    const today = ymd(now);
    const t = new Date(now); t.setDate(t.getDate() + 1);
    const word = q.day === today ? 'today' : q.day === ymd(t) ? 'tomorrow' : new Date(`${q.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    parts.push(q.time ? `${word} ${q.time}` : `${word}, any time`);
  }
  if (q.durationMin) parts.push(q.durationMin % 60 === 0 && q.durationMin >= 60 ? `${q.durationMin / 60} h` : `${q.durationMin} min`);
  if (q.deadline) parts.push(`deadline ${new Date(`${q.deadline}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`);
  return parts.length ? parts.join(' · ') : null;
}
