// Shared capture engine for the launch-film footage (group D). Deterministic: fake clock stepped one frame at a time.
// Usage: const {session} = require('./lib.cjs'); await session({...}, async (ctx)=>{ ... });
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..'); const FPS = 30, W = 1920, H = 1080, DSF = 1.5;
const BASE = fs.readFileSync(path.join(ROOT, 'scripts/board-base.js'), 'utf8');
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const CHROME_HIDE = `[data-testid="ambient-radio"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__edges{display:none!important}
 .react-flow__node,.react-flow__node *{filter:none!important}`;

async function session(cfg, fn) {
  const id = cfg.id; const tmp = path.join(ROOT, 'scripts/groupD', '.capture-' + id); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  p.on('pageerror', (e) => console.log('PE', e.message.slice(0, 160)));
  await p.clock.install({ time: new Date(cfg.at || '2026-11-24T10:30:00') });
  const flags = `window.__LOGO=${JSON.stringify(cfg.logo || '')};window.__NOSEED=${!!cfg.noseed};window.__VIEW=${JSON.stringify(cfg.view || '')};window.__SIZE=${JSON.stringify(cfg.size || {})};window.__SKIP='';`;
  await p.addInitScript({ content: `try{localStorage.setItem('krnl0-theme','${cfg.theme || 'dark'}')}catch(e){}` });
  await p.addInitScript({ content: flags + BASE });
  if (cfg.mutate) await p.addInitScript({ content: `(()=>{const f=${cfg.mutate};const d=Object.getOwnPropertyDescriptor(window,'krnl');Object.defineProperty(window,'krnl',{configurable:true,get:()=>d.get.call(window),set:(v)=>{d.set.call(window,v);const o=v.boardLoad;v.boardLoad=async()=>f(await o());}});})();` });   // extra board tweaks, applied AFTER the base seed
  await p.goto('http://localhost:5201/?fixture=fresh'); await p.clock.runFor(5000); await p.waitForTimeout(1500); await p.clock.runFor(4000);
  await p.addStyleTag({ content: CHROME_HIDE + (cfg.css || '') });
  await p.evaluate(() => {
    for (const e of document.querySelectorAll('div,section')) { const r = e.getBoundingClientRect(); if (/^\s*Good (morning|afternoon|evening)/.test(e.textContent || '') && r.height < 80 && r.height > 20) e.style.display = 'none'; }
    const c = document.createElement('div'); c.id = 'cur';document.head.insertAdjacentHTML('beforeend','<style>#cur{visibility:hidden!important}</style>');
    c.style.cssText = 'position:fixed;left:0;top:0;width:72px;height:72px;z-index:2147483647;pointer-events:none;opacity:0;transform-origin:8px 6px';
    c.innerHTML = '<svg width="72" height="72" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  let n = 0, ptr = { x: W * 0.85, y: H + 40 }, show = false, down = false;
  const ctx = {
    p, W, H, FPS, ease, easeOut, get frames() { return n; }, get t() { return n / FPS; }, markers: {},
    mark(name) { ctx.markers[name] = +(n / FPS).toFixed(2); },
    async cursor() { await p.evaluate(({ x, y, show, down }) => { const c = document.getElementById('cur'); if (c) { c.style.opacity = show ? '1' : '0'; c.style.transform = `translate(${x}px,${y}px) scale(${down ? 0.86 : 1})`; } }, { x: ptr.x, y: ptr.y, show, down }); },
    async frame(step = 1000 / FPS) { await ctx.cursor(); await p.clock.runFor(step); await p.screenshot({ path: path.join(tmp, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); n++; },
    async hold(sec) { for (let i = 0; i < Math.round(sec * FPS); i++) await ctx.frame(); },
    async moveTo(x, y, sec = 0.6, ez = ease) { const sx = ptr.x, sy = ptr.y; show = true; const k = Math.max(1, Math.round(sec * FPS)); for (let i = 1; i <= k; i++) { const e = ez(i / k); ptr = { x: sx + (x - sx) * e, y: sy + (y - sy) * e }; await p.mouse.move(ptr.x, ptr.y); await ctx.frame(); } },
    async click(holdFrames = 3) { await p.mouse.down(); down = true; await ctx.frame(); for (let i = 1; i < holdFrames; i++) await ctx.frame(); await p.mouse.up(); down = false; },
    async rect(sel) { return p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel); },
    async center(sel) { const r = await ctx.rect(sel); if (!r) throw new Error('no element ' + sel); return { x: r.x + r.w / 2, y: r.y + r.h / 2, r }; },
    async fit(ids, settle = 3) { for (let k = 0; k < settle; k++) { await p.evaluate((ids) => window.dispatchEvent(new CustomEvent('krnl:fit-nodes', { detail: { nodeIds: ids } })), ids); await p.clock.runFor(1200); await p.waitForTimeout(250); } },
    // zoom the canvas by `factor` around a point (ctrl+wheel, the app's own zoom). Windows are fixed 540x540, so shots zoom in on them.
    async zoom(factor, x = W / 2, y = H / 2) {
      await p.addStyleTag({ content: '.react-flow__node{pointer-events:none!important}' }).then((h) => (ctx._nz = h));
      await p.mouse.move(x, y); await p.keyboard.down('Control');
      const total = -Math.round(Math.log(factor) / 0.00137); const steps = 4;
      for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, Math.round(total / steps)); await p.clock.runFor(120); await p.waitForTimeout(120); }
      await p.keyboard.up('Control'); await p.clock.runFor(900); await p.waitForTimeout(400);
      await p.evaluate((h) => h && h.remove && h.remove(), ctx._nz);
    },
    // zoom until the element's height is ~targetH CSS px (re-measures and corrects)
    async zoomToHeight(sel, targetH, tol = 0.03) {
      for (let k = 0; k < 5; k++) { const r = await ctx.rect(sel); const f = targetH / r.h; if (Math.abs(f - 1) < tol) return r; await ctx.zoom(f, r.x + r.w / 2, r.y + r.h / 2); }
      return ctx.rect(sel);
    },
    isolate(id) { return p.addStyleTag({ content: `.react-flow__node:not([data-id="${id}"]){opacity:0!important;pointer-events:none!important}` }); },
  };
  await fn(ctx);
  await b.close();
  // encode
  const out = path.join(ROOT, 'footage', id + '.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.jpg'), '-vf', 'tpad=stop_mode=clone:stop_duration=1', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(tmp, '00000.jpg'), path.join(ROOT, 'footage', id + '.png')]);
  const dur = +(n / FPS).toFixed(2);
  fs.writeFileSync(path.join(ROOT, 'footage', id + '.json'), JSON.stringify({ fps: FPS, duration: dur, w: W * DSF, h: H * DSF, markers: ctx.markers, notes: cfg.notes || '' }, null, 1));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('done', id, dur + 's', JSON.stringify(ctx.markers));
}
module.exports = { session };

const HABITS_MUTATE = `(b)=>{const pad=n=>String(n).padStart(2,'0');const day=(back)=>{const d=new Date('2026-11-24T12:00:00');d.setDate(d.getDate()-back);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};const run=(a,z)=>Array.from({length:z-a+1},(_,i)=>day(a+i));
 const h=b.nodes.find(n=>n.kind==='habit');const set={'h-run':run(1,6),'h-read':run(1,4),'h-water':run(1,2)};for(const x of h.state.habits)if(set[x.id])x.log=set[x.id];return b}`;
module.exports.HABITS_MUTATE = HABITS_MUTATE;
