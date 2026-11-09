/**
 * Background layer: deep navy -> violet gradient, static nebulae, subtle grid
 * and scanlines, bottom vignette, plus three parallax star layers.
 *
 * Everything static is baked once into an offscreen canvas sized to the current
 * canvas/transform, so a normal frame costs one drawImage plus ~140 star quads.
 * Gradients are cached and only rebuilt on resize; no object or gradient is
 * created inside the per-frame path.
 */

import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { FIELD_H, FIELD_W } from '../game/constants';
import type { World } from '../game/world';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkle: number;
}

interface StarLayer {
  readonly speed: number;
  readonly color: string;
  readonly stars: Star[];
}

interface Background {
  draw(ctx: CanvasRenderingContext2D, world: World | null, time: number, dt: number): void;
}

const STAR_SEED = 0x51a7c0de;

function createStars(): StarLayer[] {
  const rng = new Rng(STAR_SEED);
  const specs = [
    { count: 70, speed: 11, color: '#9fc7ff', sizeMin: 0.6, sizeMax: 1.15, alpha: 0.4 },
    { count: 45, speed: 23, color: '#d9c8ff', sizeMin: 0.9, sizeMax: 1.65, alpha: 0.62 },
    { count: 25, speed: 41, color: '#ffffff', sizeMin: 1.2, sizeMax: 2.2, alpha: 0.85 },
  ];
  const layers: StarLayer[] = [];
  for (const spec of specs) {
    const stars: Star[] = [];
    for (let i = 0; i < spec.count; i += 1) {
      stars.push({
        x: rng.range(0, FIELD_W),
        y: rng.range(0, FIELD_H),
        size: rng.range(spec.sizeMin, spec.sizeMax),
        alpha: spec.alpha * rng.range(0.55, 1),
        twinkle: rng.range(0, Math.PI * 2),
      });
    }
    layers.push({ speed: spec.speed, color: spec.color, stars });
  }
  return layers;
}

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  } catch {
    return null;
  }
}

function makeLinear(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient | null {
  if (typeof ctx.createLinearGradient !== 'function') return null;
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  if (!gradient || typeof gradient.addColorStop !== 'function') return null;
  for (const stop of stops) gradient.addColorStop(stop[0], stop[1]);
  return gradient;
}

function makeRadial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient | null {
  if (typeof ctx.createRadialGradient !== 'function') return null;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  if (!gradient || typeof gradient.addColorStop !== 'function') return null;
  for (const stop of stops) gradient.addColorStop(stop[0], stop[1]);
  return gradient;
}

const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, '#04020d'],
  [0.32, '#070b24'],
  [0.62, '#120a2c'],
  [0.84, '#1b0b33'],
  [1, '#090516'],
];

interface NebulaSpec {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly alpha: number;
}

const NEBULAE: readonly NebulaSpec[] = [
  { x: 108, y: 250, radius: 210, color: '#6b2f9b', alpha: 0.22 },
  { x: 354, y: 512, radius: 245, color: '#24408f', alpha: 0.18 },
  { x: 244, y: 96, radius: 170, color: '#0c7088', alpha: 0.12 },
];

