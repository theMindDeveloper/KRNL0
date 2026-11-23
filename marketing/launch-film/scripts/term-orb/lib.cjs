// Frame-by-frame capture engine for the launch-film app shots (1920x1080 viewport, DPR 1.5 → 2880x1620, 30 fps, deterministic fake clock).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'../..');
const FOOT=path.join(ROOT,'footage');fs.mkdirSync(FOOT,{recursive:true});
const FPS=30, W=1920, H=1080, DPR=Number(process.env.DPR||1.5);
const ease=(x)=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const easeOut=(x)=>1-Math.pow(1-x,3);
const LOGO='data:image/svg+xml;base64,'+fs.readFileSync(path.resolve(ROOT,'../posts/_shared/icon.svg')).toString('base64');

async function open(b,{init=[],size,theme='dark',viewport={width:W,height:H},url='http://localhost:5201/?fixture=fresh'}={}){
  const p=await b.newPage({viewport,deviceScaleFactor:DPR});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript(([t,logo,size])=>{try{localStorage.setItem('krnl0-theme',t)}catch(e){};window.__LOGO=logo;if(size)window.__SIZE=size;},[theme,LOGO,size||null]);
  for(const code of init)await p.addInitScript({content:code});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto(url);await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="day-moment"]{display:none!important} *{caret-color:#c9f158}`});
  await p.evaluate(()=>{
    for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good (morning|afternoon|evening)/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}
    const c=document.createElement('div');c.id='cur';document.head.insertAdjacentHTML('beforeend','<style>#cur{visibility:hidden!important}</style>');
    c.style.cssText='position:fixed;left:0;top:0;width:72px;height:72px;z-index:2147483000;pointer-events:none;opacity:0;transform-origin:8px 6px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))';
    c.innerHTML='<svg width="72" height="72" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  return p;
}
const fit=(p,ids)=>p.evaluate((ids)=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);
const rect=(p,sel,text)=>p.evaluate(([sel,text])=>{let el=null;if(text){for(const n of document.querySelectorAll(sel)){const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===text);if(t){el=t;break;}}}else el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},[sel,text]);

