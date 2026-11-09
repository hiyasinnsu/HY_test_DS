/**
 * Canvas2D renderer for the danmaku playfield.
 *
 * Draw order (all in 450x800 playfield units; the integrator owns the canvas
 * transform): background -> items -> enemies -> lasers -> player shots ->
 * player -> bullets -> focus hitbox -> particles -> paused/gameover tint ->
 * vignette flash. Bullets always sit above the ship so silhouettes stay
 * readable, and the tiny focus hitbox is drawn last of the gameplay layers.
 */

import { clamp } from '../core/math';
import { BULLET_COLORS, BULLET_DRAW_SCALE, FIELD_H, FIELD_W } from '../game/constants';
import type { AppScreen, BulletColor, EffectEvent, Enemy, EnemyKind } from '../game/types';
import type { World } from '../game/world';
import { createBackground } from './background';
import { createParticles } from './particles';
import {
  drawSprite,
  getBulletSprite,
  getEnemySprite,
  getGlowSprite,
  getHitboxSprite,
  getItemSprite,
  getPlayerShotSprite,
  getPlayerSprite,
} from './sprites';

export interface RenderFrameInput {
  readonly world: World | null;
  readonly time: number;
  readonly alpha: number;
  readonly effects: readonly EffectEvent[];
  readonly screen: AppScreen;
  readonly paused: boolean;
}

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, input: RenderFrameInput): void;
  setQuality(quality: 'high' | 'low'): void;
}

/** Hard ceiling on bullet blits; the simulation pool can hold more than this. */
const MAX_DRAWN_BULLETS = 2000;
const CULL_MARGIN = 52;
const BOSS_BASE_RADIUS = 64;

const ENEMY_BASE_RADIUS: Record<EnemyKind, number> = {
  fairy: 14,
  turret: 22,
  spinner: 18,
  boss: BOSS_BASE_RADIUS,
};

interface LaserTint {
  readonly base: string;
  readonly core: string;
}

function mixHex(from: string, to: string, amount: number): string {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  let out = '#';
  for (let shift = 16; shift >= 0; shift -= 8) {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    out += Math.round(ca + (cb - ca) * amount)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

/** Precomputed once: no per-frame rgba() string building for laser layers. */
const LASER_TINTS: Record<BulletColor, LaserTint> = (() => {
  const out = {} as Record<BulletColor, LaserTint>;
  for (const color of Object.keys(BULLET_COLORS) as BulletColor[]) {
    const base = BULLET_COLORS[color];
    out[color] = { base, core: mixHex(base, '#ffffff', 0.78) };
  }
  return out;
})();

function drawBossAura(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.2 + 0.06 * Math.sin(time * 2.1);
  drawSprite(ctx, getGlowSprite('violet'), enemy.x, enemy.y, 0, enemy.radius / 21 + 0.06 * Math.sin(time * 1.7));
  ctx.restore();
}

function drawBossRings(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  const radius = enemy.radius;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#b06bff';
  ctx.globalAlpha = 0.55;
  const a = time * 0.9;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius * 1.5, a, a + 1.7);
  ctx.arc(enemy.x, enemy.y, radius * 1.5, a + 2.2, a + 3.9);
  ctx.stroke();
  ctx.strokeStyle = '#6ff2ff';
  ctx.globalAlpha = 0.4;
  const b = -time * 1.3;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius * 1.84, b, b + 1.2);
  ctx.arc(enemy.x, enemy.y, radius * 1.84, b + 2.4, b + 3.6);
  ctx.stroke();
  ctx.restore();
}

