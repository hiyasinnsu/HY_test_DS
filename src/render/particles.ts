/**
 * Pooled effect particles and screen shake.
 *
 * The pool is allocated once (700 high / 300 low quality) and never grows.
 * Emitting an effect only writes into existing objects, and the draw pass uses
 * plain fillRect/stroke calls under a single 'lighter' composite, so heavy
 * bullet-cancel frames do not allocate. Screen shake lives here as well: the
 * renderer offsets its gameplay layer by `shakeX` / `shakeY` and never has to
 * know which effect started it.
 */

import { clamp, TAU } from '../core/math';
import { BULLET_COLORS } from '../game/constants';
import type { EffectEvent, EffectKind } from '../game/types';

export type ParticleQuality = 'high' | 'low';

const HIGH_CAP = 700;
const LOW_CAP = 300;

const SHAPE_DOT = 0;
const SHAPE_RING = 1;
const SHAPE_SPARKLE = 2;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  drag: number;
  weight: number;
  alpha: number;
  color: string;
  shape: number;
}

export interface ParticleSystem {
  readonly count: number;
  readonly cap: number;
  readonly shakeX: number;
  readonly shakeY: number;
  /** 0..1 full-screen flash remaining; drawn by the renderer as the last layer. */
  readonly flash: number;
  setQuality(quality: ParticleQuality): void;
  emit(event: EffectEvent): void;
  emitAll(events: readonly EffectEvent[]): void;
  update(dt: number, time: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  clear(): void;
}

const CYAN = BULLET_COLORS.cyan;
const WHITE = BULLET_COLORS.white;
const PINK = BULLET_COLORS.pink;
const RED = BULLET_COLORS.red;
const PURPLE = BULLET_COLORS.purple;
const BLUE = BULLET_COLORS.blue;
const GREEN = BULLET_COLORS.green;
const YELLOW = BULLET_COLORS.yellow;

function createParticlePool(size: number): Particle[] {
  const pool = new Array<Particle>(size);
  for (let i = 0; i < size; i += 1) {
    pool[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      size: 0,
      grow: 0,
      drag: 0,
      weight: 0,
      alpha: 0,
      color: WHITE,
      shape: SHAPE_DOT,
    };
  }
  return pool;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createParticles(): ParticleSystem {
  const pool = createParticlePool(HIGH_CAP);
  let count = 0;
  let cap = HIGH_CAP;
  let quality: ParticleQuality = 'high';

  let shake = 0;
  let shakeClock = 0;
  let shakeX = 0;
  let shakeY = 0;
  let flash = 0;

  const spawn = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    grow: number,
    drag: number,
    color: string,
    shape: number,
    alpha: number,
    weight = 1,
  ): void => {
    if (count >= cap) return;
    const particle = pool[count] as Particle;
    particle.active = true;
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.grow = grow;
    particle.drag = drag;
    particle.weight = weight;
    particle.alpha = alpha;
    particle.color = color;
    particle.shape = shape;
    count += 1;
  };

  /** Radial spark burst. `count` is clamped by the caller, never by the pool. */
  const burst = (
    x: number,
    y: number,
    amount: number,
    speedMin: number,
    speedMax: number,
    lifeMin: number,
    lifeMax: number,
    sizeMin: number,
    sizeMax: number,
    color: string,
    alpha: number,
    shape = SHAPE_DOT,
  ): void => {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(speedMin, speedMax);
      spawn(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        randomRange(lifeMin, lifeMax),
        randomRange(sizeMin, sizeMax),
        0,
        3.2,
        color,
        shape,
        alpha * randomRange(0.55, 1),
      );
    }
  };

  const ring = (
    x: number,
    y: number,
    radius: number,
    grow: number,
    life: number,
    color: string,
    alpha: number,
    weight: number,
  ): void => {
    spawn(x, y, 0, 0, life, radius, grow, 0, color, SHAPE_RING, alpha, weight);
  };

  const addShake = (amount: number): void => {
    if (amount > shake) shake = amount;
  };

  const addFlash = (amount: number): void => {
    if (amount > flash) flash = amount;
  };

