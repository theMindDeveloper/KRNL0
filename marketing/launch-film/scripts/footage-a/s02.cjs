const L=require('./lib.cjs');
(async()=>{
const {b,p}=await L.open({calSize:[620,620],hr:{start:9,end:18},calZoom:5});
const R=new L.Recorder(p,'s02');
const ALL=['mother-todo','mother-calendar','mother-habit','mother-pomo','mother-clock','mother-analytics'];
R.focus=['mother-todo'];R.rate=1;await L.fit(p,['mother-todo']);
for(let i=0;i<3;i++){await p.evaluate((all)=>{for(const id of all){const el=document.querySelector(`.react-flow__node[data-id="${id}"]`);if(el)el.style.opacity=id==='mother-todo'?'1':'0';}},ALL);await p.clock.runFor(200);}
R.op=Object.fromEntries(ALL.map(i=>[i,i==='mother-todo'?1:0]));R.rate=0.22;
await R.hold(0.4);R.mark('stop-todos');await R.hold(1.3);
const stops=[['mother-calendar','stop-calendar'],['mother-habit','stop-habits'],['mother-pomo','stop-timer']];
let prev='mother-todo';
for(const [id,name] of stops){
  R.focus=[prev,id];R.mark('move-to-'+name.split('-')[1]);await R.cam([id],0.7);
  R.focus=[id];R.mark(name);await R.hold(1.5);prev=id;
}
const d=await R.finish('S02-glide','Slow glide Todos -> Calendar -> Habits -> Timer with the app fit-view (neighbours fade out so no slivers). Each stop held ~1.5 s, moves 0.7 s (+0.13 s settle). Dark theme, chrome visible. 1280x720 CSS px @2.25 -> 2880x1620.');
console.log('S02 duration',d,JSON.stringify(R.markers));
await b.close()})()