export function createRenderer(): Renderer {
  const background = createBackground();
  const particles = createParticles();
  let quality: 'high' | 'low' = 'high';
  let lastTime = -1;

  // Low quality culls bullet sprites smaller than a device pixel. The playfield
  // transform changes only on resize, so the matrix lookup is cached instead of
  // allocating a DOMMatrix every frame.
  let transformCtx: CanvasRenderingContext2D | null = null;
  let transformWidth = -1;
  let transformHeight = -1;
  let transformScale = 1;
  const pixelScale = (ctx: CanvasRenderingContext2D): number => {
    const width = ctx.canvas ? ctx.canvas.width : 0;
    const height = ctx.canvas ? ctx.canvas.height : 0;
    if (transformCtx === ctx && transformWidth === width && transformHeight === height) {
      return transformScale;
    }
    transformCtx = ctx;
    transformWidth = width;
    transformHeight = height;
    transformScale = 1;
    try {
      if (typeof ctx.getTransform === 'function') {
        const matrix = ctx.getTransform();
        const scale = Math.abs(matrix.a);
        if (Number.isFinite(scale) && scale > 0) transformScale = scale;
      }
    } catch {
      // A partial stub context has no transform; 1:1 is correct there.
    }
    return transformScale;
  };

  const drawItems = (ctx: CanvasRenderingContext2D, world: World): void => {
    const pool = world.items;
    if (!pool) return;
    const list = pool.items;
    for (let i = 0; i < pool.count; i += 1) {
      const item = list[i];
      if (!item || !item.active) continue;
      drawSprite(ctx, getItemSprite(item.kind), item.x, item.y, item.age * 2.6, 1);
    }
  };

  const drawEnemies = (ctx: CanvasRenderingContext2D, world: World, time: number): void => {
    const pool = world.enemies;
    if (!pool) return;
    const list = pool.items;
    for (let i = 0; i < pool.count; i += 1) {
      const enemy = list[i];
      if (!enemy || !enemy.active) continue;
      const sprite = getEnemySprite(enemy.kind);
      const scale = clamp(enemy.radius / ENEMY_BASE_RADIUS[enemy.kind], 0.65, 1.8);
      const rotation = enemy.spin !== 0 ? enemy.rotation : 0;

      if (enemy.bombFlash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(enemy.bombFlash * 2.4, 0, 0.4);
        drawSprite(ctx, getGlowSprite('cyan'), enemy.x, enemy.y, 0, enemy.radius / 26);
        ctx.restore();
      }
      if (enemy.kind === 'boss') drawBossAura(ctx, enemy, time);

      drawSprite(ctx, sprite, enemy.x, enemy.y, rotation, scale);

      if (enemy.hitFlash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(enemy.hitFlash / 0.09, 0, 1) * 0.7;
        drawSprite(ctx, sprite, enemy.x, enemy.y, rotation, scale);
        ctx.restore();
      }
      if (enemy.kind === 'boss') drawBossRings(ctx, enemy, time);
    }
  };

  const drawLasers = (ctx: CanvasRenderingContext2D, world: World, time: number): void => {
    const pool = world.lasers;
    if (!pool) return;
    const list = pool.items;
    for (let i = 0; i < pool.count; i += 1) {
      const laser = list[i];
      if (!laser || !laser.active) continue;
      const tint = LASER_TINTS[laser.color] ?? LASER_TINTS.cyan;
      let width = laser.width;
      let alpha = 1;

      if (laser.phase === 'warmup') {
        const progress = clamp(laser.warmup > 0 ? laser.age / laser.warmup : 1, 0, 1);
        width = laser.width * (0.1 + 0.16 * progress);
        alpha = 0.3 + 0.4 * progress + 0.1 * Math.sin(time * 38);
      } else if (laser.phase === 'fading') {
        const fade = clamp(1 - (laser.age - laser.warmup - laser.duration) / 0.3, 0, 1);
        width = laser.width * fade;
        alpha = fade;
      } else {
        width = laser.width * (1 + 0.035 * Math.sin(time * 22));
        alpha = 0.92 + 0.08 * Math.sin(time * 30);
      }
      if (width <= 0.2 || alpha <= 0.02) continue;

      ctx.save();
      ctx.translate(laser.x, laser.y);
      ctx.rotate(laser.angle);
      ctx.globalCompositeOperation = 'lighter';
      // Three stacked rects, widest/faintest first: a cheap additive glow.
      ctx.fillStyle = tint.base;
      ctx.globalAlpha = alpha * 0.1;
      ctx.fillRect(0, -width * 1.4, laser.length, width * 2.8);
      ctx.globalAlpha = alpha * 0.32;
      ctx.fillRect(0, -width * 0.62, laser.length, width * 1.24);
      ctx.fillStyle = tint.core;
      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      ctx.fillRect(0, -width * 0.16, laser.length, width * 0.32);
      ctx.restore();

      if (laser.phase === 'warmup') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 30);
        drawSprite(ctx, getGlowSprite('cyan'), laser.x, laser.y, 0, 0.55 + 0.15 * Math.sin(time * 18));
        ctx.restore();
      }
    }
  };

  const drawShots = (ctx: CanvasRenderingContext2D, world: World): void => {
    const pool = world.shots;
    if (!pool) return;
    const list = pool.items;
    const sprite = getPlayerShotSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pool.count; i += 1) {
      const shot = list[i];
      if (!shot || !shot.active) continue;
      drawSprite(ctx, sprite, shot.x, shot.y, 0, shot.scale);
    }
    ctx.restore();
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, world: World, time: number): void => {
    const player = world.player;
    if (!player || !player.alive) return;
    const sprite = getPlayerSprite();
    ctx.save();
    if (world.bombing) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      drawSprite(ctx, getGlowSprite('cyan'), player.x, player.y, 0, 1.15 + 0.1 * Math.sin(time * 12));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (player.invuln > 0) {
      ctx.globalAlpha = 0.42 + 0.38 * (0.5 + 0.5 * Math.sin(time * 34));
    }
    drawSprite(ctx, sprite, player.x, player.y, player.bank * 0.22, 1);
    ctx.restore();
  };

  const drawBullets = (
    ctx: CanvasRenderingContext2D,
    world: World,
    deviceScale: number,
  ): void => {
    const pool = world.bullets;
    if (!pool) return;
    const list = pool.items;
    const low = quality === 'low';
    let drawn = 0;
    for (let i = 0; i < pool.count && drawn < MAX_DRAWN_BULLETS; i += 1) {
      const bullet = list[i];
      if (!bullet || !bullet.active) continue;
      if (
        bullet.x < -CULL_MARGIN ||
        bullet.x > FIELD_W + CULL_MARGIN ||
        bullet.y < -CULL_MARGIN ||
        bullet.y > FIELD_H + CULL_MARGIN
      ) {
        continue;
      }
      const sprite = getBulletSprite(bullet.kind, bullet.color);
      const scale = BULLET_DRAW_SCALE[bullet.kind] ?? 1;
      if (low && sprite.width * scale * deviceScale < 1) continue;
      let rotation = 0;
      if (bullet.spin !== 0) rotation = bullet.rotation;
      else if (bullet.kind === 'rice' || bullet.kind === 'arrow') rotation = bullet.angle;
      drawSprite(ctx, sprite, bullet.x, bullet.y, rotation, scale);
      drawn += 1;
    }
  };

  const drawFocus = (ctx: CanvasRenderingContext2D, world: World): void => {
    const player = world.player;
    if (!player || !player.alive || !player.focused) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawSprite(ctx, getHitboxSprite(), player.x, player.y, 0, 1);
    ctx.restore();
  };

  return {
    draw(ctx, input) {
      const dt = input.paused || lastTime < 0 ? 0 : clamp(input.time - lastTime, 0, 1 / 30);
      lastTime = input.time;

      particles.emitAll(input.effects);
      particles.update(dt, input.time);
      background.draw(ctx, input.world, input.time, input.paused ? 0 : dt);

      const world = input.world;
      if (world === null) return;

      ctx.save();
      const shakeX = particles.shakeX;
      const shakeY = particles.shakeY;
      if (shakeX !== 0 || shakeY !== 0) ctx.translate(shakeX, shakeY);

      drawItems(ctx, world);
      drawEnemies(ctx, world, input.time);
      drawLasers(ctx, world, input.time);
      drawShots(ctx, world);
      drawPlayer(ctx, world, input.time);
      drawBullets(ctx, world, quality === 'low' ? pixelScale(ctx) : 1);
      drawFocus(ctx, world);
      particles.draw(ctx);
      ctx.restore();

      if (input.screen === 'gameover') {
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#ff2c52';
        ctx.fillRect(0, 0, FIELD_W, FIELD_H);
        ctx.globalAlpha = 1;
      }
      if (input.paused) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#04020d';
        ctx.fillRect(0, 0, FIELD_W, FIELD_H);
        ctx.globalAlpha = 1;
      }

      const flash = particles.flash;
      if (flash > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.5, flash * 0.6);
        ctx.fillStyle = '#bfefff';
        ctx.fillRect(0, 0, FIELD_W, FIELD_H);
        ctx.restore();
      }
    },
    setQuality(value) {
      quality = value;
      particles.setQuality(value);
    },
  };
}