  const emit = (event: EffectEvent): void => {
    const x = event.x;
    const y = event.y;
    const power = clamp(event.power ?? 1, 0.2, 6);
    const tint = event.color ? BULLET_COLORS[event.color] : null;
    const kind: EffectKind = event.kind;

    switch (kind) {
      case 'shot': {
        burst(x, y, 2, 28, 90, 0.12, 0.28, 0.8, 1.8, CYAN, 0.3);
        break;
      }
      case 'enemyHit': {
        const amount = 2 + Math.floor(Math.random() * 3);
        burst(x, y, amount, 55, 170, 0.14, 0.32, 1.1, 2.2, tint ?? YELLOW, 0.75);
        break;
      }
      case 'enemyKilled': {
        const boss = power >= 4;
        const amount = boss ? 26 : clamp(Math.round(10 + power * 4), 10, 26);
        const color = tint ?? (boss ? PINK : PURPLE);
        burst(x, y, amount, 80, 300, 0.28, 0.72, 1.4, 3.4, color, 0.95);
        ring(x, y, 8 + power * 4, 120 + power * 55, 0.45 + power * 0.04, color, 0.85, 2.2);
        if (boss) {
          ring(x, y, 20, 320, 0.7, WHITE, 0.7, 3);
          ring(x, y, 6, 220, 0.55, CYAN, 0.6, 2);
          addShake(8);
          addFlash(0.28);
        } else {
          addShake(clamp(power * 1.4, 1, 4));
        }
        break;
      }
      case 'graze': {
        const amount = 1 + Math.floor(Math.random() * 2);
        burst(x, y, amount, 20, 80, 0.18, 0.36, 1.6, 2.8, tint ?? WHITE, 0.75, SHAPE_SPARKLE);
        break;
      }
      case 'playerHit': {
        burst(x, y, 26, 90, 360, 0.3, 0.8, 1.6, 3.8, RED, 0.95);
        burst(x, y, 10, 60, 220, 0.25, 0.6, 1.2, 2.6, WHITE, 0.9);
        ring(x, y, 10, 260, 0.55, RED, 0.9, 3);
        ring(x, y, 18, 190, 0.7, WHITE, 0.65, 2);
        addShake(9);
        addFlash(0.42);
        break;
      }
      case 'playerRespawn': {
        burst(x, y, 16, 60, 230, 0.25, 0.6, 1.2, 2.8, tint ?? CYAN, 0.85);
        ring(x, y, 8, 210, 0.5, CYAN, 0.8, 2.4);
        break;
      }
      case 'bomb': {
        // Cyan shockwave rings plus radial sparks read as a full-screen safe burst.
        ring(x, y, 18, 380, 0.7, CYAN, 0.95, 4);
        ring(x, y, 44, 300, 0.9, WHITE, 0.7, 2.5);
        ring(x, y, 10, 520, 0.55, BLUE, 0.8, 3);
        burst(x, y, 24, 120, 420, 0.3, 0.75, 1.5, 3.4, CYAN, 0.9);
        burst(x, y, 8, 60, 180, 0.4, 0.9, 2, 4.2, WHITE, 0.7);
        addShake(6);
        addFlash(0.3);
        break;
      }
      case 'itemGet': {
        const amount = power >= 1.4 ? 8 : 5;
        burst(x, y, amount, 30, 130, 0.22, 0.5, 1.4, 3, tint ?? YELLOW, 0.9, SHAPE_SPARKLE);
        ring(x, y, 4, 90, 0.3, tint ?? YELLOW, 0.5, 1.2);
        break;
      }
      case 'laserCharge': {
        burst(x, y, 6, 35, 140, 0.2, 0.5, 1.2, 2.6, tint ?? PURPLE, 0.8);
        ring(x, y, 3, 70, 0.35, tint ?? CYAN, 0.6, 1.4);
        break;
      }
      case 'bossWarning': {
        burst(x, y, 14, 80, 260, 0.3, 0.75, 1.6, 3.4, RED, 0.8);
        ring(x, y, 16, 260, 0.6, RED, 0.8, 3);
        ring(x, y, 34, 200, 0.85, tint ?? PINK, 0.55, 2);
        addFlash(0.16);
        break;
      }
      case 'bossPhase': {
        burst(x, y, 26, 110, 400, 0.35, 0.9, 1.8, 4.2, tint ?? PURPLE, 0.95);
        burst(x, y, 12, 60, 260, 0.3, 0.7, 1.4, 3, WHITE, 0.85);
        ring(x, y, 18, 340, 0.75, tint ?? PINK, 0.9, 3);
        ring(x, y, 40, 260, 0.95, CYAN, 0.6, 2);
        addShake(6);
        addFlash(0.32);
        break;
      }
      case 'extend': {
        burst(x, y, 20, 70, 280, 0.3, 0.7, 1.6, 3.6, tint ?? GREEN, 0.9);
        ring(x, y, 10, 220, 0.6, GREEN, 0.8, 2.4);
        ring(x, y, 28, 160, 0.8, WHITE, 0.55, 2);
        addFlash(0.2);
        break;
      }
      case 'cancel': {
        burst(x, y, 4, 40, 150, 0.16, 0.4, 1, 2.2, tint ?? PURPLE, 0.7);
        break;
      }
      default: {
        break;
      }
    }
  };

