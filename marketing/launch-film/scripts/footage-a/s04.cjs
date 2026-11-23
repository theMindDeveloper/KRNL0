const L=require('./lib.cjs');
(async()=>{
const {b,p}=await L.open({calSize:[620,620],hr:{start:9,end:18},calZoom:5,noseed:true});
const R=new L.Recorder(p,'s04');
const ALL=['mother-todo','mother-calendar','mother-habit','mother-pomo','mother-clock','mother-analytics'];
R.focus=['mother-pomo'];R.rate=1;await L.fit(p,['mother-pomo']);
for(let i=0;i<3;i++){await p.evaluate((all)=>{for(const id of all){const el=document.querySelector(`.react-flow__node[data-id="${id}"]`);if(el)el.style.opacity=id==='mother-pomo'?'1':'0';}},ALL);await p.clock.runFor(200);}
R.op=Object.fromEntries(ALL.map(i=>[i,i==='mother-pomo'?1:0]));R.rate=0.22;
const center=(r)=>[r.x+r.w/2,r.y+r.h/2];
const orb=await R.rect('[data-testid="orb-button"]');
await R.hold(0.15);
await R.moveTo(...center(orb),0.6);R.mark('orb-click');await R.click();
await R.hold(0.7);R.mark('assistant-open');
const t=await R.rect('[data-testid="orb-tour-pomo"]');
await R.moveTo(...center(t),0.5);await R.hold(0.1);R.mark('timer-tour-click');await R.click();
await R.hold(0.2);R.mark('step-1');await R.hold(1.2);
let next=await R.rect('[data-testid="tour-next"]');
await R.moveTo(...center(next),0.45);R.mark('next-click-1');await R.click();
await R.hold(0.9);R.mark('step-which-task');
next=await R.rect('[data-testid="tour-next"]');
await R.moveTo(...center(next),0.45);R.mark('next-click-2');await R.click();
await R.hold(0.7);R.mark('step-press-start');
const st=await R.rect('[data-testid="pomo-primary"]');
await R.moveTo(...center(st),0.5);R.mark('start-click');await R.click();
R.mark('running');for(let i=0;i<30;i++)await R.frame(200);   // timer runs, clock fast-forwarded 6 s over 1 s
await R.hold(0.6);R.mark('next-step');
const d=await R.finish('S04-tour-pomo','Real guided tour "Timer - record what you do": Orb -> Tutorials -> Timer, step 1 (ring on the Timer), step 2 "Press Start" ring, cursor presses the real Start button, the session runs (fake clock fast-forwarded 6 s over 1 s), the tour moves on. Dark theme, chrome visible. 1280x720 CSS px @2.25 -> 2880x1620.');
console.log('S04 duration',d,JSON.stringify(R.markers));
await b.close()})()
