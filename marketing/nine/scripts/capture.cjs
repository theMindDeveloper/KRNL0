// Films each KRNL0 window whole, doing its one job, on its scene's ground colour.
// Needs the renderer preview running: (repo root) npx vite --config vite.preview.config.ts
// Usage: node scripts/capture.cjs [todo,cal,timer,habit]  → assets/windows/<shot>.mp4
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'), TMP=path.join(ROOT,'.capture'), ONLY=process.argv[2];
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(ROOT,'../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const PAD=110;
const SHOTS={
  todo:{id:'mother-todo',ground:'#a98bf6'}, cal:{id:'mother-calendar',ground:'#22d3ee'},
  timer:{id:'mother-pomo',ground:'#c9f158'}, habit:{id:'mother-habit',ground:'#ee8466'},
};
async function open(b,shot){
  const p=await b.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date('2026-11-23T10:02:00')});
  await p.addInitScript({content:'window.__LOGO='+JSON.stringify(LOGO)+';'+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],.react-flow__minimap,.react-flow__controls,.react-flow__background{display:none!important}
    html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:${shot.ground}!important}
    .react-flow__node:not([data-id="${shot.id}"]){visibility:hidden!important}
    .react-flow__edges,.react-flow__edge{display:none!important}
    *{caret-color:#c9f158}`});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  for(let k=0;k<2;k++){await p.clock.runFor(600);await p.waitForTimeout(250);
    await p.evaluate(id=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[id]}})),shot.id);
    await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
  const bb=await p.locator(`.react-flow__node[data-id="${shot.id}"]`).boundingBox();
  const clip={x:Math.round(bb.x-PAD),y:Math.round(bb.y-PAD),width:Math.round(bb.width+2*PAD),height:Math.round(bb.height+2*PAD)};
  console.log(shot.id,'zoom-fitted box',bb);
  return {p,clip};
}
const typing=(text,pre=4,post=24)=>{const s=[];for(let i=0;i<pre;i++)s.push(['w']);for(const c of text)s.push(['k',c]);for(let i=0;i<10;i++)s.push(['w']);s.push(['enter']);for(let i=0;i<post;i++)s.push(['w']);return s;};
(async()=>{const b=await chromium.launch();
for(const [name,shot] of Object.entries(SHOTS)){
  if(ONLY&&!ONLY.split(',').includes(name))continue;
  const dir=path.join(TMP,name);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const {p,clip}=await open(b,shot);let i=0;
  const snap=async(step=33)=>{await p.clock.runFor(step);await p.screenshot({path:path.join(dir,String(i++).padStart(4,'0')+'.png'),clip});};
  const play=async(inp,s)=>{for(const a of s){if(a[0]==='k')await inp.type(a[1]);if(a[0]==='enter')await inp.press('Enter');await snap();}};
  if(name==='todo'){await p.locator('[data-id="mother-todo"]').getByText('add a plan').first().click({force:true});await p.clock.runFor(200);
    await play(p.getByPlaceholder(/Add a plan/),typing('Call mom 20:00 30m',6,0).slice(0,-1));
    for(let k=0;k<20;k++)await snap();}
  if(name==='cal'){
    // Scroll the zoomed day to the afternoon, where the new event will land.
    const g=await p.locator('[data-id="mother-calendar"] .nowheel, [data-id="mother-calendar"] [class*="scroll"]').first().boundingBox().catch(()=>null);
    const box=g||clip;await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
    for(let k=0;k<Number(process.env.CAL_SCROLL||3);k++){await p.mouse.wheel(0,120);await p.clock.runFor(120);await p.waitForTimeout(60);}
    await p.clock.runFor(600);
    // A block can overlap the input row's hit area, so open the input from inside the page.
    await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-calendar"]');const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add an event$/i.test((e.textContent||'').trim()));t&&t.click();});
    await p.clock.runFor(200);await p.waitForTimeout(100);
    await p.evaluate(()=>{const i=document.querySelector('[data-id="mother-calendar"] input');i&&i.focus();});
    await play(p.locator('[data-id="mother-calendar"] input').first(),typing('Design review 16:00 1h30'));}
  if(name==='timer'){for(let k=0;k<10;k++)await snap();await p.getByText('Start session').first().click();
    for(let k=0;k<14;k++)await snap();for(let k=0;k<70;k++)await snap(3000);}
  if(name==='habit'){const t=await p.evaluate(()=>[...document.querySelectorAll('[data-id="mother-habit"] button')].filter(e=>/click to toggle/.test(e.getAttribute('aria-label')||e.title||'')).map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
    console.log('habit targets',t.length);
    for(let k=0;k<66;k++){const j=[6,16,26,36,46].indexOf(k);if(j>=0&&t[j])await p.mouse.click(t[j].x,t[j].y);await snap();}}
  await p.close();
  fs.mkdirSync(path.join(ROOT,'assets/windows'),{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-framerate','30','-i',path.join(dir,'%04d.png'),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,tpad=stop_mode=clone:stop_duration=4.0','-c:v','libx264','-crf','14','-pix_fmt','yuv420p','-movflags','+faststart',path.join(ROOT,'assets/windows',name+'.mp4')]);
  console.log(name,i,'frames →',`assets/windows/${name}.mp4`,clip);
}
await b.close()})()
