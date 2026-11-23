// S27-clock-live — Clock (AM half, now 10:30) beside the Timer: the cursor picks 'Review the proposal' and presses Start;
// the fake clock is fast-forwarded so the dial's hand moves and the recorded (observed) time fills in on the dial.
const L=require('./lib.cjs');
(async()=>{
 const {b,p}=await L.open({order:['todo','calendar','clock','pomo','habit','analytics','term'],calZoom:5,hr:{start:9,end:20},calSize:[540,600]});
 await L.fit(p,['mother-clock','mother-pomo']);
 await L.centre(p,['mother-clock','mother-pomo'],660,385);
 const R=new L.Recorder(p,'s27');
 R.focus=['mother-clock','mother-pomo'];for(const id of ['mother-todo','mother-calendar','mother-clock','mother-pomo','mother-habit','mother-analytics','mother-term'])R.op[id]=R.focus.includes(id)?1:0;
 const pomo='[data-id="mother-pomo"]';
 const rectOf=(fn)=>p.evaluate(fn).then(r=>r);
 const pill=await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const e=[...n.querySelectorAll('button,[role=combobox],[aria-haspopup]')].find(e=>/No task/.test(e.textContent||''));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 R.ptr={x:L.W+60,y:L.H*0.7};
 await R.frame();
 await R.moveTo(pill.x,pill.y,0.7,L.ease2);
 R.mark('pill');await R.click();await R.hold(0.3);
 const opt=await p.evaluate(()=>{const e=[...document.querySelectorAll('[role=option]')].find(e=>/Review the proposal/.test(e.textContent||''));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await R.moveTo(opt.x,opt.y,0.4);R.mark('pickPlan');await R.click();await R.hold(0.3);
 const start=await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-pomo"]');const e=[...n.querySelectorAll('button')].find(e=>/Start session/.test(e.textContent||''));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await R.moveTo(start.x,start.y,0.6);R.mark('start');await R.click();
 // move the cursor away, then fast-forward: 20 min of the day in ~5 s
 const ff=Math.round(5*L.FPS); const per=20*60*1000/ff;
 await R.moveTo(L.W*0.5,L.H+60,0.5);
 R.mark('ffwdStart');
 for(let i=0;i<ff;i++)await R.frame(per);
 R.mark('ffwdEnd');
 await R.hold(1.0);
 const d=await R.finish('S27-clock-live','Real Clock (AM half) beside the real Timer: cursor picks "Review the proposal" in the plan pill and presses Start session; then 20 minutes of the day are fast-forwarded over ~5 s, so the Clock hand moves 10:30 -> 10:50 and the recorded time fills in on the dial while the Timer counts down. Dark theme, neighbours faded, minimap hidden. Final 1 s frozen (tpad).');
 console.log('S27',d,JSON.stringify(R.markers));await b.close();
})();
