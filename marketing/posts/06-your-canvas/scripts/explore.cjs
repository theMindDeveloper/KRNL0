const {open}=require('./lib.cjs');const path=require('path');const OUT=path.join(__dirname,'..','.capture');
(async()=>{
 let {b,p,fit}=await open({w:1400,h:900,hide:false,mode:'free'});
 await p.click('[data-testid="layout-menu"]');await p.clock.runFor(600);await p.waitForTimeout(300);
 await p.screenshot({path:OUT+'/x_menu.png'});
 console.log(await p.evaluate(()=>{const m=document.querySelector('[aria-label="Layouts"]');return m?m.outerHTML.slice(0,200)+' | '+m.innerText:'none'}));
 await b.close();
 ({b,p,fit}=await open({w:1400,h:900,hide:true,mode:'station'}));
 await p.screenshot({path:OUT+'/x_station.png',omitBackground:true});
 await b.close();
})()
