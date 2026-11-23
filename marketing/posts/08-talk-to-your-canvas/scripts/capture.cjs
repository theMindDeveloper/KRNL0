// Films the real KRNL0 renderer (browser preview, port 5201) for post 08. Usage: node scripts/capture.cjs [panels|windows|all]
// The assistant's replies are scripted (scripts/board.js plays them through the same bridge calls the desktop app uses):
// Claude Code does not run in a browser. The panel, the orb and every window are the real app.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.resolve(__dirname,'../assets');fs.mkdirSync(OUT,{recursive:true});
const DPR=Number(process.env.DPR||3);
const CSS=`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],.react-flow__minimap,.react-flow__controls,.react-flow__background,[data-testid="dock"],[data-testid="dock-layer"],[data-testid="day-moment"]{display:none!important}
  html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:#0b0b0b!important}
  .react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"],.react-flow__node[data-id="mother-term"],.react-flow__node[data-id="mother-habit"]{visibility:hidden!important}`;
const SCRIPTS={
 'Move Gym to 17:00':[{wait:500,ev:{type:'tool',label:'krnl todo when Gym today 17:00'}},{wait:300,ev:{type:'text',text:'Done. '}},{wait:200,ev:{type:'text',text:'Gym is now at 17:00.'}},{wait:200,ev:{type:'done',text:''}}],
 'Add Send the invoice at 15:00':[{wait:500,ev:{type:'tool',label:'krnl todo when "Send the invoice" today 15:00'}},{wait:300,ev:{type:'text',text:'Done. '}},{wait:200,ev:{type:'text',text:'Send the invoice is on your Calendar at 15:00.'}},{wait:200,ev:{type:'done',text:''}}],
 "What's on my plate today?":[{wait:500,ev:{type:'tool',label:'krnl todo list'}},{wait:300,ev:{type:'text',text:'Five plans today.\n\n11:00  Review the proposal\n14:00  Client call\n18:00  Gym\n\nSend the invoice and Buy oat milk have no time yet.'}},{wait:200,ev:{type:'done',text:''}}],
};
async function open(b,{boardPatch,viewport}={}){
  const p=await b.newPage({viewport:viewport||{width:1000,height:1000},deviceScaleFactor:DPR});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.addInitScript((s)=>{window.__orbScript=s},SCRIPTS);
  if(boardPatch)await p.addInitScript({content:boardPatch});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
  await p.addStyleTag({content:CSS});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/Good (morning|afternoon|evening)/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  return p;
}
const panelShot=async(p,name)=>{await p.waitForTimeout(150);await p.locator('[data-testid="orb-chat-panel"]').screenshot({path:`${OUT}/${name}.png`});};
async function ask(p,q,ms=2600){
  const inp=p.locator('[data-testid="orb-chat-input"]');await inp.click();await inp.fill(q);await inp.press('Enter');await p.clock.runFor(ms);
}
(async()=>{const what=process.argv[2]||'all';const b=await chromium.launch();
if(what==='panels'||what==='all'){
  const p=await open(b);
  await p.addStyleTag({content:'.react-flow{visibility:hidden!important}'});
  await p.locator('[data-testid="orb-button"]').click();await p.clock.runFor(900);
  await panelShot(p,'panel-start');          // default state: quick actions + tutorials
  await p.locator('[data-testid="orb-button"]').screenshot({path:`${OUT}/orb.png`});
  for(const [q,n] of [['Move Gym to 17:00','panel-move'],['Add Send the invoice at 15:00','panel-plan'],["What's on my plate today?",'panel-plate']]){
    await ask(p,q);await panelShot(p,n);
    await p.locator('[data-testid="orb-chat-new"]').click();await p.clock.runFor(400);
  }
  await p.close();
}
await b.close();console.log('ok')})()
