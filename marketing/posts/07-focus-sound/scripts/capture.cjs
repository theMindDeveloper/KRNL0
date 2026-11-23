// Films the real Ambient Radio (and the Timer it sits beside) in the browser preview of the app.
// Needs the preview running:  (repo root) npx vite --config vite.preview.config.ts   -> http://localhost:5201
// Theme: the app's bright (light) theme (localStorage krnl0-theme).
// Usage: node scripts/capture.cjs   -> assets/*.png (transparent corners, no baked shadow; the slides add the shadow in CSS)
// The radio is filmed in real time (its settings panel does not like the fake clock); the Timer uses the fake clock.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'assets');fs.mkdirSync(OUT,{recursive:true});
const CSS=`[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background,[data-testid="dock"],[data-testid="dock-layer"],.react-flow__edges{display:none!important}
  html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}
  [data-testid="ambient-radio"]>div:last-child{box-shadow:none!important}
  /* light theme: the speaker grille dots take the paper colour and wash the dark particle screen out to grey; thin them so the screen reads dark as designed (Decision 60) */
  [data-testid="ambient-radio-grille"]{opacity:.22!important}`;
(async()=>{
const b=await chromium.launch();
// ── the radio, real time ──
{const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:3.5});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,120)));
await p.addInitScript(()=>{localStorage.setItem('krnl0-theme','light');localStorage.setItem('krnl0-ambient-radio-edge','none');localStorage.setItem('krnl0-ambient-radio-pos',JSON.stringify({x:820,y:40}));});
await p.goto('http://localhost:5201/?fixture=fresh');await p.waitForTimeout(3500);await p.addStyleTag({content:CSS});
const radio=()=>p.locator('[data-testid="ambient-radio"] > div').last();
const shot=async(name)=>{await p.mouse.move(5,5);const bb=await radio().evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});await p.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true,clip:bb});console.log('shot',name,Math.round(bb.width),Math.round(bb.height));};
const click=async(tid)=>{await p.locator(`[data-testid="${tid}"]`).click();await p.waitForTimeout(500);};
await p.waitForTimeout(800);await shot('radio-off');
await click('ambient-radio-preset-rain');await p.waitForTimeout(2500);await shot('radio-rain');
await click('ambient-radio-preset-fire');await click('ambient-radio-preset-synth');
const slide=async(id,frac)=>{const l=p.locator(`[data-testid="ambient-radio-layer-vol-${id}"]`);const bb=await l.boundingBox();if(bb){await p.mouse.click(bb.x+bb.width*frac,bb.y+bb.height/2);await p.waitForTimeout(300);}else console.log('no slider',id);};
await slide('rain',.7);await slide('fire',.32);await slide('synth',.5);
await p.waitForTimeout(2500);await shot('radio-mix');
// (opening the settings with Synth focused throws a React 'Maximum update depth' error in the preview, so Rain is focused first)
await p.locator('[data-testid="ambient-radio-mixer"]').getByText('Rain',{exact:true}).click();await p.waitForTimeout(400);
await click('ambient-radio-gear');await p.waitForTimeout(800);await shot('radio-settings');
await click('ambient-radio-gear');
await click('ambient-radio-preset-yt');await p.waitForTimeout(800);await shot('radio-yt');
await p.close();}
// ── the timer, fake clock ──
{const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:3.5});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,120)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript(()=>localStorage.setItem('krnl0-theme','light'));
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
await p.addStyleTag({content:CSS+`[data-testid="ambient-radio"]{display:none!important}`});
const tick=async(n,ms=100)=>{for(let i=0;i<n;i++)await p.clock.runFor(ms);await p.waitForTimeout(60);};
for(let k=0;k<12;k++){await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-pomo']}})));await tick(10);
  const w=await p.evaluate(()=>document.querySelector('[data-id="mother-pomo"]').getBoundingClientRect().width);if(w>480)break;}
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));t&&t.click();});await tick(5);
await p.evaluate(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));o&&o.click();});await tick(8);
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();});await tick(12);
await p.clock.runFor(4*60*1000);await tick(10);
const bb=await p.evaluate(()=>{const r=document.querySelector('[data-id="mother-pomo"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
await p.screenshot({path:path.join(OUT,'timer.png'),omitBackground:true,clip:bb});console.log('shot timer',Math.round(bb.width),Math.round(bb.height));
await p.close();}
await b.close()})()
