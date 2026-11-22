import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Same type the site uses: Geist for headlines, JetBrains Mono for times and chips.
// Bundled files (copied from the app's @fontsource packages), so renders work offline.
export const sans = "KrnlGeist";
export const mono = "KrnlMono";
for (const w of ["500", "600", "700", "800"]) {
  loadFont({ family: sans, url: staticFile(`fonts/geist-latin-${w}-normal.woff2`), weight: w });
}
for (const w of ["500", "700", "800"]) {
  loadFont({ family: mono, url: staticFile(`fonts/jetbrains-mono-latin-${w}-normal.woff2`), weight: w });
}

// Brand tokens (src/renderer/styles/tokens.css and the website's day sections).
export const C = {
  acid: "#c9f158",
  lavender: "#a98bf6",
  cyan: "#22d3ee",
  coral: "#ee8466",
  dark: "#141414",
  black: "#0a0908",
  paper: "#f4efe2",
  red: "#e5484d",
};

// Ghost digits are the ground colour pushed slightly darker (tone on tone).
export const ghostOf: Record<string, string> = {
  [C.acid]: "#b5dc45",
  [C.lavender]: "#9677e8",
  [C.cyan]: "#14bfd9",
  [C.coral]: "#de7255",
  [C.dark]: "#1d1d1d",
};

export const FPS = 30;
export const W = 1080;
export const H = 1920;

// Captured frames are 2880x1800 (1440x900 at 2x); the canvas still is 4320x2700.
export const pad4 = (n: number) => String(n).padStart(4, "0");
