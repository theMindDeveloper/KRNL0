// Films the real KRNL0 windows for the "planned vs spent" carousel. Transparent background, no baked shadow:
// the slide adds its own (.win). Needs the renderer preview on :5201 (already running).
// Usage: node scripts/shots.cjs [name,name]   -> assets/<name>.png
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..'), OUT=path.join(ROOT,'assets'), ONLY=process.argv[2];
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(ROOT,'../../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const DSF=2;
const SHOTS={
  // id = mother window, at = fake "now", view = analytics view, page = which analytics page, size = window size
  todo:     {id:'mother-todo', at:'2026-11-24T08:30:00', noseed:true, size:{todo:[560,560]}},
  timer:    {id:'mother-pomo', at:'2026-11-24T11:00:00', noseed:true, size:{pomo:[560,560]}, act:'timer'},
  plan_vs:  {id:'mother-analytics', at:'2026-11-24T19:40:00', view:'estimates', size:{analytics:[820,760]}},
  summary:  {id:'mother-analytics', at:'2026-11-24T19:40:00', view:'summary', size:{analytics:[820,760]}},
  recap:    {id:null, at:'2026-11-24T21:05:00', modal:'recap'},
  week:     {id:null, at:'2026-11-23T09:10:00', modal:'week'},
};
async function open(b,shot){
  const p=await b.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:DSF});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date(shot.at)});
  const flags=`window.__LOGO=${JSON.stringify(LOGO)};window.__NOSEED=${!!shot.noseed};window.__VIEW=${JSON.stringify(shot.view||'')};window.__SIZE=${JSON.stringify(shot.size||{})};window.__SKIP='';`;
  await p.addInitScript({content:flags+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  return p;
}
const HIDE=`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],[data-testid="dock-layer"],.react-flow__minimap,.react-flow__controls,.react-flow__background,.react-flow__edges{display:none!important}
 html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}`;
(async()=>{const b=await chromium.launch();fs.mkdirSync(OUT,{recursive:true});
for(const [name,shot] of Object.entries(SHOTS)){
  if(ONLY&&!ONLY.split(',').includes(name))continue;
  const p=await open(b,shot);
  await p.addStyleTag({content:HIDE+(shot.id?`.react-flow__node:not([data-id="${shot.id}"]){opacity:0!important;pointer-events:none!important}`:'')});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  if(shot.id){
    for(let k=0;k<2;k++){await p.clock.runFor(600);await p.waitForTimeout(250);
      await p.evaluate(id=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[id]}})),shot.id);
      await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
    if(shot.act==='timer'){
      await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));t&&t.click();});
      await p.clock.runFor(400);
      await p.evaluate(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));o&&o.click();});
      await p.clock.runFor(700);
      await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();});
      await p.clock.runFor(1500);await p.clock.runFor(60*1000*3);await p.waitForTimeout(300);}
    const bb=await p.locator(`.react-flow__node[data-id="${shot.id}"]`).boundingBox();
    console.log(name,bb);
    await p.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true,clip:{x:Math.floor(bb.x),y:Math.floor(bb.y),width:Math.ceil(bb.width),height:Math.ceil(bb.height)}});
  } else {
    await p.evaluate(ev=>window.dispatchEvent(new CustomEvent(ev)),shot.modal==='recap'?'krnl:recap-show':'krnl:week-show');
    await p.clock.runFor(900);await p.waitForTimeout(400);
    const card=p.locator(shot.modal==='recap'?'[data-testid="day-recap"]':'[data-testid="week-recap"]');
    const bb=await card.boundingBox();console.log(name,bb);
    await card.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true});
  }
  await p.close();
}
await b.close()})()
