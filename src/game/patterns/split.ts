import type { BulletColor, BulletKind, BulletSpec } from '../types';
import type { Rng } from '../../core/rng';
import { resolveRng, scaledCount } from './shared';
import type { PatternContext } from './shared';

export interface FireworkOptions {
  /** Shells launched per volley, scaled by difficulty.bulletCount. */
  readonly count?: number;
  /** Shell launch speed. */
  readonly speed?: number;
  /** Total fan width of the shells in radians. */
  readonly spread?: number;
  /** Absolute shell heading; aimed at the player when omitted. */
  readonly angle?: number;
  readonly aimed?: boolean;
  /** Seconds before each shell bursts. */
  readonly delay?: number;
  /** Base child bullets per shell; the world scales them by bulletCount. */
  readonly childCount?: number;
  /** Base child launch speed; the world scales it by bulletSpeed. */
  readonly childSpeed?: number;
  /** Total child fan width in radians; omit for a full-circle burst. */
  readonly childSpread?: number;
  readonly kind?: BulletKind;
  readonly color?: BulletColor;
  readonly childKind?: BulletKind;
  readonly childColor?: BulletColor;
  /** Deceleration applied to the shell so it hangs at the burst point. */
  readonly decel?: number;
  /** Extra lifetime after the burst; defaults to delay + 2.4s. */
  readonly life?: number;
  /** Per-shell heading jitter in radians. */
  readonly jitter?: number;
  readonly rng?: Rng;
  readonly spawnRadius?: number;
}

/**
 * Launches slow "shell" bullets that bloom into a ring of children through
 * BulletSpec.split. The split itself is executed by the world.
 */
export function firework(ctx: PatternContext, x: number, y: number, opts: FireworkOptions = {}): void {
  const rng = resolveRng(opts.rng);
  const shells = scaledCount(ctx, opts.count ?? 1);
  const speedMul = ctx.difficulty.bulletSpeed;
  const speed = (opts.speed ?? 130) * speedMul;
  const delay = opts.delay ?? 0.9;
  const aimed = opts.aimed ?? opts.angle === undefined;
  const base = aimed ? ctx.aimAtPlayer(x, y) : (opts.angle ?? Math.PI / 2);
  const spread = opts.spread ?? 0;
  const jitter = opts.jitter ?? 0;
  const spawnRadius = opts.spawnRadius ?? 0;

  for (let i = 0; i < shells; i += 1) {
    const t = shells === 1 ? 0.5 : i / (shells - 1);
    let angle = base + (t - 0.5) * spread;
    if (jitter !== 0) angle += rng.jitter(jitter);
    const spec: BulletSpec = {
      x: x + Math.cos(angle) * spawnRadius,
      y: y + Math.sin(angle) * spawnRadius,
      angle,
      speed,
      kind: opts.kind ?? 'star',
      color: opts.color ?? 'pink',
      accel: -(opts.decel ?? 180) * speedMul,
      spin: 2.4,
      minSpeed: 0,
      life: opts.life ?? delay + 2.4,
      split: {
        delay,
        // The world applies bulletCount / bulletSpeed to split children when it
        // bursts the shell, so the helper must pass the base values here or the
        // children would be scaled twice on higher difficulties.
        count: Math.max(1, Math.round(opts.childCount ?? 8)),
        speed: opts.childSpeed ?? 82,
        // Omitting spread makes the world burst the children in a full circle.
        ...(opts.childSpread === undefined ? {} : { spread: opts.childSpread }),
        kind: opts.childKind ?? 'rice',
        color: opts.childColor ?? 'yellow',
      },
    };
    ctx.spawnBullet(spec);
  }
}
