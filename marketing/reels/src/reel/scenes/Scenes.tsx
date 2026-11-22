import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, ghostOf, mono, sans } from "../theme";
import { GhostClock, Headline, TimeChip } from "../ui/Type";
import { AppShot } from "../ui/AppShot";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** One day section, laid out like the website: ghost clock, time chip, headline, the real app below. */
const Section: React.FC<{
  bg: string;
  ink?: string;
  time: string;
  label: string;
  rail: number;
  lines: string[];
  children: React.ReactNode;
}> = ({ bg, ink = C.black, time, label, rail, lines, children }) => (
  <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
    <GhostClock time={time} color={ghostOf[bg]} at={2} />
    <div style={{ position: "absolute", left: 120, top: 330 }}>
      <TimeChip time={time} label={label} at={4} ink={ink} chipBg={ink === C.black ? C.black : C.paper} chipInk={ink === C.black ? C.paper : C.black} />
      <Headline lines={lines} at={8} size={104} color={ink} style={{ marginTop: 34 }} />
    </div>
    <div style={{ position: "absolute", left: 120, top: 700 }}>{children}</div>
  </AbsoluteFill>
);

// ── 1. Hook: "One app instead of nine." — nine tools fold into the cube ──────
const NINE = [
  ["Timer", C.acid], ["To-dos", C.cyan], ["Habits", C.coral],
  ["Calendar", C.lavender], ["Clock", C.paper], ["Focus sounds", C.acid],
  ["Canvas", C.cyan], ["Analytics", C.coral], ["Time tracking", C.lavender],
] as const;

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fold = interpolate(frame, [62, 84], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const cube = spring({ frame: frame - 78, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ background: C.acid, overflow: "hidden" }}>
      <GhostClock time="07:00" color={ghostOf[C.acid]} at={0} />
      <div style={{ position: "absolute", left: 90, top: 300 }}>
        {/* Frame 0 already carries the claim: the first line is on screen before anything moves. */}
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 168, lineHeight: 0.92, letterSpacing: "-0.055em", color: C.black }}>One app</div>
        <Headline lines={["instead", "of nine."]} at={6} size={168} style={{ fontWeight: 800, letterSpacing: "-0.055em", lineHeight: 0.92 }} />
      </div>
      {/* The nine tools, as chips, then pulled into one point */}
      <div style={{ position: "absolute", left: 90, top: 880, width: 900, height: 520 }}>
        {NINE.map(([name, color], i) => {
          const col = i % 3, row = Math.floor(i / 3);
          const s = 20 + i * 3;
          const t = interpolate(frame, [s, s + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
          const x = col * 300, y = row * 150;
          const cx = 450 - 135, cy = 225 - 50;
          return (
            <div key={name} style={{
              position: "absolute", left: x + (cx - x) * fold, top: y + (cy - y) * fold, width: 270, height: 100,
              borderRadius: 22, background: C.black, display: "flex", alignItems: "center", gap: 14, padding: "0 22px",
              opacity: t * (1 - fold), scale: `${(0.6 + 0.4 * t) * (1 - 0.7 * fold)}`, rotate: `${(1 - t) * (i % 2 ? 6 : -6)}deg`,
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: color, flexShrink: 0 }} />
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: C.paper, whiteSpace: "nowrap" }}>{name}</div>
            </div>
          );
        })}
        <Img src={staticFile("icon.svg")} style={{ position: "absolute", left: 450 - 230, top: 225 - 230, width: 460, height: 460, scale: `${cube}`, rotate: `${(1 - cube) * -20}deg`, filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.35))" }} />
      </div>
    </AbsoluteFill>
  );
};

// ── 2. Plan: type a plan, KRNL0 reads its day, time and length ──────────────
export const Plan: React.FC = () => (
  <Section bg={C.lavender} time="08:30" label="Plan" rail={1} lines={["Type it.", "It is planned."]}>
    <AppShot
      dir="todo" count={29} at={10}
      index={(f) => (f - 12) * 0.55}
      width={860} height={900}
      cam={[
        { f: 0, c: { x: 904, y: 360, w: 1072 } },
        { f: 34, c: { x: 904, y: 360, w: 1072 } },
        { f: 64, c: { x: 900, y: 560, w: 760 } },
      ]}
    />
  </Section>
);

