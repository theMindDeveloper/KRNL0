// Shared recorder for the launch-film footage (group A). Deterministic: fake clock stepped per frame, one JPEG per frame, ffmpeg encode.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const HERE=__dirname, FOOT=path.resolve(HERE,'../../footage');
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(HERE,'../../../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const W=1280,H=720,FPS=30;
const ease=(x)=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const ease2=(x)=>1-Math.pow(1-x,3);
exports.ease=ease;exports.ease2=ease2;exports.W=W;exports.H=H;exports.FPS=FPS;exports.FOOT=FOOT;
exports.open=async function({calZoom,dpr=2.25,size={},calSize,hr,noseed=true,theme='dark',at='2026-11-24T10:30:00',hide=[],viewport={width:W,height:H},style=''}={}){
  const b=await chromium.launch();
  const p=await b.newPage({viewport,deviceScaleFactor:dpr});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.clock.install({time:new Date(at)});
  await p.addInitScript({content:`try{localStorage.setItem('krnl0-theme','${theme}')}catch(e){}`});
  await p.addInitScript({content:`window.__LOGO=${JSON.stringify(LOGO)};window.__SIZE=${JSON.stringify(size)};window.__CALSIZE=${JSON.stringify(calSize||null)};window.__HR=${JSON.stringify(hr||null)};window.__CALZOOM=${calZoom||0};window.__SKIP='';window.__NOSEED=${!!noseed};window.__VIEW='';`+fs.readFileSync(path.join(HERE,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],.react-flow__minimap,.react-flow__controls{display:none!important}
    .react-flow__edges,.react-flow__edge{display:none!important} *{caret-color:#c9f158} ${hide.map(s=>s+'{display:none!important}').join('')} ${style}`});
  await p.evaluate(()=>{
    for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none';}
    const c=document.createElement('div');c.id='cur';
    c.style.cssText='position:fixed;left:0;top:0;width:48px;height:48px;z-index:2147483647;pointer-events:none;opacity:0;transform-origin:5px 4px';
    c.innerHTML='<svg width="48" height="48" viewBox="0 0 24 24"><path d="M4 2.5 L4 18.5 L8.4 14.6 L11.2 21 L14 19.8 L11.3 13.5 L17.2 13.3 Z" fill="#0a0908" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  return {b,p};
};
exports.fit=async function(p,ids,settle=true){
  await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);
  if(settle){await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
};
// Recorder: .frame() steps the fake clock by one frame and writes a JPEG
exports.Recorder=class{
  constructor(p,name){this.p=p;this.name=name;this.dir=path.resolve(HERE,'../../../.capture-a-'+name);fs.rmSync(this.dir,{recursive:true,force:true});fs.mkdirSync(this.dir,{recursive:true});this.n=0;this.focus=null;this.rate=0.25;this.op={};this.ptr={x:W+60,y:H*0.6};this.show=false;this.down=false;this.markers={};}
  t(){return this.n/FPS}
  mark(k){this.markers[k]=+this.t().toFixed(3)}
  async frame(clockMs=1000/FPS){
    const MOTH=['mother-todo','mother-calendar','mother-habit','mother-pomo','mother-clock','mother-analytics','mother-term'];
    if(this.focus){for(const id of MOTH){const tg=this.focus.includes(id)?1:0;const cur=this.op[id]==null?tg:this.op[id];this.op[id]=Math.abs(tg-cur)<0.02?tg:cur+(tg-cur)*this.rate;}}
    await this.p.evaluate(({ptr,show,down,op})=>{const c=document.getElementById('cur');if(c){c.style.opacity=show?'1':'0';c.style.transform=`translate(${ptr.x}px,${ptr.y}px) scale(${down?0.86:1})`;}
      for(const id in op){const el=document.querySelector(`.react-flow__node[data-id="${id}"]`);if(el){el.style.opacity=String(op[id]);el.style.pointerEvents=op[id]<0.5?'none':'';}}},{ptr:this.ptr,show:this.show,down:this.down,op:this.op});
    await this.p.clock.runFor(clockMs);
    await this.p.screenshot({path:path.join(this.dir,String(this.n).padStart(5,'0')+'.jpg'),type:'jpeg',quality:93});
    this.n++;
  }
  async hold(sec,clockMs){for(let i=0;i<Math.round(sec*FPS);i++)await this.frame(clockMs)}
  // camera move through the app's own fit-view (0.4 s animation filmed slowly over `dur` seconds)
  async cam(ids,dur=0.7){
    await this.p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);
    const n=Math.round(dur*FPS);const step=420/n;
    for(let i=0;i<n;i++)await this.frame(step);
    for(let i=0;i<4;i++)await this.frame();
  }
  async moveTo(x,y,dur=0.5,e=ease){const sx=this.ptr.x,sy=this.ptr.y,n=Math.max(1,Math.round(dur*FPS));this.show=true;for(let i=1;i<=n;i++){const k=e(i/n);this.ptr={x:sx+(x-sx)*k,y:sy+(y-sy)*k};await this.p.mouse.move(this.ptr.x,this.ptr.y);await this.frame();}}
  async click(){this.down=true;await this.p.mouse.down();await this.frame();await this.frame();this.down=false;await this.p.mouse.up();await this.frame();}
  async rect(sel,text){return this.p.evaluate(({sel,text})=>{let el=null;if(text){for(const n of document.querySelectorAll(sel)){const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()===text);if(t){el=t;break;}}}else el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},{sel,text});}
  async type(text,perSec=14){const per=Math.max(1,Math.round(FPS/perSec));for(const ch of text){await this.p.keyboard.type(ch);for(let i=0;i<per;i++)await this.frame();}}
  async finish(id,notes){
    // tail pad is done by ffmpeg (tpad); encode
    this.dpr=this.dpr||2.25;const out=path.join(FOOT,id+'.mp4');fs.mkdirSync(FOOT,{recursive:true});
    execFileSync('ffmpeg',['-v','error','-y','-framerate',String(FPS),'-i',path.join(this.dir,'%05d.jpg'),'-vf','tpad=stop_mode=clone:stop_duration=1','-c:v','libx264','-crf','16','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart',out]);
    const dur=+(this.n/FPS).toFixed(3);
    fs.writeFileSync(path.join(FOOT,id+'.json'),JSON.stringify({fps:FPS,duration:dur,w:2880,h:1620,markers:this.markers,notes},null,1));
    execFileSync('ffmpeg',['-v','error','-y','-i',path.join(this.dir,'00000.jpg'),'-frames:v','1',path.join(FOOT,id+'.png')]);
    return dur;
  }
};
