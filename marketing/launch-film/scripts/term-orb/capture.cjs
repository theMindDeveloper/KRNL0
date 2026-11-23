// Films four shots of the real app for the launch film. Usage: node capture.cjs S22 [S23 S24 S25]   (DPR=0.5 for a fast dry run)
// Needs the preview on :5201. Real: the Terminal window, the orb + assistant panel, the Calendar/Todos/Habits/Timer windows, the tours list.
// Scripted: the shell (no shell in a browser: it echoes typed text and prints the output the REAL krnl command code produced, recorded in
// posts/09 capture/outputs.json) and the assistant's answer (Claude Code does not run in a browser). The result of each command is applied
// through the app's own UI (quick-add, habit tick, Start session) in the same frame, so the windows beside the terminal really change.
const fs=require('fs');const path=require('path');
const L=require('./lib.cjs');const {chromium,open,record,fit,wait,moveTo,typeText,ease,dolly,zoomOf,zoomTo,zoomIn,vpOf,W,H,FPS}=L;
const OUTS=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../posts/09-every-button-a-command/capture/outputs.json'),'utf8'));
const real=(c)=>OUTS.find(o=>o.cmd===c).message;
const OUTMAP={
  'krnl todo add "Review the proposal 11:00 1h"': real('todo add Review the proposal 11:00 1h'),
  'krnl habit done "Morning run"': real('habit done Morning run'),
  'krnl pomo start': 'Pomodoro started',      // exact string from src/sys/commands/pomo.ts (cannot run headlessly: needs the main process)
};
const want=process.argv.slice(2);const run=(id)=>!want.length||want.includes(id);

(async()=>{const b=await chromium.launch();

// ───────────────────────── S22 · terminal ─────────────────────────
if(run('S22')){
  const init=[`window.__SHELL=true;window.__SKIP='t-review';window.__NOSEED=true;window.__WRAP=${process.env.WRAP||40};window.__OUT=${JSON.stringify(OUTMAP)};
    window.__PATCH=(b,nodes)=>{const by=k=>nodes.find(n=>n.kind===k);const set=(n,x,w,h)=>{n.position={x,y:0};n.config={...n.config,canvasSize:{width:w,height:h}}};
      const term=by('term');term.config={...term.config,stationHidden:false,fontSize:15};
      set(by('pomo'),-400,540,540);set(by('habit'),-300,540,540);set(by('todo'),-200,540,540);set(term,0,540,540);set(by('calendar'),100,540,540);set(by('clock'),300,540,540);set(by('analytics'),400,540,540);
      const cal=by('calendar');cal.config={...cal.config,view:'day',hourRange:{start:8,end:16}};cal.state={...cal.state,zoom:6};b.edges=[];};`];
  const p=await open(b,{init});
  await fit(p,['mother-term','mother-calendar']);await p.clock.runFor(1500);await p.waitForTimeout(400);
  // make sure the terminal font/size is settled
  await p.addStyleTag({content:'.react-flow__node[data-id="mother-pomo"],.react-flow__node[data-id="mother-habit"],.react-flow__node[data-id="mother-todo"],.react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"]{opacity:0!important;pointer-events:none!important}'});
  console.log('zoom',await zoomIn(p,2));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await p.clock.runFor(800);await p.waitForTimeout(500);
  console.log('xterm',JSON.stringify(await p.evaluate(()=>{const s=document.querySelector('.react-flow__node[data-id="mother-term"] .xterm-screen');const m=document.querySelector('.react-flow__node[data-id="mother-term"] .xterm-char-measure-element');return {screen:s&&s.getBoundingClientRect().width,measure:m&&m.getBoundingClientRect().width,chars:m&&m.textContent.length}}))); 
  const termBox=await p.locator('.react-flow__node[data-id="mother-term"]').boundingBox();
  console.log('term box',JSON.stringify(termBox));
  const cmd=(text,after)=>function*(api){
    yield* typeText(text,16);
    yield [{k:'mark',name:after.mark},{k:'key',key:'Enter'},{k:'real',fn:after.real}];
  };
  const focusTerm=(p)=>p.evaluate(()=>document.querySelector('.react-flow__node[data-id="mother-term"] .xterm-helper-textarea')?.focus({preventScroll:true}));
  const quickAdd=async(p,text)=>{await p.evaluate(()=>document.querySelector('.react-flow__node[data-id="mother-todo"] [data-testid="add-task-placeholder"]')?.click());await p.clock.runFor(60);await p.evaluate(()=>document.querySelector('.react-flow__node[data-id="mother-todo"] input')?.focus({preventScroll:true}));await p.keyboard.type(text);await p.keyboard.press('Enter');await p.clock.runFor(60);await focusTerm(p);};
  const tick=async(p)=>{await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-habit"]');const t=[...n.querySelectorAll('button[title]')].find(e=>/Morning run 2026-11-24/.test(e.getAttribute('title')||''));t&&t.click();});};
  const pomoStart=async(p)=>{await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session|Start/.test(e.textContent||''));t&&t.click();});};
  await record(p,'S22-terminal',function*(api){
    yield [{k:'pin'}];
    yield [{k:'move',x:W-40,y:H+30},{k:'cur',on:true}];
    yield* moveTo(api,termBox.x+termBox.width*0.55,termBox.y+termBox.height*0.55,26);
    yield [{k:'mark',name:'click'},{k:'down'}];yield [{k:'up'}];yield* wait(4);
    yield* cmd('krnl todo add "Review the proposal 11:00 1h"',{mark:'enter-add',real:(p)=>quickAdd(p,'Review the proposal 11:00 1h')})(api);
    yield* wait(26);
    yield* cmd('krnl habit done "Morning run"',{mark:'enter-habit',real:tick})(api);
    yield* wait(20);
    yield* cmd('krnl pomo start',{mark:'enter-pomo',real:pomoStart})(api);
  },{tail:1.6,notes:'Real Terminal window (stand-in shell with recorded real krnl output) beside the real Calendar: krnl todo add → the plan appears on the Calendar at 11:00 (applied through the app quick-add), krnl habit done, krnl pomo start.'});
  await p.close();
}

