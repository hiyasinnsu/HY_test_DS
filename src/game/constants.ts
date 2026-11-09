import type { BulletColor, BulletKind, Difficulty, DifficultyConfig } from './types';

/** Logical playfield size. Everything in the simulation uses these units. */
export const FIELD_W = 450;
export const FIELD_H = 800;

/** Height of the top HUD band inside the playfield. */
export const HUD_H = 58;

/** Bottom band reserved for thumb controls. */
export const CONTROL_BAND_H = 96;

export const PLAYER = {
  radius: 2.6,
  grazeRadius: 20,
  speed: 236,
  focusSpeed: 112,
  /** Drag amplification: 1 = the ship tracks the finger exactly. */
  dragScale: 1,
  shotInterval: 0.062,
  shotDamage: 1.15,
  startX: FIELD_W / 2,
  startY: FIELD_H - 110,
  respawnInvuln: 2.6,
  deathPause: 0.9,
} as const;

export const MAX_POWER = 4;
export const MAX_LIVES = 8;
export const MAX_BOMBS = 8;

/** Seconds the bomb is active (clearing bullets and damaging enemies). */
export const BOMB_DURATION = 2.1;
export const BOMB_INVULN = 2.4;
export const BOMB_DAMAGE_PER_SECOND = 78;

/** Bullet collision radius per kind, in playfield units. */
export const BULLET_RADIUS: Record<BulletKind, number> = {
  orb: 4.6,
  rice: 3.4,
  arrow: 4.2,
  big: 9,
  star: 5.2,
  bubble: 11,
};

/** Sprite scale per kind; kept separate from the hit radius for readability. */
export const BULLET_DRAW_SCALE: Record<BulletKind, number> = {
  orb: 1,
  rice: 0.92,
  arrow: 1.06,
  big: 1,
  star: 1.1,
  bubble: 1,
};

export const BULLET_COLORS: Record<BulletColor, string> = {
  red: '#ff3b5c',
  pink: '#ff7ad9',
  purple: '#b07bff',
  blue: '#5b8cff',
  cyan: '#5ce8ff',
  green: '#62ffb0',
  yellow: '#ffe066',
  white: '#f4f6ff',
};

/** Bullet culling margin outside the playfield. */
export const BULLET_MARGIN = 48;

export const BULLET_CAPACITY = 2400;
export const PLAYER_SHOT_CAPACITY = 220;
export const ENEMY_CAPACITY = 48;
export const ITEM_CAPACITY = 260;
export const LASER_CAPACITY = 16;

export const SCORE = {
  graze: 40,
  pointItem: 120,
  powerItem: 60,
  bossPhase: 8000,
  bossKill: 30000,
  stageClear: 20000,
  perLife: 3000,
  perBomb: 1500,
} as const;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    bulletSpeed: 0.82,
    bulletCount: 0.7,
    enemyHp: 0.8,
    bossHp: 0.72,
    score: 0.7,
    lives: 4,
    bombs: 4,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    bulletSpeed: 1,
    bulletCount: 1,
    enemyHp: 1,
    bossHp: 1,
    score: 1,
    lives: 3,
    bombs: 3,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    bulletSpeed: 1.13,
    bulletCount: 1.3,
    enemyHp: 1.25,
    bossHp: 1.2,
    score: 1.5,
    lives: 2,
    bombs: 2,
  },
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const STORAGE_KEYS = {
  best: 'hy-test-ds.best',
  sound: 'hy-test-ds.sound',
  difficulty: 'hy-test-ds.difficulty',
} as const;
