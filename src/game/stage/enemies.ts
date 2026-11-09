import { FIELD_W } from '../constants';
import type {
  BulletColor,
  BulletKind,
  DifficultyConfig,
  Enemy,
  EnemySpec,
  EnemyUpdateContext,
} from '../types';
import { curtain, fan, IntervalEmitter, ring, SpiralEmitter } from '../patterns';

type EnemyUpdate = (enemy: Enemy, ctx: EnemyUpdateContext, dt: number) => void;

const FAIRY = { hp: 10, radius: 14, score: 500 } as const;
const TURRET = { hp: 40, radius: 20, score: 1200 } as const;
const SPINNER = { hp: 30, radius: 18, score: 900 } as const;
const MIDBOSS = { hp: 460, radius: 30, score: 5000 } as const;

/** Normal difficulty HP for every non-boss enemy; bosses use bossHp instead. */
function hpFor(difficulty: DifficultyConfig, hp: number): number {
  return Math.max(1, Math.round(hp * difficulty.enemyHp));
}

function dropPoints(ctx: EnemyUpdateContext, x: number, y: number, count: number): void {
  if (count <= 0) return;
  // The world reads ItemSpec.spread as horizontal units, not radians.
  ctx.spawnItem({
    kind: 'point',
    x,
    y,
    count: Math.round(count),
    spread: Math.min(120, 20 * (Math.round(count) - 1)),
  });
}

interface BaseOptions {
  readonly x: number;
  readonly y?: number;
  readonly hp?: number;
  readonly score?: number;
  /** Point items released on death (0 disables the drop). */
  readonly pointDrops?: number;
}

export interface FairyOptions extends BaseOptions {
  /** Horizontal drift in units/s; ignored when `sineAmp` is set. */
  readonly drift?: number;
  readonly fallSpeed?: number;
  /** 0 disables firing entirely (used by the item carriers). */
  readonly fireInterval?: number;
  readonly fireDelay?: number;
  readonly fireCount?: number;
  readonly spread?: number;
  readonly bulletSpeed?: number;
  readonly bulletKind?: BulletKind;
  readonly color?: BulletColor;
  /** Sine-wave rush: amplitude and angular frequency of the x sweep. */
  readonly sineAmp?: number;
  readonly sineFreq?: number;
}

/** Small fairy: drifts down, occasionally fires an aimed fan, drops points. */
export function fairySpec(difficulty: DifficultyConfig, opts: FairyOptions): EnemySpec {
  const spawnX = opts.x;
  const fallSpeed = opts.fallSpeed ?? 128;
  const fire = new IntervalEmitter(opts.fireInterval ?? 2.1, opts.fireDelay ?? 0.8);
  const drops = opts.pointDrops ?? 1;

  const update: EnemyUpdate = (enemy, ctx, dt) => {
    enemy.vy = fallSpeed;
    if (opts.sineAmp !== undefined) {
      enemy.vx = 0;
      enemy.x = spawnX + Math.sin(enemy.age * (opts.sineFreq ?? 2.4)) * opts.sineAmp;
    } else {
      enemy.vx = opts.drift ?? 0;
    }
    if (opts.fireInterval === 0) return;
    if (fire.step(dt) <= 0) return;
    fan(ctx, enemy.x, enemy.y, {
      count: opts.fireCount ?? 1,
      speed: opts.bulletSpeed ?? 100,
      spread: opts.spread ?? 0,
      aimed: true,
      kind: opts.bulletKind ?? 'rice',
      color: opts.color ?? 'pink',
    });
  };

  return {
    x: opts.x,
    y: opts.y ?? -40,
    kind: 'fairy',
    hp: hpFor(difficulty, opts.hp ?? FAIRY.hp),
    radius: FAIRY.radius,
    score: opts.score ?? FAIRY.score,
    update,
    onDeath: (enemy, ctx) => dropPoints(ctx, enemy.x, enemy.y, drops),
  };
}

export interface TurretOptions extends BaseOptions {
  readonly holdY?: number;
  readonly retreatAfter?: number;
  readonly fireInterval?: number;
  readonly fireDelay?: number;
  readonly fireCount?: number;
  readonly spread?: number;
  readonly bulletSpeed?: number;
  readonly bulletKind?: BulletKind;
  readonly color?: BulletColor;
  /** Fires full-width curtain rows with a sliding safe gap instead of a fan. */
  readonly curtainWall?: boolean;
  readonly gapWidth?: number;
  readonly radius?: number;
}

