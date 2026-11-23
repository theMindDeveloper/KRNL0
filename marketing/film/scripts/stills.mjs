// Renders stills of the Film at the given seconds into out/qa/, then a contact sheet per 12 frames.
// Usage: node scripts/stills.mjs 1.0 3.5 ... | node scripts/stills.mjs --shots (start/mid/end of every shot)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const edl = JSON.parse(fs.readFileSync(path.join(root, "src/film/edl.json"), "utf8"));
let times = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number);
if (process.argv.includes("--shots")) times = edl.flatMap((s) => [s.t0 + 0.35, (s.t0 + s.t1) / 2, s.t1 - 0.12]);
const out = path.join(root, "out/qa"); fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });
const browser = await openBrowser("chrome", { browserExecutable: process.env.REMOTION_BROWSER });
const composition = await selectComposition({ serveUrl, id: "Film", puppeteerInstance: browser });
for (const t of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * 30));
  await renderStill({ composition, serveUrl, frame, output: path.join(out, `f${String(frame).padStart(5, "0")}.png`), puppeteerInstance: browser, imageFormat: "png" });
  process.stdout.write(".");
}
await browser.close({ silent: true });
console.log("\nstills", times.length);
