// Films the whole "one take": one continuous recording of the real KRNL0 canvas (1080x1200 stage).
//   - the camera is the app's own fit-view, filmed in slow motion (tiny fake-clock steps while it moves)
//   - the ground colour changes per frame; unused neighbours fade so every stop is clean
//   - real interactions: sticky note from the dock, a plan dragged from Todos onto the Calendar, habit ticks
// Needs the renderer preview running: (repo root) npx vite --config vite.preview.config.ts
// Usage: node scripts/capture.cjs            (full quality → assets/take.mp4)
//        DPR=0.5 node scripts/capture.cjs    (fast dry run → assets/take-dry.mp4)
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const T=JSON.parse(fs.readFileSync(path.join(ROOT,'timing.json'),'utf8'));
const DPR=Number(process.env.DPR||1.6), FPS=30, W=675, H=750;
const OUT=path.join(ROOT,'.capture-take');
const FRAMES=Math.ceil((Number(process.env.TO)||T.total)*FPS), F0=Math.floor((Number(process.env.FROM)||0)*FPS), RANGE=!!(process.env.FROM||process.env.TO);
const DAY='2026-11-24';
const HABITS=['Morning run','Read 20 pages','Drink water'];
const NODES=['mother-todo','mother-calendar','mother-habit','mother-pomo','frame-notes'];
const hex=(c)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const toHex=(a)=>'#'+a.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const ease=(x)=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;

(async()=>{
if(!process.env.FROM&&!process.env.TO)fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:DPR});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date(`${DAY}T10:30:00`)});
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background{display:none!important}
  [data-testid="dock"],[data-testid="dock-layer"]{opacity:0!important}
  .react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"],.react-flow__node[data-id="mother-term"]{visibility:hidden!important}
  html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:var(--gbg,#c9f158)!important}
  .react-flow__edges,.react-flow__edge{display:none!important}
  [data-id^="mother-"]{filter:drop-shadow(0 30px 40px rgba(0,0,0,.30)) drop-shadow(0 8px 12px rgba(0,0,0,.2))}
  *{caret-color:#c9f158}`});
await p.evaluate(()=>{
  for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}
  const c=document.createElement('div');c.id='cur';
  c.style.cssText='position:fixed;left:0;top:0;width:36px;height:36px;z-index:99999;pointer-events:none;opacity:0;transform-origin:4px 3px';
  c.innerHTML='<svg width="36" height="36" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
});
const fitEvt=(ids)=>p.evaluate((ids)=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);

// ── pointer + tasks ──
let ptr={x:W/2,y:H/2}, holding=false, curOn=false, pinT=null;
const Q={};
async function exec(op){
  if(op.k==='move'){await p.mouse.move(op.x,op.y);ptr={x:op.x,y:op.y};if(!op.hid)curOn=true;}
  else if(op.k==='down'){await p.mouse.down();holding=true;}
  else if(op.k==='up'){await p.mouse.up();holding=false;}
  else if(op.k==='key'){if(op.ch==='\n')await p.keyboard.press('Enter');else await p.keyboard.type(op.ch);}
  else if(op.k==='wheel'){await p.keyboard.down('Control');await p.mouse.wheel(0,op.dy);await p.keyboard.up('Control');}
  else if(op.k==='wheel'){await p.keyboard.down('Control');await p.mouse.wheel(0,op.dy);await p.keyboard.up('Control');}
  else if(op.k==='eval'){await p.evaluate(op.fn,op.arg);}
  else if(op.k==='q'){Q[op.name]=await p.evaluate(op.fn,op.arg);}
  else if(op.k==='pin'){pinT=await p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform);}
  else if(op.k==='unpin'){pinT=null;}
}
function* moveTo(x,y,n){const sx=ptr.x,sy=ptr.y;for(let i=1;i<=n;i++){const e=ease(i/n);yield [{k:'move',x:sx+(x-sx)*e,y:sy+(y-sy)*e}];}}
const rectOf=(sel,text)=>({k:'q',fn:([sel,text])=>{let el=null;if(text){for(const n of document.querySelectorAll(sel)){const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===text);if(t){el=t;break;}}}else el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},arg:[sel,text]});

