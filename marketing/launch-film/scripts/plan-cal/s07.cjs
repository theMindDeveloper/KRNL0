// S07-tick — the cursor ticks a plan in the real Todos window; the row is checked off and moves to 'Done today'.
const L=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(L.ROOT,'footage');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const {b,p}=await L.open({h0:11,h1:19,tw:640,th:540,cw:540,ch:560,skip:'t-deep',hide:['mother-calendar']});
 await L.fit(p,['mother-todo']);await L.zoomTo(p,960,90,1.7);await L.centerOn(p,'mother-todo');
 const R=L.recorder(p,path.join(L.ROOT,'.capture-plan-cal','s07'));await L.pinNow(R,p);
 await p.mouse.move(2000,800);
 // the checkbox is the square left of the row text
 const cb=await p.evaluate(()=>{const root=document.querySelector('[data-id="mother-todo"]');const t=[...root.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='Review the proposal');if(!t)return null;let row=t.parentElement;for(let i=0;i<4&&row;i++){const c=row.querySelector('input[type=checkbox],button[role=checkbox],[role=checkbox],button');if(c){const r=c.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}row=row.parentElement;}return null;});
 console.log('checkbox',JSON.stringify(cb));
 await R.frame(2);
 await R.moveTo(cb.x+cb.w/2,cb.y+cb.h/2,0.9,L.easeOut);
 await R.frame(6);
 R.mark('click');R.down=true;await p.mouse.down();await R.frame(3);await p.mouse.up();R.down=false;
 await R.frame(30);R.mark('done');
 await R.frame(8);
 // then the 'Done today' drawer opens: the checked plan is there
 const dt=await p.evaluate(()=>{const root=document.querySelector('[data-id="mother-todo"]');let best=null;for(const e of root.querySelectorAll('*')){const t=(e.textContent||'').trim().toLowerCase();if(t.startsWith('done today')&&t.length<24&&(!best||t.length<=best.t.length)){const r=e.getBoundingClientRect();if(r.width>0)best={t,x:r.x,y:r.y,w:r.width,h:r.height};}}return best;});
 if(dt){await R.moveTo(dt.x+dt.w*0.4,dt.y+dt.h/2,0.7);await R.frame(4);R.mark('openDone');R.down=true;await p.mouse.down();await R.frame(2);await p.mouse.up();R.down=false;await R.frame(34);}
 const dur=R.n/L.FPS+1.0;
 R.encode(path.join(OUT,'S07-tick.mp4'),1.0);
 fs.copyFileSync(path.join(R.dir,'00000.jpg'),path.join(OUT,'S07-tick.png'));
 fs.writeFileSync(path.join(OUT,'S07-tick.json'),JSON.stringify({fps:30,duration:+dur.toFixed(2),w:2880,h:1620,markers:R.marks,notes:'Real Todos window, single, 1.7x: the cursor ticks "Review the proposal"; the row leaves the list (Todos 5→4) and lands in Done today; the cursor then opens the Done today drawer to show it checked. Dark theme. Final 1 s is a frozen hold.'},null,1));
 console.log('S07',dur.toFixed(2),JSON.stringify(R.marks));await b.close();
})();
