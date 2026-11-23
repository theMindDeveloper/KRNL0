// Films the real Ambient Radio (and the Timer it sits beside) in the browser preview of the app.
// Needs the preview running:  (repo root) npx vite --config vite.preview.config.ts   -> http://localhost:5201
// Usage: node scripts/capture.cjs   -> assets/*.png (transparent corners, no baked shadow; the slides add the shadow in CSS)
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'assets');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:3});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript(()=>{localStorage.setItem('krnl0-ambient-radio-edge','none');localStorage.setItem('krnl0-ambient-radio-pos',JSON.stringify({x:820,y:40}));});
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
await p.addStyleTag({content:`[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background,[data-testid="dock"],[data-testid="dock-layer"],.react-flow__edges{display:none!important}
  html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}
  [data-testid="ambient-radio"]>div:last-child{box-shadow:none!important}
  *{caret-color:#c9f158}`});
await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}});
const tick=async(n,ms=100)=>{for(let i=0;i<n;i++){await p.clock.runFor(ms);}await p.waitForTimeout(60);};
const radio=()=>p.locator('[data-testid="ambient-radio"] > div').last();
const shot=async(loc,name)=>{const bb=await loc.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});await p.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true,clip:bb});console.log('shot',name,Math.round(bb.width),Math.round(bb.height));};
await tick(6);
await shot(radio(),'radio-off');
// 1) rain
await p.locator('[data-testid="ambient-radio-preset-rain"]').click();await tick(40);
await shot(radio(),'radio-rain');
// 2) a layered mix: rain + fire + synth, with their own volumes
for(const id of ['fire','synth'])await p.locator(`[data-testid="ambient-radio-preset-${id}"]`).click(),await tick(4);
const slide=async(id,frac)=>{const l=p.locator(`[data-testid="ambient-radio-layer-vol-${id}"]`);const bb=await l.boundingBox();if(bb){await p.mouse.click(bb.x+bb.width*frac,bb.y+bb.height/2);await tick(2);}else console.log('no slider',id);};
await slide('rain',.7);await slide('fire',.32);await slide('synth',.5);
await p.mouse.move(5,5);await tick(60);
await shot(radio(),'radio-mix');
// 3) the settings (gear) for a sound
await p.locator('[data-testid="ambient-radio-gear"]').click();await tick(8);
await shot(radio(),'radio-settings');
await p.locator('[data-testid="ambient-radio-gear"]').click();await tick(4);
// 4) YouTube row
await p.locator('[data-testid="ambient-radio-preset-yt"]').click();await tick(10);
await shot(radio(),'radio-yt');
await p.locator('[data-testid="ambient-radio-preset-yt"]').click();await tick(6);
// 5) the Timer, running a plan
await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-pomo']}})));await tick(20);
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));t&&t.click();});await tick(5);
await p.evaluate(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));o&&o.click();});await tick(8);
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();});await tick(12);
await p.clock.runFor(4*60*1000);await tick(10);
await shot(p.locator('[data-id="mother-pomo"]'),'timer');
await b.close()})()
