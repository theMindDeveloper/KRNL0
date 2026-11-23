const {chromium}=require('playwright');const L=require('./lib.cjs');
(async()=>{const b=await chromium.launch();
const p=await L.open(b,{order:['pomo','todo','cal','habit'],show:['mother-pomo','mother-todo']});
await L.fit(p,['mother-pomo','mother-todo']);
const R=(fn,a)=>L.rect(p,fn,a);
const pill=await R(()=>{const n=document.querySelector('[data-id="mother-pomo"]');return [...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''))});
// pre-measure the dropdown option
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||'')).click();});
await p.clock.runFor(600);await p.waitForTimeout(200);
const opt=await R(()=>[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||'')));
await p.keyboard.press('Escape');await p.clock.runFor(600);
const start=await R(()=>{const n=document.querySelector('[data-id="mother-pomo"]');return [...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''))});
console.log({pill,opt,start});
const ctr=r=>[r.x+r.w/2,r.y+r.h/2];
await L.shoot(p,{name:'S09-timer-record',seconds:11,
  markers:{pickPlan:1.7,start:2.8,runningEnds:9.9},
  notes:'Real Timer + Todos on the free canvas (dark). Cursor picks "Review the proposal" in the plan pill, presses Start session; clock fast-forwarded 21 min so the countdown runs 25:00 -> ~04:00 (the app counts down) and the Today bar records.',
  events:[
   {t:0,gen:function*(c){yield* c.moveTo(...ctr(pill),30);yield [{k:'click'}];yield* c.wait(8);yield* c.moveTo(...ctr(opt),12);yield [{k:'click'}];yield* c.wait(10);yield* c.moveTo(...ctr(start),22);yield [{k:'click'}];}},
   {t:8.6,gen:function*(c){yield* c.moveTo(L.VW+60,560,30);}}],
  ffwd:[{from:3.0,to:9.9,ms:21*60*1000}]});
await b.close()})()
