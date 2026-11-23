const L=require('./lib.cjs');
(async()=>{
const {b,p}=await L.open({calSize:[620,620],hr:{start:9,end:18},calZoom:5});
const R=new L.Recorder(p,'s01');
// pre-roll (not recorded): settle camera on Todos with neighbours hidden
R.focus=['mother-todo'];R.rate=1;await L.fit(p,['mother-todo']);
for(let i=0;i<3;i++){await p.evaluate((op)=>{for(const id of ['mother-todo','mother-calendar','mother-habit','mother-pomo','mother-clock','mother-analytics']){const el=document.querySelector(`.react-flow__node[data-id="${id}"]`);if(el)el.style.opacity=id==='mother-todo'?'1':'0';}});await p.clock.runFor(200);}
R.op={'mother-todo':1,'mother-calendar':0,'mother-habit':0,'mother-pomo':0,'mother-clock':0,'mother-analytics':0};R.rate=0.22;
await R.hold(1.8);R.mark('app-on-todos');
R.focus=['mother-todo','mother-calendar'];R.mark('pull-to-pair');await R.cam(['mother-todo','mother-calendar'],0.9);
await R.hold(1.9);
R.focus=['mother-todo','mother-calendar','mother-habit','mother-pomo'];R.mark('pull-to-all');await R.cam(['mother-todo','mother-calendar','mother-habit','mother-pomo'],1.1);
await R.hold(0.8);
R.mark('hold-row');await R.hold(2.6);
await R.hold(0.5);
const d=await R.finish('S01-boot','Real app, dark theme, chrome visible. Starts on Todos, the app\'s own fit-view pulls out to Todos+Calendar, then all four windows (Todos, Calendar, Habits, Timer); holds on the row at the end (a push-in would crop the outer windows). Captured at 1280x720 CSS px @2.25 (UI reads like 1920x1080 @1.5 scaled up 1.5x), output 2880x1620.');
console.log('S01 duration',d,JSON.stringify(R.markers));
await b.close()})()
