// Films the REAL Ambient Radio widget (and the Timer window) in the browser preview, one PNG per state, transparent corners.
// Needs the preview running: (repo root) npx vite --config vite.preview.config.ts  -> http://localhost:5201
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.resolve(__dirname,'..','assets');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(3000);
const radio=p.locator('[data-testid="ambient-radio"]');
await p.locator('[data-testid="ambient-radio-edge-tab-right"]').click({force:true});await p.clock.runFor(2500);
const chip=(id)=>p.locator(`[data-testid="ambient-radio-preset-${id}"]`);
const playBtn=p.locator('[data-testid="ambient-radio-play"]');
const ensurePlaying=async()=>{if((await playBtn.getAttribute('aria-label'))!=='Pause'){await playBtn.click();await p.clock.runFor(400);}};
async function shot(name,ms=3200){await p.clock.runFor(ms);
  await p.addStyleTag({content:`html,body,#root{background:transparent!important}.react-flow,.react-flow__renderer,.react-flow__pane,[data-testid="topbar"],[data-testid="statusbar"],[data-testid="dock"],[data-testid="dock-layer"],.react-flow__minimap,.react-flow__controls{visibility:hidden!important}`}).catch(()=>{});
  await radio.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true});
  console.log(name,await radio.boundingBox());}
// idle (no sound yet)
await shot('radio-idle',600);
const sets={'dark-brown':['dark','brown'],'white':['white'],'rain':['rain'],'fire':['fire'],'synth':['synth'],'mix':['rain','synth']};
for(const [name,ids] of Object.entries(sets)){
  for(const id of ids){await chip(id).click();await p.clock.runFor(500);}
  await ensurePlaying();
  await shot('radio-'+name);
  for(const id of ids){await chip(id).click();await p.clock.runFor(400);}
}
await b.close()})()
