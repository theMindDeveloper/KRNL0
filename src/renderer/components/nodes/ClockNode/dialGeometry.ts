// 12-hour dial geometry shared by the main Clock face and the Week view's
// small static dials. Pure — kept out of index.tsx so React Fast Refresh can
// hot-swap the component.

export const CX = 120;
export const CY = 120;
export const R_FACE = 86;

/** Map an hour 0–24 onto its angle on a 12-hour face. 12 sits at top. */
export function hourToRad(h: number): number {
  return ((h % 12) / 12) * Math.PI * 2 - Math.PI / 2;
}

export function pt(h: number, r: number): { x: number; y: number } {
  const a = hourToRad(h);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

/** SVG arc path from startH to endH on the 12-h face at radius r. */
export function arcPath(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, endH - startH);
  const a1 = hourToRad(startH);
  const a2 = hourToRad(startH + span);
  const x1 = CX + r * Math.cos(a1);
  const y1 = CY + r * Math.sin(a1);
  const x2 = CX + r * Math.cos(a2);
  const y2 = CY + r * Math.sin(a2);
  const large = span > 6 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * #180 — filled pie sector from the dial centre out to radius r, spanning
 * [startH, endH]. Used to draw tracked-reality as an ambient background WASH
 * on the dial face (behind the ticks/numbers/event lanes), distinct from the
 * thin outlined event arcs on the outer track lanes.
 */
export function sectorPath(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, endH - startH);
  const a1 = hourToRad(startH);
  const a2 = hourToRad(startH + span);
  const x1 = CX + r * Math.cos(a1);
  const y1 = CY + r * Math.sin(a1);
  const x2 = CX + r * Math.cos(a2);
  const y2 = CY + r * Math.sin(a2);
  const large = span > 6 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}
