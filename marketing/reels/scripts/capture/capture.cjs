const {chromium}=require('playwright');const fs=require('fs');
const path=require('path');
// Films the real KRNL0 renderer (the browser preview, `npx vite --config vite.preview.config.ts`
// from the repo root, port 5201) into JPEG frame sequences under public/footage.
// Usage: npm run capture [-- shot,shot]   shots: cal todo timer habit canvas clock pair
const HERE=__dirname, OUT=path.resolve(HERE,'../../public/footage'), ONLY=process.argv[2];
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(HERE,'../../../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const HIDE=`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls{display:none!important} *{caret-color:#c9f158}`;
async function open(b,dsf,fitIds,{dock=false}={}){
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:dsf});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date('2026-11-23T10:02:00')});
  await p.addInitScript({content:'window.__LOGO='+JSON.stringify(LOGO)+';'+fs.readFileSync(path.join(HERE,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:HIDE+(dock?'':'[data-testid="dock"]{display:none!important}')});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){if(/^\s*Good morning/.test(e.textContent||'')&&e.getBoundingClientRect().height<80&&e.getBoundingClientRect().height>20)e.style.display='none'}});
  for(let k=0;k<2;k++){await p.clock.runFor(600);await p.waitForTimeout(250);
  await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),fitIds);
  await p.clock.runFor(800);await p.waitForTimeout(250);await p.clock.runFor(800);}
  return p;
}
const want=n=>!ONLY||ONLY.split(',').includes(n);
(async()=>{const b=await chromium.launch();
const rec=async(p,name,n,step,act)=>{fs.mkdirSync(`${OUT}/${name}`,{recursive:true});for(let i=0;i<n;i++){if(act)await act(i);await p.clock.runFor(step);await p.screenshot({path:`${OUT}/${name}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}console.log(name,n)};
const typing=(text,pre=6,post=30)=>{const s=[];for(let i=0;i<pre;i++)s.push(['w']);for(const c of text)s.push(['k',c]);for(let i=0;i<8;i++)s.push(['w']);s.push(['enter']);for(let i=0;i<post;i++)s.push(['w']);return s;};
const play=(inp,s)=>async i=>{const a=s[i];if(a[0]==='k')await inp.type(a[1]);if(a[0]==='enter')await inp.press('Enter');};

if(want('cal')){const p=await open(b,2,['mother-calendar']);
  await p.getByText('add an event').first().click();await p.clock.runFor(200);
  const inp=p.locator('input:focus');const s=typing('Design review 16:00 1h30');
  await rec(p,'cal',s.length,33,play(inp,s));await p.close();}
if(want('todo')){const p=await open(b,2,['mother-todo']);
  await p.getByText('add a plan').first().click();await p.clock.runFor(200);
  const inp=p.getByPlaceholder(/Add a plan/);const s=typing('Call mom 20:00 30m',6,16);
  await rec(p,'todo',s.length,33,play(inp,s));
  const row=p.getByText('Review the proposal',{exact:true}).first();const bb=await row.boundingBox();
  const cb=await p.evaluate(({x,y})=>{let best=null;for(const e of document.querySelectorAll('button,[role=checkbox],input[type=checkbox]')){const r=e.getBoundingClientRect();if(Math.abs(r.y+r.height/2-y)<10&&r.x<x&&r.width<30){if(!best||r.x>best.x)best={x:r.x+r.width/2,y:r.y+r.height/2}}}return best},{x:bb.x,y:bb.y+bb.height/2});
  console.log('checkbox',cb);
  await rec(p,'todo_tick',45,33,async i=>{if(i===8&&cb)await p.mouse.click(cb.x,cb.y)});await p.close();}
if(want('timer')){const p=await open(b,2,['mother-pomo']);
  await rec(p,'timer',24,33,async i=>{if(i===8)await p.getByText('Start session').first().click()});
  await rec(p,'timer_ff',90,3000);await p.close();}
if(want('habit')){const p=await open(b,2,['mother-habit']);
  const labels=await p.evaluate(()=>[...document.querySelectorAll('[data-id="mother-habit"] button')].map(e=>(e.getAttribute('aria-label')||e.title||e.textContent).slice(0,50)));console.log(labels.join(' | '));
  const tgt=await p.evaluate(()=>{const bs=[...document.querySelectorAll('[data-id="mother-habit"] button')].filter(e=>/(today|Mon|23)/i.test((e.getAttribute('aria-label')||'')+(e.title||'')));return bs.map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,l:e.getAttribute('aria-label')}})});
  console.log('habit targets',JSON.stringify(tgt));
  await rec(p,'habit',60,33,async i=>{const k=[8,24,40].indexOf(i);if(k>=0&&tgt[k])await p.mouse.click(tgt[k].x,tgt[k].y)});await p.close();}
if(want('canvas')){const p=await open(b,3,['t-deep','t-review','t-call','t-gym','frame-launch'],{dock:true});
  await rec(p,'canvas',1,33);await p.close();}
if(want('clock')){const p=await open(b,3,['mother-clock']);await rec(p,'clock',1,33);await p.close();}
if(want('pair')){const p=await open(b,2,['mother-todo','mother-calendar']);await rec(p,'pair',1,33);await p.close();}
await b.close();
// The Focus scene plays the start click and the fast-forwarded countdown as one sequence.
if(fs.existsSync(`${OUT}/timer`)){fs.mkdirSync(`${OUT}/focus`,{recursive:true});let n=0;for(const d of ['timer','timer_ff'])for(const f of fs.readdirSync(`${OUT}/${d}`).sort())fs.copyFileSync(`${OUT}/${d}/${f}`,`${OUT}/focus/${String(n++).padStart(4,'0')}.jpg`);}
})()
