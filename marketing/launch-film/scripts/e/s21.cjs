const {film,ease}=require('./rec.cjs');
const HID=['pomo','calendar','clock','analytics','term'].map(k=>`.react-flow__node[data-id="mother-${k}"]`).join(',')+`,.react-flow__node[data-id^="t-"],.react-flow__edge,.react-flow__edges{visibility:hidden!important}`;
film.notes='Settings (gear) -> Appearance -> Light: the whole app flips from dark to light (the real look transition), the dialog closes and the light app holds 1.5 s.';
film({id:'S21-theme-flip',dur:6.2,css:HID,
 setup:async(p,st)=>{
  const run=async(ms)=>{await p.clock.runFor(ms);await p.waitForTimeout(200)};
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-todo','mother-habit']}})));await run(1500);
  await p.mouse.move(960,500);
  const total=-Math.round(Math.log(1.5)/0.00137);let sent=0;
  for(let i=1;i<=10;i++){const tg=Math.round(total*i/10);const dy=tg-sent;sent=tg;await p.keyboard.down('Control');await p.mouse.wheel(0,dy);await p.keyboard.up('Control');await p.clock.runFor(50);}
  await run(800);
 },
 script:function*(A,st){
  yield* A.wait(0.4);
  yield* A.move(1745,21,0.9);
  yield* A.mark('gear');
  yield* A.click();
  yield* A.wait(0.9);
  yield* A.move(938,540,0.55);
  yield* A.wait(0.15);
  yield* A.mark('light');
  yield* A.click();
  yield* A.wait(0.9);
  yield* A.move(1302,298,0.5);
  yield* A.click();
  yield* A.mark('closed');
  yield* A.wait(0.4);
  yield* A.move(1640,640,0.6);
  yield* A.wait(1.1);
 }}).catch(e=>{console.error(e);process.exit(1)});
