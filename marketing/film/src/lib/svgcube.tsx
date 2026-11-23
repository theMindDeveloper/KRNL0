// The KRNL0 mark as crisp vector art (the app icon's "Lit Core"): an isometric 3x3 cube in one SVG.
// Scaling the SVG keeps it sharp at any size, so the macro shot on the lit tile is never pixelated.
import React from "react";
const MATS = ["0.866,-0.5,0.866,0.5,-86.6,-50", "0.866,0.5,0,1,-86.6,-50", "0.866,-0.5,0,1,0,0"];
const CELLS = ["#4d4d4d", "#323232", "#1e1e1e"];
const CORES = ["#e6ff9c", "#b5e03a", "#9bc232"];
/** Top-face lit tile centre in viewBox units (the cube spans -100..100). */
export const CORE_TOP: [number, number] = [0, -50];
export const SvgCube: React.FC<{ size: number; glow: number; id?: string }> = ({ size, glow, id = "c" }) => (
  <svg width={size} height={size} viewBox="-100 -100 200 200" style={{ overflow: "visible", display: "block" }}>
    <defs>
      <filter id={`${id}g`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation={2 + 5 * glow} /></filter>
      <radialGradient id={`${id}h`}><stop offset="0" stopColor="#c9f158" stopOpacity={0.35 * glow} /><stop offset="1" stopColor="#c9f158" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="0" cy="0" r="150" fill={`url(#${id}h)`} />
    <path d="M0,-98 L85,-49 L85,49 L0,98 L-85,49 L-85,-49Z" fill="#050505" stroke="#050505" strokeWidth="12" strokeLinejoin="round" />
    {MATS.map((m, f) => (
      <g key={f} transform={`matrix(${m})`}>
        {Array.from({ length: 9 }, (_, i) => {
          const x = 2.5 + (i % 3) * 33.333, y = 2.5 + Math.floor(i / 3) * 33.333;
          if (i === 4) return (
            <g key={i}>
              <rect x={x - 3} y={y - 3} width={34.33} height={34.33} rx={11} fill={CORES[f]} filter={`url(#${id}g)`} opacity={0.35 + 0.65 * glow} />
              <rect x={x} y={y} width={28.33} height={28.33} rx={10} fill={CORES[f]} opacity={0.75 + 0.25 * glow} />
            </g>);
          return <rect key={i} x={x} y={y} width={28.33} height={28.33} rx={10} fill={CELLS[f]} />;
        })}
      </g>
    ))}
  </svg>
);