function paintNebula(ctx: CanvasRenderingContext2D, spec: NebulaSpec): void {
  const gradient = makeRadial(ctx, spec.x, spec.y, spec.radius, [
    [0, spec.color],
    [1, 'rgba(0,0,0,0)'],
  ]);
  if (!gradient) return;
  ctx.globalAlpha = spec.alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(spec.x, spec.y, spec.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintStatic(ctx: CanvasRenderingContext2D): void {
  const sky = makeLinear(ctx, 0, 0, 0, FIELD_H, SKY_STOPS);
  ctx.fillStyle = sky ?? '#070b24';
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  for (const nebula of NEBULAE) paintNebula(ctx, nebula);

  // Faint perspective grid; static, so no per-frame stroke cost.
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(92,214,255,0.045)';
  ctx.beginPath();
  for (let x = 25; x < FIELD_W; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 30; y < FIELD_H; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // Scanlines.
  ctx.fillStyle = 'rgba(1,2,10,0.16)';
  for (let y = 0; y < FIELD_H; y += 4) ctx.fillRect(0, y, FIELD_W, 1);

  // Bottom vignette keeps bullets near the control band readable.
  const vignette = makeLinear(ctx, 0, FIELD_H - 300, 0, FIELD_H, [
    [0, 'rgba(0,0,0,0)'],
    [0.55, 'rgba(2,1,8,0.24)'],
    [1, 'rgba(1,0,6,0.62)'],
  ]);
  if (vignette) {
    ctx.fillStyle = vignette;
    ctx.fillRect(0, FIELD_H - 300, FIELD_W, 300);
  }
}

interface StaticState {
  canvas: HTMLCanvasElement | null;
  built: boolean;
  width: number;
  height: number;
  scale: number;
}

interface FallbackCache {
  ctx: CanvasRenderingContext2D | null;
  width: number;
  height: number;
  built: boolean;
  sky: CanvasGradient | null;
  vignette: CanvasGradient | null;
  nebulae: (CanvasGradient | null)[];
}

export function createBackground(): Background {
  const layers = createStars();
  const staticState: StaticState = { canvas: null, built: false, width: 0, height: 0, scale: 0 };
  const fallback: FallbackCache = {
    ctx: null,
    width: 0,
    height: 0,
    built: false,
    sky: null,
    vignette: null,
    nebulae: [],
  };

  // The transform only changes with the canvas size, so resolve it lazily and
  // keep it cached: getTransform() allocates a matrix and must not run per frame.
  let scaleCtx: CanvasRenderingContext2D | null = null;
  let scaleWidth = -1;
  let scaleHeight = -1;
  let cachedScale = 1;

  const resolveScale = (ctx: CanvasRenderingContext2D): number => {
    const width = ctx.canvas ? ctx.canvas.width : 0;
    const height = ctx.canvas ? ctx.canvas.height : 0;
    if (scaleCtx === ctx && scaleWidth === width && scaleHeight === height) {
      return cachedScale;
    }
    scaleCtx = ctx;
    scaleWidth = width;
    scaleHeight = height;
    cachedScale = 1;
    try {
      if (typeof ctx.getTransform === 'function') {
        const matrix = ctx.getTransform();
        if (matrix && Number.isFinite(matrix.a) && matrix.a > 0.2) {
          cachedScale = clamp(matrix.a, 1, 2);
        }
      }
    } catch {
      // A partial stub context has no transform; 1x is a safe fallback.
    }
    return cachedScale;
  };

  const ensureStatic = (ctx: CanvasRenderingContext2D): void => {
    const width = ctx.canvas ? ctx.canvas.width : 0;
    const height = ctx.canvas ? ctx.canvas.height : 0;
    const scale = resolveScale(ctx);
    if (
      staticState.built &&
      staticState.width === width &&
      staticState.height === height &&
      Math.abs(staticState.scale - scale) < 0.01
    ) {
      return;
    }
    staticState.built = true;
    staticState.width = width;
    staticState.height = height;
    staticState.scale = scale;
    staticState.canvas = null;

    const canvas = createCanvas(FIELD_W * scale, FIELD_H * scale);
    const sctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !sctx) return;
    sctx.scale(scale, scale);
    paintStatic(sctx);
    staticState.canvas = canvas;
  };

  const ensureFallback = (ctx: CanvasRenderingContext2D): void => {
    const width = ctx.canvas ? ctx.canvas.width : 0;
    const height = ctx.canvas ? ctx.canvas.height : 0;
    if (
      fallback.ctx === ctx &&
      fallback.width === width &&
      fallback.height === height &&
      fallback.built
    ) {
      return;
    }
    fallback.ctx = ctx;
    fallback.width = width;
    fallback.height = height;
    fallback.built = true;
    fallback.sky = makeLinear(ctx, 0, 0, 0, FIELD_H, SKY_STOPS);
    fallback.vignette = makeLinear(ctx, 0, FIELD_H - 300, 0, FIELD_H, [
      [0, 'rgba(0,0,0,0)'],
      [0.55, 'rgba(2,1,8,0.24)'],
      [1, 'rgba(1,0,6,0.62)'],
    ]);
    fallback.nebulae = NEBULAE.map((nebula) =>
      makeRadial(ctx, nebula.x, nebula.y, nebula.radius, [
        [0, nebula.color],
        [1, 'rgba(0,0,0,0)'],
      ]),
    );
  };

  const drawFallbackBase = (ctx: CanvasRenderingContext2D): void => {
    ensureFallback(ctx);
    ctx.fillStyle = fallback.sky ?? '#070b24';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    for (let i = 0; i < NEBULAE.length; i += 1) {
      const gradient = fallback.nebulae[i];
      const spec = NEBULAE[i] as NebulaSpec;
      if (!gradient) continue;
      ctx.globalAlpha = spec.alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(spec.x, spec.y, spec.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(92,214,255,0.045)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = 25; x < FIELD_W; x += 50) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD_H);
    }
    for (let y = 30; y < FIELD_H; y += 50) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD_W, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(1,2,10,0.16)';
    for (let y = 0; y < FIELD_H; y += 4) ctx.fillRect(0, y, FIELD_W, 1);
    if (fallback.vignette) {
      ctx.fillStyle = fallback.vignette;
      ctx.fillRect(0, FIELD_H - 300, FIELD_W, 300);
    }
  };

  const updateStars = (dt: number, motion: number): void => {
    if (dt <= 0) return;
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l] as StarLayer;
      const step = layer.speed * motion * dt;
      const stars = layer.stars;
      for (let s = 0; s < stars.length; s += 1) {
        const star = stars[s] as Star;
        star.y += step;
        if (star.y > FIELD_H + 2) {
          star.y -= FIELD_H + 4;
          star.x += 17;
          if (star.x > FIELD_W) star.x -= FIELD_W;
        }
      }
    }
  };

  const drawStars = (ctx: CanvasRenderingContext2D, time: number): void => {
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l] as StarLayer;
      ctx.fillStyle = layer.color;
      const stars = layer.stars;
      for (let s = 0; s < stars.length; s += 1) {
        const star = stars[s] as Star;
        ctx.globalAlpha = star.alpha * (0.74 + 0.26 * Math.sin(time * 1.6 + star.twinkle));
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
    }
    ctx.globalAlpha = 1;
  };

  return {
    draw(ctx, world, time, dt) {
      updateStars(dt, world === null ? 0.35 : 1);
      ensureStatic(ctx);
      if (staticState.canvas) {
        ctx.drawImage(staticState.canvas, 0, 0, FIELD_W, FIELD_H);
      } else {
        drawFallbackBase(ctx);
      }
      drawStars(ctx, time);

      if (world !== null) {
        if (world.boss !== null && world.boss !== undefined) {
          ctx.globalAlpha = 0.075 + 0.035 * (0.5 + 0.5 * Math.sin(time * 1.1));
          ctx.fillStyle = '#7a2dbe';
          ctx.fillRect(0, 0, FIELD_W, FIELD_H);
          ctx.globalAlpha = 1;
        }
        const bombTime = world.bombTime;
        if ((bombTime !== undefined && bombTime > 0) || world.bombing === true) {
          ctx.globalAlpha = 0.1 + 0.09 * Math.abs(Math.sin(time * 14));
          ctx.fillStyle = '#9ffcff';
          ctx.fillRect(0, 0, FIELD_W, FIELD_H);
          ctx.globalAlpha = 1;
        }
      }
    },
  };
}
