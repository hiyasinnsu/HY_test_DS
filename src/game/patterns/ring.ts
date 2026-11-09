import { TAU } from '../../core/math';
import { scaledCount, scaledSpeed, spawnBulletAt } from './shared';
import type { BulletStyle, PatternContext } from './shared';

export interface RingOptions extends BulletStyle {
  /** Bullets in the ring, scaled by difficulty.bulletCount. */
  readonly count: number;
  readonly speed: number;
  /** Added to every bullet angle, in radians. */
  readonly baseAngle?: number;
  /** Distance from (x, y) to spawn the ring at; 0 puts them all on the point. */
  readonly spawnRadius?: number;
}

/** Fires `count` bullets evenly around a full circle. */
export function ring(ctx: PatternContext, x: number, y: number, opts: RingOptions): void {
  const count = scaledCount(ctx, opts.count);
  const speed = scaledSpeed(ctx, opts.speed);
  const spawnRadius = opts.spawnRadius ?? 0;
  const base = opts.baseAngle ?? 0;
  const step = TAU / count;
  for (let i = 0; i < count; i += 1) {
    const angle = base + step * i;
    spawnBulletAt(
      ctx,
      x + Math.cos(angle) * spawnRadius,
      y + Math.sin(angle) * spawnRadius,
      angle,
      speed,
      opts,
    );
  }
}
