// Loss Exceedance Curve helpers, shared by the Risk Simulator and the ROI
// page. Both need to answer "is this tolerance green?" and "what tolerance
// would be?" — and they have to use the SAME interpolation, or the two pages
// disagree at the boundary.
export interface LecPoint {
  loss: number;
  probability: number; // P(annual loss > this value)
}

// Linear interpolation within an already-computed LEC, so dragging a
// tolerance slider updates the displayed probability instantly without
// re-running the simulation.
export function interpolateLec(lec: LecPoint[], x: number): number | null {
  if (lec.length === 0) return null;
  if (x <= lec[0].loss) return lec[0].probability;
  const last = lec[lec.length - 1];
  if (x >= last.loss) return last.probability;
  for (let i = 0; i < lec.length - 1; i++) {
    const a = lec[i];
    const b = lec[i + 1];
    if (x >= a.loss && x <= b.loss) {
      const t = (x - a.loss) / (b.loss - a.loss);
      return a.probability + t * (b.probability - a.probability);
    }
  }
  return null;
}

// Inverse of interpolateLec: the lowest loss threshold at which exceedance
// probability drops to (or below) the target — i.e. "what tolerance would
// already be green here." Returns null if even the largest simulated loss
// still exceeds the target (needs a materially different risk posture, not
// just a bigger tolerance number).
//
// Interpolates between the bracketing grid points, the exact inverse of
// interpolateLec. Returning a raw grid point's loss overstates the tolerance
// needed by up to half a grid step and contradicts the live reading.
export function toleranceForTargetProbability(lec: LecPoint[], target: number): number | null {
  if (lec.length === 0) return null;
  if (lec[0].probability <= target) return lec[0].loss;
  for (let i = 0; i < lec.length - 1; i++) {
    const a = lec[i];
    const b = lec[i + 1];
    if (a.probability >= target && b.probability <= target) {
      if (a.probability === b.probability) return a.loss;
      const t = (a.probability - target) / (a.probability - b.probability);
      return a.loss + t * (b.loss - a.loss);
    }
  }
  return null;
}
