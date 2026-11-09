import type { BulletColor, Enemy } from '../types';
import type { PatternContext } from './shared';

export interface LaserSweepOptions {
  /** Absolute heading; defaults to a snapshot of the player's direction. */
  readonly angle?: number;
  readonly length?: number;
  readonly width: number;
  /** Radians/s rotation during warmup and firing. */
  readonly spin?: number;
  /** Telegraph time before the beam becomes lethal. */
  readonly warmup?: number;
  /** Seconds the beam stays lethal before fading. */
  readonly duration?: number;
  readonly color?: BulletColor;
  /** Follows this enemy every step (boss beams). */
  readonly follow?: Enemy;
  /** When false the beam hits the player repeatedly. */
  readonly repeatHit?: boolean;
}

/**
 * Spawns a LaserSpec. Warmup -> firing -> fading is stepped by the world; this
 * helper only decides the geometry. The world owns the telegraph effect.
 */
export function laserSweep(
  ctx: PatternContext,
  x: number,
  y: number,
  opts: LaserSweepOptions,
): void {
  const angle = opts.angle ?? ctx.aimAtPlayer(x, y);
  ctx.spawnLaser({
    x,
    y,
    angle,
    width: opts.width,
    spin: opts.spin ?? 0,
    warmup: opts.warmup ?? 1,
    duration: opts.duration ?? 1.6,
    color: opts.color ?? 'cyan',
    ...(opts.length === undefined ? {} : { length: opts.length }),
    ...(opts.follow === undefined ? {} : { follow: opts.follow }),
    ...(opts.repeatHit === undefined ? {} : { repeatHit: opts.repeatHit }),
  });
}
