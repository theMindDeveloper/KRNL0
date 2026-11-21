// Decision 60 — the ONE look of anything carried onto the Calendar: a plan from
// Todo, a task card (grip or canvas), a block moved on the Calendar, a
// repeating event, a habit. It is the thing itself, drawn solid at the slot
// it would land on (its name, its times), gliding from slot to slot; the
// original steps back while it is carried. No browser drag pictures.

export function DropGhost({ top, height, name, times, tone, testId }: {
  top: number;
  height: number;
  name: string;
  times: string;
  /** A CSS colour (the plan's or the habit's). */
  tone: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="cal-drop-ghost"
      aria-hidden
      style={{
        position: 'absolute', left: 2, right: 2, top: top + 1, height: Math.max(18, height - 2), zIndex: 8, pointerEvents: 'none', boxSizing: 'border-box',
        borderRadius: 6, border: `1.5px solid ${tone}`, background: `color-mix(in srgb, ${tone} 22%, var(--paper))`,
        boxShadow: '0 8px 22px -8px rgba(0,0,0,0.55)', padding: '3px 7px', overflow: 'hidden',
        fontFamily: 'var(--font-read, var(--font-sans))', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: '15px',
      }}
    >
      {name && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{times}</div>
    </div>
  );
}

/** A clean drag picture for a plan carried from outside the Calendar (a small chip with its name). */
export function setPlanDragImage(e: { dataTransfer: DataTransfer }, name: string, tone: string): void {
  if (typeof document === 'undefined' || typeof e.dataTransfer.setDragImage !== 'function') return;
  const chip = document.createElement('div');
  chip.textContent = name;
  chip.style.cssText = [
    'position:fixed', 'top:-200px', 'left:-200px', 'max-width:220px', 'padding:6px 10px', 'border-radius:8px',
    'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis', 'font:600 12.5px var(--font-read, sans-serif)',
    'color:var(--ink)', `border:1.5px solid ${tone}`, `background:color-mix(in srgb, ${tone} 22%, var(--paper))`,
  ].join(';');
  document.body.appendChild(chip);
  e.dataTransfer.setDragImage(chip, 14, 14);
  window.setTimeout(() => chip.remove(), 0);
}

/** No browser drag picture (the Calendar draws the block itself where it would land). */
export function setNoDragImage(e: { dataTransfer: DataTransfer }): void {
  if (typeof document === 'undefined' || typeof e.dataTransfer.setDragImage !== 'function') return;
  const none = document.createElement('div');
  none.style.cssText = 'position:fixed;top:-50px;left:-50px;width:1px;height:1px;opacity:0';
  document.body.appendChild(none);
  e.dataTransfer.setDragImage(none, 0, 0);
  window.setTimeout(() => none.remove(), 0);
}
