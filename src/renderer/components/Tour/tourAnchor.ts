// Where the real assistant orb sits while a tour runs: on the tour card's
// corner, so the guide reads as the orb itself moving over (no second orb).
// TourHost writes it, the Orb reads it; null = no tour, the orb stays home.

import { create } from 'zustand';

export interface TourAnchor {
  /** Top-left of the orb in window coordinates, or null: the orb stays home.
   *  (Tours no longer move it: it keeps its place and size, and speaks.) */
  at: { x: number; y: number } | null;
  /** A tour is on screen: the orb stays above its dimming. */
  active: boolean;
  /** The guide's voice is playing: the orb shows its speaking rings. */
  speaking: boolean;
}

export const useTourAnchor = create<TourAnchor>(() => ({ at: null, active: false, speaking: false }));

export function setTourActive(active: boolean): void {
  if (useTourAnchor.getState().active !== active) useTourAnchor.setState({ active, ...(active ? {} : { speaking: false }) });
}
export function setGuideSpeaking(speaking: boolean): void {
  if (useTourAnchor.getState().speaking !== speaking) useTourAnchor.setState({ speaking });
}

export function setTourAnchor(at: { x: number; y: number } | null): void {
  const cur = useTourAnchor.getState().at;
  if (cur === at || (cur && at && cur.x === at.x && cur.y === at.y)) return;
  useTourAnchor.setState({ at });
}
