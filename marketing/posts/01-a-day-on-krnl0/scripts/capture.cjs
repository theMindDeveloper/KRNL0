// Films each KRNL0 window whole (transparent PNG, no baked shadow) for the carousel.
// Needs the preview running at :5201.  Usage: node scripts/capture.cjs [todo,cal,timer,habits,analytics]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'assets');fs.mkdirSync(OUT,{recursive:true});
const ONLY=process.argv[2];
const SHOTS={
  todo:     {id:'mother-todo',      at:'2026-11-24T08:00:00', flags:{}},
  cal:      {id:'mother-calendar',  at:'2026-11-24T10:30:00', flags:{SCHED:1,CALZOOM:Number(process.env.CALZOOM||6)}},
  timer:    {id:'mother-pomo',      at:'2026-11-24T10:30:00', flags:{SCHED:1}},
  habits:   {id:'mother-habit',     at:'2026-11-24T20:00:00', flags:{}},
  planned:  {id:'mother-analytics', at:'2026-11-24T19:40:00', flags:{SCHED:1,DONE:1}, click:1},
  recap:    {id:'mother-analytics', at:'2026-11-24T21:30:00', flags:{SCHED:1,DONE:1}},
};
(async()=>{const b=await chromium.launch();
for(const [name,s] of Object.entries(SHOTS)){
  if(ONLY&&!ONLY.split(',').includes(name))continue;
  const p=await b.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date(s.at)});
  const flags=Object.entries(s.flags).map(([k,v])=>`window.__${k}=${JSON.stringify(v)};`).join('');
  await p.addInitScript({content:flags+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],.react-flow__minimap,.react-flow__controls,.react-flow__background,.react-flow__edges{display:none!important}
    html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}
    .react-flow__node:not([data-id="${s.id}"]){opacity:0!important;pointer-events:none!important}`});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  for(let k=0;k<2;k++){await p.clock.runFor(600);await p.waitForTimeout(250);
    await p.evaluate(id=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[id]}})),s.id);
    await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
  if(name==='timer'){
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));t&&t.click();});
    await p.clock.runFor(400);
    await p.evaluate(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));o&&o.click();});
    await p.clock.runFor(700);
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();});
    for(let k=0;k<40;k++)await p.clock.runFor(15000);   // ten minutes of focus
    await p.clock.runFor(500);}
  if(s.click){
    await p.clock.runFor(1500);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Good night/.test(x.textContent||''));b&&b.click();});
    await p.clock.runFor(1200);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-id="mother-analytics"] button')].find(x=>x.getAttribute('aria-label')==='Planned vs spent');b&&b.click();});
    await p.clock.runFor(1500);await p.waitForTimeout(600);await p.clock.runFor(1000);}
  if(name==='recap'){await p.clock.runFor(3000);await p.waitForTimeout(500);await p.clock.runFor(1500);
    // film just the evening-recap card (a whole card, not a slice of the window behind it)
    const box=await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Good night/.test(x.textContent||''));if(!b)return null;
      let e=b;while(e&&e.parentElement){const r=e.getBoundingClientRect();if(r.width>400&&r.height>300&&getComputedStyle(e).borderRadius!=='0px')break;e=e.parentElement;}
      const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
    console.log('recap card',box);
    if(box){await p.screenshot({path:path.join(OUT,name+'.png'),clip:box,omitBackground:true});await p.close();continue;}}
  const bb=await p.locator(`.react-flow__node[data-id="${s.id}"]`).boundingBox();
  console.log(name,bb);
  await p.screenshot({path:path.join(OUT,name+'.png'),clip:{x:bb.x,y:bb.y,width:bb.width,height:bb.height},omitBackground:true});
  await p.close();}
await b.close()})()
