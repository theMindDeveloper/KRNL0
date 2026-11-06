// Draws a milestone card as a 1080 × 1080 PNG (launch-experience.md F21).
// Streak: cream "paper" card with the habit name. Sessions: the dark LCD
// card. Only a habit name and numbers are on it — never tasks or times.

import { formatFocused, type Milestone } from './milestones';
import logoUrl from '../assets/launch/logo.webp';

const SIZE = 1080;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SERIF = "'Instrument Serif', Georgia, serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function dots(ctx: CanvasRenderingContext2D, color: string, step: number): void {
  ctx.fillStyle = color;
  for (let y = step / 2; y < SIZE; y += step) {
    for (let x = step / 2; x < SIZE; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxWidth: number): void {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 24) {
    px -= 4;
    ctx.font = font(px);
  }
}

export async function drawMilestoneCard(m: Milestone, date = new Date()): Promise<HTMLCanvasElement> {
  try { await document.fonts.ready; } catch { /* fonts API missing */ }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const logo = await loadImage(logoUrl);
  const paper = m.kind === 'streak';
  const ink = paper ? '#1a1612' : '#f4efe2';
  const muted = paper ? '#554b38' : '#8f8572';

  ctx.fillStyle = paper ? '#ebe1c2' : '#131210';
  ctx.fillRect(0, 0, SIZE, SIZE);
  dots(ctx, paper ? 'rgba(26,22,16,.16)' : 'rgba(240,235,221,.07)', 48);

  // Brand row
  if (logo) ctx.drawImage(logo, 80, 80, 56, 56);
  ctx.fillStyle = ink;
  ctx.font = `700 34px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('KRNL0', logo ? 152 : 80, 108);

  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.textBaseline = 'alphabetic';

  if (m.kind === 'streak') {
    ctx.fillStyle = ink;
    fitText(ctx, String(m.value), (px) => `800 ${px}px ${MONO}`, 420, 860);
    ctx.fillText(String(m.value), 72, 600);
    ctx.font = `500 40px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('DAY STREAK', 84, 670);
    ctx.fillStyle = ink;
    fitText(ctx, `${m.habit}.`, (px) => `400 ${px}px ${SERIF}`, 112, 920);
    ctx.fillText(`${m.habit}.`, 80, 840);
  } else {
    ctx.font = `500 34px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText(`pomo.${String(m.value).padStart(3, '0')}`, 80, 260);
    ctx.fillStyle = '#c9f158';
    ctx.shadowColor = 'rgba(201,241,88,.45)';
    ctx.shadowBlur = 40;
    fitText(ctx, String(m.value), (px) => `800 ${px}px ${MONO}`, 400, 900);
    ctx.fillText(String(m.value), 72, 640);
    ctx.shadowBlur = 0;
    ctx.fillStyle = ink;
    ctx.font = `400 96px ${SERIF}`;
    ctx.fillText('Focus sessions', 80, 790);
    ctx.font = `500 34px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText(`${formatFocused(m.focusedMs)} focused · last 12 weeks`, 84, 860);
  }

  // Footer
  ctx.fillStyle = paper ? 'rgba(26,22,16,.18)' : 'rgba(240,235,221,.12)';
  ctx.fillRect(80, 940, SIZE - 160, 2);
  ctx.font = `500 30px ${MONO}`;
  ctx.fillStyle = muted;
  ctx.fillText('planned on KRNL0', 80, 1000);
  ctx.textAlign = 'right';
  ctx.fillText(day, SIZE - 80, 1000);
  ctx.textAlign = 'left';
  return canvas;
}

export function cardFileName(m: Milestone): string {
  return m.kind === 'streak'
    ? `krnl0-${m.value}-day-streak.png`
    : `krnl0-${m.value}-focus-sessions.png`;
}
