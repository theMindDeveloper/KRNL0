const {chromium}=require('playwright');const L=require('./lib.cjs');
(async()=>{const b=await chromium.launch();
const p=await L.open(b,{order:['pomo','todo','cal','habit'],show:['mother-pomo'],radio:true,radioPos:{x:740,y:89},
  css:`[data-testid="ambient-radio"]{transform:scale(1.4)!important;transform-origin:0 0!important}`});
await L.fit(p,['mother-pomo']);
// shift the camera left so Timer + radio sit centred together, then pin it
let T=await p.evaluate(()=>document.querySelector('.react-flow__viewport').style.transform);
const m=T.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);const pinT=`translate(${(+m[1]-190)}px, ${+m[2]}px) scale(${m[3]})`;
await p.evaluate(t=>{document.querySelector('.react-flow__viewport').style.transform=t},pinT);await p.clock.runFor(300);
const R=(fn,a)=>L.rect(p,fn,a);const preset=id=>R(id=>document.querySelector(`[data-testid="ambient-radio-preset-${id}"]`),id);
const rain=await preset('rain'),fire=await preset('fire'),synth=await preset('synth');
// dry run: add the three layers to measure their sliders, then remove them again
for(const id of ['rain','fire','synth']){await p.locator(`[data-testid="ambient-radio-preset-${id}"]`).click();await p.clock.runFor(300);}
const vol=async id=>R(id=>document.querySelector(`[data-testid="ambient-radio-layer-vol-${id}"]`),id);
const vr=await vol('rain'),vf=await vol('fire'),vs=await vol('synth');
for(const id of ['rain','fire','synth']){await p.locator(`[data-testid="ambient-radio-preset-${id}"]`).click();await p.clock.runFor(300);}
await p.clock.runFor(1500);
console.log({rain,fire,synth,vr,vf,vs});
const c=r=>[r.x+r.w/2,r.y+r.h/2];const at=(r,f)=>[r.x+r.w*f,r.y+r.h/2];
await L.shoot(p,{name:'S10-radio-mix',seconds:10,pinT,start:{x:L.VW+40,y:330},
  markers:{rain:1.0,fire:1.8,synth:2.5,volume:5.0},
  notes:'Real ambient radio (scaled 1.4x with CSS so it reads large) beside the Timer, dark theme. Cursor taps Rain, Fire, Synth (layers stack, each with its own volume row) then drags the Rain volume slider; the radio visual reacts. Audio not captured.',
  events:[{t:0,gen:function*(k){
    yield* k.moveTo(...c(rain),26);yield [{k:'click'}];yield* k.wait(22);
    yield* k.moveTo(...c(fire),12);yield [{k:'click'}];yield* k.wait(6);
    yield* k.moveTo(...c(synth),10);yield [{k:'click'}];yield* k.wait(36);
    yield* k.moveTo(...at(vr,0.8),22);yield [{k:'down'}];yield* k.wait(3);
    const [sx,sy]=at(vr,0.8),[ex]=at(vr,0.42);for(let i=1;i<=16;i++){yield [{k:'move',x:sx+(ex-sx)*L.ease(i/16),y:sy}];}
    yield [{k:'up'}];yield* k.wait(8);
    yield* k.moveTo(...at(vf,0.6),14);yield [{k:'down'}];yield* k.wait(2);
    const [fx,fy]=at(vf,0.6),[gx]=at(vf,0.3);for(let i=1;i<=12;i++){yield [{k:'move',x:fx+(gx-fx)*L.ease(i/12),y:fy}];}
    yield [{k:'up'}];yield* k.wait(10);
    yield* k.moveTo(L.VW+60,520,24);}}]});
await b.close()})()
