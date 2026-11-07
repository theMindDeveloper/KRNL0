// Where the real assistant orb sits while a tour runs: on the tour card's
// corner, so the guide reads as the orb itself moving over (no second orb).
// TourHost writes it, the Orb reads it; null = no tour, the orb stays home.

import { create } from 'zustand';

export interface TourAnchor {
  /** Top-left of the orb in window coordinates, or null when no tour runs. */
  at: { x: number; y: number } | null;
}

export const useTourAnchor = create<TourAnchor>(() => ({ at: null }));

export function setTourAnchor(at: { x: number; y: number } | null): void {
  const cur = useTourAnchor.getState().at;
  if (cur === at || (cur && at && cur.x === at.x && cur.y === at.y)) return;
  useTourAnchor.setState({ at });
}
