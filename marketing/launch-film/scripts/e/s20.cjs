const {film,ease}=require('./rec.cjs');
const HID=['clock','analytics','term'].map(k=>`.react-flow__node[data-id="mother-${k}"]`).join(',')+`,.react-flow__node[data-id^="t-"],.react-flow__edge,.react-flow__edges{visibility:hidden!important}`;
film.notes='Layout menu (top bar) opened to show both options, My layout chosen: the windows tile the screen; then Ctrl+Shift+L flips back to the Free canvas. Real app, real shortcut.';
film({id:'S20-layout-flip',dur:8,css:HID,
 setup:async(p,st)=>{
  const run=async(ms)=>{await p.clock.runFor(ms);await p.waitForTimeout(200)};
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-pomo','mother-todo','mother-habit','mother-calendar']}})));await run(1600);
 },
 script:function*(A,st){
  yield* A.wait(0.3);
  yield* A.move(1625,22,0.8);
  yield* A.mark('menu');
  yield* A.click();
  yield* A.wait(0.9);
  yield* A.move(1470,90,0.5);
  yield* A.wait(0.2);
  yield* A.mark('my-layout');
  yield* A.click();
  yield* A.move(1720,700,0.9);
  yield* A.wait(1.6);
  yield* A.mark('shortcut');
  yield* A.press('Control+Shift+L');
  yield* A.wait(1.8);
 }}).catch(e=>{console.error(e);process.exit(1)});
