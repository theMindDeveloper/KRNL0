// S06-drag — 'Send the invoice' (no time yet) is picked up in Todos and dropped on the Calendar; the camera is still during the carry.
const L=require('./lib.cjs');const path=require('path');const fs=require('fs');
const OUT=path.join(L.ROOT,'footage');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const {b,p}=await L.open({h0:11,h1:19,th:585,ch:560});
 await L.fit(p,['mother-todo','mother-calendar']);await L.zoomTo(p,960,548,1.55);
 const R=L.recorder(p,path.join(L.ROOT,'.capture-plan-cal','s06'));await L.pinNow(R,p);
 await p.mouse.move(2000,700);
 const row=await L.rect(p,'[data-id="mother-todo"]','Send the invoice');
 const cell=await p.locator('[data-testid="week-cell-2026-11-24-15"]').first().boundingBox();
 const tx=cell.x+cell.width*0.45, ty=cell.y+cell.height*0.55;
 await R.frame(2);
 await R.moveTo(row.x+row.w*0.35,row.y+row.h/2,0.9,L.easeOut);
 await R.frame(7);                                                  // hover: the row lights up
 R.mark('grab');R.down=true;await p.mouse.down();await R.frame(4);
 await R.moveTo(tx,ty,0.9);                                          // the carry
 R.mark('hover');await R.frame(22);                                  // the drop indicator on 15:00-15:30
 R.mark('drop');await p.mouse.up();R.down=false;await R.frame(44);  // it lands as a timed block; the row shows its time
 R.mark('landed');
 await R.moveTo(cell.x+cell.width*0.85,cell.y+cell.height*3.1,0.7);
 await R.frame(10);
 const dur=R.n/L.FPS+1.0;
 R.encode(path.join(OUT,'S06-drag.mp4'),1.0);
 fs.copyFileSync(path.join(R.dir,'00000.jpg'),path.join(OUT,'S06-drag.png'));
 fs.writeFileSync(path.join(OUT,'S06-drag.json'),JSON.stringify({fps:30,duration:+dur.toFixed(2),w:2880,h:1620,markers:R.marks,notes:'Real pointer drag: "Send the invoice" (30m, no time) from Todos onto the Calendar at 15:00; drop indicator, landing as a timed block, Todos row shows its time. Dark theme, camera fixed at 1.55x during the whole shot, minimap hidden. Final 1 s is a frozen hold.'},null,1));
 console.log('S06',dur.toFixed(2),JSON.stringify(R.marks));await b.close();
})();
