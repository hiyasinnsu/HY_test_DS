import { clamp } from '../../core/math';
import { FIELD_W } from '../constants';
import type { Enemy, StageContext, StageController } from '../types';
import {
  BOSS_NAME,
  BossRuntime,
  createBossSpec,
  PHASE_COUNT,
  PHASE_NAMES,
  PHASE_THRESHOLDS,
} from './boss';
import { fairySpec, midbossSpec, spinnerSpec, turretSpec } from './enemies';
import type { FairyOptions, SpinnerOptions, TurretOptions } from './enemies';

export const STAGE_NAME = 'ステージ 1 — 星屑回廊';

/** Timeline: waves for ~66s, a 3s WARNING, then the boss at ~70s. */
export const BOSS_WARNING_AT = 66.8;
export const BOSS_SPAWN_AT = BOSS_WARNING_AT + 3;

/** Seconds after the boss dies before the stage reports completion. */
export const BOSS_DEFEAT_DELAY = 3;

/** Nominal full length used to map progress onto 0..1. */
const STAGE_LENGTH = 112;

interface SpawnEvent {
  readonly at: number;
  readonly spawn: (ctx: StageContext) => void;
}

/**
 * Wave legend (13 groups, enemy spawns never more than 1.5s apart):
 *  W1  星屑のヴェール      V-formation fairies drifting apart
 *  W2  流れ星の横隊        fairies crossing from both sides
 *  W3  星灯の砲台          aimed three-way turrets
 *  W4  天の川のカーテン    curtain walls with a sliding gap
 *  W5  回転する星          spinners with rotating rings
 *  W6  流星のラッシュ      sine-wave rush of eight fairies
 *  W7  中ボス・星霊の門番  fat turret: spiral + aimed rings
 *  W8  星の溜まり場        breather: falling point items
 *  W9  星灯の再点火        turret / curtain mix
 *  W10 双星のワルツ        spinner pair
 *  W11 天の川の押し合い    curtain push
 *  W12 流星群の再来        second sine rush
 *  W13 星屑の終曲          mixed finale, then WARNING
 */
