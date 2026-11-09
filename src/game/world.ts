import { angleTo, clamp } from '../core/math';
import { Pool } from '../core/pool';
import { Rng } from '../core/rng';
import {
  BOMB_DAMAGE_PER_SECOND,
  BOMB_DURATION,
  BOMB_INVULN,
  BULLET_CAPACITY,
  BULLET_MARGIN,
  BULLET_RADIUS,
  DIFFICULTIES,
  ENEMY_CAPACITY,
  FIELD_H,
  FIELD_W,
  HUD_H,
  ITEM_CAPACITY,
  LASER_CAPACITY,
  MAX_BOMBS,
  MAX_LIVES,
  MAX_POWER,
  PLAYER,
  PLAYER_SHOT_CAPACITY,
  SCORE,
} from './constants';
import type {
  Bullet,
  BulletKind,
  BulletSpec,
  Difficulty,
  DifficultyConfig,
  EffectEvent,
  EffectKind,
  Enemy,
  EnemySpec,
  EnemyUpdateContext,
  Item,
  ItemSpec,
  Laser,
  LaserSpec,
  PlayerShot,
  PlayerState,
  StageContext,
  StageController,
} from './types';

export type WorldStatus = 'playing' | 'gameover' | 'complete';

export interface WorldOptions {
  readonly difficulty: Difficulty;
  readonly stage: StageController;
  readonly seed?: number;
}

function createBullet(): Bullet {
  return {
    active: false,
    x: 0,
    y: 0,
    angle: 0,
    speed: 0,
    vx: 0,
    vy: 0,
    accel: 0,
    angularVel: 0,
    spin: 0,
    rotation: 0,
    radius: 4,
    kind: 'orb',
    color: 'red',
    age: 0,
    life: Number.POSITIVE_INFINITY,
    grazed: false,
    minSpeed: 0,
    cancellable: true,
    split: null,
    splitDone: false,
  };
}

function createShot(): PlayerShot {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 3.4, damage: 1, scale: 1 };
}

function createEnemy(): Enemy {
  return {
    active: false,
    id: 0,
    kind: 'fairy',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    radius: 14,
    score: 0,
    age: 0,
    hitFlash: 0,
    spin: 0,
    rotation: 0,
    items: [],
    update: null,
    onDeath: null,
    bombFlash: 0,
  };
}

function createItem(): Item {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'point', age: 0, magnet: false };
}

function createLaser(): Laser {
  return {
    active: false,
    x: 0,
    y: 0,
    angle: 0,
    length: FIELD_H * 1.4,
    width: 18,
    spin: 0,
    warmup: 1,
    duration: 2,
    age: 0,
    phase: 'warmup',
    color: 'cyan',
    follow: null,
    repeatHit: false,
    hitCooldown: 0,
  };
}

const PLAYER_SHOT_SPEED = 980;
const BULLET_SCORE_ON_CANCEL = 5;
const ITEM_MAGNET_TRIGGER_Y = HUD_H + 78;

interface ShotPattern {
  readonly dx: number;
  readonly angleOffset: number;
  readonly damage: number;
  readonly scale: number;
}

/** Extra shots unlocked per power level; level 0 fires the two basics only. */
const POWER_SHOTS: readonly (readonly ShotPattern[])[] = [
  [],
  [
    { dx: -13, angleOffset: -0.07, damage: 0.95, scale: 0.95 },
    { dx: 13, angleOffset: 0.07, damage: 0.95, scale: 0.95 },
  ],
  [
    { dx: -13, angleOffset: -0.07, damage: 0.95, scale: 0.95 },
    { dx: 13, angleOffset: 0.07, damage: 0.95, scale: 0.95 },
    { dx: -21, angleOffset: -0.2, damage: 0.8, scale: 0.9 },
    { dx: 21, angleOffset: 0.2, damage: 0.8, scale: 0.9 },
  ],
  [
    { dx: -13, angleOffset: -0.07, damage: 0.95, scale: 0.95 },
    { dx: 13, angleOffset: 0.07, damage: 0.95, scale: 0.95 },
    { dx: -21, angleOffset: -0.2, damage: 0.8, scale: 0.9 },
    { dx: 21, angleOffset: 0.2, damage: 0.8, scale: 0.9 },
    { dx: 0, angleOffset: 0, damage: 1.5, scale: 1.35 },
  ],
  [
    { dx: -13, angleOffset: -0.07, damage: 0.95, scale: 0.95 },
    { dx: 13, angleOffset: 0.07, damage: 0.95, scale: 0.95 },
    { dx: -21, angleOffset: -0.22, damage: 0.85, scale: 0.9 },
    { dx: 21, angleOffset: 0.22, damage: 0.85, scale: 0.9 },
    { dx: 0, angleOffset: 0, damage: 1.5, scale: 1.35 },
    { dx: -30, angleOffset: -0.42, damage: 0.7, scale: 0.85 },
    { dx: 30, angleOffset: 0.42, damage: 0.7, scale: 0.85 },
  ],
];

