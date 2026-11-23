// S14-habit-year: same Habits window; Week -> Month -> Year tabs clicked in turn; hold on the year grid.
const {session}=require('./lib.cjs');
const FR='[data-id="mother-habit"] .mother-frame';
const MUT=`(b)=>{const pad=n=>String(n).padStart(2,'0');const ds=(back)=>{const d=new Date('2026-11-24T12:00:00');d.setDate(d.getDate()-back);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 const run=(a,z)=>Array.from({length:z-a+1},(_,i)=>ds(a+i));
 const hist=(n,miss,seed)=>{const out=[];let s=seed;for(let k=1;k<=n;k++){s=(s*1103515245+12345)&0x7fffffff;if((s>>8)%100>=miss)out.push(ds(k))}return out};
 const h=b.nodes.find(n=>n.kind==='habit');
 const L={'h-run':[...hist(330,14,3).filter(d=>d<ds(7)),...run(1,6)],'h-read':[...hist(300,24,11).filter(d=>d<ds(5)),...run(1,4)],'h-water':[...hist(290,22,29).filter(d=>d<ds(3)),...run(1,2)],'h-med':[...hist(260,30,17).filter(d=>d<ds(9)),...run(1,8)],'h-sugar':[...hist(200,40,5).filter(d=>d<ds(3)),...run(1,2)]};
 h.state.habits=h.state.habits.filter(x=>['h-run','h-read','h-water'].includes(x.id));for(const x of h.state.habits)x.log=L[x.id];return b}`;
(async()=>{
 await session({id:'S14-habit-year',mutate:MUT,notes:'Habits window, dark, zoomed to 156%. Cursor clicks Month, then Year; the year grid is shown full. Habits carry a long deterministic history (illustrative).'},async(ctx)=>{
  await ctx.isolate('mother-habit'); await ctx.fit(['mother-habit']); await ctx.zoomToHeight(FR,860);
  const tab=async(label,mk,mv)=>{const c=await ctx.p.evaluate((label)=>{const r=document.querySelector('[data-id="mother-habit"]');const b=[...r.querySelectorAll('button')].find(e=>(e.textContent||'').trim()===label);if(!b)return null;const q=b.getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2}},label);await ctx.moveTo(c.x,c.y,mv);ctx.mark(mk);await ctx.click();};
  await ctx.hold(0.4);
  await tab('Month','tab_month',0.8); await ctx.hold(1.8);
  await tab('Year','tab_year',0.55); await ctx.hold(0.7);
  await ctx.moveTo(1560,880,0.7); ctx.mark('settle'); await ctx.hold(1.9);
 });
})();
