const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');
exports.ROOT=ROOT;
exports.open=async function(opts={}){
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1700,height:1000},deviceScaleFactor:opts.dsf||2});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript({content:`window.__ZOOM=${opts.zoom||6};window.__REVIEW=${!!opts.review};`+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],[data-testid="dock-layer"],.react-flow__minimap,.react-flow__controls,.react-flow__background,.react-flow__edges{display:none!important}
   .react-flow__node[data-id="mother-habit"],.react-flow__node[data-id="mother-pomo"],.react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"],.react-flow__node[data-id="mother-term"],.react-flow__node[data-type="todo.task"]{visibility:hidden!important}`});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  const ground=async(c)=>{await p.addStyleTag({content:`html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:${c}!important}`});};
  const fit=async(ids)=>{for(let k=0;k<2;k++){await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);await p.clock.runFor(900);await p.waitForTimeout(250);}await p.clock.runFor(600);};
  return {b,p,ground,fit};
};
