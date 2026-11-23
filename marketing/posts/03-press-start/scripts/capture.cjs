// Films the real app doing one focus session and saves transparent window shots (no baked shadow) into assets/.
// Needs the renderer preview running: (repo root) npx vite --config vite.preview.config.ts  (port 5201)
const {chromium}=require('playwright');const {open,fit,ROOT}=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(ROOT,'assets');fs.mkdirSync(OUT,{recursive:true});
const click=(p,re)=>p.evaluate(re=>{const n=document.querySelector('[data-id="mother-pomo"]');const e=[...n.querySelectorAll('button')].find(e=>new RegExp(re).test((e.textContent||'')+'|'+(e.getAttribute('title')||'')));if(e)e.click();return !!e;},re);
(async()=>{const b=await chromium.launch();const p=await open(b,{dsf:2,w:1500,h:900});
await fit(p,['mother-pomo','mother-calendar']);
const shot=async(id,name)=>{await fit(p,[id]);await p.clock.runFor(600);await p.locator(`[data-id="${id}"]`).screenshot({path:path.join(OUT,name+'.png'),omitBackground:true});console.log('saved',name);};
// the pill that offers the plan that is on right now
await shot('mother-pomo','timer-idle');
await click(p,'planned now');await p.clock.runFor(2000);
const advance=async(min)=>{for(let k=0;k<min;k+=3){await p.clock.fastForward(3*60*1000);await p.clock.runFor(1200);}};
await advance(9);await p.clock.runFor(1500);
await shot('mother-pomo','timer-run');
await shot('mother-calendar','cal-run');
// the task card (a node of its own, shown whole)
await shot('t-review','card-run');
await advance(12);await p.clock.runFor(1500);
await shot('mother-calendar','cal-tracked');await shot('mother-pomo','timer-late');
await shot('t-review','card-late');
await advance(6);await p.clock.runFor(3000);
await shot('mother-pomo','timer-break');await shot('mother-calendar','cal-done');
console.log(await p.locator('[data-id="mother-pomo"]').innerText());
await b.close()})()
