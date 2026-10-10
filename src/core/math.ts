import type { Point } from "./types";
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const rounded = (v: number, digits = 2) => Number(v.toFixed(digits));
export const norm = (v: readonly number[]) => Math.hypot(...v);
export const sub = (a: readonly number[], b: readonly number[]): Point =>
  [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)];
export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const mean = (xs: readonly number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const median = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
};
export const standardDeviation = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(v => (v - m) ** 2)));
};
export const angle3pt = (a: Point, b: Point, c: Point): number => {
  const ax = a[0] - b[0], ay = a[1] - b[1];
  const cx = c[0] - b[0], cy = c[1] - b[1];
  const cosine = (ax * cx + ay * cy) / (Math.hypot(ax, ay) * Math.hypot(cx, cy) + 1e-6);
  return Math.acos(clamp(cosine, -1, 1)) * 180 / Math.PI;
};
export const horizontalTilt = (a: Point, b: Point): number => {
  const raw = Math.atan2(b[1] - a[1], b[0] - a[0] + 1e-6) * 180 / Math.PI;
  return Math.abs((((raw + 90) % 180) + 180) % 180 - 90);
};