// shared board patch for the orb / overview shots: calendar big and showing the afternoon, task cards parked far away, no edges
const PATCH_COMMON=`window.__PATCH=(b,nodes)=>{const by=k=>nodes.find(n=>n.kind===k);const cal=by('calendar');cal.config={...cal.config,view:'day',hourRange:{start:10,end:18},canvasSize:{width:540,height:540}};cal.state={...cal.state,zoom:6};b.edges=[];for(const n of nodes){if(n.kind==='todo.task')n.position={x:4000,y:3000};}};`;
const HIDE_OTHERS=(ids)=>`${ids.map(i=>`.react-flow__node[data-id="${i}"]`).join(',')}{opacity:0!important;pointer-events:none!important}`;
const orbBtn=(p)=>p.locator('[data-testid="orb-button"]');
const panelBox=(p)=>p.locator('[data-testid="orb-chat-panel"]').boundingBox();
const quickAddReal=async(p,text)=>{await p.evaluate(()=>document.querySelector('.react-flow__node[data-id="mother-todo"] [data-testid="add-task-placeholder"]')?.click());await p.clock.runFor(60);await p.evaluate(()=>document.querySelector('.react-flow__node[data-id="mother-todo"] input')?.focus({preventScroll:true}));await p.keyboard.type(text);await p.keyboard.press('Enter');await p.clock.runFor(60);};
const ORB_ZOOM=Number(process.env.OZ||1.7);
const calLeft=async(p)=>(await p.locator('.react-flow__node[data-id="mother-calendar"]').boundingBox()).x;
const panRight=async(p,wantLeft)=>{for(let k=0;k<4;k++){const x=await calLeft(p);const need=wantLeft-x;if(Math.abs(need)<8)break;await p.mouse.move(1750,300);await p.mouse.wheel(-need/2.5,0);await p.clock.runFor(800);await p.waitForTimeout(150);}console.log('calendar left',await calLeft(p));};
const scrollCal=async(p,dy)=>{const bb=await p.locator('.react-flow__node[data-id="mother-calendar"]').boundingBox();await p.mouse.move(bb.x+bb.width*0.5,bb.y+bb.height*0.55);await p.mouse.wheel(0,dy);await p.clock.runFor(500);await p.waitForTimeout(150);};

