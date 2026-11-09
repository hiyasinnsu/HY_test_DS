import type { Rng } from '../../core/rng';
import { resolveRng, scaledCount, scaledSpeed, spawnBulletAt } from './shared';
import type { BulletStyle, PatternContext } from './shared';

export interface FanOptions extends BulletStyle {
  /** Bullets in the fan, scaled by difficulty.bulletCount. */
  readonly count: number;
  readonly speed: number;
  /** Total arc width in radians; 0 sends every bullet along one heading. */
  readonly spread?: number;
  /** Absolute heading; ignored while `aimed` is on. */
  readonly angle?: number;
  /**
   * Points the fan at the player. Defaults to true when no `angle` is given,
   * so a bare fan automatically tracks the ship.
   */
  readonly aimed?: boolean;
  /** Per-bullet random heading jitter in radians. */
  readonly jitter?: number;
  readonly rng?: Rng;
  /** Radial spawn offset along each bullet's heading. */
  readonly spawnRadius?: number;
}

/** Fires an evenly spaced arc of bullets, optionally aimed at the player. */
export function fan(ctx: PatternContext, x: number, y: number, opts: FanOptions): void {
  const count = scaledCount(ctx, opts.count);
  const speed = scaledSpeed(ctx, opts.speed);
  const aimed = opts.aimed ?? opts.angle === undefined;
  const base = aimed ? ctx.aimAtPlayer(x, y) : (opts.angle ?? Math.PI / 2);
  const spread = opts.spread ?? 0;
  const jitter = opts.jitter ?? 0;
  const spawnRadius = opts.spawnRadius ?? 0;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    let angle = base + (t - 0.5) * spread;
    if (jitter !== 0) angle += resolveRng(opts.rng).jitter(jitter);
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
