import { clamp, damp, TAU } from '../../core/math';
import { Rng } from '../../core/rng';
import { FIELD_W, SCORE } from '../constants';
import type { DifficultyConfig, Enemy, EnemySpec, EnemyUpdateContext } from '../types';
import { curtain, fan, firework, IntervalEmitter, laserSweep, ring, SpiralEmitter } from '../patterns';

export const BOSS_NAME = '星霊アストラル・セラフ';

/** Normal-difficulty boss HP; scaled by difficulty.bossHp at spawn. */
export const BOSS_HP = 3200;
export const BOSS_RADIUS = 42;

/** Seconds the boss stops firing after every phase change. */
export const PHASE_PAUSE = 2;

/** Five spell cards, one per HP threshold. */
export const PHASE_NAMES = [
  '星屑の螺旋',
  '流星群',
  '天の川のワルツ',
  '花火の星',
  '終曲・銀河の涙',
] as const;

export const PHASE_COUNT = PHASE_NAMES.length;

/**
 * Fraction of max HP left when the active phase ends, derived from the card
 * count so every card owns exactly 1/5 of the bar (640 HP at Normal). The last
 * entry (0) is the kill threshold, so the finale runs from 20% HP down to zero.
 */
export const PHASE_THRESHOLDS: readonly number[] = Array.from(
  { length: PHASE_COUNT },
  (_, index) => (PHASE_COUNT - 1 - index) / PHASE_COUNT,
);

const BOSS_HOLD_Y = 168;
const BOSS_SEED = 0xb055177;

interface BossPhaseRunner {
  update(ctx: EnemyUpdateContext, boss: Enemy, dt: number): void;
}

/** 星屑の螺旋 — rotating spiral rings plus an aimed opening burst. */
function phaseSpiral(rng: Rng): BossPhaseRunner {
  const spiral = new SpiralEmitter({
    count: 5,
    interval: 0.17,
    speed: 96,
    rotate: 0.37,
    startAngle: rng.range(0, TAU),
    kind: 'star',
    color: 'cyan',
    angularVel: 0.12,
  });
  const burst = new IntervalEmitter(2.6, 1.1);
  return {
    update(ctx, boss, dt) {
      spiral.update(ctx, boss.x, boss.y, dt);
      if (burst.step(dt) <= 0) return;
      ring(ctx, boss.x, boss.y, {
        count: 16,
        speed: 78,
        baseAngle: ctx.aimAtPlayer(boss.x, boss.y),
        kind: 'orb',
        color: 'blue',
        spawnRadius: 8,
      });
    },
  };
}

/** 流星群 — aimed meteor fans over a curtain with a sliding gap. */
function phaseMeteor(rng: Rng): BossPhaseRunner {
  const fans = new IntervalEmitter(1.05, 0.25);
  const walls = new IntervalEmitter(1.9, 1);
  let sweep = rng.range(0, TAU);
  return {
    update(ctx, boss, dt) {
      if (fans.step(dt) > 0) {
        fan(ctx, boss.x, boss.y, {
          count: 7,
          speed: 118,
          spread: 0.62,
          aimed: true,
          kind: 'arrow',
          color: 'yellow',
        });
      }
      if (walls.step(dt) <= 0) return;
      sweep += 0.85;
      curtain(ctx, FIELD_W / 2, boss.y + 24, {
        speed: 104,
        gaps: 1,
        gapWidth: 92,
        gapX: [FIELD_W / 2 + Math.sin(sweep) * 118],
        kind: 'rice',
        color: 'purple',
      });
    },
  };
}

/** 天の川のワルツ — sweeping lasers and slow big orbs. */
function phaseWaltz(): BossPhaseRunner {
  const beams = new IntervalEmitter(3.5, 0.5);
  const orbs = new IntervalEmitter(1.5, 0.3);
  const stars = new IntervalEmitter(2.9, 2.2);
  let spin = 1;
  return {
    update(ctx, boss, dt) {
      if (beams.step(dt) > 0) {
        spin = -spin;
        laserSweep(ctx, boss.x, boss.y, {
          width: 30,
          length: 880,
          warmup: 1,
          duration: 2.1,
          spin: 0.5 * spin,
          color: 'cyan',
          repeatHit: true,
          follow: boss,
        });
      }
      if (orbs.step(dt) > 0) {
        ring(ctx, boss.x, boss.y, {
          count: 8,
          speed: 58,
          accel: 32,
          kind: 'bubble',
          color: 'blue',
          angularVel: 0.08,
          hitRadius: 13,
        });
      }
      if (stars.step(dt) > 0) {
        fan(ctx, boss.x, boss.y, {
          count: 5,
          speed: 120,
          spread: 0.4,
          aimed: true,
          kind: 'star',
          color: 'white',
        });
      }
    },
  };
}

/** 花火の星 — split shells that bloom into rings of rice bullets. */
function phaseFireworks(rng: Rng): BossPhaseRunner {
  const shells = new IntervalEmitter(1.2, 0.3);
  const fans = new IntervalEmitter(2.3, 1.5);
  return {
    update(ctx, boss, dt) {
      if (shells.step(dt) > 0) {
        firework(ctx, boss.x, boss.y, {
          count: 3,
          speed: 135,
          spread: 0.9,
          delay: 0.85,
          childCount: 12,
          childSpeed: 82,
          decel: 180,
          kind: 'star',
          color: 'pink',
          childKind: 'rice',
          childColor: 'yellow',
          rng,
        });
      }
      if (fans.step(dt) <= 0) return;
      fan(ctx, boss.x, boss.y, {
        count: 9,
        speed: 100,
        spread: 1,
        aimed: true,
        jitter: 0.06,
        rng,
        kind: 'orb',
        color: 'purple',
      });
    },
  };
}

