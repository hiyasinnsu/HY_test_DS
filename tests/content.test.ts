import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DIFFICULTIES, FIELD_W } from '../src/game/constants';
import { curtain, fan, firework, laserSweep, ring, SpiralEmitter } from '../src/game/patterns';
import { BOSS_WARNING_AT, createStage1, PHASE_NAMES, PHASE_THRESHOLDS } from '../src/game/stage';
import type {
  BulletSpec,
  Difficulty,
  EffectKind,
  Enemy,
  EnemySpec,
  ItemSpec,
  LaserSpec,
  PlayerState,
  StageContext,
} from '../src/game/types';

const DT = 1 / 60;

interface SpawnLog {
  readonly bullets: BulletSpec[];
  readonly lasers: LaserSpec[];
  readonly items: ItemSpec[];
  readonly enemies: EnemySpec[];
  readonly enemyObjects: Enemy[];
  readonly effects: { kind: EffectKind; x: number; y: number; power?: number }[];
  readonly banners: { text: string | null; seconds?: number }[];
  readonly spells: (string | null)[];
  readonly bossCalls: { enemy: Enemy | null; name: string }[];
}

interface TestContext {
  readonly ctx: StageContext;
  readonly log: SpawnLog;
}

function makePlayer(): PlayerState {
  return {
    x: FIELD_W / 2,
    y: 700,
    radius: 2.6,
    grazeRadius: 20,
    alive: true,
    invuln: 0,
    focused: false,
    power: 0,
    shotCooldown: 0,
    bank: 0,
    deathTimer: 0,
  };
}

/** Records every spawn call so patterns and stage waves can be inspected. */
function createFakeContext(difficulty: Difficulty = 'normal'): TestContext {
  const log: SpawnLog = {
    bullets: [],
    lasers: [],
    items: [],
    enemies: [],
    enemyObjects: [],
    effects: [],
    banners: [],
    spells: [],
    bossCalls: [],
  };
  const player = makePlayer();
  let nextId = 1;

  const ctx: StageContext = {
    player,
    difficulty: DIFFICULTIES[difficulty],
    time: 0,
    stageTime: 0,
    spawnBullet: (spec) => {
      log.bullets.push(spec);
    },
    spawnLaser: (spec) => {
      log.lasers.push(spec);
    },
    spawnItem: (spec) => {
      log.items.push(spec);
    },
    spawnEnemy: (spec) => {
      log.enemies.push(spec);
      const enemy: Enemy = {
        active: true,
        id: nextId,
        kind: spec.kind,
        x: spec.x,
        y: spec.y,
        vx: 0,
        vy: 0,
        hp: spec.hp,
        maxHp: spec.hp,
        radius: spec.radius,
        score: spec.score,
        age: 0,
        hitFlash: 0,
        spin: spec.spin ?? 0,
        rotation: 0,
        items: spec.items ?? [],
        update: spec.update ?? null,
        onDeath: spec.onDeath ?? null,
        bombFlash: 0,
      };
      nextId += 1;
      log.enemyObjects.push(enemy);
      return enemy;
    },
    spawnEffect: (kind, x, y, power) => {
      log.effects.push({ kind, x, y, power });
    },
    aimAtPlayer: (x, y) => Math.atan2(player.y - y, player.x - x),
    setBoss: (enemy, name) => {
      log.bossCalls.push({ enemy, name });
    },
    setSpell: (name) => {
      log.spells.push(name);
    },
    setBanner: (text, seconds) => {
      log.banners.push({ text, seconds });
    },
  };
  return { ctx, log };
}

function widestGap(xs: readonly number[]): number {
  const sorted = [...new Set(xs)].sort((a, b) => a - b);
  let best = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    best = Math.max(best, sorted[i] - sorted[i - 1]);
  }
  return best;
}

