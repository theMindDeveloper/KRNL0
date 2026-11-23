// Films the Habits window (real app, browser preview on :5201) in several states -> assets/*.png (transparent corners, no baked shadow).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = path.resolve(__dirname, '../assets'); fs.mkdirSync(OUT, { recursive: true });
const BOARD = fs.readFileSync(path.join(__dirname, 'board.js'), 'utf8');
const only = process.argv[2];
async function session(variant, size, fn) {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: size, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('PE', e.message.slice(0, 160)));
  await p.clock.install({ time: new Date('2026-11-24T10:30:00') });
  await p.addInitScript({ content: `window.__V=${JSON.stringify(variant)};` });
  await p.addInitScript({ content: BOARD });
  await p.goto('http://localhost:5201/?fixture=fresh'); await p.clock.runFor(5000); await p.waitForTimeout(1200); await p.clock.runFor(4000);
  await p.addStyleTag({ content: `[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background,[data-testid="dock"],[data-testid="dock-layer"]{display:none!important}
    html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane,.react-flow__viewport{background:transparent!important}
    .react-flow__node:not([data-id="mother-habit"]){visibility:hidden!important}
    [data-id="mother-habit"],[data-id="mother-habit"] *{filter:none!important} [data-id="mother-habit"] .mother-frame{box-shadow:none!important} .mother-frame__corners{display:none!important}` });
  await p.evaluate(() => { for (const e of document.querySelectorAll('div,section')) { const r = e.getBoundingClientRect(); if (/^\s*Good (morning|afternoon|evening)/.test(e.textContent || '') && r.height < 80 && r.height > 20) e.style.display = 'none'; } });
  const fit = async () => { await p.evaluate(() => window.dispatchEvent(new CustomEvent('krnl:fit-nodes', { detail: { nodeIds: ['mother-habit'] } }))); await p.clock.runFor(1500); await p.waitForTimeout(250); };
  await fit();
  const shot = async (name) => { const n = p.locator('[data-id="mother-habit"] .mother-frame'); await n.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true }); console.log('shot', name, JSON.stringify(await n.boundingBox())); };
  await fn(p, shot, fit); await b.close();
}
const tick = async (p, name, wait = 500) => { await p.locator(`button[title^="${name} 2026-11-24"]`).first().click(); await p.clock.runFor(wait); };
(async () => {
  if (!only || only === 'week') await session('week', { width: 900, height: 900 }, async (p, shot) => { await shot('week-before'); await tick(p, 'Morning run'); await shot('week-ticked'); await tick(p, 'Read 20 pages'); await tick(p, 'Drink water', 900); await shot('week-all'); });
  if (!only || only === 'repair') await session('repair', { width: 900, height: 900 }, async (p, shot) => { await shot('repair'); });
  if (!only || only === 'month') await session('month', { width: 900, height: 900 }, async (p, shot) => { await shot('month'); });
  if (!only || only === 'year') await session('year', { width: 1100, height: 800 }, async (p, shot) => { await shot('year'); });
})();
