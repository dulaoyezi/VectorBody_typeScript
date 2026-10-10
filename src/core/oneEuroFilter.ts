import type { Landmarks } from "./types";
export class OneEuroFilter {
  private previous: Landmarks | null = null;
  private previousDerivatives: Landmarks | null = null;
  constructor(readonly frequency = 30, readonly minCutoff = 1, readonly beta = 0.007, readonly derivativeCutoff = 1) {}
  reset() { this.previous = null; this.previousDerivatives = null; }
  private alpha(cutoff: number) {
    return 1 / (1 + this.frequency / (2 * Math.PI * Math.max(1e-6, cutoff)));
  }
  smooth(points: Landmarks): Landmarks {
    if (!this.previous) {
      this.previous = points.map(p => [...p]);
      this.previousDerivatives = points.map(() => [0, 0, 0]);
      return points.map(p => [...p]);
    }
    const result: Landmarks = [], derivatives: Landmarks = [];
    for (let i = 0; i < points.length; i++) {
      const next = [0, 0, 0] as [number, number, number];
      const dx = [0, 0, 0] as [number, number, number];
      for (let j = 0; j < 3; j++) {
        const rawDerivative = (points[i][j] - this.previous[i][j]) * this.frequency;
        dx[j] = this.alpha(this.derivativeCutoff) * rawDerivative + (1 - this.alpha(this.derivativeCutoff)) * this.previousDerivatives![i][j];
        const smoothing = this.alpha(this.minCutoff + this.beta * Math.abs(dx[j]));
        next[j] = smoothing * points[i][j] + (1 - smoothing) * this.previous[i][j];
      }
      result.push(next); derivatives.push(dx);
    }
    this.previous = result; this.previousDerivatives = derivatives;
    return result;
  }
}