describe('pattern library', () => {
  it('ring covers a full circle and scales count and speed', () => {
    const normal = createFakeContext('normal');
    ring(normal.ctx, 100, 100, { count: 10, speed: 100, kind: 'rice', color: 'cyan' });
    expect(normal.log.bullets).toHaveLength(10);
    expect(normal.log.bullets[0].angle).toBeCloseTo(0, 6);
    expect(normal.log.bullets[5].angle).toBeCloseTo(Math.PI, 6);
    expect(normal.log.bullets[0].speed).toBeCloseTo(100, 6);
    expect(normal.log.bullets[0].kind).toBe('rice');
    expect(normal.log.bullets[0].color).toBe('cyan');

    const easy = createFakeContext('easy');
    ring(easy.ctx, 100, 100, { count: 10, speed: 100 });
    expect(easy.log.bullets).toHaveLength(7);
    expect(easy.log.bullets[0].speed).toBeCloseTo(82, 5);

    const hard = createFakeContext('hard');
    ring(hard.ctx, 100, 100, { count: 10, speed: 100 });
    expect(hard.log.bullets).toHaveLength(13);
    expect(hard.log.bullets[0].speed).toBeCloseTo(113, 5);
  });

  it('fan aims at the player, spreads evenly and jitters deterministically', () => {
    const aimed = createFakeContext('normal');
    aimed.ctx.player.x = 100;
    aimed.ctx.player.y = 200;
    fan(aimed.ctx, 100, 100, { count: 5, speed: 90, spread: 0.6, aimed: true });
    expect(aimed.log.bullets).toHaveLength(5);
    expect(aimed.log.bullets[2].angle).toBeCloseTo(Math.PI / 2, 6);
    expect(aimed.log.bullets[0].angle).toBeCloseTo(Math.PI / 2 - 0.3, 6);
    expect(aimed.log.bullets[4].angle).toBeCloseTo(Math.PI / 2 + 0.3, 6);

    const fixed = createFakeContext('normal');
    fan(fixed.ctx, 100, 100, { count: 3, speed: 90, spread: 0, angle: Math.PI });
    expect(fixed.log.bullets.map((bullet) => bullet.angle)).toEqual([Math.PI, Math.PI, Math.PI]);

    const jitterA = createFakeContext('normal');
    fan(jitterA.ctx, 100, 100, {
      count: 5,
      speed: 90,
      spread: 0.4,
      angle: 0,
      jitter: 0.06,
      rng: new Rng(7),
    });
    const jitterB = createFakeContext('normal');
    fan(jitterB.ctx, 100, 100, {
      count: 5,
      speed: 90,
      spread: 0.4,
      angle: 0,
      jitter: 0.06,
      rng: new Rng(7),
    });
    const anglesA = jitterA.log.bullets.map((bullet) => bullet.angle);
    expect(anglesA).toEqual(jitterB.log.bullets.map((bullet) => bullet.angle));
    expect(anglesA[0]).not.toBeCloseTo(-0.2, 6);
  });

  it('curtain leaves a passable gap on every difficulty', () => {
    const counts: number[] = [];
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { ctx, log } = createFakeContext(difficulty);
      curtain(ctx, FIELD_W / 2, 120, { speed: 100 });
      expect(log.bullets.length).toBeGreaterThan(0);
      expect(log.bullets.every((bullet) => bullet.y === 120)).toBe(true);
      expect(widestGap(log.bullets.map((bullet) => bullet.x))).toBeGreaterThanOrEqual(60);
      expect(log.bullets[0].speed).toBeCloseTo(100 * DIFFICULTIES[difficulty].bulletSpeed, 5);
      counts.push(log.bullets.length);
    }
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });

  it('spiral emitter repeats on its interval and rotates every volley', () => {
    const { ctx, log } = createFakeContext('normal');
    const spiral = new SpiralEmitter({ count: 2, interval: 0.25, speed: 100, rotate: 0.5 });
    spiral.update(ctx, 50, 50, DT);
    expect(log.bullets).toHaveLength(2);
    expect(log.bullets[0].angle).toBeCloseTo(0, 6);
    for (let i = 0; i < 30; i += 1) spiral.update(ctx, 50, 50, DT);

    const volleys = log.bullets.length / 2;
    expect(volleys).toBeGreaterThanOrEqual(3);
    const bases: number[] = [];
    for (let v = 0; v < volleys; v += 1) bases.push(log.bullets[v * 2].angle);
    expect(bases[1]).toBeCloseTo(0.5, 6);
    expect(bases[2]).toBeCloseTo(1, 6);
  });

  it('firework shells scale but leave split children to the world', () => {
    const { ctx, log } = createFakeContext('hard');
    firework(ctx, 200, 150, {
      count: 2,
      speed: 120,
      delay: 0.8,
      childCount: 10,
      childSpeed: 70,
      childKind: 'rice',
    });
    expect(log.bullets).toHaveLength(3);
    for (const shell of log.bullets) {
      expect(shell.split).toBeDefined();
      expect(shell.split?.delay).toBeCloseTo(0.8, 6);
      // The world multiplies split children by the difficulty multipliers.
      expect(shell.split?.count).toBe(10);
      expect(shell.split?.speed).toBeCloseTo(70, 6);
      expect(shell.split?.kind).toBe('rice');
      expect(shell.speed).toBeCloseTo(120 * 1.13, 5);
      expect(shell.accel).toBeLessThan(0);
    }
  });

  it('laserSweep telegraphs an aimed beam', () => {
    const { ctx, log } = createFakeContext('normal');
    ctx.player.x = 100;
    ctx.player.y = 200;
    laserSweep(ctx, 100, 100, { width: 24, warmup: 0.8, duration: 1.4, spin: 0.4 });
    expect(log.lasers).toHaveLength(1);
    const laser = log.lasers[0];
    expect(laser.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(laser.warmup).toBeCloseTo(0.8, 6);
    expect(laser.duration).toBeCloseTo(1.4, 6);
    expect(laser.spin).toBeCloseTo(0.4, 6);
    expect(laser.width).toBe(24);
  });
});

