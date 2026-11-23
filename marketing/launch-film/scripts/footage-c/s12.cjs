const {chromium}=require('playwright');const L=require('./lib.cjs');
(async()=>{const b=await chromium.launch();
const p=await L.open(b,{order:['pomo','todo','cal','habit'],show:['mother-pomo','t-review']});
const G=()=>p.evaluate(()=>{const g=id=>{const r=document.querySelector(`[data-id="${id}"]`).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {a:g('mother-pomo'),c:g('t-review')}});
await L.fit(p,['mother-pomo']);
// off-camera set-up: pick the plan and start a session (S09 shows this on screen)
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||'')).click();});await p.clock.runFor(500);
await p.evaluate(()=>[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||'')).click());await p.clock.runFor(800);
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||'')).click();});await p.clock.runFor(1500);
// the app parks the activated task card far away (flow x=4000): bring it next to the Timer with real drags
const drag=async(sx,sy,tx,ty,n=24)=>{await p.mouse.move(sx,sy);await p.clock.runFor(100);await p.mouse.down();for(let i=1;i<=n;i++){await p.mouse.move(sx+(tx-sx)*i/n,sy+(ty-sy)*i/n);await p.clock.runFor(40);}await p.mouse.up();await p.clock.runFor(500);};
await L.fit(p,['mother-pomo','t-review'],3);
let g=await G();console.log('zoomed out',JSON.stringify(g));
await p.mouse.move(640,300);for(let i=0;i<6;i++){await p.mouse.wheel(60,0);await p.clock.runFor(60);}await p.clock.runFor(500);   // pan the canvas left so the card comes into view
g=await G();console.log('panned',JSON.stringify(g));
await drag(g.c.x+g.c.w/2,g.c.y+g.c.h/2,60,g.c.y+g.c.h/2);   // card to the left edge
await L.fit(p,['mother-pomo','t-review'],3);g=await G();console.log('closer',JSON.stringify(g));
await drag(g.c.x+g.c.w/2,g.c.y+g.c.h/2,g.a.x+g.a.w*(1+40/560)+g.c.w/2,g.a.y+g.a.h/2);
await L.fit(p,['mother-pomo','t-review'],3);g=await G();console.log('fit both',JSON.stringify(g));
await p.mouse.move(640,700);
await p.clock.fastForward(9*60*1000);await p.clock.runFor(900);
const MODE=process.env.MODE||'wide';
const wheel=async(x,y,dy)=>{await p.mouse.move(x,y);await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');};
if(MODE==='close'){   // static close-up: app zoom ~2.6x anchored on the card (the Timer leaves the frame entirely)
  for(let i=0;i<17;i++){const gg=await G();await wheel(gg.c.x+gg.c.w/2,gg.c.y+gg.c.h/2,-100);await p.clock.runFor(120);}
  await p.clock.runFor(900);await p.waitForTimeout(200);await p.clock.runFor(900);
  g=await G();console.log('close',JSON.stringify(g));
  // centre the card in the frame: pan with the wheel (no ctrl), a few corrections
  for(let k=0;k<6;k++){g=await G();const dx=640-(g.c.x+g.c.w/2),dy=370-(g.c.y+g.c.h/2);if(Math.abs(dx)<3&&Math.abs(dy)<3)break;
    await p.mouse.move(640,360);await p.mouse.wheel(-dx*1.7,-dy*1.7);await p.clock.runFor(700);await p.waitForTimeout(120);}
  await p.clock.runFor(500);
  g=await G();console.log('centred',JSON.stringify(g));
}
const name=MODE==='close'?'S12b-card-closeup':'S12-card-fill';
await L.shoot(p,{name,seconds:6,start:{x:L.VW+40,y:640},
  markers:{runStarts:0},
  notes:MODE==='close'?'Close-up (app zoom ~2.6x) on the real task card "Review the proposal": "Focusing now", progress bar filling from ~9m to ~22m of 1h as the clock is fast-forwarded. No cursor.':'Real Timer running on "Review the proposal" with its task card beside it (dark), both whole: clock fast-forwarded 13 min so the digits count down and the card fills from 9m to 22m of 1h. No cursor. The task card was dragged next to the Timer in set-up (the app parks activated cards elsewhere).',
  ffwd:[{from:0,to:6,ms:13*60*1000}],
  events:[{t:0,gen:function*(k){yield [{k:'cur',on:false}];}}]});
await b.close()})()
