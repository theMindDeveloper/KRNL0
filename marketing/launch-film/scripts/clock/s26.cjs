// S26-clock-drag — Todos | Calendar | Clock: 'Send the invoice' is carried from Todos onto the Calendar at 15:30;
// the Clock (PM half) shows the carried arc gliding with the ghost, and the plan's arc settles on the dial on drop.
const L=require('./lib.cjs');
(async()=>{
 const {b,p}=await L.open({invoice:true,order:['todo','calendar','clock','pomo','habit','analytics','term'],calZoom:5,hr:{start:9,end:20},calSize:[540,600]});
 // the Clock shows the afternoon (where the drop lands); the app's own AM/PM switch
 await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-clock"]');const bt=[...n.querySelectorAll('button')].find(e=>(e.textContent||'').trim()==='PM');bt&&bt.click();});
 await p.clock.runFor(400);
 await L.fit(p,['mother-todo','mother-calendar','mother-clock']);
 await L.centre(p,['mother-todo','mother-calendar','mother-clock'],664,378);
 const R=new L.Recorder(p,'s26');
 R.focus=['mother-todo','mother-calendar','mother-clock'];for(const id of ['mother-todo','mother-calendar','mother-clock','mother-pomo','mother-habit','mother-analytics','mother-term'])R.op[id]=R.focus.includes(id)?1:0;
 const row=await R.rect('[data-id="mother-todo"]','Send the invoice');
 const cell=await p.locator('[data-id="mother-calendar"] [data-testid="week-cell-2026-11-24-15"]').first().boundingBox();
 console.log('row',row,'cell',cell);
 const tx=cell.x+cell.width*0.45, ty=cell.y+cell.height*0.75;
 R.ptr={x:L.W*0.45,y:L.H+40};
 await R.frame();
 await R.moveTo(row.x+row.w*0.35,row.y+row.h/2,0.8,L.ease2);
 await R.hold(0.25);
 R.mark('grab');R.down=true;await p.mouse.down();await R.hold(0.15);
 await R.moveTo(tx,ty-cell.height*1.2,0.9);          // the carry: the Clock's carried arc glides
 R.mark('carry');
 await R.moveTo(tx,ty,0.5);
 await R.hold(0.6);
 R.mark('drop');await p.mouse.up();R.down=false;await R.hold(1.6);
 R.mark('landed');
 await R.moveTo(tx+260,ty+120,0.7);
 await R.hold(1.0);
 const d=await R.finish('S26-clock-drag','Real pointer drag: "Send the invoice" (30m, no time) from Todos onto the Calendar at 15:30, with the Clock showing the PM half: while carrying, the Clock draws the carried arc (Decision 63) that follows the calendar ghost; on drop the plan lands as a 15:30 block and its arc settles on the dial. Dark theme, camera fixed, neighbours faded out, minimap hidden. Final 1 s frozen (tpad).');
 console.log('S26',d,JSON.stringify(R.markers));await b.close();
})();