// ── 3. Calendar: an event typed in lands on the day ─────────────────────────
export const Calendar: React.FC = () => (
  <Section bg={C.cyan} time="10:00" label="Calendar" rail={2} lines={["One calendar", "for all of it."]}>
    <AppShot
      dir="cal" count={69} at={8}
      index={(f) => (f - 10) * 0.75}
      width={860} height={940}
      cam={[
        { f: 0, c: { x: 610, y: 942, w: 730 } },
        { f: 40, c: { x: 610, y: 942, w: 730 } },
        { f: 76, c: { x: 610, y: 1040, w: 640 } },
      ]}
    />
  </Section>
);

// ── 4. Focus: press start, the timer records ────────────────────────────────
export const Focus: React.FC = () => (
  <Section bg={C.acid} time="13:00" label="Focus" rail={3} lines={["Press start.", "It records what", "you do."]}>
    <div style={{ marginTop: 110 }}>
      <AppShot
        dir="focus" count={114} at={6}
        index={(f) => (f < 30 ? f - 6 : 24 + (f - 30) * 1.1)}
        width={860} height={800}
        cam={[
          { f: 0, c: { x: 903, y: 363, w: 1074 } },
          { f: 20, c: { x: 903, y: 363, w: 1074 } },
          { f: 46, c: { x: 1010, y: 520, w: 860 } },
        ]}
      />
    </div>
  </Section>
);

// ── 5. Habits: one tap a day, the streak counts itself ──────────────────────
export const Habits: React.FC = () => (
  <Section bg={C.coral} time="15:00" label="Habits" rail={4} lines={["Habits you can", "see building."]}>
    <AppShot
      dir="habit" count={60} at={6}
      index={(f) => f - 8}
      width={860} height={760}
      cam={[
        { f: 0, c: { x: 904, y: 340, w: 1072 } },
        { f: 24, c: { x: 920, y: 380, w: 860 } },
      ]}
    />
  </Section>
);

// ── 6. Canvas: everything next to the plan ──────────────────────────────────
export const Canvas: React.FC = () => (
  <Section bg={C.dark} ink={C.paper} time="18:00" label="Canvas" rail={5} lines={["Put anything", "next to your plan."]}>
    <AppShot
      dir="canvas" count={1} srcWidth={4320}
      width={860} height={760}
      cam={[
        { f: 0, c: { x: 2120, y: 1160, w: 1540 } },
        { f: 26, c: { x: 2120, y: 1160, w: 1540 } },
        { f: 110, c: { x: 620, y: 0, w: 3050 } },
      ]}
    />
  </Section>
);

// ── 7. End card: the coloured KRNL0 tiles and where to get it ───────────────
const TILES = [["K", C.acid], ["R", C.cyan], ["N", C.coral], ["L", C.lavender], ["0", C.paper]] as const;

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Colour flood: the dark ground fills with acid from the bottom.
  const flood = interpolate(frame, [70, 86], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const onAcid = flood > 0.5;
  const ink = onAcid ? C.black : C.paper;
  return (
    <AbsoluteFill style={{ background: C.dark, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: C.acid, clipPath: `inset(${(1 - flood) * 100}% 0 0 0)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center", gap: 14 }}>
        {TILES.map(([ch, color], i) => {
          const s = spring({ frame: frame - 6 - i * 4, fps, config: { damping: 12, stiffness: 140 } });
          return (
            <div key={ch} style={{
              width: 168, height: 190, borderRadius: 22, background: color, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: ch === "0" ? mono : sans, fontWeight: 800, fontSize: ch === "0" ? 150 : 168, color: C.black, letterSpacing: "-0.04em",
              translate: `0 ${(1 - s) * -420}px`, opacity: Math.min(1, s * 2),
              boxShadow: onAcid ? "inset 0 0 0 4px rgba(0,0,0,0.9)" : "none",
            }}>{ch}</div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 830, textAlign: "center" }}>
        <Headline lines={["Your whole day,", "one canvas."]} at={30} size={110} color={ink} style={{ display: "inline-block", textAlign: "center" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1120, display: "flex", flexDirection: "column", alignItems: "center", gap: 26,
        opacity: interpolate(frame, [92, 104], [0, 1], clamp), translate: `0 ${interpolate(frame, [92, 108], [30, 0], { ...clamp, easing: Easing.out(Easing.exp) })}px` }}>
        <div style={{ background: C.black, color: C.acid, fontFamily: sans, fontWeight: 700, fontSize: 46, padding: "26px 54px", borderRadius: 22 }}>
          Free download · link in bio
        </div>
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 32, color: C.black }}>Windows · macOS · Linux</div>
      </div>
    </AbsoluteFill>
  );
};
