// S13-habit-tick: cursor ticks today's square for three habits; streaks update; the 7-day card badge appears on Morning run.
const {session,HABITS_MUTATE}=require('./lib.cjs');
const FR='[data-id="mother-habit"] .mother-frame';
(async()=>{
 await session({id:'S13-habit-tick',mutate:HABITS_MUTATE,notes:'Habits window, dark, canvas zoomed to 156% so the 540x540 window fills ~80% of the frame height. Cursor ticks today (Tue 24 Nov): Morning run 6->7 days (7-day card badge appears), Read 20 pages 4->5, Drink water 2->3.'},async(ctx)=>{
  await ctx.isolate('mother-habit'); await ctx.fit(['mother-habit']); await ctx.zoomToHeight(FR,860);
  const tick=async(name,mk,mv=0.6)=>{const c=await ctx.center(`button[title^="${name} 2026-11-24"]`);await ctx.moveTo(c.x,c.y,mv);ctx.mark(mk);await ctx.click();};
  await ctx.hold(0.35);
  await tick('Morning run','tick_run',0.8); await ctx.hold(1.0);
  await tick('Read 20 pages','tick_read',0.55); await ctx.hold(0.7);
  await tick('Drink water','tick_water',0.55); await ctx.hold(0.5);
  await ctx.moveTo(1500,820,0.7); ctx.mark('settle'); await ctx.hold(1.5);
 });
})();
