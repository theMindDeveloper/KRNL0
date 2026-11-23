// S15-analytics: Analytics window (dark, 156% zoom). Starts on Summary; cursor clicks 'Planned vs spent'; the cards fill in; cursor rests on Accuracy then on a task row.
const {session}=require('./lib.cjs');
const FR='[data-id="mother-analytics"] .mother-frame';
(async()=>{
 await session({id:'S15-analytics',at:'2026-11-24T19:40:00',view:'summary',size:{analytics:[540,540]},notes:'Analytics window, dark, zoomed to 156%. Clock set to 19:40 (evening). Click on the Planned vs spent tab, then cursor to Accuracy x1.47 and to a task row. Seeded demo history (illustrative).'},async(ctx)=>{
  await ctx.isolate('mother-analytics'); await ctx.fit(['mother-analytics']); await ctx.zoomToHeight(FR,860);
  const by=(label)=>ctx.p.evaluate((label)=>{const r=document.querySelector('[data-id="mother-analytics"]');const el=[...r.querySelectorAll('*')].filter(e=>e.children.length<2&&e.tagName!=='svg'&&e.tagName!=='title'&&(e.textContent||'').trim().startsWith(label)).map(e=>({e,b:e.getBoundingClientRect()})).find(o=>o.b.width>4&&o.b.height>4);if(!el)return null;return{x:el.b.x+Math.min(el.b.width,200)/2,y:el.b.y+el.b.height/2}},label);
  const lastBar=()=>ctx.p.evaluate(()=>{const r=document.querySelector('[data-id="mother-analytics"]');const rs=[...r.querySelectorAll('svg rect')].map(e=>e.getBoundingClientRect()).filter(b=>b.width>6&&b.width<20&&b.height>20&&b.y>700&&b.y<1000);if(!rs.length)return null;const b=rs.sort((a,c)=>c.x-a.x)[0];return{x:b.x+b.width/2,y:b.y+b.height/2}});
  await ctx.hold(0.4);
  const tab=await ctx.center('[data-id="mother-analytics"] button[aria-label="Planned vs spent"]');
  await ctx.moveTo(tab.x,tab.y,0.8); ctx.mark('click_tab'); await ctx.click(); await ctx.hold(1.0);
  const acc=await by('×1.47'); if(acc){await ctx.moveTo(acc.x,acc.y,0.8); ctx.mark('hover_accuracy'); await ctx.hold(0.9);}
  const row=await by('Build the prototype'); if(row){await ctx.moveTo(row.x,row.y,0.8); ctx.mark('hover_task'); await ctx.hold(0.9);}
  const bar=await lastBar(); if(bar){await ctx.moveTo(bar.x,bar.y,0.8); ctx.mark('hover_day'); await ctx.hold(1.0);}
  await ctx.moveTo(1560,900,0.6); ctx.mark('settle'); await ctx.hold(0.6);
 });
})();
