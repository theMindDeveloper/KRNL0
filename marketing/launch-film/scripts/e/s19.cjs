const {film,ease}=require('./rec.cjs');
const HID=['pomo','habit','calendar','clock','analytics','term'].map(k=>`.react-flow__node[data-id="mother-${k}"]`).join(',')+`,.react-flow__node[data-id^="t-"],.react-flow__edge,.react-flow__edges{visibility:hidden!important}`;
film.notes='A frame (title + three notes): the cursor grabs the frame header and drags it right/up and back; everything inside moves with it.';
film({id:'S19-frame',dur:7,css:HID,
 setup:async(p,st)=>{
  const run=async(ms)=>{await p.clock.runFor(ms);await p.waitForTimeout(200)};
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['frame-launch']}})));await run(1500);
  await p.mouse.move(960,548);
  const total=-Math.round(Math.log(1.25)/0.00137);let sent=0;
  for(let i=1;i<=10;i++){const tg=Math.round(total*i/10);const dy=tg-sent;sent=tg;await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');await p.clock.runFor(50);}
  await run(800);
 },
 script:function*(A,st){
  yield* A.q('hdr',()=>{const n=document.querySelector('.react-flow__node[data-id="frame-launch"]');const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const h=st.Q.hdr;const gx=h.x+h.w*0.5, gy=h.y+9;           // the frame's title bar
  yield* A.wait(0.2);
  yield* A.move(gx,gy,0.8);
  yield* A.mark('grab');
  yield* A.down();yield* A.wait(0.12);
  const sx=st.ptr.x,sy=st.ptr.y;
  yield* A.move(sx+250,sy-70,1.25);
  yield* A.mark('dragged');
  yield* A.wait(0.35);
  yield* A.move(sx-70,sy+95,1.45);
  yield* A.up();yield* A.mark('drop');
  yield* A.wait(0.4);
  yield* A.move(sx-260,sy+330,0.5);
  yield* A.wait(0.4);
 }}).catch(e=>{console.error(e);process.exit(1)});
