const {chromium}=require('playwright');const {open,fit,ROOT}=require('./lib.cjs');const path=require('path');
const click=(p,re)=>p.evaluate(re=>{const n=document.querySelector('[data-id="mother-pomo"]');const e=[...n.querySelectorAll('button')].find(e=>new RegExp(re).test((e.textContent||'')+'|'+(e.getAttribute('title')||'')));if(e)e.click();return !!e;},re);
(async()=>{const b=await chromium.launch();const p=await open(b,{dsf:2,w:1500,h:900});
await fit(p,['mother-pomo','mother-calendar']);
const shot=async(id,n)=>{await p.locator(`[data-id="${id}"]`).screenshot({path:path.join(ROOT,`.capture/${n}.png`),omitBackground:true});};
await click(p,'planned now');await p.clock.runFor(1500);
await p.clock.fastForward(24*60*1000);await p.clock.runFor(1000);await shot('mother-pomo','q_pre');
await p.clock.fastForward(70*1000);await p.clock.runFor(2000);await shot('mother-pomo','q_break');await shot('mother-calendar','q_cal');
console.log(await p.locator('[data-id="mother-pomo"]').innerText());
await b.close()})()
