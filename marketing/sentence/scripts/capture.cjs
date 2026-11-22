// Films each KRNL0 window whole, doing one real job, on its scene's ground colour.
// Needs the renderer preview running: (repo root) npx vite --config vite.preview.config.ts
// Usage: node scripts/capture.cjs [clock,todo,cal,timer,analytics]  → assets/windows/<shot>.mp4
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'), TMP=path.join(ROOT,'.capture'), ONLY=process.argv[2];
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(ROOT,'../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const PAD=110;
const SHOTS={
  clock:    {id:'mother-clock',     ground:'#c9f158', at:'2026-11-24T19:40:00', dsf:2},
  todo:     {id:'mother-todo',      ground:'#a98bf6', at:'2026-11-24T10:02:00', dsf:2, skip:'t-review', noseed:true},
  cal:      {id:'mother-calendar',  ground:'#22d3ee', at:'2026-11-24T10:02:00', dsf:2, skip:'t-review', noseed:true},
  timer:    {id:'mother-pomo',      ground:'#c9f158', at:'2026-11-24T11:00:00', dsf:2, noseed:true},
  analytics:{id:'mother-analytics', ground:'#f4efe2', at:'2026-11-24T19:40:00', dsf:3, view:'summary'},
};
const PLAN='Review the proposal 11:00 1h';
async function open(b,shot){
  const p=await b.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:shot.dsf});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date(shot.at)});
  const flags=`window.__LOGO=${JSON.stringify(LOGO)};window.__SKIP=${JSON.stringify(shot.skip||'')};window.__NOSEED=${!!shot.noseed};window.__VIEW=${JSON.stringify(shot.view||'')};`;
  await p.addInitScript({content:flags+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],.react-flow__minimap,.react-flow__controls,.react-flow__background{display:none!important}
    html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:${shot.ground}!important}
    .react-flow__node:not([data-id="${shot.id}"]){opacity:0!important;pointer-events:none!important}
    .react-flow__edges,.react-flow__edge{display:none!important} *{caret-color:#c9f158}`});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  for(let k=0;k<2;k++){await p.clock.runFor(600);await p.waitForTimeout(250);
    await p.evaluate(id=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[id]}})),shot.id);
    await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
  // Pin the camera: the app pans to a task card it has just created, which would carry the window out of frame.
  await p.evaluate(()=>{window.__T=document.querySelector('.react-flow__viewport').style.transform;});
  const bb=await p.locator(`.react-flow__node[data-id="${shot.id}"]`).boundingBox();
  const clip={x:Math.round(bb.x-PAD),y:Math.round(bb.y-PAD),width:Math.round(bb.width+2*PAD),height:Math.round(bb.height+2*PAD)};
  console.log(shot.id,'box',bb);
  return {p,clip};
}
const keys=(text,pre,post,per=2,hold=10)=>{const s=[];for(let i=0;i<pre;i++)s.push(['w']);for(const c of text){s.push(['k',c]);for(let j=1;j<per;j++)s.push(['w']);}for(let i=0;i<hold;i++)s.push(['w']);s.push(['enter']);for(let i=0;i<post;i++)s.push(['w']);return s;};
(async()=>{const b=await chromium.launch();
for(const [name,shot] of Object.entries(SHOTS)){
  if(ONLY&&!ONLY.split(',').includes(name))continue;
  const dir=path.join(TMP,name);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const {p,clip}=await open(b,shot);let i=0;
  const snap=async(step=33)=>{await p.clock.runFor(step);await p.evaluate(()=>{const v=document.querySelector('.react-flow__viewport');if(v&&window.__T&&v.style.transform!==window.__T)v.style.transform=window.__T;});await p.screenshot({path:path.join(dir,String(i++).padStart(4,'0')+'.png'),clip});};
  const play=async(inp,s)=>{for(const a of s){if(a[0]==='k')await inp.type(a[1]);if(a[0]==='enter')await inp.press('Enter');await snap();}};
  if(name==='clock'){ // the day slipping by: 20 minutes of clock in three seconds
    for(let k=0;k<90;k++)await snap(13000);}
  if(name==='todo'){
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-todo"]');const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add a plan$/i.test((e.textContent||'').trim()));t&&t.click();});
    await p.clock.runFor(250);
    await play(p.locator('[data-id="mother-todo"] input').first(),keys(PLAN,8,34,2,86));}
  if(name==='cal'){
    for(let k=0;k<Number(process.env.CAL_SCROLL||0);k++){await p.mouse.move(clip.x+clip.width/2,clip.y+clip.height/2);await p.mouse.wheel(0,120);await p.clock.runFor(120);await p.waitForTimeout(60);}
    await p.clock.runFor(500);
    for(let k=0;k<24;k++)await snap();
    // the plan is typed into the Todos window (off screen); it lands on the calendar
    const ok=await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-todo"]');if(!n)return false;const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add a plan$/i.test((e.textContent||'').trim()));t&&t.click();return !!t;});
    await p.clock.runFor(250);
    let target=p.locator('[data-id="mother-todo"] input').first();
    if(!ok||!(await target.count())){console.log('todo input not available: typing into the calendar instead');
      await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-calendar"]');const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add an event$/i.test((e.textContent||'').trim()));t&&t.click();});
      await p.clock.runFor(250);target=p.locator('[data-id="mother-calendar"] input').first();}
    await target.focus({timeout:5000}).catch(()=>{});
    for(const c of PLAN)await target.press(c==' '?'Space':c).catch(()=>{});
    await target.press('Enter').catch(()=>{});
    for(let k=0;k<70;k++)await snap();}
  if(name==='timer'){
    // the plan is picked before the camera rolls (the voice says "press start", so the clip opens on Start)
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));t&&t.click();});
    await p.clock.runFor(400);
    await p.evaluate(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));o&&o.click();});
    await p.clock.runFor(700);
    for(let k=0;k<6;k++)await snap();
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();});
    for(let k=0;k<16;k++)await snap();
    for(let k=0;k<64;k++)await snap(3000);}
  if(name==='analytics'){
    for(let k=0;k<24;k++)await snap();
    await p.locator('[data-id="mother-analytics"] button[aria-label="Planned vs spent"]').first().click({force:true});
    for(let k=0;k<70;k++)await snap();}
  await p.close();
  fs.mkdirSync(path.join(ROOT,'assets/windows'),{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-framerate','30','-i',path.join(dir,'%04d.png'),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,tpad=stop_mode=clone:stop_duration='+(name==='clock'?'7.0':'4.0')+'','-c:v','libx264','-crf','14','-pix_fmt','yuv420p','-movflags','+faststart',path.join(ROOT,'assets/windows',name+'.mp4')]);
  console.log(name,i,'frames →',`assets/windows/${name}.mp4`,clip);
}
await b.close()})()
