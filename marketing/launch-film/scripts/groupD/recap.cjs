// S16-day-complete / S17-week-recap: the app's own recap cards (dark), scaled 1.75x with CSS zoom so the card fills ~70% of the frame height.
const {session}=require('./lib.cjs');
const which=process.argv[2];
const CFG={
 S16:{id:'S16-day-complete',at:'2026-11-24T19:40:00',ev:'krnl:recap-show',card:'[data-testid="day-recap"]',btn:'Good night',notes:'The Day complete evening recap (Tue 24 Nov, clock 19:40), triggered with the app\'s own krnl:recap-show event; card shown at 175% (CSS zoom). Dim canvas behind. Cursor rests on the Good night button (not clicked).'},
 S17:{id:'S17-week-recap',at:'2026-11-24T19:40:00',ev:'krnl:week-show',card:'[data-testid="week-recap"]',btn:'Start the week',notes:'The Last week look-back card (clock Tue 24 Nov 19:40; the card summarises 16-22 Nov), triggered with krnl:week-show; shown at 175% (CSS zoom). Dim canvas behind. Cursor rests on Start the week (not clicked).'},
}[which];
(async()=>{
 await session({id:CFG.id,at:CFG.at,css:'.ln-dialog.dm-card{zoom:1.75}',notes:CFG.notes},async(ctx)=>{
  await ctx.hold(0.5);
  await ctx.p.evaluate((ev)=>window.dispatchEvent(new CustomEvent(ev)),CFG.ev); ctx.mark('card_in');
  await ctx.hold(2.6);
  const c=await ctx.p.evaluate(({btn})=>{const b=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').trim()===btn);if(!b)return null;const q=b.getBoundingClientRect();return{x:q.x+q.width/2,y:q.y+q.height/2}},{btn:CFG.btn});
  if(c){await ctx.moveTo(c.x,c.y,0.9); ctx.mark('hover_cta');}
  await ctx.hold(1.9);
 });
})();