  return {
    get count() {
      return count;
    },
    get cap() {
      return cap;
    },
    get shakeX() {
      return shakeX;
    },
    get shakeY() {
      return shakeY;
    },
    get flash() {
      return flash;
    },
    setQuality(value) {
      if (value === quality) return;
      quality = value;
      cap = value === 'high' ? HIGH_CAP : LOW_CAP;
      if (count > cap) {
        for (let i = cap; i < count; i += 1) (pool[i] as Particle).active = false;
        count = cap;
      }
    },
    emit(event) {
      emit(event);
    },
    emitAll(events) {
      for (let i = 0; i < events.length; i += 1) emit(events[i] as EffectEvent);
    },
    update(dt, _time) {
      if (dt > 0) {
        for (let i = count - 1; i >= 0; i -= 1) {
          const particle = pool[i] as Particle;
          particle.life -= dt;
          if (particle.life <= 0) {
            particle.active = false;
            count -= 1;
            if (i !== count) {
              pool[i] = pool[count] as Particle;
              pool[count] = particle;
            }
            continue;
          }
          if (particle.shape === SHAPE_RING) {
            particle.size += particle.grow * dt;
          } else {
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            const damping = Math.min(1, particle.drag * dt);
            particle.vx -= particle.vx * damping;
            particle.vy -= particle.vy * damping;
          }
        }

        shake *= Math.exp(-dt * 7.5);
        if (shake < 0.05) shake = 0;
        flash = Math.max(0, flash - dt * 2.4);
        shakeClock += dt;
      }
      if (shake > 0) {
        shakeX = Math.sin(shakeClock * 97) * shake;
        shakeY = Math.cos(shakeClock * 73) * shake * 0.8;
      } else {
        shakeX = 0;
        shakeY = 0;
      }
    },
    draw(ctx) {
      if (count === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i += 1) {
        const particle = pool[i] as Particle;
        const fade = particle.life / particle.maxLife;
        const alpha = particle.alpha * fade;
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha > 1 ? 1 : alpha;
        ctx.fillStyle = particle.color;
        if (particle.shape === SHAPE_RING) {
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = particle.weight;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
          ctx.stroke();
        } else if (particle.shape === SHAPE_SPARKLE) {
          const size = particle.size * (0.45 + 0.55 * fade);
          const thin = size * 0.22;
          ctx.fillRect(particle.x - size * 0.5, particle.y - thin * 0.5, size, thin);
          ctx.fillRect(particle.x - thin * 0.5, particle.y - size * 0.5, thin, size);
        } else {
          const size = particle.size * (0.5 + 0.5 * fade);
          ctx.fillRect(particle.x - size * 0.5, particle.y - size * 0.5, size, size);
        }
      }
      ctx.restore();
    },
    clear() {
      count = 0;
      shake = 0;
      shakeX = 0;
      shakeY = 0;
      flash = 0;
    },
  };
}
