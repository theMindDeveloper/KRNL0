// S08-calendar-day — slow cinematic push on the real Calendar day view; the now-line, hover on events. Camera by ctrl+wheel ticks (no pin).
const L=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(L.ROOT,'footage');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const {b,p}=await L.open({h0:8,h1:20,zoom:3.5,tw:540,th:560,cw:720,ch:700,skip:'t-deep',hide:['mother-todo']});
 await L.fit(p,['mother-calendar']);await L.zoomTo(p,960,90,1.18);await L.centerOn(p,'mother-calendar');
 const R=L.recorder(p,path.join(L.ROOT,'.capture-plan-cal','s08'));
 await p.mouse.move(2000,800);
 const N=Math.round(5.0*L.FPS);let dyDone=0;const total=Math.round(Math.log(1.28/1.18)/0.00137);   // 1.2x -> ~1.34x
 let blk=null;
 for(let i=0;i<N;i++){
   const e=L.ease((i+1)/N), tgt=Math.round(-total*e), dy=tgt-dyDone;   // negative dy zooms in
   if(dy){await L.wheelZoom(p,960,90,dy);dyDone=tgt;}
   if(i===Math.round(1.6*L.FPS)){blk=await L.rect(p,'[data-id="mother-calendar"]','Review the proposal');}
   if(i>=Math.round(1.6*L.FPS)&&blk&&!R._m){R._m=1;}
   await R.frame();
   if(i===Math.round(1.6*L.FPS)){R.mark('cursorIn');}
 }
 // cursor glides in to hover 'Review the proposal' (the block under the pointer lights up), then settles on 'Client call'
 blk=await L.rect(p,'[data-id="mother-calendar"]','Review the proposal');
 const blk2=await L.rect(p,'[data-id="mother-calendar"]','Client call');
 await R.moveTo(blk.x+blk.w*0.6,blk.y+blk.h*0.5,0.9,L.easeOut);R.mark('hover');await R.frame(24);
 if(blk2)await R.moveTo(blk2.x+blk2.w*0.6,blk2.y+blk2.h*0.5,0.8);
 await R.frame(12);
 const dur=R.n/L.FPS+1.0;
 R.encode(path.join(OUT,'S08-calendar-day.mp4'),1.0);
 fs.copyFileSync(path.join(R.dir,'00000.jpg'),path.join(OUT,'S08-calendar-day.png'));
 fs.writeFileSync(path.join(OUT,'S08-calendar-day.json'),JSON.stringify({fps:30,duration:+dur.toFixed(2),w:2880,h:1620,markers:R.marks,notes:'Real Calendar day view, single window: slow push 1.18x to 1.28x by in-app zoom while the cursor drifts in and hovers Review the proposal then Client call. Red now-line at 10:30. Dark theme.'},null,1));
 console.log('S08',dur.toFixed(2),JSON.stringify(R.marks));await b.close();
})();