/** 終曲・銀河の涙 — dense finale: spiral, aimed rings, fans, sliding curtains. */
function phaseFinale(rng: Rng): BossPhaseRunner {
  const spiral = new SpiralEmitter({
    count: 6,
    interval: 0.15,
    speed: 108,
    rotate: -0.29,
    startAngle: rng.range(0, TAU),
    kind: 'star',
    color: 'white',
    angularVel: 0.1,
  });
  const rings = new IntervalEmitter(1.8, 0.9);
  const fans = new IntervalEmitter(2.7, 2);
  const walls = new IntervalEmitter(3.3, 3.1);
  let sweep = rng.range(0, TAU);
  return {
    update(ctx, boss, dt) {
      spiral.update(ctx, boss.x, boss.y, dt);
      if (rings.step(dt) > 0) {
        ring(ctx, boss.x, boss.y, {
          count: 20,
          speed: 84,
          baseAngle: ctx.aimAtPlayer(boss.x, boss.y),
          kind: 'orb',
          color: 'pink',
          angularVel: 0.18,
        });
      }
      if (fans.step(dt) > 0) {
        fan(ctx, boss.x, boss.y, {
          count: 11,
          speed: 126,
          spread: 0.55,
          aimed: true,
          kind: 'arrow',
          color: 'cyan',
        });
      }
      if (walls.step(dt) <= 0) return;
      sweep += 1;
      curtain(ctx, FIELD_W / 2, boss.y + 26, {
        speed: 100,
        gaps: 1,
        gapWidth: 90,
        gapX: [FIELD_W / 2 + Math.sin(sweep) * 128],
        kind: 'rice',
        color: 'purple',
      });
    },
  };
}

function createPhaseRunner(phase: number, rng: Rng): BossPhaseRunner {
  switch (phase) {
    case 0:
      return phaseSpiral(rng);
    case 1:
      return phaseMeteor(rng);
    case 2:
      return phaseWaltz();
    case 3:
      return phaseFireworks(rng);
    default:
      return phaseFinale(rng);
  }
}

/**
 * Owns the boss's movement, spell-card phases and firing. The stage creates one
 * per run, wires it into the EnemySpec, and advances phases on HP thresholds.
 */
export class BossRuntime {
  private readonly rng = new Rng(BOSS_SEED);
  private phaseIndex = 0;
  private pause = 0;
  private runner: BossPhaseRunner | null = null;

  get phase(): number {
    return this.phaseIndex;
  }

  /** Binds the spawned enemy and starts spell card 1. */
  attach(): void {
    this.enterPhase(0);
  }

  /** Switches spell card and stops firing for PHASE_PAUSE seconds. */
  enterPhase(phase: number): void {
    this.phaseIndex = phase;
    this.pause = PHASE_PAUSE;
    this.runner = createPhaseRunner(phase, this.rng);
  }

  update(boss: Enemy, ctx: EnemyUpdateContext, dt: number): void {
    this.move(boss, ctx.player.x, dt);
    if (this.pause > 0) {
      this.pause = Math.max(0, this.pause - dt);
      return;
    }
    this.runner?.update(ctx, boss, dt);
  }

  /** Final explosion loot shower. The world handles the actual kill effect. */
  onDeath(enemy: Enemy, ctx: EnemyUpdateContext): void {
    for (let i = 0; i < 24; i += 1) {
      const angle = (TAU * i) / 24;
      ctx.spawnItem({
        kind: 'point',
        x: enemy.x + Math.cos(angle) * 46,
        y: enemy.y + Math.sin(angle) * 46,
        count: 1,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      ctx.spawnItem({ kind: 'bigPower', x: enemy.x + (i - 1) * 30, y: enemy.y + 18, count: 1 });
    }
  }

  private move(boss: Enemy, targetX: number, dt: number): void {
    boss.vx = 0;
    boss.vy = 0;
    if (boss.y < BOSS_HOLD_Y) {
      boss.y = Math.min(BOSS_HOLD_Y, boss.y + 92 * dt);
      return;
    }
    // Hover toward the player's column: the boss stays inside the player's line
    // of fire, which keeps the 5-card fight at a predictable length.
    boss.x = damp(boss.x, clamp(targetX, 96, FIELD_W - 96), 2.2, dt);
  }
}

export function createBossSpec(difficulty: DifficultyConfig, runtime: BossRuntime): EnemySpec {
  return {
    x: FIELD_W / 2,
    y: -70,
    kind: 'boss',
    hp: Math.max(1, Math.round(BOSS_HP * difficulty.bossHp)),
    radius: BOSS_RADIUS,
    score: SCORE.bossKill,
    spin: 0.5,
    update: (enemy, ctx, dt) => runtime.update(enemy, ctx, dt),
    onDeath: (enemy, ctx) => runtime.onDeath(enemy, ctx),
  };
}