describe('stage 1', () => {
  it('opens with the stage banner', () => {
    const { ctx, log } = createFakeContext('normal');
    const stage = createStage1();
    stage.start(ctx);
    expect(log.banners[0]).toEqual({ text: 'ステージ 1 — 星屑回廊', seconds: 2.5 });
    expect(log.bossCalls[0]).toEqual({ enemy: null, name: '' });
  });

  it('spawns enemies continuously across the first minute', () => {
    const { ctx, log } = createFakeContext('normal');
    const stage = createStage1();
    stage.start(ctx);

    const spawnTimes: number[] = [];
    let t = 0;
    let seen = 0;
    while (t < 60) {
      stage.update(ctx, DT);
      t += DT;
      if (log.enemies.length > seen) {
        spawnTimes.push(t);
        seen = log.enemies.length;
      }
    }

    expect(spawnTimes.length).toBeGreaterThan(25);
    expect(spawnTimes[0]).toBeLessThanOrEqual(2);
    for (let i = 1; i < spawnTimes.length; i += 1) {
      const gap = spawnTimes[i] - spawnTimes[i - 1];
      // No dead air longer than ~1.5s; this also rules out any empty 2s window.
      expect(gap).toBeLessThan(1.6);
    }
    expect(spawnTimes[spawnTimes.length - 1]).toBeGreaterThan(58);

    const kinds = new Set(log.enemies.map((enemy) => enemy.kind));
    expect(kinds).toContain('fairy');
    expect(kinds).toContain('turret');
    expect(kinds).toContain('spinner');

    // Mid-boss is a turret with boss-sized HP.
    expect(Math.max(...log.enemies.map((enemy) => enemy.hp))).toBeGreaterThan(400);

    // Difficulty scales non-boss HP but the wave count stays identical.
    const hard = createFakeContext('hard');
    const hardStage = createStage1();
    hardStage.start(hard.ctx);
    for (let i = 0; i < 60 * 60; i += 1) hardStage.update(hard.ctx, DT);
    expect(hard.log.enemies.length).toBe(log.enemies.length);
    expect(hard.log.enemies[0].hp).toBeGreaterThan(log.enemies[0].hp);

    const progress = stage.progress(ctx);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
    expect(stage.isComplete(ctx)).toBe(false);
  });

  it('runs five spell cards and completes after the boss dies', () => {
    const { ctx, log } = createFakeContext('normal');
    const stage = createStage1();
    stage.start(ctx);

    let t = 0;
    let warningAt = -1;
    let boss: Enemy | null = null;
    while (t < 85 && boss === null) {
      stage.update(ctx, DT);
      t += DT;
      if (warningAt < 0 && log.banners.some((banner) => banner.text === 'WARNING')) {
        warningAt = t;
      }
      for (let i = log.bossCalls.length - 1; i >= 0; i -= 1) {
        const call = log.bossCalls[i];
        if (call.enemy) {
          boss = call.enemy;
          break;
        }
      }
    }

    expect(boss).not.toBeNull();
    const bossEnemy = boss as Enemy;
    expect(bossEnemy.kind).toBe('boss');
    expect(warningAt).toBeGreaterThan(BOSS_WARNING_AT - 1);
    expect(t - warningAt).toBeGreaterThan(2.5);
    expect(t - warningAt).toBeLessThan(3.5);
    expect(log.bossCalls.some((call) => call.name === '星霊アストラル・セラフ')).toBe(true);
    expect(log.effects.some((effect) => effect.kind === 'bossWarning')).toBe(true);
    expect(log.effects.some((effect) => effect.kind === 'bossPhase')).toBe(true);
    expect(log.spells).toContain(PHASE_NAMES[0]);

    // Depleting HP below each threshold advances one spell card.
    const thresholds = [0.75, 0.55, 0.35, 0.15];
    for (let i = 0; i < thresholds.length; i += 1) {
      bossEnemy.hp = bossEnemy.maxHp * thresholds[i];
      stage.update(ctx, DT);
      t += DT;
      expect(log.spells[log.spells.length - 1]).toBe(PHASE_NAMES[i + 1]);
    }
    expect(log.spells.filter((name) => name !== null)).toEqual([...PHASE_NAMES]);
    expect(log.effects.filter((effect) => effect.kind === 'bossPhase').length).toBe(5);

    const beforeDeath = log.effects.length;
    bossEnemy.hp = 0;
    stage.update(ctx, DT);
    t += DT;
    expect(log.bossCalls[log.bossCalls.length - 1]).toEqual({ enemy: null, name: '' });
    expect(log.spells[log.spells.length - 1]).toBeNull();
    expect(log.effects.length).toBeGreaterThanOrEqual(beforeDeath);
    expect(stage.isComplete(ctx)).toBe(false);

    let lastProgress = stage.progress(ctx);
    for (let i = 0; i < 200; i += 1) {
      stage.update(ctx, DT);
      t += DT;
      const progress = stage.progress(ctx);
      expect(progress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = progress;
    }
    expect(stage.isComplete(ctx)).toBe(true);
    expect(stage.progress(ctx)).toBe(1);
  });

  it('advances one spell card when a huge hit crosses several thresholds', () => {
    const { ctx, log } = createFakeContext('normal');
    const stage = createStage1();
    stage.start(ctx);
    let boss: Enemy | null = null;
    for (let frame = 0; frame < 85 * 60 && boss === null; frame += 1) {
      stage.update(ctx, DT);
      for (let i = log.bossCalls.length - 1; i >= 0; i -= 1) {
        const call = log.bossCalls[i];
        if (call.enemy) {
          boss = call.enemy;
          break;
        }
      }
    }
    expect(boss).not.toBeNull();
    const bossEnemy = boss as Enemy;
    const played = (): (string | null)[] => log.spells.filter((name) => name !== null);
    expect(played()).toEqual([PHASE_NAMES[0]]);

    // 2000 damage from full HP crosses the 80%, 60% and 40% thresholds at once.
    bossEnemy.hp -= 2000;
    stage.update(ctx, DT);
    expect(played()).toEqual([PHASE_NAMES[0], PHASE_NAMES[1]]);
    expect(bossEnemy.hp).toBeCloseTo(bossEnemy.maxHp * PHASE_THRESHOLDS[0], 6);
    expect(log.effects.filter((effect) => effect.kind === 'bossPhase')).toHaveLength(2);

    // The clamped HP sits inside the new band, so nothing advances on its own.
    stage.update(ctx, DT);
    expect(played()).toEqual([PHASE_NAMES[0], PHASE_NAMES[1]]);
  });

  it('stays inside the bullet budget and never throws while firing', () => {
    const { ctx, log } = createFakeContext('normal');
    const stage = createStage1();
    stage.start(ctx);

    // Minimal stand-in for the world: advance enemies, cull them off-screen and
    // slowly grind the boss down so all five spell cards actually fire.
    const live: Enemy[] = [];
    let seen = 0;
    let previousBullets = 0;
    let secondBullets = 0;
    let worstSecond = 0;
    // ~80 dps at Normal, matching the balance target for the 3200 HP boss.
    const bossLifetime = 40;
    const frames = Math.round(120 / DT);
    for (let frame = 0; frame < frames; frame += 1) {
      stage.update(ctx, DT);
      while (seen < log.enemyObjects.length) {
        live.push(log.enemyObjects[seen]);
        seen += 1;
      }
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const enemy = live[i];
        enemy.age += DT;
        if (enemy.kind === 'boss') {
          enemy.hp = Math.max(0, enemy.hp - (enemy.maxHp * DT) / bossLifetime);
        }
        enemy.update?.(enemy, ctx, DT);
        enemy.x += enemy.vx * DT;
        enemy.y += enemy.vy * DT;
        enemy.rotation += enemy.spin * DT;
        const gone =
          enemy.hp <= 0 ||
          enemy.y > 890 ||
          enemy.x < -140 ||
          enemy.x > FIELD_W + 140;
        if (gone) live.splice(i, 1);
      }

      secondBullets += log.bullets.length - previousBullets;
      previousBullets = log.bullets.length;
      if ((frame + 1) % 60 === 0) {
        worstSecond = Math.max(worstSecond, secondBullets);
        secondBullets = 0;
      }
    }

    expect(log.bullets.length).toBeGreaterThan(1000);
    expect(worstSecond).toBeLessThan(200);
    expect(log.lasers.length).toBeGreaterThan(0);
    expect(log.items.length).toBeGreaterThan(0);
    expect(log.spells).toContain(PHASE_NAMES[PHASE_NAMES.length - 1]);
    expect(stage.isComplete(ctx)).toBe(true);
  });
});
