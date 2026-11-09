// Milestone cards as images (launch-experience.md F21), drawn to match the
// "Milestone cards to share" design board exactly:
//   Streak · paper · 1080 × 1080   cream, dot grid, the cube, big number, the habit in serif, a 4-week day grid
//   Sessions · LCD · 1080 × 1080   dark green screen, glowing number, 12 weekly bars
//   Story · 1080 × 1920            dark, the habit in serif, 70 days as a 10 × 7 grid
// Layout is written in the design's own units (a 400 px card, a 225 px story)
// and scaled up. Only a habit name and numbers — never tasks or times of day.

import { formatFocused, type Milestone } from './milestones';
import logoUrl from '../assets/launch/logo.webp';
import cubeUrl from '../assets/launch/cube-paper.webp';

export type CardFormat = 'square' | 'story';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SERIF = "'Instrument Serif', Georgia, serif";

const C = {
  cream: '#ebe1c2', sepia: '#1a1612', sepia3: '#554b38', amber: '#d9a55a', acid: '#c9f158', empty: '#b9a77c',
  lcd: '#0d1207', lcdEdge: '#2a3312', lcdLabel: '#7ea22b', muted: '#8a8270', coal: '#131210', ink: '#f4efe2',
  teal: '#5fa3a8', off: '#2a2f2a', edge: '#2f2b24',
};
const BAR_RAMP = ['#3f5c0a', '#3f5c0a', '#3f5c0a', '#5e7d1d', '#5e7d1d', '#5e7d1d', '#7ea22b', '#7ea22b', '#a8d244', '#a8d244', C.acid, C.acid];

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The last `n` days, oldest first: true when the habit was done. */
export function lastDays(log: readonly string[], n: number, today = new Date()): boolean[] {
  const done = new Set(log);
  const out: boolean[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(done.has(ymd(d)));
  }
  return out;
}

