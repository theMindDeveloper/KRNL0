// Shared engine for the "Timer + radio" footage group: opens the real app at 1280x720 CSS px, device scale 2.25
// (= 2880x1620 frames, UI shown 1.5x bigger than a desktop window), dark theme, fake clock, big cursor, frame-by-frame capture.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const VW=1280,VH=720,DSF=2.25,FPS=30;
const ROOT=path.resolve(__dirname,'../..');const FOOT=path.join(ROOT,'footage');fs.mkdirSync(FOOT,{recursive:true});
const ease=x=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
exports.FPS=FPS;exports.ease=ease;exports.FOOT=FOOT;exports.VW=VW;exports.VH=VH;

exports.open=async function(b,o={}){
  const {size,order,pos,show=[],radio=false,radioPos={x:880,y:60},at='2026-11-24T10:30:00',css=''}=o;
  const p=await b.newPage({viewport:{width:VW,height:VH},deviceScaleFactor:o.dsf||DSF});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date(at)});
  await p.addInitScript(({size,order,pos,radio,radioPos})=>{
    try{localStorage.setItem('krnl0-theme','dark');
      if(radio){localStorage.setItem('krnl0-ambient-radio-edge','none');localStorage.setItem('krnl0-ambient-radio-pos',JSON.stringify(radioPos));}}catch(e){}
    if(size)window.__SIZE=size;if(order)window.__ORDER=order;if(pos)window.__POS=pos;
  },{size,order,pos,radio,radioPos});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  const hide=show.length?`.react-flow__node:not(${show.map(i=>`[data-id="${i}"]`).join('):not(')}){visibility:hidden!important}`:'';
  await p.addStyleTag({content:`${hide}${radio?'':'[data-testid="ambient-radio"]{display:none!important}'}
    .react-flow__edges,.react-flow__edge,.react-flow__minimap{display:none!important} *{caret-color:#c9f158} ${css}`});
  await p.evaluate(()=>{
    for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}
    const c=document.createElement('div');c.id='cur';
    c.style.cssText='position:fixed;left:0;top:0;width:46px;height:46px;z-index:2147483647;pointer-events:none;opacity:0;transform-origin:5px 4px;will-change:transform';
    c.innerHTML='<svg width="46" height="46" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  return p;
};
exports.fit=async function(p,ids,reps=2){
  for(let k=0;k<reps;k++){await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
};
// rect (CSS px) of the first element matching fn(root) -> Element
exports.rect=function(p,fn,arg){return p.evaluate(([src,arg])=>{const el=(new Function('arg','return ('+src+')(arg)'))(arg);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},[fn.toString(),arg]);};

// run one shot: events [{t:sec, gen:()=>generator}], ffwd [{from,to,ms}] (app time advanced in that window), then encode
exports.shoot=async function(p,spec){
  const {name,seconds,events=[],ffwd=[],start={x:VW+40,y:360},notes='',markers={},pinT=null}=spec;
  const dir=path.join(ROOT,`.capture-c-${name}`);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  let ptr={...start},holding=false,curOn=true;let tasks=[];const evs=[...events].sort((a,b)=>a.t-b.t);
  const Q={};
  const exec=async op=>{
    if(op.k==='move'){await p.mouse.move(op.x,op.y);ptr={x:op.x,y:op.y};}
    else if(op.k==='down'){await p.mouse.down();holding=true;}
    else if(op.k==='up'){await p.mouse.up();holding=false;}
    else if(op.k==='click'){await p.mouse.down();await p.mouse.up();}
    else if(op.k==='key'){await p.keyboard.type(op.ch);}
    else if(op.k==='eval'){await p.evaluate(op.fn,op.arg);}
    else if(op.k==='q'){Q[op.name]=await op.q();}
    else if(op.k==='cur'){curOn=op.on;}
    else if(op.k==='wheel'){if(op.dy){await p.keyboard.down('Control');await p.mouse.wheel(0,op.dy);await p.keyboard.up('Control');}}
  };
  const ctx={get ptr(){return ptr},Q,moveTo:function*(x,y,n){const sx=ptr.x,sy=ptr.y;for(let i=1;i<=n;i++){const e=ease(i/n);yield [{k:'move',x:sx+(x-sx)*e,y:sy+(y-sy)*e}];}},
    wait:function*(n){for(let i=0;i<n;i++)yield [];}};
  const N=Math.round(seconds*FPS);
  for(let f=0;f<N;f++){
    const t=f/FPS;
    while(evs.length&&evs[0].t<=t+1e-6){tasks.push(evs.shift().gen(ctx));}
    const ops=[];tasks=tasks.filter(g=>{const r=g.next();if(r.done)return false;ops.push(...r.value);return true;});
    for(const o of ops)await exec(o);
    await p.evaluate(({ptr,holding,curOn})=>{const c=document.getElementById('cur');c.style.opacity=curOn?'1':'0';c.style.transform=`translate(${ptr.x}px,${ptr.y}px) scale(${holding?0.88:1})`;},{ptr,holding,curOn});
    if(pinT)await p.evaluate(t=>{const v=document.querySelector('.react-flow__viewport');if(v&&v.style.transform!==t)v.style.transform=t;},pinT);
    const w=ffwd.find(x=>t>=x.from&&t<x.to);
    if(w){const per=w.ms/Math.round((w.to-w.from)*FPS);await p.clock.fastForward(per);await p.clock.runFor(1000/FPS);}
    else await p.clock.runFor(1000/FPS);
    await p.screenshot({path:path.join(dir,String(f).padStart(5,'0')+'.jpg'),type:'jpeg',quality:93});
    if(f%60===0)console.log(name,'frame',f,'/',N);
  }
  const out=path.join(FOOT,name+'.mp4');
  execFileSync('ffmpeg',['-v','error','-y','-framerate',String(FPS),'-i',path.join(dir,'%05d.jpg'),'-vf','tpad=stop_mode=clone:stop_duration=1','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart','-frames:v',String(N),out]);
  execFileSync('ffmpeg',['-v','error','-y','-i',path.join(dir,'00000.jpg'),'-vf','scale=1920:-1',path.join(FOOT,name+'.png')]);
  fs.writeFileSync(path.join(FOOT,name+'.json'),JSON.stringify({fps:FPS,duration:N/FPS,w:Math.round(VW*DSF),h:Math.round(VH*DSF),markers,notes},null,1));
  fs.rmSync(dir,{recursive:true,force:true});console.log('done',name,N/FPS+'s');
};
