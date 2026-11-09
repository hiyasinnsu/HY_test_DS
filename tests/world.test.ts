import { describe, expect, it } from 'vitest';
import { FIELD_H, FIELD_W, HUD_H, PLAYER } from '../src/game/constants';
import type { StageController } from '../src/game/types';
import { World } from '../src/game/world';

/** Stage that never spawns anything, so world mechanics are tested in isolation. */
class StubStage implements StageController {
  complete = false;
  started = false;

  start(): void {
    this.started = true;
  }

  update(): void {}

  progress(): number {
    return this.complete ? 1 : 0;
  }

  isComplete(): boolean {
    return this.complete;
  }
}

function makeWorld(difficulty: 'easy' | 'normal' | 'hard' = 'normal'): {
  world: World;
  stage: StubStage;
} {
  const stage = new StubStage();
  const world = new World({ difficulty, stage, seed: 1 });
  return { world, stage };
}

function step(world: World, seconds: number, dt = 1 / 60): void {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i += 1) world.update(dt);
}

function spawnStationaryBullet(world: World, x: number, y: number): void {
  world.spawnBullet({ x, y, angle: 0, speed: 0, radius: 4, kind: 'orb', color: 'red' });
}

describe('World boot', () => {
  it('starts the stage and spawns the player near the bottom centre', () => {
    const { world, stage } = makeWorld();
    expect(stage.started).toBe(true);
    expect(world.player.x).toBeCloseTo(PLAYER.startX, 5);
    expect(world.player.y).toBeCloseTo(PLAYER.startY, 5);
    expect(world.status).toBe('playing');
    expect(world.lives).toBe(3);
    expect(world.bombs).toBe(3);
  });

  it('scales lives and bombs with difficulty', () => {
    expect(makeWorld('easy').world.lives).toBe(4);
    expect(makeWorld('hard').world.lives).toBe(2);
    expect(makeWorld('hard').world.bombs).toBe(2);
  });
});

describe('player movement', () => {
  it('moves toward the target and clamps to the playfield', () => {
    const { world } = makeWorld();
    world.setPlayerTarget(FIELD_W + 500, HUD_H - 500);
    step(world, 1);
    expect(world.player.x).toBeLessThanOrEqual(FIELD_W - PLAYER.radius - 6);
    expect(world.player.y).toBeGreaterThanOrEqual(HUD_H + 10);
  });

  it('never exceeds the unfocused speed per second', () => {
    const { world } = makeWorld();
    const startX = world.player.x;
    world.setPlayerTarget(startX - 400, world.player.y);
    step(world, 1 / 60);
    const moved = Math.abs(world.player.x - startX);
    expect(moved).toBeLessThanOrEqual(PLAYER.speed / 60 + 0.001);
  });

  it('moves slower while focused', () => {
    const fast = makeWorld().world;
    const slow = makeWorld().world;
    fast.setPlayerTarget(fast.player.x - 400, fast.player.y);
    slow.setFocus(true);
    slow.setPlayerTarget(slow.player.x - 400, slow.player.y);
    step(fast, 0.2);
    step(slow, 0.2);
    expect(Math.abs(slow.player.x - PLAYER.startX)).toBeLessThan(
      Math.abs(fast.player.x - PLAYER.startX),
    );
  });
});

describe('shooting and damage', () => {
  it('auto-fires without input', () => {
    const { world } = makeWorld();
    step(world, 0.2);
    expect(world.shots.count).toBeGreaterThan(2);
  });

  it('kills an enemy with player shots and awards score', () => {
    const { world } = makeWorld();
    world.spawnEnemy({
      x: world.player.x,
      y: world.player.y - 40,
      kind: 'fairy',
      hp: 2,
      radius: 14,
      score: 500,
    });
    step(world, 1);
    expect(world.enemies.count).toBe(0);
    expect(world.score).toBeGreaterThanOrEqual(500);
  });

  it('scales enemy score by the difficulty multiplier', () => {
    const easy = makeWorld('easy').world;
    easy.spawnEnemy({
      x: easy.player.x,
      y: easy.player.y - 40,
      kind: 'fairy',
      hp: 2,
      radius: 14,
      score: 1000,
    });
    step(easy, 1);
    expect(easy.score).toBe(700);
  });
});

describe('player damage', () => {
  it('loses a life, gains invulnerability and clears bullets on a hit', () => {
    const { world } = makeWorld();
    spawnStationaryBullet(world, world.player.x, world.player.y);
    expect(world.bullets.count).toBe(1);
    step(world, 1 / 60);
    expect(world.lives).toBe(2);
    expect(world.player.invuln).toBeGreaterThan(0);
    expect(world.bullets.count).toBe(0);
    expect(world.player.x).toBeCloseTo(PLAYER.startX, 5);
  });

  it('ignores hits while invulnerable', () => {
    const { world } = makeWorld();
    spawnStationaryBullet(world, world.player.x, world.player.y);
    step(world, 1 / 60);
    const livesAfterFirstHit = world.lives;
    spawnStationaryBullet(world, world.player.x, world.player.y);
    step(world, 1 / 60);
    expect(world.lives).toBe(livesAfterFirstHit);
  });

  it('ends the run when the last life is lost', () => {
    const { world } = makeWorld('hard');
    for (let i = 0; i < 5; i += 1) {
      world.player.invuln = 0;
      spawnStationaryBullet(world, world.player.x, world.player.y);
      step(world, 1 / 60);
      if (world.status !== 'playing') break;
    }
    expect(world.status).toBe('gameover');
    expect(world.lives).toBe(0);
  });

  it('damages the player with a firing laser', () => {
    const { world } = makeWorld();
    world.spawnLaser({
      x: world.player.x,
      y: world.player.y,
      angle: 0,
      width: 24,
      warmup: 0.1,
      duration: 0.5,
    });
    step(world, 0.3);
    expect(world.lives).toBe(2);
  });
});