/** Shrink a font until the text fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, max: number): number {
  let size = px;
  ctx.font = font(size);
  while (ctx.measureText(text).width > max && size > 8) {
    size -= 1;
    ctx.font = font(size);
  }
  return size;
}

function brand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number, color: string, text: number): void {
  if (logo) ctx.drawImage(logo, x, y, size, size);
  ctx.fillStyle = color;
  ctx.font = `700 ${text}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('KRNL0', x + size + 10, y + size / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, em: number, align: 'left' | 'right' = 'left'): void {
  // Letter-spacing by hand: canvas letterSpacing is not everywhere yet.
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10);
  const gap = em * size;
  const width = [...text].reduce((w, ch) => w + ctx.measureText(ch).width + gap, -gap);
  let cx = align === 'right' ? x - width : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + gap;
  }
}

function streakSquare(ctx: CanvasRenderingContext2D, m: Extract<Milestone, { kind: 'streak' }>, logo: HTMLImageElement | null, cube: HTMLImageElement | null, date: Date): void {
  // 400 × 400 design units.
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = 'rgba(26,22,16,.2)';
  for (let y = 8; y < 400; y += 16) for (let x = 8; x < 400; x += 16) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  if (cube) ctx.drawImage(cube, 400 - 22 - 96, 22, 96, 96);
  brand(ctx, logo, 28, 28, 24, C.sepia, 13);

  const num = String(m.value);
  ctx.fillStyle = C.sepia;
  const numPx = fit(ctx, num, (px) => `800 ${px}px ${MONO}`, 120, 230);
  ctx.font = `800 ${numPx}px ${MONO}`;
  const base = 84 + numPx * 0.78;
  ctx.fillText(num, 24, base);
  const nw = ctx.measureText(num).width;
  ctx.font = `700 16px ${MONO}`;
  ctx.fillText('day', 24 + nw + 12, base - 22);
  ctx.fillText('streak', 24 + nw + 12, base - 4);

  const name = `${m.habit}.`;
  fit(ctx, name, (px) => `400 ${px}px ${SERIF}`, 34, 344);
  ctx.fillText(name, 28, base + 46);

  // The last four weeks: amber when done, acid today, an outline when missed.
  const days = lastDays(m.log, 28, date);
  const cols = 7;
  const gap = 5;
  const cw = (344 - gap * (cols - 1)) / cols;
  const ch = 22;
  const top = 400 - 28 - 12 - 16 - (4 * ch + 3 * gap);
  days.forEach((done, i) => {
    const x = 28 + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    const today = i === days.length - 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 3);
    if (done) {
      ctx.fillStyle = today ? C.acid : C.amber;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.sepia;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, cw - 2, ch - 2, 2.5);
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.empty;
      ctx.beginPath();
      ctx.roundRect(x + 0.75, y + 0.75, cw - 1.5, ch - 1.5, 2.5);
      ctx.stroke();
    }
  });

  ctx.font = `400 10.5px ${MONO}`;
  ctx.fillStyle = C.sepia3;
  ctx.fillText('planned on KRNL0', 28, 400 - 28 - 2);
  ctx.textAlign = 'right';
  ctx.fillText(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 372, 400 - 28 - 2);
  ctx.textAlign = 'left';
}

function sessionsSquare(ctx: CanvasRenderingContext2D, m: Extract<Milestone, { kind: 'sessions' }>, logo: HTMLImageElement | null): void {
  ctx.fillStyle = C.lcd;
  ctx.fillRect(0, 0, 400, 400);
  // LCD scan lines.
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = 0; y < 400; y += 3) ctx.fillRect(0, y, 400, 1);
  ctx.strokeStyle = C.lcdEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 399, 399);

  brand(ctx, logo, 28, 28, 24, C.ink, 13);
  ctx.font = `500 10.5px ${MONO}`;
  ctx.fillStyle = C.lcdLabel;
  tracked(ctx, `POMO.${String(m.value).padStart(3, '0')}`, 372, 44, 0.12, 'right');

  const num = String(m.value);
  const px = fit(ctx, num, (s) => `700 ${s}px ${MONO}`, 112, 344);
  ctx.font = `700 ${px}px ${MONO}`;
  ctx.fillStyle = C.acid;
  ctx.shadowColor = 'rgba(201,241,88,.45)';
  ctx.shadowBlur = 22;
  ctx.fillText(num, 24, 84 + px * 0.8);
  ctx.shadowBlur = 0;

  ctx.font = `500 15px ${MONO}`;
  tracked(ctx, 'FOCUS SESSIONS', 28, 84 + px * 0.8 + 34, 0.14);

  // Twelve weeks of focus, greener as they get closer to now.
  const weeks = m.weeks.length > 0 ? m.weeks : new Array<number>(12).fill(0);
  const max = Math.max(1, ...weeks);
  const gap = 6;
  const bw = (344 - gap * (weeks.length - 1)) / weeks.length;
  const bottom = 400 - 28 - 14 - 12;
  weeks.forEach((w, i) => {
    const h = Math.max(4, (w / max) * 88);
    ctx.fillStyle = BAR_RAMP[Math.round((i / Math.max(1, weeks.length - 1)) * (BAR_RAMP.length - 1))] ?? C.acid;
    ctx.fillRect(28 + i * (bw + gap), bottom - h, bw, h);
  });

  ctx.font = `400 10.5px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('last 12 weeks', 28, 400 - 28 - 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatFocused(m.focusedMs)} focused`, 372, 400 - 28 - 2);
  ctx.textAlign = 'left';
}

function streakStory(ctx: CanvasRenderingContext2D, m: Extract<Milestone, { kind: 'streak' }>, logo: HTMLImageElement | null, date: Date): void {
  // 225 × 400 design units.
  ctx.fillStyle = C.coal;
  ctx.fillRect(0, 0, 225, 400);
  brand(ctx, logo, 20, 24, 20, C.ink, 11);
  ctx.font = `500 10.5px ${MONO}`;
  ctx.fillStyle = C.teal;
  tracked(ctx, `${m.total} DAYS`, 20, 82, 0.12);
  ctx.fillStyle = C.ink;
  const name = `${m.habit}.`;
  const px = fit(ctx, name, (s) => `400 ${s}px ${SERIF}`, 30, 185);
  ctx.font = `400 ${px}px ${SERIF}`;
  ctx.fillText(name, 20, 82 + 10 + px);
  ctx.font = `800 64px ${MONO}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(String(m.value), 18, 200);
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = C.muted;
  tracked(ctx, 'DAYS IN A ROW', 20, 220, 0.12);

  // Seventy days, ten to a row.
  const days = lastDays(m.log, 70, date);
  const cols = 10;
  const gap = 3;
  const cw = (185 - gap * (cols - 1)) / cols;
  const ch = 12;
  const top = 400 - 24 - 16 - (7 * ch + 6 * gap);
  days.forEach((done, i) => {
    ctx.fillStyle = done ? C.teal : C.off;
    ctx.beginPath();
    ctx.roundRect(20 + (i % cols) * (cw + gap), top + Math.floor(i / cols) * (ch + gap), cw, ch, 2);
    ctx.fill();
  });
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('planned on KRNL0', 20, 400 - 24);
}

/** A story card exists for habit streaks only. */
export function formatsFor(m: Milestone): CardFormat[] {
  return m.kind === 'streak' ? ['square', 'story'] : ['square'];
}

export async function drawMilestoneCard(m: Milestone, format: CardFormat = 'square', date = new Date()): Promise<HTMLCanvasElement> {
  try { await document.fonts.ready; } catch { /* fonts API missing */ }
  const story = format === 'story' && m.kind === 'streak';
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = story ? 1920 : 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const [logo, cube] = await Promise.all([loadImage(logoUrl), loadImage(cubeUrl)]);
  ctx.scale(story ? 1080 / 225 : 1080 / 400, story ? 1920 / 400 : 1080 / 400);
  if (m.kind === 'sessions') sessionsSquare(ctx, m, logo);
  else if (story) streakStory(ctx, m, logo, date);
  else streakSquare(ctx, m, logo, cube, date);
  return canvas;
}

export function cardFileName(m: Milestone, format: CardFormat = 'square'): string {
  const base = m.kind === 'streak' ? `krnl0-${m.value}-day-streak` : `krnl0-${m.value}-focus-sessions`;
  return format === 'story' && m.kind === 'streak' ? `${base}-story.png` : `${base}.png`;
}