// A shot is a generator that yields one array of ops per frame. ops: {k:'move',x,y} {k:'down'} {k:'up'} {k:'type',ch} {k:'key',key} {k:'eval',fn,arg} {k:'fit',ids} {k:'wheel',dy} {k:'mark',name} {k:'cur',on}
async function record(p,id,gen,{tail=1.0,notes=''}={}){
  const dir=path.join(ROOT,'scripts/term-orb','.capture-term-orb',id);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const markers={};let ptr={x:W*0.6,y:H*1.1};let curOn=false;let f=0;let pinT=null;
  const api={ptr:()=>ptr,rect:(s,t)=>rect(p,s,t),frame:()=>f,q:null};
  const place=()=>p.evaluate(([x,y,on])=>{const c=document.getElementById('cur');c.style.opacity=on?'1':'0';c.style.transform=`translate(${x-8}px,${y-6}px)`;},[ptr.x,ptr.y,curOn]);
  async function exec(op){
    switch(op.k){
      case 'move':await p.mouse.move(op.x,op.y);ptr={x:op.x,y:op.y};break;
      case 'cur':curOn=op.on;break;
      case 'down':await p.mouse.down();break;
      case 'up':await p.mouse.up();break;
      case 'type':await p.keyboard.type(op.ch);break;
      case 'key':await p.keyboard.press(op.key);break;
      case 'wheel':await p.keyboard.down('Control');await p.mouse.wheel(0,op.dy);await p.keyboard.up('Control');break;
      case 'eval':await p.evaluate(op.fn,op.arg);break;
      case 'fit':await fit(p,op.ids);break;
      case 'mark':markers[op.name]=Math.round(f/FPS*1000)/1000;break;
      case 'real':await op.fn(p);break;
      case 'zoomwheel':await p.evaluate(([x,y,dy])=>{const el=document.querySelector('.react-flow__pane');el.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,ctrlKey:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));},[op.x,op.y,op.dy]);break;
      case 'pin':pinT=await p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform);break;
      case 'unpin':pinT=null;break;
    }
  }
  let it=gen(api);api.box={};
  const step=async(ops)=>{for(const o of ops)await exec(o);await place();await p.clock.runFor(1000/FPS);if(pinT)await p.evaluate((t)=>{document.querySelector('.react-flow__viewport').style.transform=t},pinT);await p.screenshot({path:path.join(dir,String(f).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92});f++;};
  for(;;){const r=await it.next();if(r.done)break;await step(r.value||[]);}
  for(let i=0;i<Math.round(tail*FPS);i++)await step([]);
  const out=path.join(FOOT,id+'.mp4');
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(FPS),'-i',path.join(dir,'%05d.jpg'),'-vf','tpad=stop_mode=clone:stop_duration=1','-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart','-r',String(FPS),'-frames:v',String(f),out]);
  fs.copyFileSync(path.join(dir,'00000.jpg'),path.join(FOOT,id+'.png'));
  const meta={fps:FPS,duration:Math.round(f/FPS*1000)/1000,w:Math.round(W*DPR),h:Math.round(H*DPR),markers,notes};
  fs.writeFileSync(path.join(FOOT,id+'.json'),JSON.stringify(meta,null,1));
  console.log(id,meta.duration+'s',JSON.stringify(markers));
  return meta;
}
// helpers for generators
function* wait(n){for(let i=0;i<n;i++)yield [];}
function* moveTo(api,x,y,n,curve=ease){const sx=api.ptr().x,sy=api.ptr().y;for(let i=1;i<=n;i++){const e=curve(i/n);yield [{k:'move',x:sx+(x-sx)*e,y:sy+(y-sy)*e}];}}
function* typeText(text,cps=16){const per=FPS/cps;let t=0;for(const ch of text){yield [{k:'type',ch}];t+=per-1;while(t>=1){yield [];t-=1;}}}
// zoom the canvas in/out about a screen point with real ctrl+wheel (ln(zoom) ≈ 0.00137 per wheel unit), done before recording or inside a shot
async function dolly(p,factor,ax,ay,frames=20){const total=-Math.log(factor)/0.00137;let sent=0;await p.mouse.move(ax,ay);
  for(let i=1;i<=frames;i++){const target=Math.round(total*ease(i/frames));const dy=target-sent;sent=target;if(dy){await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');}await p.clock.runFor(1000/FPS);}
  await p.clock.runFor(400);await p.waitForTimeout(200);}
const zoomOf=(p)=>p.evaluate(()=>{const t=document.querySelector('.react-flow__viewport').style.transform;const m=/scale\(([\d.]+)\)/.exec(t);return m?parseFloat(m[1]):null;});
async function zoomTo(p,target,ax,ay){for(let k=0;k<3;k++){const z=await zoomOf(p);if(!z||Math.abs(z/target-1)<0.012)break;await dolly(p,target/z,ax,ay,k?6:22);}return zoomOf(p);}
async function zoomIn(p,n=1,out=false){for(let i=0;i<n;i++){await p.evaluate((o)=>document.querySelector(o?'.react-flow__controls-zoomout':'.react-flow__controls-zoomin')?.click(),out);await p.clock.runFor(900);}await p.waitForTimeout(200);return zoomOf(p);}
const vpOf=(p)=>p.evaluate(()=>{const t=document.querySelector('.react-flow__viewport').style.transform;const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(t);return m?{x:parseFloat(m[1]),y:parseFloat(m[2]),z:parseFloat(m[3])}:null;});
module.exports={vpOf,dolly,zoomOf,zoomTo,zoomIn,chromium,open,record,fit,rect,wait,moveTo,typeText,ease,easeOut,W,H,FPS,ROOT,FOOT};
