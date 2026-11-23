const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file://'+path.resolve(__dirname,'thumb.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
await p.screenshot({path:path.resolve(__dirname,'thumbnail-1920.png')});
const q=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});await q.goto('file://'+path.resolve(__dirname,'thumb.html'));
await q.addStyleTag({content:'body{zoom:0.6667}'});await q.waitForTimeout(300);await q.screenshot({path:path.resolve(__dirname,'thumbnail.png')});await b.close()})()
