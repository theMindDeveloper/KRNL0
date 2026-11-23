// Films the real KRNL0 app for the carousel. Needs the preview running at :5201 (repo root: npx vite --config vite.preview.config.ts).
// Output → assets/*.png   (A: typing a plan + landing on the calendar, B: dragging an unscheduled plan onto the calendar)
const {open,ROOT}=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(ROOT,'assets');fs.mkdirSync(OUT,{recursive:true});
const PLAN='Review the proposal 11:00 1h';
const SHADOW=`.react-flow__node[data-id^="mother-"]{filter:drop-shadow(0 34px 44px rgba(0,0,0,.30)) drop-shadow(0 8px 14px rgba(0,0,0,.22))}`;
const union=async(p,ids,pad)=>{const bs=[];for(const id of ids)bs.push(await p.locator(`[data-id="${id}"]`).boundingBox());
  const x=Math.min(...bs.map(b=>b.x))-pad,y=Math.min(...bs.map(b=>b.y))-pad,x2=Math.max(...bs.map(b=>b.x+b.width))+pad,y2=Math.max(...bs.map(b=>b.y+b.height))+pad;
  return {x:Math.round(x),y:Math.round(y),width:Math.round(x2-x),height:Math.round(y2-y)};};
const addPlanClick=(p)=>p.evaluate(()=>{const n=document.querySelector('[data-id="mother-todo"]');const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add a plan$/i.test((e.textContent||'').trim()));t&&t.click();});
(async()=>{
 // ── A: type the line, press Enter ──
 {const {b,p,ground,fit}=await open({zoom:6});await ground('#141414');await fit(['mother-todo','mother-calendar']);
  const T=await p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform);
  const pin=async(ms)=>{await p.clock.runFor(ms);await p.evaluate(t=>{const v=document.querySelector('.react-flow__viewport');if(v&&v.style.transform!==t)v.style.transform=t;},T);};
  const el=(id,name)=>p.locator(`[data-id="${id}"]`).screenshot({path:path.join(OUT,name)});
  await el('mother-calendar','cal-before.png');await el('mother-todo','todo-before.png');
  await addPlanClick(p);await pin(400);
  const inp=p.locator('[data-id="mother-todo"] input').first();
  for(const c of PLAN){await inp.press(c==' '?'Space':c);await pin(50);}
  await pin(600);await el('mother-todo','todo-typed.png');
  await inp.press('Enter');for(let k=0;k<14;k++)await pin(100);
  await el('mother-todo','todo-added.png');await el('mother-calendar','cal-added.png');
  await ground('#22d3ee');await p.addStyleTag({content:SHADOW});await pin(300);
  await p.screenshot({path:path.join(OUT,'pair-added.png'),clip:await union(p,['mother-todo','mother-calendar'],70)});
  await b.close();}
 // ── B: drag "Send the invoice" onto 15:00 ──
 {const {b,p,ground,fit}=await open({zoom:6,review:true});await ground('#ee8466');await fit(['mother-todo','mother-calendar']);await p.addStyleTag({content:SHADOW});
  const T=await p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform);
  const pin=async(ms)=>{await p.clock.runFor(ms);await p.evaluate(t=>{const v=document.querySelector('.react-flow__viewport');if(v&&v.style.transform!==t)v.style.transform=t;},T);};
  await pin(300);const clip=await union(p,['mother-todo','mother-calendar'],70);
  await p.screenshot({path:path.join(OUT,'pair-before-drag.png'),clip});
  const row=p.locator('[data-id="mother-todo"]').getByText('Send the invoice').first();const rb=await row.boundingBox();
  const cell=p.locator('[data-testid="week-cell-2026-11-24-15"]').first();const cb=await cell.boundingBox();console.log('row',rb,'cell',cb);
  await p.mouse.move(rb.x+30,rb.y+rb.height/2);await p.mouse.down();
  const N=26;for(let i=1;i<=N;i++){await p.mouse.move(rb.x+30+(cb.x+cb.width*0.45-rb.x-30)*i/N,rb.y+rb.height/2+(cb.y+cb.height*0.5-rb.y-rb.height/2)*i/N);await pin(40);}
  await pin(200);await p.screenshot({path:path.join(OUT,'pair-drag.png'),clip});
  await p.mouse.up();for(let k=0;k<12;k++)await pin(100);
  await ground('#f4efe2');await pin(200);
  await p.screenshot({path:path.join(OUT,'pair-dropped.png'),clip});
  await p.locator('[data-id="mother-todo"]').screenshot({path:path.join(OUT,'todo-dropped.png')});
  await b.close();}
 console.log('done');
})();
