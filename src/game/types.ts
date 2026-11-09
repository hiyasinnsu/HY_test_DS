/**
 * Shared game contracts. The simulation owns these objects; the renderer and
 * the UI only read them. Everything here is plain data so it can be unit tested
 * without a canvas.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  readonly id: Difficulty;
  readonly label: string;
  /** Multiplier on every bullet's spawn speed. */
  readonly bulletSpeed: number;
  /** Multiplier on bullet counts in patterns (floored, never below 1). */
  readonly bulletCount: number;
  readonly enemyHp: number;
  readonly bossHp: number;
  /** Multiplier on score gained. */
  readonly score: number;
  readonly lives: number;
  readonly bombs: number;
}

export type BulletKind = 'orb' | 'rice' | 'arrow' | 'big' | 'star' | 'bubble';

export type BulletColor =
  | 'red'
  | 'pink'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'white';

export interface BulletSplit {
  /** Seconds after spawn before the bullet bursts. */
  readonly delay: number;
  readonly count: number;
  readonly speed: number;
  /** Total spread in radians; 0 sends every child outward evenly. */
  readonly spread?: number;
  readonly kind?: BulletKind;
  readonly color?: BulletColor;
}

export interface BulletSpec {
  readonly x: number;
  readonly y: number;
  /** Radians; 0 points right, PI/2 points down the screen. */
  readonly angle: number;
  readonly speed: number;
  readonly kind?: BulletKind;
  readonly color?: BulletColor;
  /** Overrides the per-kind collision radius. */
  readonly radius?: number;
  /** Acceleration along the heading, units/s^2 (negative slows down). */
  readonly accel?: number;
  /** Heading change in radians/s (spiral / swirl). */
  readonly angularVel?: number;
  /** Sprite spin in radians/s (cosmetic). */
  readonly spin?: number;
  /** Seconds before automatic despawn. Defaults to off-screen culling only. */
  readonly life?: number;
  /** Ignores the bullet-count difficulty scaling when spawned. */
  readonly split?: BulletSplit;
  /**
   * Minimum speed the bullet may decelerate to before `accel` stops applying.
   * Used by "stop and bloom" patterns.
   */
  readonly minSpeed?: number;
  /** When true the bullet can be cancelled by a bomb. Defaults to true. */
  readonly cancellable?: boolean;
}

export interface Bullet {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  speed: number;
  vx: number;
  vy: number;
  accel: number;
  angularVel: number;
  spin: number;
  rotation: number;
  radius: number;
  kind: BulletKind;
  color: BulletColor;
  age: number;
  life: number;
  grazed: boolean;
  minSpeed: number;
  cancellable: boolean;
  split: BulletSplit | null;
  /** Set once the split has fired so a bullet never bursts twice. */
  splitDone: boolean;
}

export interface PlayerShot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  /** Cosmetic scale for the option shots. */
  scale: number;
}

export type EnemyKind = 'fairy' | 'turret' | 'spinner' | 'boss';

export interface ItemSpec {
  readonly kind: 'point' | 'power' | 'bigPower';
  readonly x: number;
  readonly y: number;
  readonly count?: number;
  readonly spread?: number;
}

export interface Item {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'point' | 'power' | 'bigPower';
  age: number;
  /** Magnetised toward the player once collected by a bomb / top-of-screen. */
  magnet: boolean;
}

export type LaserPhase = 'warmup' | 'firing' | 'fading';

export interface LaserSpec {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length?: number;
  readonly width: number;
  /** Radians/s rotation while warmup and firing. */
  readonly spin?: number;
  readonly warmup: number;
  readonly duration: number;
  readonly color?: BulletColor;
  /** Follows this enemy's position every step (used by boss beams). */
  readonly follow?: Enemy;
  /** When false the beam pierces the player repeatedly. Defaults to one hit. */
  readonly repeatHit?: boolean;
}

export interface Laser {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  spin: number;
  warmup: number;
  duration: number;
  age: number;
  phase: LaserPhase;
  color: BulletColor;
  follow: Enemy | null;
  repeatHit: boolean;
  /** Cooldown for repeat hits so a pierce beam hits ~6x per second. */
  hitCooldown: number;
}

export type EffectKind =
  | 'shot'
  | 'enemyHit'
  | 'enemyKilled'
  | 'graze'
  | 'playerHit'
  | 'playerRespawn'
  | 'bomb'
  | 'itemGet'
  | 'bossWarning'
  | 'bossPhase'
  | 'laserCharge'
  | 'extend'
  | 'cancel';

export interface EffectEvent {
  readonly kind: EffectKind;
  readonly x: number;
  readonly y: number;
  /** Relative strength, used for particle count and sound volume. */
  readonly power?: number;
  readonly color?: BulletColor;
  readonly label?: string;
}

