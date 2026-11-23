// S05-quickadd — type 'Review the proposal 11:00 1h' into the real Todos quick-add, Enter: it lands in the list AND on the calendar.
const L=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(L.ROOT,'footage');fs.mkdirSync(OUT,{recursive:true});
const PLAN='Review the proposal 11:00 1h';
(async()=>{
 const {b,p}=await L.open({skip:'t-review',h0:11,h1:19,th:585,ch:560});
 await L.fit(p,['mother-todo','mother-calendar']);await L.zoomTo(p,960,548,1.55);
 const R=L.recorder(p,path.join(L.ROOT,'.capture-plan-cal','s05'));await L.pinNow(R,p);
 await p.mouse.move(2000,700);
 const field=await L.rect(p,'[data-id="mother-todo"]','add a plan');
 await R.frame(2);                                              // settled opening frames, no cursor yet
 await R.moveTo(field.x+field.w*0.18,field.y+field.h/2,0.9,L.easeOut);   // cursor enters from the right edge
 R.mark('click');R.down=true;await p.mouse.down();await R.frame(2);await p.mouse.up();R.down=false;await R.frame(4);
 const inp=p.locator('[data-id="mother-todo"] input').first();
 await R.moveTo(field.x+field.w*0.72,field.y+field.h*0.92,0.35);   // out of the way of the text
 R.mark('typeStart');
 let i=0;for(const ch of PLAN){await inp.press(ch===' '?'Space':ch);await R.frame(i%5===4?3:2);i++;}   // ≈ 12.5 characters a second
 R.mark('parsed');await R.frame(42);                            // the card with day / time / length is read
 R.mark('enter');await inp.press('Enter');await R.frame(38);    // lands in the list and on the calendar
 R.mark('landed');
 const blk=await L.rect(p,'[data-id="mother-calendar"]','Review the proposal');
 if(blk)await R.moveTo(blk.x+blk.w*0.55,blk.y+blk.h*0.5,0.8);
 await R.frame(10);
 const dur=R.n/L.FPS+1.0;
 R.encode(path.join(OUT,'S05-quickadd.mp4'),1.0);
 fs.copyFileSync(path.join(R.dir||path.join(L.ROOT,'.capture-plan-cal','s05'),'00000.jpg'),path.join(OUT,'S05-quickadd.png'));
 fs.writeFileSync(path.join(OUT,'S05-quickadd.json'),JSON.stringify({fps:30,duration:+dur.toFixed(2),w:2880,h:1620,markers:R.marks,notes:'Real Todos quick-add: cursor click, typing "Review the proposal 11:00 1h", parsed card (day/time/length), Enter, plan appears in Todos and on the Calendar at 11:00. Dark theme, free canvas, camera fixed at 1.55x, minimap hidden. Final 1 s is a frozen hold.'},null,1));
 console.log('S05',dur.toFixed(2),'s',JSON.stringify(R.marks));await b.close();
})();