/**
 * The whole bullet-hell simulation: player, enemies, bullets, lasers, items,
 * scoring and the stage script that drives them.
 *
 * Deliberately free of DOM access so it can be stepped headlessly in tests at a
 * fixed rate regardless of the display refresh rate.
 */
export class World implements StageContext, EnemyUpdateContext {
  readonly difficulty: DifficultyConfig;
  readonly stage: StageController;
  readonly rng: Rng;
  readonly player: PlayerState = {
    x: PLAYER.startX,
    y: PLAYER.startY,
    radius: PLAYER.radius,
    grazeRadius: PLAYER.grazeRadius,
    alive: true,
    invuln: 0,
    focused: false,
    power: 0,
    shotCooldown: 0,
    bank: 0,
    deathTimer: 0,
  };

  readonly bullets = new Pool<Bullet>(BULLET_CAPACITY, createBullet, (b) => {
    b.split = null;
    b.splitDone = false;
  });
  readonly shots = new Pool<PlayerShot>(PLAYER_SHOT_CAPACITY, createShot, () => {});
  readonly enemies = new Pool<Enemy>(ENEMY_CAPACITY, createEnemy, () => {});
  readonly items = new Pool<Item>(ITEM_CAPACITY, createItem, () => {});
  readonly lasers = new Pool<Laser>(LASER_CAPACITY, createLaser, () => {});

  score = 0;
  graze = 0;
  lives: number;
  bombs: number;
  power = 0;
  status: WorldStatus = 'playing';

  time = 0;
  stageTime = 0;

  boss: Enemy | null = null;
  bossName = '';
  spellName: string | null = null;
  banner: string | null = null;
  bannerTimer = 0;

  private targetX = PLAYER.startX;
  private targetY = PLAYER.startY;
  private bombTimer = 0;
  private enemyIdSeq = 1;
  private effects: EffectEvent[] = [];

  constructor(options: WorldOptions) {
    this.difficulty = DIFFICULTIES[options.difficulty];
    this.stage = options.stage;
    this.rng = new Rng(options.seed ?? 0x5eed1234);
    this.lives = Math.min(MAX_LIVES, this.difficulty.lives);
    this.bombs = Math.min(MAX_BOMBS, this.difficulty.bombs);
    this.stage.start(this);
  }

  get bombing(): boolean {
    return this.bombTimer > 0;
  }

  get bombTime(): number {
    return this.bombTimer;
  }

  get stageProgress(): number {
    return this.stage.progress(this);
  }

  get bossMaxHp(): number {
    return this.boss ? this.boss.maxHp : 0;
  }

  get bossHp(): number {
    return this.boss ? Math.max(0, this.boss.hp) : 0;
  }

  /** Movement target in playfield units, set by touch or keyboard input. */
  setPlayerTarget(x: number, y: number): void {
    this.targetX = clamp(x, PLAYER.radius + 6, FIELD_W - PLAYER.radius - 6);
    this.targetY = clamp(y, HUD_H + 10, FIELD_H - PLAYER.radius - 6);
  }

  setFocus(focused: boolean): void {
    this.player.focused = focused;
  }

  useBomb(): boolean {
    if (this.status !== 'playing' || this.bombs <= 0 || this.bombTimer > 0) return false;
    this.bombs -= 1;
    this.bombTimer = BOMB_DURATION;
    this.player.invuln = Math.max(this.player.invuln, BOMB_INVULN);
    this.cancelCancellableBullets();
    this.spawnEffect('bomb', this.player.x, this.player.y, 3);
    return true;
  }

  update(dt: number): void {
    if (this.status !== 'playing') return;

    this.time += dt;
    this.stageTime += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }

