const {film,ease}=require('./rec.cjs');
const HID=['pomo','habit','calendar','clock','analytics','term'].map(k=>`.react-flow__node[data-id="mother-${k}"]`).join(',')+`{visibility:hidden!important}`;
film.notes='Right-click the canvas: the real pie menu (Sticky) -> colour ring -> a sticky note appears next to the Todos window, the camera re-frames, the note is typed live ("Gift idea for Mom"), then a second note.';
film({id:'S18-sticky',dur:12.4,css:HID,
 setup:async(p,st)=>{
  const run=async(ms)=>{await p.clock.runFor(ms);await p.waitForTimeout(200)};
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-todo']}})));await run(1500);
  await p.mouse.move(1100,436);
  const total=-Math.round(Math.log(1.4)/0.00137);let sent=0;
  for(let i=1;i<=10;i++){const tg=Math.round(total*i/10);const dy=tg-sent;sent=tg;await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');await p.clock.runFor(50);}
  await run(800);
 },
 script:function*(A,st){
  const newest=()=>document.querySelectorAll('.react-flow__node');
  const ring=function*(A,cx,cy,dx,dy){                       // right-click -> Sticky -> pick a colour
    yield* A.move(cx,cy,0.6);yield* A.click('right');yield* A.wait(0.4);
    yield* A.move(cx+52,cy+52,0.28);yield* A.click();yield* A.wait(0.35);
    yield* A.move(cx+dx,cy+dy,0.26);yield* A.click();
  };
  const lastNote=function*(A,st,name){
    yield* A.q('ids',()=>[...document.querySelectorAll('.react-flow__node')].map(n=>n.dataset.id).filter(i=>/^node-/.test(i)));
    const id=st.Q.ids[st.Q.ids.length-1];
    yield* A.q(name,(id)=>{const e=document.querySelector(`.react-flow__node[data-id="${id}"]`);const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},id);
  };
  yield* A.wait(0.25);
  yield* A.mark('rightclick1');
  yield* ring(A,1400,330,0,-74);                          // yellow
  yield* A.mark('created1');
  yield* A.wait(0.5);
  yield* lastNote(A,st,'n1');
  yield* A.move(st.Q.n1.x+st.Q.n1.w*0.5,st.Q.n1.y+st.Q.n1.h*0.35,0.45);
  yield* A.click();yield* A.wait(0.2);yield* A.click();yield* A.wait(0.25);
  yield* A.mark('typing1');
  yield* A.type('Gift idea for Mom',2);
  yield* A.mark('typed1');
  yield* A.wait(0.4);
  yield* A.move(1400,640,0.5);
  yield* A.mark('rightclick2');
  yield* A.click('right');yield* A.wait(0.45);
  yield* A.move(1400+52,640+52,0.28);yield* A.click();yield* A.wait(0.35);
  yield* A.move(1400+64,640-37,0.26);yield* A.click();           // pink
  yield* A.mark('created2');
  yield* A.wait(0.5);
  yield* lastNote(A,st,'n2');
  yield* A.move(st.Q.n2.x+st.Q.n2.w*0.5,st.Q.n2.y+st.Q.n2.h*0.35,0.4);
  yield* A.click();yield* A.wait(0.2);yield* A.click();yield* A.wait(0.25);
  yield* A.type('Pitch deck v2',2);
  yield* A.mark('typed2');
  yield* A.move(1780,260,0.45);
  yield* A.wait(0.9);
 }}).catch(e=>{console.error(e);process.exit(1)});
