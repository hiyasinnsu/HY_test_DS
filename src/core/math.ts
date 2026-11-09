export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Moves `current` toward `target` by at most `maxDelta` (units per call). */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function angleTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % TAU;
  return (wrapped < 0 ? wrapped + TAU : wrapped) - Math.PI;
}

/** Shortest signed difference from `from` to `to`. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Squared distance from point (px,py) to the segment (ax,ay)-(bx,by). */
export function segmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : clamp((apx * abx + apy * aby) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return dx * dx + dy * dy;
}

/** Exponential smoothing that is stable across variable frame times. */
export function damp(current: number, target: number, smoothingPerSecond: number, dt: number): number {
  return target + (current - target) * Math.exp(-smoothingPerSecond * dt);
}

/** Ease-out cubic on a normalized 0..1 progress value. */
export function easeOutCubic(t: number): number {
  const p = 1 - clamp(t, 0, 1);
  return 1 - p * p * p;
}

export function easeInQuad(t: number): number {
  const p = clamp(t, 0, 1);
  return p * p;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}
