// Frame-by-frame recorder for the real KRNL0 preview (deterministic fake clock). A shot is a generator that yields arrays of ops per frame.
//   node scripts/e/<shot>.cjs            full quality (DPR 1.5 -> 2880x1620)  -> footage/<id>.mp4/.json/.png
//   DPR=1 node scripts/e/<shot>.cjs      fast dry run (-> footage/<id>-dry.mp4)
const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const {open,ROOT}=require('./lib.cjs');
const FPS=30, W=1920, H=1080;
const ease=(x)=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const eo=(x)=>1-Math.pow(1-x,3);
function api(state){
  const A={};
  A.wait=function*(s){const n=Math.round(s*FPS);for(let i=0;i<n;i++)yield [];};
  A.mark=function*(name){yield [{k:'mark',name}];};
  A.move=function*(x,y,s,fn=ease){const sx=state.ptr.x,sy=state.ptr.y;const n=Math.max(1,Math.round(s*FPS));for(let i=1;i<=n;i++){const e=fn(i/n);yield [{k:'move',x:sx+(x-sx)*e,y:sy+(y-sy)*e}];}};
  A.moveEl=function*(sel,s,opt={}){yield [{k:'q',name:'_el',fn:opt.fn||(([sel,txt])=>{let el=null;if(txt){for(const n of document.querySelectorAll(sel)){const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===txt);if(t){el=t;break;}}}else el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}),arg:[sel,opt.text||null]}];
    const r=state.Q._el;if(!r)throw new Error('moveEl: not found '+sel);const tx=r.x+r.w*(opt.fx??0.5),ty=r.y+r.h*(opt.fy??0.5);yield* A.move(tx,ty,s,opt.fn2||ease);};
  A.down=function*(btn='left'){yield [{k:'down',btn}];};
  A.up=function*(btn='left'){yield [{k:'up',btn}];};
  A.click=function*(btn='left'){yield [{k:'down',btn}];yield [];yield [{k:'up',btn}];};
  A.type=function*(text,perFrame=2){for(const ch of text){yield [{k:'key',ch}];for(let i=1;i<perFrame;i++)yield [];}};
  A.press=function*(combo){yield [{k:'press',combo}];};
  A.eval=function*(fn,arg){yield [{k:'eval',fn,arg}];};
  A.q=function*(name,fn,arg){yield [{k:'q',name,fn,arg}];};
  A.fit=function*(ids){yield [{k:'fit',ids}];};
  A.zoom=function*(factor,ax,ay,s){const n=Math.max(1,Math.round(s*FPS));yield [{k:'move',x:ax,y:ay,hid:true}];const total=-Math.log(factor)/0.00137;let sent=0;for(let i=1;i<=n;i++){const t=Math.round(total*ease(i/n));const dy=t-sent;sent=t;yield [dy?{k:'wheel',dy}:{k:'noop'}];}};
  return A;
}
async function film({id,dur,theme='dark',flags='',css='',setup,script,hold=1.0}){
  const DPR=Number(process.env.DPR||1.5), dry=DPR<1.5;
  const OUTD=path.join(ROOT,'.capture-e-'+id);fs.rmSync(OUTD,{recursive:true,force:true});fs.mkdirSync(OUTD,{recursive:true});
  const {b,p}=await open({dpr:DPR,theme,flags,css});
  await p.evaluate(()=>{const c=document.createElement('div');c.id='cur';document.head.insertAdjacentHTML('beforeend','<style>#cur{visibility:hidden!important}</style>');c.style.cssText='position:fixed;left:0;top:0;width:72px;height:72px;z-index:2147483647;pointer-events:none;opacity:0;transform-origin:8px 6px';c.innerHTML='<svg width="72" height="72" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';document.body.appendChild(c);});
  const state={ptr:{x:W+80,y:H*0.82},Q:{},holding:false,curOn:false,marks:{}};
  if(setup)await setup(p,state);
  const A=api(state);
  const tasks=[script(A,state)];
  const frames=Math.round(dur*FPS);
  async function exec(o){
    if(o.k==='move'){await p.mouse.move(o.x,o.y);state.ptr={x:o.x,y:o.y};if(!o.hid)state.curOn=true;}
    else if(o.k==='down'){await p.mouse.down({button:o.btn||'left'});state.holding=true;}
    else if(o.k==='up'){await p.mouse.up({button:o.btn||'left'});state.holding=false;}
    else if(o.k==='key'){await p.keyboard.type(o.ch);}
    else if(o.k==='press'){await p.keyboard.press(o.combo);}
    else if(o.k==='wheel'){await p.keyboard.down('Control');await p.mouse.wheel(0,o.dy);await p.keyboard.up('Control');}
    else if(o.k==='eval'){await p.evaluate(o.fn,o.arg);}
    else if(o.k==='q'){state.Q[o.name]=await p.evaluate(o.fn,o.arg);}
    else if(o.k==='fit'){await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),o.ids);}
    else if(o.k==='mark'){state.marks[o.name]=state.f/FPS;}
  }
  for(let f=0;f<frames;f++){
    state.f=f;
    const ops=[];
    for(let i=tasks.length-1;i>=0;i--){const r=tasks[i].next();if(r.done)tasks.splice(i,1);else ops.push(...r.value);}
    for(const o of ops)await exec(o);
    await p.evaluate(({ptr,holding,on})=>{const c=document.getElementById('cur');if(c){c.style.opacity=on?'1':'0';c.style.transform=`translate(${ptr.x}px,${ptr.y}px) scale(${holding?0.86:1})`;}},{ptr:state.ptr,holding:state.holding,on:state.curOn});
    await p.clock.runFor(1000/FPS);
    await p.screenshot({path:path.join(OUTD,String(f).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92});
    if(f%45===0)console.log(id,'frame',f,'/',frames);
  }
  await b.close();
  const out=path.join(ROOT,'footage',id+(dry?'-dry':'')+'.mp4');fs.mkdirSync(path.dirname(out),{recursive:true});
  execFileSync('ffmpeg',['-v','error','-y','-framerate',String(FPS),'-i',path.join(OUTD,'%05d.jpg'),'-vf',`tpad=stop_mode=clone:stop_duration=2,trim=duration=${dur}`,'-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',out]);
  if(!dry){
    execFileSync('ffmpeg',['-v','error','-y','-i',path.join(OUTD,'00000.jpg'),'-frames:v','1',path.join(ROOT,'footage',id+'.png')]);
    fs.writeFileSync(path.join(ROOT,'footage',id+'.json'),JSON.stringify({fps:FPS,duration:dur,w:W*DPR,h:H*DPR,markers:state.marks,notes:film.notes||''},null,1));
    fs.rmSync(OUTD,{recursive:true,force:true});
  }
  console.log('done',out,JSON.stringify(state.marks));
  return {out,marks:state.marks};
}
module.exports={film,ease,eo,W,H,FPS};
