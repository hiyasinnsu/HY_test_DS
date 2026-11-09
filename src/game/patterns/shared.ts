import { Rng } from '../../core/rng';
import type {
  BulletColor,
  BulletKind,
  BulletSpec,
  EnemyUpdateContext,
  StageContext,
} from '../types';

/**
 * Both the stage controller and enemy `update` callbacks can drive the pattern
 * helpers, so the library only depends on the members they share.
 */
export type PatternContext = StageContext | EnemyUpdateContext;

/** Fixed seed keeps unseeded (jittered) patterns identical between runs. */
export const DEFAULT_PATTERN_SEED = 0x51a7d057;

const fallbackRng = new Rng(DEFAULT_PATTERN_SEED);

/** Uses the caller's Rng when given, otherwise the shared deterministic one. */
export function resolveRng(rng?: Rng): Rng {
  return rng ?? fallbackRng;
}

/** Difficulty-scaled bullet count; never drops below a single bullet. */
export function scaledCount(ctx: PatternContext, count: number): number {
  return Math.max(1, Math.round(count * ctx.difficulty.bulletCount));
}

/**
 * Difficulty-scaled bullet speed. Every speed value in this library goes
 * through here (or an equivalent `bulletSpeed` multiply).
 */
export function scaledSpeed(ctx: PatternContext, speed: number): number {
  return speed * ctx.difficulty.bulletSpeed;
}

/** Cosmetic and motion knobs shared by every pattern helper. */
export interface BulletStyle {
  readonly kind?: BulletKind;
  readonly color?: BulletColor;
  /** Units/s^2 along the heading; scaled by bulletSpeed like other speeds. */
  readonly accel?: number;
  readonly angularVel?: number;
  readonly spin?: number;
  readonly life?: number;
  readonly minSpeed?: number;
  readonly cancellable?: boolean;
  /** Overrides the per-kind collision radius. */
  readonly hitRadius?: number;
}

export function styleOf(style: BulletStyle): BulletStyle {
  return {
    kind: style.kind,
    color: style.color,
    accel: style.accel,
    angularVel: style.angularVel,
    spin: style.spin,
    life: style.life,
    minSpeed: style.minSpeed,
    cancellable: style.cancellable,
    hitRadius: style.hitRadius,
  };
}

/**
 * Spawns one bullet through `ctx`. `speed` must already be difficulty-scaled;
 * acceleration and minSpeed are scaled here so callers cannot forget them.
 */
export function spawnBulletAt(
  ctx: PatternContext,
  x: number,
  y: number,
  angle: number,
  speed: number,
  style: BulletStyle = {},
): void {
  const speedMul = ctx.difficulty.bulletSpeed;
  const spec: BulletSpec = {
    x,
    y,
    angle,
    speed,
    kind: style.kind ?? 'orb',
    color: style.color ?? 'pink',
    accel: style.accel === undefined ? 0 : style.accel * speedMul,
    angularVel: style.angularVel ?? 0,
    spin: style.spin ?? 0,
    minSpeed: style.minSpeed === undefined ? 0 : style.minSpeed * speedMul,
    ...(style.life === undefined ? {} : { life: style.life }),
    ...(style.cancellable === undefined ? {} : { cancellable: style.cancellable }),
    ...(style.hitRadius === undefined ? {} : { radius: style.hitRadius }),
  };
  ctx.spawnBullet(spec);
}