function buildTimeline(): SpawnEvent[] {
  const events: SpawnEvent[] = [];
  const add = (at: number, spawn: (ctx: StageContext) => void): void => {
    events.push({ at, spawn });
  };
  const fairy = (at: number, x: number, extra: Partial<FairyOptions> = {}): void => {
    add(at, (ctx) => {
      ctx.spawnEnemy(fairySpec(ctx.difficulty, { x, ...extra }));
    });
  };
  const fairyGroup = (at: number, xs: readonly number[], extra: Partial<FairyOptions> = {}): void => {
    add(at, (ctx) => {
      for (const x of xs) ctx.spawnEnemy(fairySpec(ctx.difficulty, { x, ...extra }));
    });
  };
  const turret = (at: number, x: number, extra: Partial<TurretOptions> = {}): void => {
    add(at, (ctx) => {
      ctx.spawnEnemy(turretSpec(ctx.difficulty, { x, ...extra }));
    });
  };
  const spinner = (at: number, x: number, extra: Partial<SpinnerOptions> = {}): void => {
    add(at, (ctx) => {
      ctx.spawnEnemy(spinnerSpec(ctx.difficulty, { x, ...extra }));
    });
  };

  // W1 星屑のヴェール — the V opens as the fairies drift outward.
  for (let i = 0; i < 5; i += 1) {
    const offset = (i - 2) * 62;
    fairy(i * 0.35, FIELD_W / 2 + offset, {
      y: -40 - Math.abs(offset) * 0.3,
      drift: -offset * 0.32,
      fallSpeed: 118,
      fireInterval: 2.4,
      fireDelay: 0.9,
      fireCount: 3,
      spread: 0.5,
      bulletSpeed: 96,
    });
  }

  // W2 流れ星の横隊 — one fairy from each side.
  fairy(2.6, -30, {
    drift: 118,
    fallSpeed: 86,
    fireInterval: 2.6,
    fireDelay: 1.1,
    fireCount: 3,
    spread: 0.45,
    bulletSpeed: 104,
  });
  fairy(3.2, FIELD_W + 30, {
    drift: -118,
    fallSpeed: 86,
    fireInterval: 2.6,
    fireDelay: 1.1,
    fireCount: 3,
    spread: 0.45,
    bulletSpeed: 104,
    color: 'blue',
  });

  // W3 星灯の砲台 — two aimed three-way turrets.
  turret(4.7, 110, { fireInterval: 1.6, fireDelay: 1, fireCount: 3, spread: 0.5 });
  turret(5.9, 340, { fireInterval: 1.6, fireDelay: 1, fireCount: 3, spread: 0.5, color: 'pink' });

  // W4 天の川のカーテン — a curtain weaver plus covering fire.
  turret(7.3, 150, { curtainWall: true, fireInterval: 1.9, fireDelay: 1.2 });
  turret(8.5, 300, { fireInterval: 1.6, fireDelay: 0.9 });

  // W5 回転する星 — two spinners.
  spinner(9.9, 140);
  spinner(11.1, 310, { rotate: -0.34 });

  // W6 流星のラッシュ — eight fairies on individual sine paths.
  for (let i = 0; i < 8; i += 1) {
    fairy(12.6 + i * 0.5, 130 + (i % 4) * 62, {
      y: -30 - i * 14,
      fallSpeed: 150,
      sineAmp: 52,
      sineFreq: 2.2 + i * 0.06,
      hp: 8,
      fireInterval: 2.8,
      fireDelay: 1.2,
      fireCount: 1,
      bulletSpeed: 110,
    });
  }

  // W7 中ボス・星霊の門番 — escorted gatekeeper.
  add(17.6, (ctx) => {
    ctx.spawnEnemy(midbossSpec(ctx.difficulty));
  });
  for (let i = 0; i < 8; i += 1) {
    const fromLeft = i % 2 === 0;
    fairy(19.1 + i * 1.5, fromLeft ? -30 : FIELD_W + 30, {
      drift: fromLeft ? 104 : -104,
      fallSpeed: 70,
      fireInterval: 2.6,
      fireDelay: 1,
      fireCount: 1,
      bulletSpeed: 104,
      color: 'white',
    });
  }

  // W8 星の溜まり場 — breather: a point-item shower and three carriers.
  add(30.9, (ctx) => {
    for (let i = 0; i < 12; i += 1) {
      ctx.spawnItem({ kind: 'point', x: 45 + i * 32, y: -12 - (i % 3) * 24, count: 1 });
    }
  });
  for (let i = 0; i < 3; i += 1) {
    fairy(31 + i * 1.4, 120 + i * 105, {
      fireInterval: 0,
      fallSpeed: 88,
      hp: 6,
      pointDrops: 2,
      color: 'white',
    });
  }

  // W9 星灯の再点火 — turrets and a curtain.
  turret(35.2, 150, { curtainWall: true, fireInterval: 1.8, fireDelay: 0.9 });
  turret(36.6, 320, { fireInterval: 1.5 });
  turret(38, FIELD_W / 2, { fireInterval: 1.7, fireCount: 5, spread: 0.8 });

  // W10 双星のワルツ — spinner pair, opposite rotation.
  spinner(39.4, 130);
  spinner(40.8, 320, { rotate: -0.34 });

  // W11 天の川の押し合い — staggered curtain walls.
  turret(42.2, FIELD_W / 2, { curtainWall: true, fireInterval: 2.1, fireDelay: 1 });
  turret(43.6, 90, { curtainWall: true, fireInterval: 2.1, fireDelay: 0.8 });
  turret(45, 360, { fireInterval: 1.5, color: 'yellow' });

  // W12 流星群の再来 — second sine rush.
  for (let i = 0; i < 8; i += 1) {
    fairy(46.4 + i * 0.5, 300 - (i % 4) * 62, {
      y: -30 - i * 14,
      fallSpeed: 155,
      sineAmp: 58,
      sineFreq: 2.4 + i * 0.06,
      hp: 8,
      fireInterval: 2.6,
      fireDelay: 1.1,
      fireCount: 1,
      bulletSpeed: 112,
      color: 'purple',
    });
  }

  // W13 星屑の終曲 — mixed finale before the WARNING.
  spinner(51.3, 140);
  spinner(52.7, 310, { rotate: -0.34 });
  turret(54.1, FIELD_W / 2, { fireInterval: 1.6, fireCount: 5, spread: 0.9 });
  turret(55.5, 120, { curtainWall: true, fireInterval: 1.9, fireDelay: 0.9 });
  fairyGroup(56.9, [-70, 0, 70].map((dx) => FIELD_W / 2 + dx), {
    fireInterval: 2.2,
    fireDelay: 0.8,
    fireCount: 3,
    spread: 0.4,
    bulletSpeed: 108,
  });
  turret(58.3, 360, { fireInterval: 1.5 });
  turret(59.7, FIELD_W / 2, { curtainWall: true, fireInterval: 2, fireDelay: 0.8 });
  fairyGroup(61.1, [90, 360], { fireInterval: 2.3, fireDelay: 1, color: 'yellow' });
  turret(62.5, 140, { fireInterval: 1.6 });
  spinner(63.9, 300, { rotate: -0.34 });
  fairyGroup(65.3, [FIELD_W / 2 - 90, FIELD_W / 2, FIELD_W / 2 + 90], {
    fireInterval: 2.4,
    fireDelay: 0.9,
    fireCount: 3,
    spread: 0.5,
    bulletSpeed: 110,
  });

  return events.sort((a, b) => a.at - b.at);
}

