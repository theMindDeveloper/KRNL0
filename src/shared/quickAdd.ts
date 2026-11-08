// Quick add (new-user review 6.1): people type plans the way they say them —
// "Call mom tomorrow at 5pm", "Gym 18:00 1h", "Pay rent friday". This pulls
// the day, the time and the length out of the words. The Todo shows the
// result under the field before Enter, so nothing happens unseen.

import { describeTaskRepeat, nextRepeatDay, type TaskRepeat } from './repeatTask';
import { addDaysYMD } from './ymd';

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
  /** "every day" / "every weekday" / "every sunday": a repeating plan. */
  repeat?: TaskRepeat;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_RE = /\b(?:on\s+)?(next\s+)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;

export function parseQuickAdd(raw: string, now: Date = new Date()): QuickAdd {
  let s = ` ${raw} `;
  const out: QuickAdd = { text: raw.trim() };
  const cut = (m: RegExpExecArray) => { s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); };

  // Time first ("5pm" must not be read as 5 minutes).
  let m = /\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)\b/i.exec(s);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3]!.toLowerCase() === 'pm') h += 12;
    if (Number(m[1]) <= 12) { out.time = `${pad(h)}:${m[2] ?? '00'}`; cut(m); }
  } else {
    m = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(s);
    if (m) { out.time = `${pad(Number(m[1]))}:${m[2]}`; cut(m); }
    else {
      m = /\bat\s+([01]?\d|2[0-3])\b(?!\s*(?:min|h\b|hr|hour))/i.exec(s);
      // "at 3" means 3 pm to almost everyone; 1–7 without am/pm read as afternoon.
      if (m) { const n = Number(m[1]); out.time = `${pad(n >= 1 && n <= 7 ? n + 12 : n)}:00`; cut(m); }
    }
  }

  // Length: "1h30", "1.5h", "2 hours", "45m", "45 min".
  m = /\b(\d{1,2})h([0-5]\d)\b/i.exec(s);
  if (m) { out.durationMin = Number(m[1]) * 60 + Number(m[2]); cut(m); }
  else {
    m = /\b(?:for\s+)?(\d{1,2}(?:\.\d)?)\s?(?:h|hr|hrs|hour|hours)\b/i.exec(s);
    if (m) { out.durationMin = Math.round(Number(m[1]) * 60); cut(m); }
    else {
      m = /\b(?:for\s+)?(\d{1,3})(?:\s?(?:min|mins|minute|minutes)|m)\b/i.exec(s);
      if (m) { out.durationMin = Number(m[1]); cut(m); }
    }
  }
  if (out.durationMin !== undefined && !(out.durationMin >= 1 && out.durationMin <= 480)) delete out.durationMin;

  // Repeat: "every day", "every weekday", "every sunday" (then the first one is the day).
  const today = ymd(now);
  m = /\bevery\s+(day|weekday|weekdays|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.exec(s);
  if (m) {
    const w = m[1]!.toLowerCase();
    if (w === 'day') out.repeat = { kind: 'daily' };
    else if (w.startsWith('weekday')) out.repeat = { kind: 'weekdays' };
    else {
      const idx = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
      out.repeat = { kind: 'weekly', day: idx === 0 ? 7 : idx };
    }
    cut(m);
  }

  // Day.
  m = /\b(today|tonight)\b/i.exec(s);
  if (m) { out.day = today; cut(m); }
  else if ((m = /\b(tomorrow|tmrw|tmr)\b/i.exec(s))) {
    const d = new Date(now); d.setDate(d.getDate() + 1); out.day = ymd(d); cut(m);
  } else if ((m = DAY_RE.exec(s))) {
    const want = DAYS.findIndex((w) => w.startsWith(m![2]!.toLowerCase().slice(0, 3)));
    let add = (want - now.getDay() + 7) % 7;
    if (m[1]) add += add === 0 ? 7 : 7; // "next friday" is the one after this week's
    const d = new Date(now); d.setDate(d.getDate() + add); out.day = ymd(d); cut(m);
  }

  // A repeat with no day: its first matching day from today (today counts
  // unless its time has passed).
  if (out.repeat && !out.day) {
    const passed = out.time ? (() => { const [h, mm] = out.time!.split(':').map(Number) as [number, number]; return h * 60 + mm <= now.getHours() * 60 + now.getMinutes(); })() : false;
    out.day = nextRepeatDay(out.repeat, passed ? today : addDaysYMD(today, -1), today);
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

/** "tomorrow 17:00 · 30 min", "due Fri", "45 min" — what Enter will do, in words. */
export function describeQuickAdd(q: QuickAdd, now: Date = new Date()): string | null {
  const parts: string[] = [];
  if (q.day) {
    const today = ymd(now);
    const t = new Date(now); t.setDate(t.getDate() + 1);
    const word = q.day === today ? 'today' : q.day === ymd(t) ? 'tomorrow' : new Date(`${q.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    parts.push(q.time ? `${word} ${q.time}` : `due ${word}`);
  }
  if (q.durationMin) parts.push(q.durationMin % 60 === 0 && q.durationMin >= 60 ? `${q.durationMin / 60} h` : `${q.durationMin} min`);
  if (q.repeat) parts.push(`repeats ${describeTaskRepeat(q.repeat)}`);
  return parts.length ? parts.join(' · ') : null;
}