// ───────────────────────── S23 · orb-ask ─────────────────────────
const SC={'Add Call Mia at 16:00':[{wait:500,ev:{type:'tool',label:'krnl todo add "Call Mia"'}},{wait:350,ev:{type:'tool',label:'krnl todo when "Call Mia" today 16:00'}},{wait:300,ev:{type:'text',text:'Done. '}},{wait:200,ev:{type:'text',text:'Call Mia is on your Calendar at 16:00.'}},{wait:200,ev:{type:'done',text:''}}]};
const ORB_CSS=`[data-testid="orb-chat-panel"]{zoom:${ORB_ZOOM}}`;
if(run('S23')){
  const p=await open(b,{init:['window.__ORB=true;'+PATCH_COMMON,`window.__orbScript=${JSON.stringify(SC)};`]});
  await p.addStyleTag({content:HIDE_OTHERS(['mother-pomo','mother-habit','mother-todo','mother-clock','mother-analytics'])});
  await fit(p,['mother-calendar']);await p.clock.runFor(1500);await p.waitForTimeout(300);
  console.log('zoom',await zoomIn(p,2));await panRight(p,800);await scrollCal(p,200);
  await record(p,'S23-orb-ask',async function*(api){
    yield [{k:'pin'}];
    yield [{k:'move',x:W+40,y:H*0.62},{k:'cur',on:true}];
    const o=await api.rect('[data-testid="orb-button"]');
    yield* moveTo(api,o.x+o.w/2,o.y+o.h/2,26);
    yield [{k:'mark',name:'click-orb'},{k:'down'}];yield [{k:'up'}];
    yield* wait(3);
    yield [{k:'real',fn:(p)=>p.addStyleTag({content:ORB_CSS})}];
    yield* wait(26);
    const ib=await api.rect('[data-testid="orb-chat-input"]');
    yield* moveTo(api,ib.x+ib.w*0.4,ib.y+ib.h/2,16);
    yield [{k:'mark',name:'click-input'},{k:'down'}];yield [{k:'up'}];yield* wait(6);
    yield* typeText('Add Call Mia at 16:00',15);
    yield* wait(8);
    yield [{k:'mark',name:'enter'},{k:'key',key:'Enter'}];
    yield* wait(40);
    yield [{k:'mark',name:'calendar-updates'},{k:'real',fn:(p)=>quickAddReal(p,'Call Mia 16:00 1h')}];
  },{tail:2.6,notes:'Real orb + assistant panel (scripted answer: Claude Code does not run in a browser) and the real Calendar: the typed request, the two krnl command lines, then the Calendar shows Call Mia at 16:00 (applied through the app quick-add).'});
  await p.close();
}