/** Per-frame callback handed to content code (stage waves, boss patterns). */
export interface EnemyUpdateContext {
  readonly player: PlayerState;
  readonly difficulty: DifficultyConfig;
  readonly time: number;
  readonly stageTime: number;
  spawnBullet(spec: BulletSpec): void;
  spawnLaser(spec: LaserSpec): void;
  spawnItem(spec: ItemSpec): void;
  spawnEffect(kind: EffectKind, x: number, y: number, power?: number): void;
  /** Aimed angle from a point to the player, in radians. */
  aimAtPlayer(x: number, y: number): number;
}

export interface EnemySpec {
  readonly x: number;
  readonly y: number;
  readonly kind: EnemyKind;
  readonly hp: number;
  readonly radius: number;
  /** Score awarded on kill, before the difficulty multiplier. */
  readonly score: number;
  /** Sprite rotation speed for spinning enemies (cosmetic). */
  readonly spin?: number;
  readonly items?: readonly ItemSpec[];
  /** Called every simulation step while the enemy is alive. */
  readonly update?: (enemy: Enemy, ctx: EnemyUpdateContext, dt: number) => void;
  /** Called once when the enemy dies (loot, add score, spawn effects). */
  readonly onDeath?: (enemy: Enemy, ctx: EnemyUpdateContext) => void;
}

export interface Enemy {
  active: boolean;
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  score: number;
  age: number;
  /** Seconds of white flash after taking a hit (render only). */
  hitFlash: number;
  /** Cosmetic spin rate in radians/s. */
  spin: number;
  rotation: number;
  items: readonly ItemSpec[];
  update: ((enemy: Enemy, ctx: EnemyUpdateContext, dt: number) => void) | null;
  onDeath: ((enemy: Enemy, ctx: EnemyUpdateContext) => void) | null;
  /** Remaining seconds of an active bomb flash (render only). */
  bombFlash: number;
}

export interface PlayerState {
  x: number;
  y: number;
  /** Collision radius: intentionally tiny, danmaku style. */
  radius: number;
  grazeRadius: number;
  alive: boolean;
  /** Seconds of invulnerability remaining. */
  invuln: number;
  focused: boolean;
  /** 0..MAX_POWER, fractional; determines shot spread. */
  power: number;
  shotCooldown: number;
  /** Cosmetic banking angle, -1..1. */
  bank: number;
  /** Seconds since the last hit, for the bomb/death visual. */
  deathTimer: number;
}

export interface StageContext {
  readonly player: PlayerState;
  readonly difficulty: DifficultyConfig;
  readonly time: number;
  readonly stageTime: number;
  spawnBullet(spec: BulletSpec): void;
  spawnLaser(spec: LaserSpec): void;
  spawnItem(spec: ItemSpec): void;
  spawnEnemy(spec: EnemySpec): Enemy | null;
  spawnEffect(kind: EffectKind, x: number, y: number, power?: number): void;
  aimAtPlayer(x: number, y: number): number;
  /** Sets the HUD boss bar; null hides it. */
  setBoss(enemy: Enemy | null, name: string): void;
  /** Sets the spell-card banner (null clears it). */
  setSpell(name: string | null): void;
  /** Shows a transient centred banner such as "WARNING". */
  setBanner(text: string | null, seconds?: number): void;
}

export interface StageController {
  /** Called once when the stage starts. */
  start(ctx: StageContext): void;
  /** Called every fixed step. */
  update(ctx: StageContext, dt: number): void;
  /** 0..1 progress for the HUD and for the clear screen. */
  progress(ctx: StageContext): number;
  /** True once the boss has been defeated and the stage can be cleared. */
  isComplete(ctx: StageContext): boolean;
}

export type AppScreen = 'title' | 'playing' | 'paused' | 'gameover' | 'clear';

export interface ResultSummary {
  readonly score: number;
  readonly best: number;
  readonly isNewRecord: boolean;
  readonly graze: number;
  readonly difficulty: Difficulty;
  readonly stageCleared: boolean;
}

/** Everything the UI layer may draw or react to. */
export interface UiModel {
  screen: AppScreen;
  difficulty: Difficulty;
  score: number;
  best: number;
  lives: number;
  bombs: number;
  graze: number;
  power: number;
  maxPower: number;
  bossHp: number;
  bossMaxHp: number;
  bossName: string;
  spellName: string | null;
  banner: string | null;
  bannerTimer: number;
  soundEnabled: boolean;
  fps: number;
  stageProgress: number;
  elapsed: number;
  result: ResultSummary | null;
}

export type UiAction =
  | { readonly type: 'start'; readonly difficulty: Difficulty }
  | { readonly type: 'selectDifficulty'; readonly difficulty: Difficulty }
  | { readonly type: 'resume' }
  | { readonly type: 'retry' }
  | { readonly type: 'title' }
  | { readonly type: 'pause' }
  | { readonly type: 'toggleSound' }
  | { readonly type: 'bomb' };

/** Actions that stay active while a finger is held down. */
export type UiHoldAction = 'focus';
