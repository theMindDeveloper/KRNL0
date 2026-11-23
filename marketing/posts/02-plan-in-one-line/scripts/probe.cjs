const {open,ROOT}=require('./lib.cjs');const path=require('path');
(async()=>{const {b,p,ground,fit}=await open({zoom:6,th:+(process.env.TH||260),ch:+(process.env.CH||340)});await ground('#141414');await fit(['mother-todo','mother-calendar']);
console.log(await p.evaluate(()=>document.documentElement.getAttribute('data-theme')));
for(const id of ['mother-todo','mother-calendar']){const bb=await p.locator(`[data-id="${id}"] .mother-frame`).boundingBox();console.log(id,bb.width,bb.height);}
await p.screenshot({path:path.join(ROOT,'.capture/probe.png')});await b.close()})()
