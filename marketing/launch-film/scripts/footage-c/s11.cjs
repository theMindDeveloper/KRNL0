const {chromium}=require('playwright');const L=require('./lib.cjs');
const OPEN={order:['pomo','todo','cal','habit'],show:['mother-pomo','mother-todo']};
const btn=(re)=>`()=>{const n=document.querySelector('[data-id="mother-pomo"]');return [...n.querySelectorAll('button')].find(e=>/${re}/.test((e.textContent||'').trim()))}`;
const B=re=>new Function('return '+btn(re))();
(async()=>{const b=await chromium.launch();
// dry run on a throw-away page to measure every control we need to click
const d=await L.open(b,{...OPEN,dsf:1});await L.fit(d,['mother-pomo','mother-todo']);
const R=(p,fn)=>L.rect(p,fn);
const tab=await R(d,B('^Stopwatch$'));
await d.mouse.click(tab.x+tab.w/2,tab.y+tab.h/2);await d.clock.runFor(600);
const start=await R(d,B('^Start$'));
await d.mouse.click(start.x+start.w/2,start.y+start.h/2);await d.clock.runFor(600);
await d.clock.fastForward(14*60*1000);await d.clock.runFor(600);
const stop=await R(d,B('^Stop$'));
await d.mouse.click(stop.x+stop.w/2,stop.y+stop.h/2);await d.clock.runFor(700);
const input=await R(d,()=>document.querySelector('[data-id="mother-pomo"] input'));
const check=await R(d,()=>{const n=document.querySelector('[data-id="mother-pomo"]');return [...n.querySelectorAll('button')].find(e=>/Save/.test(e.title||''))});
await d.close();console.log({tab,start,stop,input,check});
const p=await L.open(b,OPEN);await L.fit(p,['mother-pomo','mother-todo']);
const c=r=>[r.x+r.w/2,r.y+r.h/2];
await L.shoot(p,{name:'S11-stopwatch',seconds:7,
  markers:{stopwatchTab:0.9,start:1.7,runningEnds:3.2,stop:3.7,nameSpan:5.6,save:6.2},
  notes:'Real Timer in Stopwatch mode (dark): Stopwatch tab, Start, clock fast-forwarded 14 min so it counts 00:00 -> 14:01, Stop, the app asks to name the span ("What did you do?"), a short name is typed and saved. Todos beside it.',
  events:[{t:0,gen:function*(k){
    yield* k.moveTo(...c(tab),24);yield [{k:'click'}];yield* k.wait(10);
    yield* k.moveTo(...c(start),12);yield [{k:'click'}];yield* k.wait(4);          // clock runs from here (ffwd window below)
    yield* k.wait(45);
    yield* k.moveTo(...c(stop),12);yield [{k:'click'}];yield* k.wait(12);
    yield* k.moveTo(...c(input),10);yield [{k:'click'}];yield* k.wait(4);
    for(const ch of 'Proposal review'){yield [{k:'key',ch}];yield [];}
    yield* k.wait(8);yield* k.moveTo(...c(check),10);yield [{k:'click'}];}}],
  ffwd:[{from:52/30,to:97/30,ms:14*60*1000}]});
await b.close()})()
