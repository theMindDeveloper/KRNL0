import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
const F: [string, string, string][] = [
  ["Geist", "geist-latin-600-normal.woff2", "600"], ["Geist", "geist-latin-700-normal.woff2", "700"], ["Geist", "geist-latin-800-normal.woff2", "800"],
  ["JetBrains Mono", "jetbrains-mono-latin-500-normal.woff2", "500"], ["JetBrains Mono", "jetbrains-mono-latin-800-normal.woff2", "800"],
];
export const fontsReady = Promise.all(F.map(([family, file, weight]) => loadFont({ family, url: staticFile(`fonts/${file}`), weight })));
export const SANS = "Geist, system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const C = { acid: "#c9f158", lav: "#a98bf6", cyan: "#22d3ee", coral: "#ee8466", paper: "#f4efe2", ink: "#0a0908", bay: "#060606" };
