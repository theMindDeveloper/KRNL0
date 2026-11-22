import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Headline: each word blurs in from light to sharp, 3 frames apart, then holds dead still. */
export const Headline: React.FC<{
  lines: string[];
  at?: number;
  size?: number;
  color?: string;
  accent?: string; // one word drawn in a second colour
  accentColor?: string;
  style?: React.CSSProperties;
}> = ({ lines, at = 0, size = 112, color = C.black, accent, accentColor, style }) => {
  const frame = useCurrentFrame();
  let k = 0;
  return (
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: size, lineHeight: 0.98, letterSpacing: "-0.045em", color, ...style }}>
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.split(" ").map((w, wi) => {
            const start = at + k++ * 3;
            const t = interpolate(frame, [start, start + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            return (
              <span key={wi} style={{ display: "inline-block", marginRight: "0.24em", opacity: t, filter: `blur(${(1 - t) * 10}px)`, color: accent && w.replace(/[.,]/g, "") === accent ? accentColor : undefined }}>
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** "10:00  Calendar" — the site's dark time chip and its label. */
export const TimeChip: React.FC<{ time: string; label: string; at?: number; ink?: string; chipBg?: string; chipInk?: string }> = ({
  time, label, at = 0, ink = C.black, chipBg = C.black, chipInk = C.paper,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.exp) });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: t, translate: `${(1 - t) * -24}px 0` }}>
      <div style={{ background: chipBg, color: chipInk, fontFamily: mono, fontWeight: 700, fontSize: 38, padding: "8px 18px", borderRadius: 12, letterSpacing: "0.02em" }}>
        {time}
      </div>
      <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 38, color: ink }}>{label}</div>
    </div>
  );
};

/** Huge tone-on-tone clock digits behind each section, rolling into place like a slot machine. */
export const GhostClock: React.FC<{ time: string; color: string; at?: number; top?: number }> = ({ time, color, at = 0, top = -70 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center", fontFamily: mono, fontWeight: 800, fontSize: 400, letterSpacing: "-0.04em", color, lineHeight: 1 }}>
      {time.split("").map((ch, i) => {
        const s = at + i * 2;
        const t = interpolate(frame, [s, s + 16], [0, 1], { ...clamp, easing: Easing.out(Easing.exp) });
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, translate: `0 ${(1 - t) * 160}px`, filter: `blur(${(1 - t) * 8}px)` }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** The site's left day rail: hours down the side, a red pill sliding to the current one. */
const SLOTS = ["07:00", "08:30", "10:00", "13:00", "15:00", "18:00"];
export const DayRail: React.FC<{ active: number; ink: string; at?: number }> = ({ active, ink, at = 0 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at + 4, at + 22], [Math.max(0, active - 1), active], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const top = 760;
  const gap = 78;
  return (
    <div style={{ position: "absolute", left: 34, top, width: 70 }}>
      <div style={{ position: "absolute", left: 6, top: -10, width: 3, height: gap * (SLOTS.length - 1) + 20, background: ink, opacity: 0.25, borderRadius: 2 }} />
      {SLOTS.map((s, i) => (
        <div key={s} style={{ position: "absolute", left: 18, top: i * gap - 12, fontFamily: mono, fontSize: 19, fontWeight: 500, color: ink, opacity: i === active ? 0 : 0.45 }}>
          {s}
        </div>
      ))}
      <div style={{ position: "absolute", left: -6, top: t * gap - 17, background: C.red, color: "#fff", fontFamily: mono, fontWeight: 700, fontSize: 20, padding: "3px 8px", borderRadius: 8 }}>
        {SLOTS[active]}
      </div>
    </div>
  );
};