    this.stage.update(this, dt);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateBullets(dt);
    this.updateLasers(dt);
    this.updateItems(dt);
    this.updateBomb(dt);
    this.collectCollisions();

    if (this.stage.isComplete(this)) this.status = 'complete';
  }

  /** Returns the events accumulated since the last call and clears the queue. */
  takeEffects(): EffectEvent[] {
    const events = this.effects;
    this.effects = [];
    return events;
  }

  // ---------------------------------------------------------------- context API

  spawnBullet(spec: BulletSpec): void {
    const bullet = this.bullets.acquire();
    if (!bullet) return;
    const kind: BulletKind = spec.kind ?? 'orb';
    bullet.x = spec.x;
    bullet.y = spec.y;
    bullet.angle = spec.angle;
    bullet.speed = spec.speed;
    bullet.vx = Math.cos(spec.angle) * spec.speed;
    bullet.vy = Math.sin(spec.angle) * spec.speed;
    bullet.accel = spec.accel ?? 0;
    bullet.angularVel = spec.angularVel ?? 0;
    bullet.spin = spec.spin ?? 0;
    bullet.rotation = spec.angle;
    bullet.kind = kind;
    bullet.color = spec.color ?? 'red';
    bullet.radius = spec.radius ?? BULLET_RADIUS[kind];
    bullet.age = 0;
    bullet.life = spec.life ?? Number.POSITIVE_INFINITY;
    bullet.grazed = false;
    bullet.minSpeed = spec.minSpeed ?? 0;
    bullet.cancellable = spec.cancellable ?? true;
    bullet.split = spec.split ?? null;
    bullet.splitDone = false;
  }

  spawnLaser(spec: LaserSpec): void {
    const laser = this.lasers.acquire();
    if (!laser) return;
    laser.x = spec.x;
    laser.y = spec.y;
    laser.angle = spec.angle;
    laser.length = spec.length ?? FIELD_H * 1.4;
    laser.width = spec.width;
    laser.spin = spec.spin ?? 0;
    laser.warmup = spec.warmup;
    laser.duration = spec.duration;
    laser.age = 0;
    laser.phase = 'warmup';
    laser.color = spec.color ?? 'cyan';
    laser.follow = spec.follow ?? null;
    laser.repeatHit = spec.repeatHit ?? false;
    laser.hitCooldown = 0;
    this.spawnEffect('laserCharge', laser.x, laser.y, 1);
  }

  spawnItem(spec: ItemSpec): void {
    const count = Math.max(1, spec.count ?? 1);
    const spread = spec.spread ?? 26;
    for (let i = 0; i < count; i += 1) {
      const item = this.items.acquire();
      if (!item) return;
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      item.x = spec.x + t * spread;
      item.y = spec.y;
      item.vx = t * 60;
      item.vy = 52 + Math.abs(t) * 18;
      item.kind = spec.kind;
      item.age = 0;
      item.magnet = false;
    }
  }

  spawnEnemy(spec: EnemySpec): Enemy | null {
    const enemy = this.enemies.acquire();
    if (!enemy) return null;
    enemy.id = this.enemyIdSeq++;
    enemy.kind = spec.kind;
    enemy.x = spec.x;
    enemy.y = spec.y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.hp = spec.hp;
    enemy.maxHp = spec.hp;
    enemy.radius = spec.radius;
    enemy.score = spec.score;
    enemy.age = 0;
    enemy.hitFlash = 0;
    enemy.spin = spec.spin ?? 0;
    enemy.rotation = 0;
    enemy.items = spec.items ?? [];
    enemy.update = spec.update ?? null;
    enemy.onDeath = spec.onDeath ?? null;
    enemy.bombFlash = 0;
    return enemy;
  }

  spawnEffect(kind: EffectKind, x: number, y: number, power = 1): void {
    if (this.effects.length > 240) return;
    this.effects.push({ kind, x, y, power });
  }

  aimAtPlayer(x: number, y: number): number {
    return angleTo(x, y, this.player.x, this.player.y);
  }

  setBoss(enemy: Enemy | null, name: string): void {
    this.boss = enemy;
    this.bossName = name;
    if (!enemy) this.spellName = null;
  }

  setSpell(name: string | null): void {
    const previous = this.spellName;
    this.spellName = name;
    // A new spell name means the boss advanced to its next attack. Clearing the
    // screen keeps the transition fair: the previous pattern's bullets cannot
    // overlap the opening volley of the next one.
    if (name !== null && previous !== null && name !== previous) {
      this.cancelCancellableBullets();
      this.spawnEffect('cancel', FIELD_W / 2, FIELD_H * 0.4, 2);
    }
  }

  setBanner(text: string | null, seconds = 2.4): void {
    this.banner = text;
    this.bannerTimer = text ? seconds : 0;
  }

  // ------------------------------------------------------------------ internals

  private updatePlayer(dt: number): void {
    const player = this.player;
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);

    const speed = player.focused ? PLAYER.focusSpeed : PLAYER.speed;
    const dx = this.targetX - player.x;
    const dy = this.targetY - player.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = speed * dt;
    if (dist <= maxStep) {
      player.x = this.targetX;
      player.y = this.targetY;
    } else if (dist > 0.0001) {
      player.x += (dx / dist) * maxStep;
      player.y += (dy / dist) * maxStep;
    }
    player.bank = clamp(dx / 40, -1, 1);

    if (!player.alive) return;

    player.shotCooldown -= dt;
    if (player.shotCooldown <= 0) {
      player.shotCooldown += PLAYER.shotInterval;
      this.firePlayerShots();
    }
  }

  private firePlayerShots(): void {
    const player = this.player;
    const level = clamp(Math.floor(this.power), 0, MAX_POWER);
    const patterns = POWER_SHOTS[level] ?? [];
    const fire = (dx: number, angleOffset: number, damage: number, scale: number): void => {
      const shot = this.shots.acquire();
      if (!shot) return;
      const angle = -Math.PI / 2 + angleOffset;
      shot.x = player.x + dx;
      shot.y = player.y - 12;
      shot.vx = Math.cos(angle) * PLAYER_SHOT_SPEED;
      shot.vy = Math.sin(angle) * PLAYER_SHOT_SPEED;
      shot.radius = 4 * scale;
      shot.damage = PLAYER.shotDamage * damage;
      shot.scale = scale;
    };

    fire(-5, 0, 1, 1);
    fire(5, 0, 1, 1);
    for (const extra of patterns) fire(extra.dx, extra.angleOffset, extra.damage, extra.scale);
    this.spawnEffect('shot', player.x, player.y - 16, 0.5);
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.count - 1; i >= 0; i -= 1) {
      const enemy = this.enemies.items[i] as Enemy;
      enemy.age += dt;
      if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      if (enemy.bombFlash > 0) enemy.bombFlash = Math.max(0, enemy.bombFlash - dt);
      if (enemy.update) enemy.update(enemy, this, dt);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.rotation += enemy.spin * dt;

      if (enemy.hp <= 0) {
        this.killEnemy(enemy, i);
        continue;
      }
      const offscreen = enemy.y > FIELD_H + 90 || enemy.x < -140 || enemy.x > FIELD_W + 140;
      if (offscreen && enemy.kind !== 'boss') {
        if (enemy === this.boss) this.setBoss(null, '');
        this.enemies.releaseAt(i);
      }
    }
  }

  private killEnemy(enemy: Enemy, index: number): void {
    if (enemy.onDeath) enemy.onDeath(enemy, this);
    for (const item of enemy.items) {
      this.spawnItem({ ...item, x: enemy.x, y: enemy.y });
    }
    const isBoss = enemy === this.boss;
    this.addScore(enemy.score);
    this.spawnEffect('enemyKilled', enemy.x, enemy.y, isBoss ? 4 : enemy.kind === 'fairy' ? 1 : 2);
    if (isBoss) {
      this.addScore(SCORE.bossKill);
      this.setBoss(null, '');
    }
    this.enemies.releaseAt(index);
  }

  private updateShots(dt: number): void {
    const enemies = this.enemies;
    for (let i = this.shots.count - 1; i >= 0; i -= 1) {
      const shot = this.shots.items[i] as PlayerShot;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.y < HUD_H - 40 || shot.x < -20 || shot.x > FIELD_W + 20) {
        this.shots.releaseAt(i);
        continue;
      }

      for (let e = 0; e < enemies.count; e += 1) {
        const enemy = enemies.items[e] as Enemy;
        const dx = enemy.x - shot.x;
        const dy = enemy.y - shot.y;
        const reach = enemy.radius + shot.radius;
        if (dx * dx + dy * dy > reach * reach) continue;
        enemy.hp -= shot.damage;
        enemy.hitFlash = 0.09;
        this.spawnEffect('enemyHit', shot.x, shot.y - 6, 0.5);
        this.shots.releaseAt(i);
        break;
      }
    }
  }

  private updateBullets(dt: number): void {
    const bullets = this.bullets;
    for (let i = bullets.count - 1; i >= 0; i -= 1) {
      const bullet = bullets.items[i] as Bullet;
      bullet.age += dt;
      if (bullet.split && !bullet.splitDone && bullet.age >= bullet.split.delay) {
        this.burstBullet(bullet);
        bullets.releaseAt(i);
        continue;
      }
      if (bullet.angularVel !== 0) bullet.angle += bullet.angularVel * dt;
      if (bullet.accel !== 0) {
        bullet.speed = Math.max(bullet.minSpeed, bullet.speed + bullet.accel * dt);
      }
      bullet.rotation += bullet.spin * dt;
      bullet.vx = Math.cos(bullet.angle) * bullet.speed;
      bullet.vy = Math.sin(bullet.angle) * bullet.speed;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      const expired = bullet.age >= bullet.life;
      const outside =
        bullet.x < -BULLET_MARGIN ||
        bullet.x > FIELD_W + BULLET_MARGIN ||
        bullet.y < -BULLET_MARGIN ||
        bullet.y > FIELD_H + BULLET_MARGIN;
      if (expired || outside) bullets.releaseAt(i);
    }
  }

  private burstBullet(bullet: Bullet): void {
    const split = bullet.split;
    if (!split) return;
    bullet.splitDone = true;
    const count = Math.max(1, Math.round(split.count * this.difficulty.bulletCount));
    const spread = split.spread ?? Math.PI * 2;
    const base = split.spread === undefined ? bullet.angle : bullet.angle - spread / 2;
    const step = count === 1 ? 0 : spread / (count - 1);
    for (let i = 0; i < count; i += 1) {
      this.spawnBullet({
        x: bullet.x,
        y: bullet.y,
        angle: count === 1 ? bullet.angle : base + step * i,
        speed: split.speed * this.difficulty.bulletSpeed,
        kind: split.kind ?? bullet.kind,
        color: split.color ?? bullet.color,
        radius: bullet.radius * 0.82,
      });
    }
    this.spawnEffect('cancel', bullet.x, bullet.y, 0.8);
  }

  private updateLasers(dt: number): void {
    for (let i = this.lasers.count - 1; i >= 0; i -= 1) {
      const laser = this.lasers.items[i] as Laser;
      laser.age += dt;
      if (laser.hitCooldown > 0 && Number.isFinite(laser.hitCooldown)) {
        laser.hitCooldown = Math.max(0, laser.hitCooldown - dt);
      }
      if (laser.follow && laser.follow.active) {
        laser.x = laser.follow.x;
        laser.y = laser.follow.y;
      }
      laser.angle += laser.spin * dt;
      const total = laser.warmup + laser.duration;
      if (laser.age < laser.warmup) laser.phase = 'warmup';
      else if (laser.age < total) laser.phase = 'firing';
      else laser.phase = 'fading';

      if (laser.phase === 'fading' && laser.age > total + 0.3) {
        this.lasers.releaseAt(i);
        continue;
      }

      if (laser.phase !== 'firing' || !this.player.alive || this.player.invuln > 0) continue;
      if (laser.hitCooldown > 0) continue;
      const ex = laser.x + Math.cos(laser.angle) * laser.length;
      const ey = laser.y + Math.sin(laser.angle) * laser.length;
      const abx = ex - laser.x;
      const aby = ey - laser.y;
      const apx = this.player.x - laser.x;
      const apy = this.player.y - laser.y;
      const lengthSq = abx * abx + aby * aby;
      const t = lengthSq === 0 ? 0 : clamp((apx * abx + apy * aby) / lengthSq, 0, 1);
      const dx = this.player.x - (laser.x + abx * t);
      const dy = this.player.y - (laser.y + aby * t);
      const reach = laser.width / 2 + this.player.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        this.hitPlayer();
        laser.hitCooldown = laser.repeatHit ? 0.16 : Number.POSITIVE_INFINITY;
      }
    }
  }

  private updateItems(dt: number): void {
    const magnetAll = this.player.y < ITEM_MAGNET_TRIGGER_Y || this.bombTimer > 0;
    for (let i = this.items.count - 1; i >= 0; i -= 1) {
      const item = this.items.items[i] as Item;
      item.age += dt;
      if (magnetAll) item.magnet = true;
      if (item.magnet) {
        const dx = this.player.x - item.x;
        const dy = this.player.y - item.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = 620;
        item.vx += (dx / dist) * pull * dt;
        item.vy += (dy / dist) * pull * dt;
        const speed = Math.hypot(item.vx, item.vy);
        if (speed > 760) {
          item.vx = (item.vx / speed) * 760;
          item.vy = (item.vy / speed) * 760;
        }
      } else {
        item.vy = Math.min(item.vy + 60 * dt, 120);
      }
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      if (item.y > FIELD_H + 40) {
        this.items.releaseAt(i);
        continue;
      }
      const dx = this.player.x - item.x;
      const dy = this.player.y - item.y;
      const reach = this.player.radius + 20;
      if (dx * dx + dy * dy <= reach * reach && this.player.alive) {
        this.collectItem(item);
        this.items.releaseAt(i);
      }
    }
  }

  private collectItem(item: Item): void {
    this.spawnEffect('itemGet', item.x, item.y, item.kind === 'bigPower' ? 1.5 : 0.7);
    if (item.kind === 'point') {
      this.addScore(SCORE.pointItem);
      return;
    }
    this.addScore(SCORE.powerItem);
    this.power = Math.min(MAX_POWER, this.power + (item.kind === 'bigPower' ? 1 : 0.34));
    this.player.power = this.power;
  }

  private updateBomb(dt: number): void {
    if (this.bombTimer <= 0) return;
    this.bombTimer = Math.max(0, this.bombTimer - dt);
    const damage = BOMB_DAMAGE_PER_SECOND * dt;
    for (let i = 0; i < this.enemies.count; i += 1) {
      const enemy = this.enemies.items[i] as Enemy;
      enemy.hp -= enemy.kind === 'boss' ? damage * 0.6 : damage;
      enemy.bombFlash = 0.1;
    }
    // Bullets fired during the bomb are cancelled as well, so a bomb always
    // reads as a full safe window instead of a partial shield.
    if (this.rng.chance(0.5)) this.cancelCancellableBullets();
  }

  private collectCollisions(): void {
    const player = this.player;
    if (!player.alive) return;

    for (let i = this.bullets.count - 1; i >= 0; i -= 1) {
      const bullet = this.bullets.items[i] as Bullet;
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const distSq = dx * dx + dy * dy;
      if (!bullet.grazed) {
        const grazeReach = player.grazeRadius + bullet.radius * 0.5;
        if (distSq <= grazeReach * grazeReach) {
          bullet.grazed = true;
          this.graze += 1;
          this.addScore(SCORE.graze);
          this.spawnEffect('graze', player.x, player.y, 0.5);
        }
      }
      if (player.invuln > 0) continue;
      const hitReach = player.radius + bullet.radius * 0.85;
      if (distSq <= hitReach * hitReach) this.hitPlayer();
    }
  }

  private hitPlayer(): void {
    const player = this.player;
    if (!player.alive || player.invuln > 0 || this.bombTimer > 0) return;

    this.lives -= 1;
    this.spawnEffect('playerHit', player.x, player.y, 2.5);
    this.cancelCancellableBullets();

    if (this.lives <= 0) {
      this.lives = 0;
      player.alive = false;
      this.status = 'gameover';
      return;
    }

    player.x = PLAYER.startX;
    player.y = PLAYER.startY;
    this.targetX = PLAYER.startX;
    this.targetY = PLAYER.startY;
    player.invuln = PLAYER.respawnInvuln;
    player.shotCooldown = 0.25;
    this.power = Math.max(0, this.power - 1);
    player.power = this.power;
    this.spawnEffect('playerRespawn', player.x, player.y, 2);
  }

  private cancelCancellableBullets(): void {
    for (let i = this.bullets.count - 1; i >= 0; i -= 1) {
      const bullet = this.bullets.items[i] as Bullet;
      if (!bullet.cancellable) continue;
      this.addScore(BULLET_SCORE_ON_CANCEL, false);
      this.bullets.releaseAt(i);
    }
  }

  private addScore(base: number, applyMultiplier = true): void {
    this.score += Math.round(base * (applyMultiplier ? this.difficulty.score : 1));
  }
}
