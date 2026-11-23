// Shared helpers for the plan/calendar shots (S05-S08): the real KRNL0 renderer driven frame by frame on a fake clock.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..','..');            // launch-film/
const FPS=30, VW=1920, VH=1080, DPR=Number(process.env.DPR||1.5);
exports.ROOT=ROOT;exports.FPS=FPS;exports.VW=VW;exports.VH=VH;
const ease=(x)=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;             // in-out cubic
const easeOut=(x)=>1-Math.pow(1-x,3);
exports.ease=ease;exports.easeOut=easeOut;

// the shared seed (board-base.js is read-only for me): patched in memory — no Dinner/Read, plus the two unscheduled plans, windows placed + sized
function boardSource(o){
  let s=fs.readFileSync(path.join(ROOT,'scripts','board-base.js'),'utf8');
  s=s.replace(/\s*task\('t-dinner'[^\n]*\n/,'\n').replace(/\s*task\('t-read'[^\n]*\n/,'\n');
  s=s.replace(/(task\('t-gym'[^\n]*\n)/,`$1    task('t-invoice', 'Send the invoice', 30, null, 0, { tag: 'work' }, { x: 1200, y: Y });\n    task('t-milk', 'Buy oat milk', 10, null, 0, { tag: 'home' }, { x: 1500, y: Y });\n`);
  s=s.replace("b.layoutMode = 'free';",`
    { const by=(k)=>nodes.find(n=>n.kind===k); const todo=by('todo'),cal=by('calendar');
      const put=(n,x,y,w,h)=>{n.position={x,y};n.config={...n.config,canvasSize:{width:w,height:h}};};
      put(todo,0,0,${o.tw||540},${o.th||600}); put(cal,100,0,${o.cw||540},${o.ch||600});
      by('habit').position={x:4000,y:0};by('pomo').position={x:4100,y:0};by('clock').position={x:4200,y:0};by('analytics').position={x:4300,y:0};by('term').position={x:4400,y:0};
      cal.config={...cal.config,view:'day',hourRange:{start:${o.h0||9},end:${o.h1||19}}}; cal.state={...cal.state,zoom:${o.zoom||5}}; }
    b.layoutMode = 'free';`);
  return `window.__NOSEED=true;window.__SKIP=${JSON.stringify(o.skip||'')};window.__LOGO=window.__LOGO||'';`+s;
}
exports.open=async function(o={}){
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:VW,height:VH},deviceScaleFactor:DPR});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.addInitScript(()=>{try{localStorage.setItem('krnl0-theme','dark')}catch(e){}});
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript({content:boardSource(o)});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],.react-flow__minimap{display:none!important}
   .react-flow__node[data-id="mother-habit"],.react-flow__node[data-id="mother-pomo"],.react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"],.react-flow__node[data-id="mother-term"],.react-flow__node[data-type="todo.task"],.react-flow__edges,.react-flow__edge{visibility:hidden!important}
   *{caret-color:#c9f158}${(o.hide||[]).map(id=>`.react-flow__node[data-id="${id}"]`).join(',')}${(o.hide||[]).length?'{visibility:hidden!important}':''}`});
  await p.evaluate(()=>{
    for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}
    const c=document.createElement('div');c.id='cur';document.head.insertAdjacentHTML('beforeend','<style>#cur{visibility:hidden!important}</style>');
    c.style.cssText='position:fixed;left:0;top:0;width:76px;height:76px;z-index:99999;pointer-events:none;opacity:0;transform-origin:12.7px 7.9px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45))';
    c.innerHTML='<svg width="76" height="76" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  return {b,p};
};
// a recorder: frame(n) steps the fake clock one frame and writes a JPEG; the helpers move the pointer on the same frame
exports.recorder=function(p,dir){
  fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const R={dir,n:0,x:VW+80,y:VH*0.55,pin:null,down:false,curVisible:false,marks:{}};
  const dt=1000/FPS;
  R.mark=(name)=>{R.marks[name]=+(R.n/FPS).toFixed(3);};
  R.setCur=async()=>{await p.evaluate(([x,y,v,dn])=>{const c=document.getElementById('cur');c.style.opacity=v?1:0;c.style.transform=`translate(${x-12.7}px,${y-7.9}px) scale(${dn?0.88:1})`;},[R.x,R.y,R.curVisible,R.down]);};
  R.frame=async(count=1)=>{for(let i=0;i<count;i++){
      await p.clock.runFor(dt);
      if(R.pin)await p.evaluate(t=>{const v=document.querySelector('.react-flow__viewport');if(v&&v.style.transform!==t)v.style.transform=t;},R.pin);
      await R.setCur();
      await p.screenshot({path:path.join(dir,String(R.n).padStart(5,'0')+'.jpg'),type:'jpeg',quality:93});R.n++;}};
  R.moveTo=async(x,y,secs,fn=ease)=>{const n=Math.max(1,Math.round(secs*FPS)),sx=R.x,sy=R.y;R.curVisible=true;
      for(let i=1;i<=n;i++){const e=fn(i/n);R.x=sx+(x-sx)*e;R.y=sy+(y-sy)*e;await p.mouse.move(R.x,R.y);await R.frame();}};
  R.encode=(out,hold=1.0)=>{
      execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(FPS),'-i',path.join(dir,'%05d.jpg'),'-vf',`tpad=stop_mode=clone:stop_duration=${hold},scale=2880:1620:flags=lanczos`,'-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',out]);};
  return R;
};
exports.fit=async(p,ids,secs=0.9)=>{await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);await p.clock.runFor(secs*1000);await p.waitForTimeout(300);};
exports.rect=(p,sel,text)=>p.evaluate(([sel,text])=>{let el=null;const roots=document.querySelectorAll(sel);for(const r of roots){if(text){el=[...r.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===text);if(el)break;}else{el=r;break;}}if(!el)return null;const b=el.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};},[sel,text]);

// camera: ctrl+wheel zoom anchored at (ax,ay); reads the viewport scale back (the app's zoom is exp(-dy*k))
exports.scaleOf=(p)=>p.evaluate(()=>{const m=/scale\(([\d.]+)\)/.exec(document.querySelector('.react-flow__viewport').style.transform);return m?+m[1]:1;});
exports.wheelZoom=async(p,ax,ay,dy)=>{await p.mouse.move(ax,ay);await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');};
exports.zoomTo=async(p,ax,ay,target)=>{await p.mouse.move(ax,ay);for(let k=0;k<60;k++){const s=await exports.scaleOf(p);const d=Math.log(target/s);if(Math.abs(d)<0.004)break;const dy=Math.max(-400,Math.min(400,Math.round(-d/0.00137)));if(!dy)break;await exports.wheelZoom(p,ax,ay,dy);await p.clock.runFor(250);await p.waitForTimeout(60);}await p.clock.runFor(500);};
exports.pinNow=(R,p)=>p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform).then(t=>{R.pin=t;});
// pan the canvas (middle-button drag on empty pane, far right) so node `id` is centred at (cx,cy)
exports.centerOn=async(p,id,cx=960,cy=548)=>{const bb=await p.locator(`[data-id="${id}"]`).boundingBox();const dx=cx-(bb.x+bb.width/2),dy=cy-(bb.y+bb.height/2);
  await p.mouse.move(1800,250);await p.mouse.down({button:'middle'});await p.mouse.move(1800+dx,250+dy,{steps:6});await p.mouse.up({button:'middle'});await p.clock.runFor(400);await p.waitForTimeout(100);};