/**
 * Stage 1 controller: data-driven wave timeline plus the five-phase boss.
 * All randomness lives in the boss runtime / pattern RNGs, so the wave order is
 * fully deterministic and the tests can step it safely.
 */
export class Stage1 implements StageController {
  private time = 0;
  private events: readonly SpawnEvent[] = [];
  private cursor = 0;
  private running = false;
  private warningShown = false;
  private bossSpawned = false;
  private boss: Enemy | null = null;
  private bossDefeatedAt: number | null = null;
  private progressValue = 0;
  private bossRuntime = new BossRuntime();

  start(ctx: StageContext): void {
    this.time = 0;
    this.events = buildTimeline();
    this.cursor = 0;
    this.running = true;
    this.warningShown = false;
    this.bossSpawned = false;
    this.boss = null;
    this.bossDefeatedAt = null;
    this.progressValue = 0;
    // Fresh RNG state so a retry plays the exact same spell cards.
    this.bossRuntime = new BossRuntime();
    ctx.setBanner(STAGE_NAME, 2.5);
    ctx.setBoss(null, '');
    ctx.setSpell(null);
  }

  update(ctx: StageContext, dt: number): void {
    if (!this.running) return;
    this.time += dt;

    while (this.cursor < this.events.length && this.events[this.cursor].at <= this.time) {
      this.events[this.cursor].spawn(ctx);
      this.cursor += 1;
    }

    if (!this.warningShown && this.time >= BOSS_WARNING_AT) {
      this.warningShown = true;
      ctx.setBanner('WARNING', 3);
      ctx.spawnEffect('bossWarning', FIELD_W / 2, 220, 3);
    }
    if (!this.bossSpawned && this.time >= BOSS_SPAWN_AT) {
      this.spawnBoss(ctx);
    }
    if (this.boss) this.syncBoss(ctx);

    const target = this.isComplete(ctx) ? 1 : Math.min(0.995, this.time / STAGE_LENGTH);
    if (target > this.progressValue) this.progressValue = target;
  }

  isComplete(_ctx: StageContext): boolean {
    return this.bossDefeatedAt !== null && this.time >= this.bossDefeatedAt + BOSS_DEFEAT_DELAY;
  }

  progress(_ctx: StageContext): number {
    return clamp(this.progressValue, 0, 1);
  }

  private spawnBoss(ctx: StageContext): void {
    const runtime = this.bossRuntime;
    const boss = ctx.spawnEnemy(createBossSpec(ctx.difficulty, runtime));
    if (!boss) return;
    this.bossSpawned = true;
    this.boss = boss;
    runtime.attach();
    ctx.setBoss(boss, BOSS_NAME);
    ctx.setSpell(PHASE_NAMES[0]);
    ctx.spawnEffect('bossPhase', FIELD_W / 2, 120, 3);
  }

  /** Watches HP thresholds and the kill; firing itself lives in BossRuntime. */
  private syncBoss(ctx: StageContext): void {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.active || boss.hp <= 0) {
      this.bossDefeatedAt = this.time;
      this.boss = null;
      ctx.setBoss(null, '');
      ctx.setSpell(null);
      return;
    }
    const runtime = this.bossRuntime;
    if (runtime.phase + 1 >= PHASE_COUNT) return;
    // Lower bound of the current band; also the top of the band that follows.
    const bandTop = boss.maxHp * PHASE_THRESHOLDS[runtime.phase];
    if (boss.hp > bandTop) return;
    // Exactly one card per step. A bomb plus focused shots can cross several
    // thresholds in one frame, so the spilled damage is dropped here and the
    // leftover HP is clamped to the top of the new band: the next card can
    // never be skipped and no threshold is re-triggered on the next update.
    boss.hp = bandTop;
    runtime.enterPhase(runtime.phase + 1);
    ctx.setSpell(PHASE_NAMES[runtime.phase]);
    ctx.spawnEffect('bossPhase', boss.x, Math.max(120, boss.y), 3);
  }
}

export function createStage1(): StageController {
  return new Stage1();
}
