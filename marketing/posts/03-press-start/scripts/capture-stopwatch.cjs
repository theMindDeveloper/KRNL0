// Stopwatch mode of the same Timer window (open-ended work).
const {chromium}=require('playwright');const {open,fit,ROOT}=require('./lib.cjs');const path=require('path');
const OUT=path.join(ROOT,'assets');
const click=(p,re)=>p.evaluate(re=>{const n=document.querySelector('[data-id="mother-pomo"]');const e=[...n.querySelectorAll('button')].find(e=>new RegExp(re).test((e.textContent||'').trim()));if(e)e.click();return !!e;},re);
(async()=>{const b=await chromium.launch();const p=await open(b,{dsf:3,w:760,h:720});
await fit(p,['mother-pomo']);
const shot=async(name)=>{await fit(p,['mother-pomo']);await p.clock.runFor(600);await p.locator('[data-id="mother-pomo"]').screenshot({path:path.join(OUT,name+'.png'),omitBackground:true});console.log('saved',name);};
await click(p,'^Stopwatch$');await p.clock.runFor(1000);await shot('sw-idle');
console.log(await p.locator('[data-id="mother-pomo"]').innerText());
await click(p,'^Start$');await p.clock.runFor(2000);
for(let k=0;k<12;k++){await p.clock.fastForward(3*60*1000);await p.clock.runFor(1200);}
await shot('sw-run');
console.log(await p.locator('[data-id="mother-pomo"]').innerText());
await b.close()})()