function* gEdit(text){
  yield [{...rectOf('[data-id="n3"]'),name:'n3'}];
  const n=Q.n3;if(!n)return;
  yield [{k:'move',x:W*0.75,y:H*0.8}];
  yield* moveTo(n.x+n.w/2,n.y+n.h*0.3,16);
  yield [{k:'down'}];yield [{k:'up'}];
  for(let i=0;i<5;i++)yield [];
  yield [{k:'down'}];yield [{k:'up'}];                 // a second click opens the note for typing
  for(let i=0;i<6;i++)yield [];
  for(const ch of text){yield [{k:'key',ch}];yield [];}
}
// tick a plan off in Todos (the checkbox sits left of its text)
function* gTodoTick(text){
  yield [{k:'q',name:'cb',arg:text,fn:(text)=>{const root=document.querySelector('[data-id="mother-todo"]');if(!root)return null;const t=[...root.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===text);if(!t)return null;const tr=t.getBoundingClientRect();let el=t,best=null;for(let i=0;i<5&&el;i++){el=el.parentElement;if(!el)break;for(const c of el.querySelectorAll('input[type=checkbox],[role=checkbox],button')){const r=c.getBoundingClientRect();if(r.width>6&&r.width<40&&r.x<tr.x&&Math.abs(r.y+r.height/2-(tr.y+tr.height/2))<10){if(!best||r.x>best.x)best={x:r.x,y:r.y,w:r.width,h:r.height};}}if(best)break;}return best;}}];
  const c=Q.cb;if(!c)return;
  yield* moveTo(c.x+c.w/2,c.y+c.h/2,16);
  yield [{k:'down'}];yield [{k:'up'}];
}
function* gCommit(){
  yield [{...rectOf('[data-id="frame-notes"]'),name:'frame'}];
  const f=Q.frame;yield* moveTo(f.x+f.w/2, Math.min(H-30,f.y+f.h+60),12);
  yield [{k:'down'}];yield [{k:'up'}];
}
function* gGrab(){
  yield [{...rectOf('[data-id="mother-todo"]','Send the invoice'),name:'row'}];
  const r=Q.row;yield* moveTo(r.x+r.w/2, r.y+r.h/2, 14);
  yield [{k:'down'}];
  yield* moveTo(r.x+r.w/2+16, r.y+r.h/2-10, 8);
}
function* gRelease(){
  for(let i=1;i<=18;i++){
    yield [{...rectOf('[data-testid="week-cell-'+DAY+'-15"]'),name:'cell'}];
    const c=Q.cell;if(c){const tx=c.x+c.w*0.45, ty=c.y+c.h/2;const e=ease(i/18);yield [{k:'move',x:ptr.x+(tx-ptr.x)*(i===18?1:0.25+e*0.2),y:ptr.y+(ty-ptr.y)*(i===18?1:0.25+e*0.2)}];}else yield [];
  }
  yield [{k:'up'}];
}
function* gTick(i){
  yield [{...rectOf(`button[title^="${HABITS[i]} ${DAY}"]`),name:'tick'}];
  const t=Q.tick;if(!t){yield [];return;}
  yield* moveTo(t.x+t.w/2,t.y+t.h/2,14);
  yield [{k:'down'}];yield [{k:'up'}];
}
function* gDolly(factor,dur,anchor){
  const n=Math.max(1,Math.round(dur*FPS));
  let ax=W/2,ay=H/2;
  if(anchor==='pair'){yield [{...rectOf('[data-id="mother-todo"]'),name:'todo'},{...rectOf('[data-id="mother-calendar"]'),name:'cal'}];const r=Q.todo,c=Q.cal;ax=(r.x+r.w+c.x)/2;ay=r.y+r.h*0.5;}
  yield [{k:'move',x:ax,y:ay,hid:true}];
  const total=-Math.log(factor)/0.00137;             // in wheel units (negative = zoom in)
  let sent=0;
  for(let i=1;i<=n;i++){const target=Math.round(total*ease(i/n));const dy=target-sent;sent=target;yield [dy?{k:'wheel',dy}:{k:'noop'}];}
}
// a real plan typed into Todos
function* gAddPlan(text){
  yield [{...rectOf('[data-id="mother-todo"]','add a plan'),name:'addplan'}];
  const r=Q.addplan;if(!r){return;}
  yield* moveTo(r.x+r.w*0.3,r.y+r.h/2,16);
  yield [{k:'down'}];yield [{k:'up'}];
  yield [];yield [];
  for(const ch of text){yield [{k:'key',ch}];yield [];}
  for(let i=0;i<18;i++)yield [];
  yield [{k:'key',ch:'\n'}];
  yield* moveTo(W*0.8,H*0.86,14);
}
function* gTimer(){yield [{k:'eval',fn:()=>{const n=document.querySelector('[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));t&&t.click();}}];}

// ── camera + colour ──
const beats=T.beats;
// The ground changes by a wipe that sweeps down the whole 1920 px frame (the stage is the middle 1200 px of it);
// build.py draws the same sweep above and below the stage, so the two always meet.
const STAGE_TOP=560, STAGE_H=1200, FRAME_H=1920;
function groundAt(t){
  let i=0;for(let k=0;k<beats.length;k++)if(t>=beats[k].start)i=k;
  const cur=beats[i].color, prev=i>0?beats[i-1].color:cur;
  const x=Math.min(1,Math.max(0,(t-beats[i].start)/T.move));
  if(i===0||x>=1||prev===cur)return cur;
  const loc=Math.min(100,Math.max(0,(ease(x)*FRAME_H-STAGE_TOP)/STAGE_H*100));
  return `linear-gradient(180deg, ${cur} 0%, ${cur} ${loc}%, ${prev} ${loc}%, ${prev} 100%)`;
}
function focusAt(t){let i=0;for(let k=0;k<beats.length;k++)if(t>=beats[k].start)i=k;let f=beats[i].focus;for(const [at,ids] of (beats[i].focus_at||[]))if(t>=at)f=ids;return f;}

// settle the first shot before recording
for(let k=0;k<8;k++){
  await fitEvt(['mother-todo']);await p.clock.runFor(1400);await p.waitForTimeout(400);
  const w=await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-todo"]');return n?n.getBoundingClientRect().width:0;});
  if(w>480&&w<620)break;console.log('settling, todo width',w);
}
const op={};NODES.forEach(n=>op[n]=1);
let events=[...T.events];events=events.filter(e=>!(e.t===0&&e.do==='fit'));
let tasks=[],slowUntil=-1,slowStep=33.33,moveUntil=-1;
for(let f=0;f<FRAMES;f++){
  const t=f/FPS;
  while(events.length&&events[0].t<=t+1e-6){
    const e=events.shift();
    if(e.do==='fit'){await fitEvt(e.ids);pinT=null;const d=e.slow||T.move;slowUntil=f+d*FPS;slowStep=400/(d*FPS);moveUntil=f+d*FPS+4;}
    else if(e.do==='dolly')tasks.push(gDolly(e.factor,e.dur,e.anchor));
    else if(e.do==='todotick')tasks.push(gTodoTick(e.text));
    else if(e.do==='edit')tasks.push(gEdit(e.text));
    else if(e.do==='commit')tasks.push(gCommit());
    else if(e.do==='grab')tasks.push(gGrab());
    else if(e.do==='release')tasks.push(gRelease());
    else if(e.do==='tick')tasks.push(gTick(e.habit));
    else if(e.do==='timer')tasks.push(gTimer());
  }
  // advance every running task by one frame
  const ops=[];
  tasks=tasks.filter(g=>{const r=g.next();if(r.done)return false;ops.push(...r.value);return true;});
  for(const o of ops)await exec(o);
  // per-frame look: ground colour, neighbour fade, cursor, camera pin
  const focus=focusAt(t), moving=f<moveUntil;
  for(const id of NODES){const target=(moving||focus.includes(id))?1:0;op[id]+= (target-op[id])*(moving?0.5:0.18);}
  await p.evaluate(({g,op,ptr,holding,curOn,pinT})=>{
    document.documentElement.style.setProperty('--gbg',g);
    for(const id in op){const el=document.querySelector(`.react-flow__node[data-id="${id}"]`);if(el)el.style.opacity=String(Math.max(0,Math.min(1,op[id]))<0.02?0:Math.min(1,op[id]));}
    const c=document.getElementById('cur');if(c){c.style.opacity=curOn?'1':'0';c.style.transform=`translate(${ptr.x}px,${ptr.y}px) scale(${holding?0.88:1})`;}
    if(pinT){const v=document.querySelector('.react-flow__viewport');if(v&&v.style.transform!==pinT)v.style.transform=pinT;for(const el of document.querySelectorAll('html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane,.react-flow__viewport-portal')){if(el.scrollTop)el.scrollTop=0;if(el.scrollLeft)el.scrollLeft=0;}}
  },{g:groundAt(t),op,ptr,holding,curOn,pinT});
  await p.clock.runFor(f<slowUntil?slowStep:1000/FPS);
  if(f>=F0)await p.screenshot({path:path.join(OUT,String(f).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92});
  if(f%60===0)console.log('frame',f,'/',FRAMES,t.toFixed(1)+'s');
}
await b.close();
if(RANGE){console.log('range done');process.exit(0);}
const dry=DPR<1;
execFileSync('ffmpeg',['-v','error','-y','-framerate',String(FPS),'-i',path.join(OUT,'%05d.jpg'),'-c:v','libx264','-crf','14','-pix_fmt','yuv420p','-movflags','+faststart',path.join(ROOT,'assets',dry?'take-dry.mp4':'take.mp4')]);
console.log('done →',dry?'assets/take-dry.mp4':'assets/take.mp4');
})();
