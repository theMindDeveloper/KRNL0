// Films the four windows used in the post as transparent PNGs (real app, browser preview on :5201).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.resolve(__dirname,'../assets');
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background,[data-testid="dock"],[data-testid="dock-layer"]{display:none!important}
 html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane,.react-flow__viewport{background:transparent!important}
 [data-id^="mother-"]{filter:none!important;box-shadow:none!important}`});
await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
const fit=async(id)=>{await p.evaluate(id=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[id]}})),id);await p.clock.runFor(1200);await p.waitForTimeout(250);};
const shot=async(id,name)=>{await fit(id);const l=p.locator(`[data-id="${id}"]`);const bb=await l.boundingBox();console.log(name,bb);await l.screenshot({path:`${OUT}/${name}.png`,omitBackground:true});};
await shot('mother-todo','todo');
await shot('mother-calendar','calendar');
// habits: two ticked today
await fit('mother-habit');
for(const n of ['Morning run','Read 20 pages']){await p.locator(`button[title^="${n}"]`).last().click();await p.clock.runFor(400);}
await shot('mother-habit','habits');
// timer running
await fit('mother-pomo');
const t=p.locator('[data-id="mother-pomo"]').getByText(/Start session/).first();await t.click();await p.clock.runFor(21000);
await shot('mother-pomo','timer');
await b.close()})()
