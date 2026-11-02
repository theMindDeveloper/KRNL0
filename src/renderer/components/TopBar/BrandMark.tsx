/**
 * BrandMark — the KRNL0 "Lit Core" logo, drawn inline so it stays crisp at
 * toolbar size. Same artwork as build/icon.svg (the app / dock / taskbar
 * icon): a near-black tile holding a dark 3×3 isometric voxel cube whose
 * centre voxel glows acid on each visible face.
 */

import { useId } from 'react';

// Isometric face transforms for a cube of half-height 100 centred at 0,0.
// Each maps a 100×100 square onto the top, left and right faces.
const FACES = [
  { transform: 'matrix(0.866,-0.5,0.866,0.5,-86.6,-50)', cell: '#4A4A4A', lit: '#E6FF9C' },
  { transform: 'matrix(0.866,0.5,0,1,-86.6,-50)', cell: '#303030', lit: '#B5E03E' },
  { transform: 'matrix(0.866,-0.5,0,1,0,0)', cell: '#1C1C1C', lit: '#9BC232' },
] as const;

const GRID = [0, 1, 2] as const;
const STEP = 100 / 3;

export function BrandMark({ size = 26 }: { size?: number }) {
  const tileId = useId();
  return (
    <svg
      data-testid="topbar-brand-mark"
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={tileId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141414" />
          <stop offset="1" stopColor="#030303" />
        </linearGradient>
      </defs>
      <rect width={200} height={200} rx={45} fill={`url(#${tileId})`} />
      <rect x={1} y={1} width={198} height={198} rx={44} fill="none"
            stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={2} />
      <g transform="translate(100,100) scale(0.68)">
        <path d="M0,-100 L86.6,-50 L86.6,50 L0,100 L-86.6,50 L-86.6,-50Z" fill="#050505" />
        {FACES.map((face) => (
          <g key={face.transform} transform={face.transform}>
            {GRID.flatMap((row) =>
              GRID.map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={col * STEP + 2.5}
                  y={row * STEP + 2.5}
                  width={STEP - 5}
                  height={STEP - 5}
                  rx={4}
                  fill={row === 1 && col === 1 ? face.lit : face.cell}
                />
              )),
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