describe('graze and items', () => {
  it('counts a graze for a near miss without taking damage', () => {
    const { world } = makeWorld();
    spawnStationaryBullet(world, world.player.x + 14, world.player.y);
    step(world, 1 / 60);
    expect(world.graze).toBe(1);
    expect(world.lives).toBe(3);
    expect(world.score).toBeGreaterThan(0);
  });

  it('counts each graze only once per bullet', () => {
    const { world } = makeWorld();
    spawnStationaryBullet(world, world.player.x + 14, world.player.y);
    step(world, 0.5);
    expect(world.graze).toBe(1);
  });

  it('collects power items and increases power', () => {
    const { world } = makeWorld();
    world.spawnItem({ kind: 'bigPower', x: world.player.x, y: world.player.y });
    step(world, 1 / 60);
    expect(world.power).toBeGreaterThan(0);
    expect(world.score).toBeGreaterThan(0);
  });

  it('collects point items for score', () => {
    const { world } = makeWorld();
    world.spawnItem({ kind: 'point', x: world.player.x, y: world.player.y });
    step(world, 1 / 60);
    expect(world.score).toBeGreaterThan(0);
  });
});

describe('bomb', () => {
  it('consumes a bomb, cancels bullets and damages enemies', () => {
    const { world } = makeWorld();
    for (let i = 0; i < 20; i += 1) {
      spawnStationaryBullet(world, 100 + i * 5, 200);
    }
    const enemy = world.spawnEnemy({
      x: 200,
      y: 200,
      kind: 'turret',
      hp: 60,
      radius: 20,
      score: 100,
    });
    expect(enemy).not.toBeNull();
    const hpBefore = enemy?.hp ?? 0;

    expect(world.useBomb()).toBe(true);
    expect(world.bombs).toBe(2);
    expect(world.bullets.count).toBe(0);
    expect(world.bombing).toBe(true);

    step(world, 1);
    expect(enemy?.hp ?? 0).toBeLessThan(hpBefore);
  });

  it('cannot be used twice while active or without bombs', () => {
    const { world } = makeWorld();
    expect(world.useBomb()).toBe(true);
    expect(world.useBomb()).toBe(false);
    world.bombs = 0;
    expect(world.useBomb()).toBe(false);
  });
});

describe('robustness', () => {
  it('never exceeds pool capacities when flooded with spawns', () => {
    const { world } = makeWorld();
    for (let i = 0; i < 6000; i += 1) {
      world.spawnBullet({ x: 10, y: 10, angle: 0, speed: 10 });
    }
    expect(world.bullets.count).toBeLessThanOrEqual(world.bullets.capacity);
    expect(() => step(world, 0.1)).not.toThrow();
  });

  it('splits bullets into children after their delay', () => {
    const { world } = makeWorld();
    world.spawnBullet({
      x: 200,
      y: 200,
      angle: 0,
      speed: 60,
      split: { delay: 0.2, count: 6, speed: 90 },
    });
    step(world, 0.3);
    expect(world.bullets.count).toBeGreaterThanOrEqual(5);
  });

  it('completes when the stage reports completion', () => {
    const { world, stage } = makeWorld();
    step(world, 0.1);
    expect(world.status).toBe('playing');
    stage.complete = true;
    step(world, 1 / 60);
    expect(world.status).toBe('complete');
  });

  it('stops simulating after the run ends', () => {
    const { world, stage } = makeWorld();
    stage.complete = true;
    step(world, 1 / 60);
    const time = world.time;
    step(world, 1);
    expect(world.time).toBe(time);
  });

  it('reports boss hp through the HUD getters', () => {
    const { world } = makeWorld();
    const boss = world.spawnEnemy({
      x: 225,
      y: 200,
      kind: 'boss',
      hp: 1000,
      radius: 42,
      score: 1000,
    });
    if (!boss) throw new Error('boss spawn failed');
    world.setBoss(boss, 'テストボス');
    expect(world.bossHp).toBe(1000);
    expect(world.bossMaxHp).toBe(1000);
    expect(world.bossName).toBe('テストボス');
    boss.hp = 400;
    expect(world.bossHp).toBe(400);
    world.setBoss(null, '');
    expect(world.bossHp).toBe(0);
  });

  it('exposes events through takeEffects and clears them', () => {
    const { world } = makeWorld();
    world.spawnEffect('graze', 10, 10);
    const effects = world.takeEffects();
    expect(effects.length).toBeGreaterThan(0);
    expect(world.takeEffects()).toHaveLength(0);
  });

  it('keeps the player inside the field after a huge drag', () => {
    const { world } = makeWorld();
    world.setPlayerTarget(-1000, -1000);
    step(world, 2);
    expect(world.player.x).toBeGreaterThanOrEqual(0);
    expect(world.player.y).toBeGreaterThanOrEqual(HUD_H);
    expect(world.player.y).toBeLessThanOrEqual(FIELD_H);
  });
});
