import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import type {
  Bullet,
  BulletColor,
  BulletKind,
  EffectEvent,
  EffectKind,
  Enemy,
  EnemyKind,
  Item,
  Laser,
  PlayerShot,
  PlayerState,
  StageController,
} from '../src/game/types';
import { createParticles } from '../src/render/particles';
import { createRenderer } from '../src/render/renderer';
import type { RenderFrameInput } from '../src/render/renderer';
import {
  drawSprite,
  getBulletSprite,
  getEnemySprite,
  getHitboxSprite,
  getItemSprite,
  getPlayerShotSprite,
  getPlayerSprite,
} from '../src/render/sprites';

interface StubCalls {
  save: number;
  restore: number;
  drawImage: number;
  fillRect: number;
  arc: number;
}

interface Stub {
  ctx: CanvasRenderingContext2D;
  calls: StubCalls;
}

/** The venetian-blind slice of Canvas2D the renderer is allowed to touch. */
function createStub(): Stub {
  const calls: StubCalls = { save: 0, restore: 0, drawImage: 0, fillRect: 0, arc: 0 };
  const gradient = { addColorStop: () => {} };
  const ctx = {
    canvas: { width: 900, height: 1600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    save: () => {
      calls.save += 1;
    },
    restore: () => {
      calls.restore += 1;
    },
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
    getTransform: () => ({ a: 1.5, b: 0, c: 0, d: 1.5, e: 0, f: 0 }),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {
      calls.arc += 1;
    },
    ellipse: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {
      calls.fillRect += 1;
    },
    strokeRect: () => {},
    clearRect: () => {},
    drawImage: () => {
      calls.drawImage += 1;
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const BULLET_KINDS: readonly BulletKind[] = ['orb', 'rice', 'arrow', 'big', 'star', 'bubble'];
const BULLET_COLORS: readonly BulletColor[] = [
  'red',
  'pink',
  'purple',
  'blue',
  'cyan',
  'green',
  'yellow',
  'white',
];
const EFFECT_KINDS: readonly EffectKind[] = [
  'shot',
  'enemyHit',
  'enemyKilled',
  'graze',
  'playerHit',
  'playerRespawn',
  'bomb',
  'itemGet',
  'bossWarning',
  'bossPhase',
  'laserCharge',
  'extend',
  'cancel',
];

function makeBullet(overrides: Partial<Bullet>): Bullet {
  return {
    active: true,
    x: 120,
    y: 200,
    angle: 0.4,
    speed: 120,
    vx: 0,
    vy: 0,
    accel: 0,
    angularVel: 0,
    spin: 0,
    rotation: 0.4,
    radius: 4.6,
    kind: 'orb',
    color: 'red',
    age: 0,
    life: Number.POSITIVE_INFINITY,
    grazed: false,
    minSpeed: 0,
    cancellable: true,
    split: null,
    splitDone: false,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<Enemy>): Enemy {
  return {
    active: true,
    id: 1,
    kind: 'fairy',
    x: 200,
    y: 180,
    vx: 0,
    vy: 0,
    hp: 10,
    maxHp: 10,
    radius: 14,
    score: 100,
    age: 1,
    hitFlash: 0.05,
    spin: 0.7,
    rotation: 1.2,
    items: [],
    update: null,
    onDeath: null,
    bombFlash: 0.05,
    ...overrides,
  };
}

function makeLaser(overrides: Partial<Laser>): Laser {
  return {
    active: true,
    x: 225,
    y: 100,
    angle: Math.PI / 2,
    length: 900,
    width: 18,
    spin: 0,
    warmup: 1,
    duration: 2,
    age: 1.5,
    phase: 'firing',
    color: 'cyan',
    follow: null,
    repeatHit: false,
    hitCooldown: 0,
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item>): Item {
  return {
    active: true,
    x: 210,
    y: 260,
    vx: 0,
    vy: 60,
    kind: 'point',
    age: 2.2,
    magnet: false,
    ...overrides,
  };
}

function makeShot(overrides: Partial<PlayerShot>): PlayerShot {
  return {
    active: true,
    x: 220,
    y: 520,
    vx: 0,
    vy: -900,
    radius: 4,
    damage: 1,
    scale: 1,
    ...overrides,
  };
}

const PLAYER: PlayerState = {
  x: 225,
  y: 690,
  radius: 2.6,
  grazeRadius: 20,
  alive: true,
  invuln: 0.4,
  focused: true,
  power: 2,
  shotCooldown: 0,
  bank: 0.5,
  deathTimer: 0,
};

interface FakePool<T> {
  readonly count: number;
  readonly items: T[];
}

function makePopulatedWorld(): World {
  const bullets: Bullet[] = [];
  for (let k = 0; k < BULLET_KINDS.length; k += 1) {
    for (let c = 0; c < BULLET_COLORS.length; c += 1) {
      bullets.push(
        makeBullet({
          x: 30 + ((k * 8 + c) % 12) * 34,
          y: 110 + ((k * 8 + c) % 9) * 40,
          kind: BULLET_KINDS[k] as BulletKind,
          color: BULLET_COLORS[c] as BulletColor,
          spin: k === 4 ? 1.5 : 0,
          rotation: c * 0.3,
        }),
      );
    }
  }
  bullets.push(makeBullet({ x: -200, y: -200, kind: 'bubble', color: 'white' }));

  const boss = makeEnemy({ id: 99, kind: 'boss', x: 225, y: 170, radius: 64, hp: 900, maxHp: 900 });
  const enemies: Enemy[] = [
    makeEnemy({ kind: 'fairy', x: 100, y: 160 }),
    makeEnemy({ kind: 'turret', x: 330, y: 240, radius: 22 }),
    makeEnemy({ kind: 'spinner', x: 220, y: 310, radius: 18, spin: 2.2, rotation: 2.4 }),
    boss,
  ];

  const lasers: Laser[] = [
    makeLaser({ phase: 'warmup', age: 0.4, x: 80, color: 'purple' }),
    makeLaser({ phase: 'firing', age: 1.4, x: 225, angle: Math.PI / 2, color: 'cyan' }),
    makeLaser({ phase: 'fading', age: 3.2, x: 380, angle: 2.4, color: 'red' }),
  ];

  const items: Item[] = [
    makeItem({ kind: 'point', x: 140, y: 250 }),
    makeItem({ kind: 'power', x: 220, y: 300, age: 0.7 }),
    makeItem({ kind: 'bigPower', x: 300, y: 340, age: 4.1 }),
  ];

  const shots: PlayerShot[] = [makeShot({ x: 220 }), makeShot({ x: 240, scale: 0.9 }), makeShot({ x: 260 })];

  const world = {
    player: { ...PLAYER },
    boss,
    bombing: true,
    bombTime: 1.4,
    status: 'playing',
    bossName: 'Test Boss',
    spellName: 'Test Spell',
    bullets: { count: bullets.length, items: bullets } satisfies FakePool<Bullet>,
    enemies: { count: enemies.length, items: enemies } satisfies FakePool<Enemy>,
    lasers: { count: lasers.length, items: lasers } satisfies FakePool<Laser>,
    items: { count: items.length, items } satisfies FakePool<Item>,
    shots: { count: shots.length, items: shots } satisfies FakePool<PlayerShot>,
  };
  return world as unknown as World;
}

function makeEffects(count: number): EffectEvent[] {
  const effects: EffectEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    effects.push({
      kind: EFFECT_KINDS[i % EFFECT_KINDS.length] as EffectKind,
      x: 40 + (i % 12) * 32,
      y: 100 + (i % 9) * 60,
      power: 1 + (i % 5),
      color: BULLET_COLORS[i % BULLET_COLORS.length] as BulletColor,
    });
  }
  return effects;
}

function makeInput(overrides: Partial<RenderFrameInput>): RenderFrameInput {
  return {
    world: null,
    time: 1,
    alpha: 0.5,
    effects: [],
    screen: 'title',
    paused: false,
    ...overrides,
  };
}

const emptyStage: StageController = {
  start: () => {},
  update: () => {},
  progress: () => 0,
  isComplete: () => false,
};

describe('sprite lookups', () => {
  it('returns a sprite for every bullet kind and colour', () => {
    for (const kind of BULLET_KINDS) {
      for (const color of BULLET_COLORS) {
        const sprite = getBulletSprite(kind, color);
        expect(sprite).toBeTruthy();
        expect(sprite.width).toBeGreaterThan(0);
        expect(sprite.height).toBeGreaterThan(0);
        expect(sprite.radius).toBeGreaterThan(0);
        expect(typeof sprite.color).toBe('string');
      }
    }
  });

  it('returns sprites for ships, enemies, items and helpers', () => {
    const enemies: readonly EnemyKind[] = ['fairy', 'turret', 'spinner', 'boss'];
    for (const kind of enemies) expect(getEnemySprite(kind).width).toBeGreaterThan(0);
    for (const kind of ['point', 'power', 'bigPower'] as const) {
      expect(getItemSprite(kind).width).toBeGreaterThan(0);
    }
    expect(getPlayerSprite().width).toBeGreaterThan(0);
    expect(getPlayerShotSprite().width).toBeGreaterThan(0);
    expect(getHitboxSprite().width).toBeGreaterThan(0);
  });

  it('blits fallback sprites without a DOM canvas', () => {
    const { ctx } = createStub();
    for (const color of BULLET_COLORS) {
      expect(() => drawSprite(ctx, getBulletSprite('orb', color), 50, 50, 0.3, 1)).not.toThrow();
    }
  });
});

describe('particle pool', () => {
  it('caps 5000 effects at 700, and low quality lowers the cap to 300', () => {
    const particles = createParticles();
    expect(particles.cap).toBe(700);
    const effects = makeEffects(5000);

    particles.emitAll(effects);
    expect(particles.count).toBeGreaterThan(0);
    expect(particles.count).toBeLessThanOrEqual(700);

    particles.setQuality('low');
    expect(particles.cap).toBe(300);
    expect(particles.count).toBeLessThanOrEqual(300);

    particles.emitAll(effects);
    expect(particles.count).toBeLessThanOrEqual(300);
  });

  it('updates, draws and expires every particle kind', () => {
    const particles = createParticles();
    const { ctx } = createStub();
    particles.emitAll(makeEffects(EFFECT_KINDS.length));
    expect(() => particles.draw(ctx)).not.toThrow();
    for (let i = 0; i < 120; i += 1) particles.update(1 / 60, i / 60);
    expect(() => particles.draw(ctx)).not.toThrow();
    particles.update(10, 10);
    expect(particles.count).toBe(0);
  });
});

describe('renderer', () => {
  it('draws the ambient background when the world is null', () => {
    const renderer = createRenderer();
    const { ctx } = createStub();
    expect(() => renderer.draw(ctx, makeInput({}))).not.toThrow();
  });

  it('draws an empty world', () => {
    const renderer = createRenderer();
    const { ctx } = createStub();
    const world = new World({ difficulty: 'normal', stage: emptyStage, seed: 7 });
    expect(() =>
      renderer.draw(ctx, makeInput({ world, screen: 'playing', time: 2 })),
    ).not.toThrow();
  });

  it('draws a hand-made populated world across screens and quality levels', () => {
    const renderer = createRenderer();
    const { ctx, calls } = createStub();
    const world = makePopulatedWorld();
    const effects = makeEffects(EFFECT_KINDS.length);

    let time = 1;
    for (const screen of ['playing', 'paused', 'gameover', 'clear'] as const) {
      expect(() =>
        renderer.draw(
          ctx,
          makeInput({
            world,
            effects,
            screen,
            time,
            paused: screen === 'paused',
          }),
        ),
      ).not.toThrow();
      time += 1 / 60;
    }

    renderer.setQuality('low');
    expect(() =>
      renderer.draw(ctx, makeInput({ world, effects: [], screen: 'playing', time })),
    ).not.toThrow();

    expect(calls.save).toBe(calls.restore);
    expect(calls.fillRect + calls.arc + calls.drawImage).toBeGreaterThan(0);
  });

  it('survives 5000 queued effects in one frame', () => {
    const renderer = createRenderer();
    const { ctx } = createStub();
    const world = makePopulatedWorld();
    const effects = makeEffects(5000);
    expect(() =>
      renderer.draw(ctx, makeInput({ world, effects, screen: 'playing', time: 3 })),
    ).not.toThrow();
  });
});
