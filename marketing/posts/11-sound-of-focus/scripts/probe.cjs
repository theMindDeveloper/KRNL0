const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1100,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(3000);
console.log('radio',await p.locator('[data-testid="ambient-radio"]').count());
const r=p.locator('[data-testid="ambient-radio"]');console.log(await r.boundingBox());
await p.screenshot({path:'.capture/probe-full.png'});
await r.screenshot({path:'.capture/probe-radio.png'});
await p.locator('[data-testid="ambient-radio-preset-brown"]').click();await p.clock.runFor(800);
await p.locator('[data-testid="ambient-radio-play"]').click();await p.clock.runFor(2500);
await r.screenshot({path:'.capture/probe-brown.png'});
await p.locator('[data-testid="ambient-radio-preset-rain"]').click();await p.clock.runFor(2500);
await r.screenshot({path:'.capture/probe-mix.png'});
console.log(await r.boundingBox());
await b.close()})()
