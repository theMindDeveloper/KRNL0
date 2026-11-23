// The "old way": generic tool cards (never a real brand), drawn as clean white cards with a coloured header.
import React from "react";
import { C, MONO } from "./fonts";
export type Kind = "list" | "cal" | "timer" | "habit" | "tabs" | "note" | "mail" | "chat";
const ACC: Record<Kind, string> = { list: C.lav, cal: C.cyan, timer: C.coral, habit: C.acid, tabs: "#9a978d", note: "#ffd966", mail: "#7aa7ff", chat: "#7ad6a0" };
const LABEL: Record<Kind, string> = { list: "to-do app", cal: "calendar app", timer: "timer app", habit: "habit tracker", tabs: "12 tabs open", note: "notes app", mail: "inbox", chat: "messages" };
const bar = (w: number, c = "#dcd8cd") => <b style={{ display: "block", height: 14, borderRadius: 7, background: c, width: `${w}%` }} />;
export const ToolCard: React.FC<{ kind: Kind; w?: number; h?: number }> = ({ kind, w = 420, h = 290 }) => {
  let body: React.ReactNode;
  if (kind === "list") body = [80, 62, 74, 48].map((x, i) => <div key={i} style={{ display: "flex", gap: 14, alignItems: "center" }}><i style={{ width: 24, height: 24, borderRadius: 7, border: "3px solid #bdb9ae" }} />{bar(x)}</div>);
  else if (kind === "cal") body = <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>{Array.from({ length: 28 }, (_, n) => <u key={n} style={{ height: 30, borderRadius: 7, background: [3, 9, 10, 16, 22].includes(n) ? C.cyan : "#e8e4da" }} />)}</div>;
  else if (kind === "timer") body = <><div style={{ font: `800 92px ${MONO}`, letterSpacing: "-0.04em", textAlign: "center", color: C.ink }}>25:00</div><div style={{ height: 16, borderRadius: 8, background: "#e8e4da", overflow: "hidden" }}><b style={{ display: "block", width: "38%", height: "100%", background: C.coral }} /></div></>;
  else if (kind === "habit") body = [0, 1, 2].map((r) => <div key={r} style={{ display: "flex", gap: 12 }}>{Array.from({ length: 7 }, (_, c) => <u key={c} style={{ width: 38, height: 38, borderRadius: 10, background: (r + c) % 3 ? C.acid : "#e8e4da" }} />)}</div>);
  else if (kind === "tabs") body = <><div style={{ display: "flex", gap: 8 }}>{[C.acid, C.cyan, C.coral, C.lav, "#ffd966", "#7aa7ff"].map((c, i) => <s key={i} style={{ width: 50, height: 22, borderRadius: "8px 8px 0 0", background: c }} />)}</div>{bar(70)}{bar(52)}</>;
  else if (kind === "note") body = [90, 70, 82].map((x, i) => <div key={i}>{bar(x, "#e9cf72")}</div>);
  else if (kind === "mail") body = [84, 60, 72].map((x, i) => <div key={i} style={{ display: "flex", gap: 14, alignItems: "center" }}><i style={{ width: 22, height: 22, borderRadius: 11, background: "#bdb9ae" }} />{bar(x)}</div>);
  else body = [0, 1, 2].map((n) => <div key={n} style={{ height: 38, width: "62%", borderRadius: 19, background: n % 2 ? "#7ad6a0" : "#dcd8cd", alignSelf: n % 2 ? "flex-end" : "flex-start" }} />);
  return (
    <div style={{ width: w, height: h, background: kind === "note" ? "#fff3b0" : "#fbfaf6", borderRadius: 26, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,.35), 0 10px 24px rgba(0,0,0,.25)" }}>
      <div style={{ height: 66, background: ACC[kind], display: "flex", alignItems: "center", padding: "0 26px", font: `800 27px ${MONO}`, color: C.ink }}>{LABEL[kind]}</div>
      <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>{body}</div>
    </div>
  );
};
