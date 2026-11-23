// Group E helpers: open the real KRNL0 preview at 1920x1080 (dark, chrome visible, fake clock), find things, move a big cursor.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(ROOT,'../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const CSS=`[data-testid="ambient-radio"],.react-flow__minimap,.react-flow__controls,.react-flow__attribution{display:none!important} *{caret-color:#c9f158}`;
async function open({dpr=1,theme='dark',flags='',css='',mode}={}){
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:dpr});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript({content:`try{localStorage.setItem('krnl0-theme',${JSON.stringify(theme)})}catch(e){};window.__LOGO=${JSON.stringify(LOGO)};window.__MODE__=${JSON.stringify(mode||'free')};`+flags});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board-e.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:CSS+css});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<90&&r.height>20)e.style.display='none'}});
  return {b,p};
}
module.exports={open,ROOT,CSS};
