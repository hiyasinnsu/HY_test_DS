import { describe, expect, it } from 'vitest';
import { createStage1 } from '../src/game/stage';
import { World } from '../src/game/world';

const STEP = 1 / 60;

interface RunStats {
  maxBullets: number;
  maxEnemies: number;
  maxItems: number;
  maxLasers: number;
  bossSeen: boolean;
  spells: Set<string>;
  elapsed: number;
  status: World['status'];
  score: number;
  graze: number;
}

/**
 * Drives the real stage through the real simulation headlessly. The player is
 * kept invulnerable so the scripted stage always reaches its end even without a
 * dodging player; that isolates stage/content bugs from difficulty.
 */
function runStage(difficulty: 'easy' | 'normal' | 'hard', maxSeconds: number): RunStats {
  const world = new World({ difficulty, stage: createStage1(), seed: 1234 });
  const stats: RunStats = {
    maxBullets: 0,
    maxEnemies: 0,
    maxItems: 0,
    maxLasers: 0,
    bossSeen: false,
    spells: new Set<string>(),
    elapsed: 0,
    status: 'playing',
    score: 0,
    graze: 0,
  };

  const steps = Math.ceil(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const t = i * STEP;
    // Sweep the ship horizontally so shots, grazes and item pickups all happen.
    world.setPlayerTarget(225 + Math.sin(t * 0.9) * 150, 700);
    world.player.invuln = 2;

    world.update(STEP);
    world.takeEffects();

    stats.maxBullets = Math.max(stats.maxBullets, world.bullets.count);
    stats.maxEnemies = Math.max(stats.maxEnemies, world.enemies.count);
    stats.maxItems = Math.max(stats.maxItems, world.items.count);
    stats.maxLasers = Math.max(stats.maxLasers, world.lasers.count);
    if (world.boss) stats.bossSeen = true;
    if (world.spellName) stats.spells.add(world.spellName);
    stats.elapsed = t;

    if (world.status !== 'playing') break;
  }

  stats.status = world.status;
  stats.score = world.score;
  stats.graze = world.graze;
  return stats;
}

describe('stage 1 integration', () => {
  it('runs from the first wave to stage clear without errors', () => {
    const stats = runStage('normal', 200);

    expect(stats.status).toBe('complete');
    expect(stats.bossSeen).toBe(true);
    expect(stats.elapsed).toBeGreaterThan(60);
    expect(stats.elapsed).toBeLessThan(200);
    expect(stats.score).toBeGreaterThan(1000);
  }, 30000);

  it('introduces every boss spell card exactly once per phase', () => {
    const stats = runStage('normal', 200);
    expect(stats.spells.size).toBe(5);
  }, 30000);

  it('keeps entity counts inside the pool budgets', () => {
    const stats = runStage('normal', 200);
    expect(stats.maxBullets).toBeLessThanOrEqual(2400);
    // A readable danmaku screen stays well under the pool ceiling.
    expect(stats.maxBullets).toBeLessThan(1600);
    expect(stats.maxEnemies).toBeLessThanOrEqual(48);
    expect(stats.maxItems).toBeLessThanOrEqual(260);
    expect(stats.maxLasers).toBeLessThanOrEqual(16);
  }, 30000);

  it('runs on easy and hard with the same clear condition', () => {
    const easy = runStage('easy', 200);
    const hard = runStage('hard', 200);
    expect(easy.status).toBe('complete');
    expect(hard.status).toBe('complete');
  }, 60000);
});