// ───────────────────────── S24 · orb-tours ─────────────────────────
if(run('S24')){
  const p=await open(b,{init:['window.__ORB=true;'+PATCH_COMMON,`window.__orbScript=${JSON.stringify(SC)};`]});
  await p.addStyleTag({content:HIDE_OTHERS(['mother-pomo','mother-habit','mother-todo','mother-clock','mother-analytics'])});
  await fit(p,['mother-calendar']);await p.clock.runFor(1500);await p.waitForTimeout(300);
  await zoomIn(p,2);await panRight(p,800);await scrollCal(p,200);
  await record(p,'S24-orb-tours',async function*(api){
    yield [{k:'pin'}];
    yield [{k:'move',x:W+40,y:H*0.62},{k:'cur',on:true}];
    const o=await api.rect('[data-testid="orb-button"]');
    yield* moveTo(api,o.x+o.w/2,o.y+o.h/2,22);
    yield [{k:'mark',name:'click-orb'},{k:'down'}];yield [{k:'up'}];
    yield* wait(3);
    yield [{k:'real',fn:(p)=>p.addStyleTag({content:ORB_CSS})}];
    yield* wait(22);
    const t1=await api.rect('[data-testid="orb-tour-first-day"]');
    yield* moveTo(api,t1.x+t1.w*0.45,t1.y+t1.h/2,18);
    yield [{k:'mark',name:'hover-first-day'}];
    yield* wait(26);
    const t2=await api.rect('[data-testid="orb-tours"] button');
    if(t2){yield* moveTo(api,t2.x+t2.w*0.5,t2.y+t2.h/2,16);yield [{k:'mark',name:'hover-tour'}];}
  },{tail:1.4,notes:'The real orb panel opening onto its Tutorials list (Start here · Your first day, then the tours grid); the cursor hovers the first-day tour and then a tour. Group A films the tours themselves.'});
  await p.close();
}


// ───────────────────────── S25 · chrome-zoomout ─────────────────────────
if(run('S25')){
  const PATCH_S25=`window.__PATCH=(b,nodes)=>{const by=k=>nodes.find(n=>n.kind===k);const cal=by('calendar');cal.config={...cal.config,view:'day',hourRange:{start:8,end:18},canvasSize:{width:540,height:540}};cal.state={...cal.state,zoom:6};b.edges=[];const kids=['frame-launch','img-logo','title','s1','s2','s3','s4'];for(const n of nodes){if(n.kind==='todo.task')n.position={x:4000,y:3000};if(kids.includes(n.id))n.position={x:n.position.x-290,y:n.position.y-1340};}};`;
  const p=await open(b,{init:[PATCH_S25]});
  const ALL=['mother-pomo','mother-todo','mother-habit','mother-calendar','mother-clock','mother-analytics','frame-launch'];
  await fit(p,ALL);await p.clock.runFor(1500);await p.waitForTimeout(300);
  const T1=await vpOf(p);
  await fit(p,['mother-calendar']);await p.clock.runFor(1500);await zoomIn(p,2);await p.waitForTimeout(200);
  const T0=await vpOf(p);
  // pure zoom about one screen point takes T0 to T1: a = (z0*t1 - z1*t0)/(z0 - z1) per axis
  const ax=(T0.z*T1.x-T1.z*T0.x)/(T0.z-T1.z), ay=(T0.z*T1.y-T1.z*T0.y)/(T0.z-T1.z);
  console.log('T0',JSON.stringify(T0),'T1',JSON.stringify(T1),'anchor',ax.toFixed(0),ay.toFixed(0));
  const total=Math.log(T0.z/T1.z)/0.00137;   // wheel units (positive = zoom out)
  await record(p,'S25-chrome-zoomout',async function*(api){
    yield [{k:'mark',name:'start'}];
    yield* wait(36);
    yield [{k:'mark',name:'pull-back-begins'}];
    const N=6*FPS;let sent=0;
    for(let i=1;i<=N;i++){const e=ease(i/N);const target=Math.round(total*e);const dy=target-sent;sent=target;yield [dy?{k:'zoomwheel',x:ax,y:ay,dy}:{k:'cur',on:false}];}
    yield [{k:'mark',name:'whole-board'},{k:'fit',ids:ALL}];
    yield* wait(2*FPS+6);
  },{tail:0.6,notes:'The whole real app: the camera starts tight on the Calendar and pulls back with real zoom to the full board (all windows, the launch frame of notes, dock, top bar, minimap).'});
  console.log('end vp',JSON.stringify(await vpOf(p)));
  await p.close();
}
await b.close();})();
