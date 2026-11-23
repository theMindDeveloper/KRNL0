const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
await p.goto('file://'+path.resolve(__dirname,'slide.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
await p.locator('#s1').screenshot({path:path.resolve(__dirname,'intro.png')});await b.close()})()
