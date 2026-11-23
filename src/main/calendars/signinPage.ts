// The page Google sends the browser to after "Sign in with Google" (design "KRNL0 phone Today",
// page "Google sign-in page", direction C, picked 2026-11-23). It is served by KRNL0 itself on
// 127.0.0.1, so it is fully self-contained: no fonts, images or scripts from anywhere.

const LOGO = `<div class="logo" aria-hidden="true"><span></span></div><span class="word">KRNL<b>0</b></span>`;
const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;
const CROSS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:#131210;color:#f4efe2;font-family:"Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  display:grid;place-items:center;min-height:100vh;padding:48px 24px}
.wrap{width:100%;max-width:1120px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:56px;align-items:center}
.wrap.one{grid-template-columns:minmax(0,1fr);max-width:560px}
.text{display:flex;flex-direction:column;gap:22px}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:40px;height:40px;border-radius:11px;background:#0a0908;display:grid;place-items:center}
.logo span{width:13px;height:13px;border-radius:3px;background:#c9f158;box-shadow:0 0 12px rgba(201,241,88,.5)}
.word{font:500 15px ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.08em}
.word b{font-weight:500;color:#8f8572}
.badge{align-self:flex-start;height:30px;padding:0 12px;border-radius:99px;display:inline-flex;align-items:center;gap:8px;
  font:500 12px ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.08em}
.badge.ok{background:rgba(201,241,88,.14);color:#c9f158}
.badge.bad{background:rgba(238,132,102,.14);color:#ee8466}
h1{margin:0;font-size:clamp(32px,4.6vw,48px);line-height:1.05;font-weight:700;letter-spacing:-.03em}
p{margin:0;font-size:17px;line-height:1.6;color:#ddd6c6;max-width:460px}
.week{height:520px;border-radius:18px;background:#1c1a13;border:1px solid #2f2b24;display:flex;flex-direction:column;overflow:hidden}
.days{display:flex}
.days div{flex:1;font:500 11px ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.08em;color:#8f8572;text-align:center;padding:8px 0}
.grid{flex:1;display:flex;border-top:1px solid #2f2b24}
.col{position:relative;flex:1;border-left:1px solid #2f2b24}
.col:first-child{border-left:0}
.plan,.ext{position:absolute;left:6px;right:6px;border-radius:7px;padding:6px 8px;font-size:12px;overflow:hidden}
.plan{font-weight:600;color:#0a0908}
.ext{font-weight:500;color:#ddd6c6;border:1.5px solid #9c8ec4;background:rgba(156,142,196,.08)}
.plan small,.ext small{display:block;font:500 10.5px ui-monospace,"Cascadia Mono",Consolas,monospace;opacity:.8;margin-top:2px}
@media (max-width:860px){.wrap{grid-template-columns:minmax(0,1fr);gap:36px}.week{height:380px}}
@media (max-width:520px){.plan small,.ext small{display:none}}
`;

const WEEK = `<div class="week" role="img" aria-label="An example week: KRNL0 plans filled, Google events outlined">
<div class="days"><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div></div>
<div class="grid">
<div class="col"><div class="plan" style="top:6%;height:13%;background:#c9f158">Deep work<small>09:00</small></div><div class="ext" style="top:42%;height:12%">Dentist<small>14:00 · Google</small></div></div>
<div class="col"><div class="ext" style="top:12%;height:18%">Seminar<small>10:00 · Google</small></div><div class="plan" style="top:50%;height:12%;background:#5fa3a8">Gym<small>17:30</small></div></div>
<div class="col"><div class="plan" style="top:6%;height:21%;background:#c9f158">Thesis draft<small>09:00</small></div><div class="ext" style="top:60%;height:11%">Call home<small>19:00 · Google</small></div></div>
<div class="col"><div class="ext" style="top:12%;height:18%">Seminar<small>10:00 · Google</small></div><div class="plan" style="top:38%;height:14%;background:#d9a55a">Read ch. 4<small>13:00</small></div></div>
<div class="col"><div class="plan" style="top:24%;height:12%;background:#5fa3a8">Review week<small>11:00</small></div></div>
</div></div>`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="dark"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

/** After a finished sign-in. */
export const SIGNED_IN_PAGE = page('KRNL0 · Signed in', `<main class="wrap">
<div class="text">
<div class="brand">${LOGO}</div>
<span class="badge ok">${CHECK}SIGNED IN WITH GOOGLE</span>
<h1>Your Google events now sit next to your plans.</h1>
<p>Go back to KRNL0: they're already on your Calendar, outlined so you can tell them apart. Your KRNL0 plans show up in Google too. You can close this tab.</p>
</div>
${WEEK}
</main>`);

/** After a cancelled or failed sign-in. */
export const SIGN_IN_FAILED_PAGE = page('KRNL0 · Sign-in did not finish', `<main class="wrap one">
<div class="text">
<div class="brand">${LOGO}</div>
<span class="badge bad">${CROSS}NOT SIGNED IN</span>
<h1>Sign-in didn't finish.</h1>
<p>Nothing was changed. Go back to KRNL0 and choose Google again to try once more. You can close this tab.</p>
</div>
</main>`);