/** Hovering gun: descends to `holdY`, fires aimed fans or curtain walls. */
export function turretSpec(difficulty: DifficultyConfig, opts: TurretOptions): EnemySpec {
  const holdY = opts.holdY ?? 150;
  const retreatAfter = opts.retreatAfter ?? 9;
  const fire = new IntervalEmitter(opts.fireInterval ?? 1.5, opts.fireDelay ?? 0.9);
  const drops = opts.pointDrops ?? 1;
  let gapPhase = 0.4;

  const update: EnemyUpdate = (enemy, ctx, dt) => {
    enemy.vx = 0;
    enemy.vy = enemy.y < holdY ? 130 : 0;
    if (enemy.age >= retreatAfter) enemy.vy = 110;
    if (enemy.y < holdY - 4) return;
    if (fire.step(dt) <= 0) return;
    if (opts.curtainWall) {
      gapPhase += 0.95;
      const gapX = FIELD_W / 2 + Math.sin(gapPhase) * 118;
      curtain(ctx, FIELD_W / 2, enemy.y + 18, {
        speed: 108,
        gaps: 1,
        gapWidth: opts.gapWidth ?? 84,
        gapX: [gapX],
        kind: 'rice',
        color: opts.color ?? 'purple',
      });
      return;
    }
    fan(ctx, enemy.x, enemy.y, {
      count: opts.fireCount ?? 3,
      speed: opts.bulletSpeed ?? 108,
      spread: opts.spread ?? 0.5,
      aimed: true,
      kind: opts.bulletKind ?? 'rice',
      color: opts.color ?? 'cyan',
    });
  };

  return {
    x: opts.x,
    y: opts.y ?? -50,
    kind: 'turret',
    hp: hpFor(difficulty, opts.hp ?? TURRET.hp),
    radius: opts.radius ?? TURRET.radius,
    score: opts.score ?? TURRET.score,
    update,
    onDeath: (enemy, ctx) => dropPoints(ctx, enemy.x, enemy.y, drops),
  };
}

export interface SpinnerOptions extends BaseOptions {
  readonly holdY?: number;
  readonly retreatAfter?: number;
  readonly spiralInterval?: number;
  readonly spiralCount?: number;
  readonly spiralSpeed?: number;
  readonly rotate?: number;
  readonly ringInterval?: number;
  readonly ringCount?: number;
  readonly color?: BulletColor;
  readonly radius?: number;
}

/** Rotating enemy: spinning spiral spray plus an unaimed ring burst. */
export function spinnerSpec(difficulty: DifficultyConfig, opts: SpinnerOptions): EnemySpec {
  const holdY = opts.holdY ?? 190;
  const retreatAfter = opts.retreatAfter ?? 8.5;
  const color = opts.color ?? 'green';
  const spiral = new SpiralEmitter({
    count: opts.spiralCount ?? 4,
    interval: opts.spiralInterval ?? 0.42,
    speed: opts.spiralSpeed ?? 86,
    rotate: opts.rotate ?? 0.34,
    kind: 'orb',
    color,
  });
  const rings = new IntervalEmitter(opts.ringInterval ?? 2.9, 1.4);
  const drops = opts.pointDrops ?? 1;

  const update: EnemyUpdate = (enemy, ctx, dt) => {
    enemy.vx = 0;
    enemy.vy = enemy.y < holdY ? 100 : 0;
    if (enemy.age >= retreatAfter) enemy.vy = 95;
    if (enemy.y < holdY - 4) return;
    spiral.update(ctx, enemy.x, enemy.y, dt);
    if (rings.step(dt) > 0) {
      ring(ctx, enemy.x, enemy.y, {
        count: opts.ringCount ?? 12,
        speed: 92,
        kind: 'orb',
        color,
      });
    }
  };

  return {
    x: opts.x,
    y: opts.y ?? -50,
    kind: 'spinner',
    hp: hpFor(difficulty, opts.hp ?? SPINNER.hp),
    radius: opts.radius ?? SPINNER.radius,
    score: opts.score ?? SPINNER.score,
    spin: 3.2,
    update,
    onDeath: (enemy, ctx) => dropPoints(ctx, enemy.x, enemy.y, drops),
  };
}

/**
 * Mid-boss gatekeeper: a fat turret that alternates a rotating spiral with an
 * aimed ring and short fans. Leaves the field on its own if it survives.
 */
export function midbossSpec(difficulty: DifficultyConfig, x = FIELD_W / 2): EnemySpec {
  const holdY = 170;
  const retreatAfter = 16;
  const spiral = new SpiralEmitter({
    count: 5,
    interval: 0.24,
    speed: 92,
    rotate: 0.31,
    startAngle: 0.5,
    kind: 'star',
    color: 'yellow',
  });
  const rings = new IntervalEmitter(3, 1.2);
  const fans = new IntervalEmitter(2, 0.8);

  const update: EnemyUpdate = (enemy, ctx, dt) => {
    enemy.vx = 0;
    enemy.vy = enemy.y < holdY ? 105 : 0;
    if (enemy.age >= retreatAfter) enemy.vy = 90;
    if (enemy.y < holdY - 4) return;
    spiral.update(ctx, enemy.x, enemy.y, dt);
    if (rings.step(dt) > 0) {
      ring(ctx, enemy.x, enemy.y, {
        count: 16,
        speed: 84,
        baseAngle: ctx.aimAtPlayer(enemy.x, enemy.y),
        kind: 'orb',
        color: 'blue',
      });
    }
    if (fans.step(dt) > 0) {
      fan(ctx, enemy.x, enemy.y, {
        count: 3,
        speed: 118,
        spread: 0.35,
        aimed: true,
        kind: 'arrow',
        color: 'yellow',
      });
    }
  };

  return {
    x,
    y: -60,
    kind: 'turret',
    hp: hpFor(difficulty, MIDBOSS.hp),
    radius: MIDBOSS.radius,
    score: MIDBOSS.score,
    spin: 1.2,
    update,
    onDeath: (enemy, ctx) => {
      ctx.spawnItem({ kind: 'bigPower', x: enemy.x, y: enemy.y, count: 1 });
      dropPoints(ctx, enemy.x, enemy.y, 8);
    },
  };
}
