/**
 * Procedural sprite atlas.
 *
 * Every bitmap the renderer needs is painted once into an offscreen canvas at
 * startup (3x supersampled, then downscaled by drawImage) so the per-frame path
 * is nothing but drawImage calls: no paths, gradients or shadowBlur at draw
 * time. Environments without a DOM canvas (headless tests) get the same sprite
 * descriptors with `image: null`; `drawSprite` then falls back to two circles so
 * the renderer still runs without throwing.
 */

import { TAU } from '../core/math';
import { BULLET_COLORS } from '../game/constants';
import type { BulletColor, BulletKind, EnemyKind, Item } from '../game/types';

export const SPRITE_SUPERSAMPLE = 3;

export type GlowTint = 'white' | 'cyan' | 'violet';

export interface Sprite {
  /** Logical size in playfield units (drawImage target size). */
  readonly width: number;
  readonly height: number;
  /** Offscreen bitmap; null when the platform has no canvas (headless tests). */
  readonly image: CanvasImageSource | null;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly color: string;
  readonly core: string;
  readonly radius: number;
}

const SS = SPRITE_SUPERSAMPLE;
const BULLET_KINDS: readonly BulletKind[] = ['orb', 'rice', 'arrow', 'big', 'star', 'bubble'];
const BULLET_COLOR_ORDER: readonly BulletColor[] = [
  'red',
  'pink',
  'purple',
  'blue',
  'cyan',
  'green',
  'yellow',
  'white',
];

interface BulletSize {
  readonly w: number;
  readonly h: number;
}

const BULLET_SIZE: Record<BulletKind, BulletSize> = {
  orb: { w: 24, h: 24 },
  rice: { w: 28, h: 16 },
  arrow: { w: 28, h: 18 },
  big: { w: 40, h: 40 },
  star: { w: 30, h: 30 },
  bubble: { w: 46, h: 46 },
};

interface Palette {
  readonly base: string;
  readonly core: string;
  readonly rim: string;
  /** "r,g,b" for building rgba() strings while pre-rendering. */
  readonly rgb: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
}

function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${toHex(a.r + (b.r - a.r) * amount)}${toHex(a.g + (b.g - a.g) * amount)}${toHex(
    a.b + (b.b - a.b) * amount,
  )}`;
}

function rgba(rgb: string, alpha: number): string {
  return `rgba(${rgb},${alpha})`;
}

const BULLET_PALETTES: Record<BulletColor, Palette> = (() => {
  const out = {} as Record<BulletColor, Palette>;
  for (const color of BULLET_COLOR_ORDER) {
    const base = BULLET_COLORS[color];
    const { r, g, b } = hexToRgb(base);
    out[color] = {
      base,
      core: mixHex(base, '#ffffff', 0.7),
      rim: mixHex(base, '#050212', 0.66),
      rgb: `${r},${g},${b}`,
    };
  }
  return out;
})();

const CYAN_RGB = '104,236,255';
const VIOLET_RGB = '158,116,255';
const MAGENTA_RGB = '255,96,214';
const GOLD_RGB = '255,214,110';
const WHITE_RGB = '240,248,255';

function fillCircle(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
}

function fillDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function fillEllipse(ctx: CanvasRenderingContext2D, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** Baked radial glow. Called only while building the atlas, never per frame. */
function paintGlow(
  ctx: CanvasRenderingContext2D,
  radius: number,
  rgb: string,
  alpha: number,
): void {
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.04, 0, 0, radius);
  gradient.addColorStop(0, rgba(rgb, alpha));
  gradient.addColorStop(0.5, rgba(rgb, alpha * 0.42));
  gradient.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
}

function starPath(
  ctx: CanvasRenderingContext2D,
  outer: number,
  inner: number,
  points: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintOrb(ctx: CanvasRenderingContext2D, palette: Palette): void {
  paintGlow(ctx, 11.5, palette.rgb, 0.55);
  ctx.fillStyle = palette.rim;
  fillCircle(ctx, 7);
  ctx.fillStyle = palette.base;
  fillCircle(ctx, 6.1);
  ctx.fillStyle = palette.core;
  fillCircle(ctx, 3.3);
  ctx.fillStyle = rgba(WHITE_RGB, 0.92);
  fillDot(ctx, -1.7, -1.8, 1.35);
}

function paintRice(ctx: CanvasRenderingContext2D, palette: Palette): void {
  ctx.save();
  ctx.scale(1.7, 1);
  paintGlow(ctx, 7.2, palette.rgb, 0.46);
  ctx.restore();
  ctx.fillStyle = palette.rim;
  fillEllipse(ctx, 9.2, 4.9);
  ctx.fillStyle = palette.base;
  fillEllipse(ctx, 8, 3.8);
  ctx.fillStyle = palette.core;
  fillEllipse(ctx, 5.2, 2.2);
  ctx.fillStyle = rgba(WHITE_RGB, 0.9);
  fillDot(ctx, -2.2, -1, 1.1);
}

function paintArrow(ctx: CanvasRenderingContext2D, palette: Palette): void {
  paintGlow(ctx, 12, palette.rgb, 0.48);
  const arrow = (scale: number): void => {
    ctx.beginPath();
    ctx.moveTo(10 * scale, 0);
    ctx.lineTo(-7 * scale, -6.4 * scale);
    ctx.lineTo(-3.2 * scale, 0);
    ctx.lineTo(-7 * scale, 6.4 * scale);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = palette.rim;
  arrow(1.16);
  ctx.fillStyle = palette.base;
  arrow(0.98);
  ctx.fillStyle = palette.core;
  arrow(0.5);
  ctx.fillStyle = rgba(WHITE_RGB, 0.9);
  fillDot(ctx, 2.4, -0.6, 1.05);
}

function paintBig(ctx: CanvasRenderingContext2D, palette: Palette): void {
  paintGlow(ctx, 19.5, palette.rgb, 0.58);
  ctx.fillStyle = palette.rim;
  fillCircle(ctx, 13);
  ctx.fillStyle = palette.base;
  fillCircle(ctx, 11.8);
  ctx.strokeStyle = rgba(WHITE_RGB, 0.4);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, 9.2, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = palette.core;
  fillCircle(ctx, 6.4);
  ctx.fillStyle = rgba(WHITE_RGB, 0.95);
  fillCircle(ctx, 2.6);
}

function paintStar(ctx: CanvasRenderingContext2D, palette: Palette): void {
  paintGlow(ctx, 14, palette.rgb, 0.5);
  ctx.fillStyle = palette.rim;
  starPath(ctx, 13, 5.7, 5);
  ctx.fill();
  ctx.fillStyle = palette.base;
  starPath(ctx, 11.2, 4.9, 5);
  ctx.fill();
  ctx.fillStyle = palette.core;
  starPath(ctx, 6.1, 2.6, 5);
  ctx.fill();
  ctx.fillStyle = rgba(WHITE_RGB, 0.9);
  fillCircle(ctx, 1.6);
}

function paintBubble(ctx: CanvasRenderingContext2D, palette: Palette): void {
  paintGlow(ctx, 21, palette.rgb, 0.45);
  ctx.fillStyle = palette.rim;
  fillCircle(ctx, 15.2);
  ctx.fillStyle = rgba(palette.rgb, 0.24);
  fillCircle(ctx, 13.4);
  ctx.strokeStyle = palette.base;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(0, 0, 12.8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(WHITE_RGB, 0.55);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, 9.6, -2.5, -1.25);
  ctx.stroke();
  ctx.fillStyle = palette.core;
  fillCircle(ctx, 3.4);
  ctx.fillStyle = rgba(WHITE_RGB, 0.95);
  fillCircle(ctx, 1.5);
}

const BULLET_PAINTERS: Record<BulletKind, (ctx: CanvasRenderingContext2D, palette: Palette) => void> =
  {
    orb: paintOrb,
    rice: paintRice,
    arrow: paintArrow,
    big: paintBig,
    star: paintStar,
    bubble: paintBubble,
  };

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return canvas;
  } catch {
    return null;
  }
}

function fallbackSprite(
  width: number,
  height: number,
  color: string,
  core: string,
  radius: number,
): Sprite {
  return {
    width,
    height,
    image: null,
    sx: 0,
    sy: 0,
    sw: 0,
    sh: 0,
    color,
    core,
    radius,
  };
}

// ------------------------------------------------------------------ bullet atlas

const ATLAS_CELL = 144;
const ATLAS_COLS = BULLET_COLOR_ORDER.length;
const ATLAS_ROWS = BULLET_KINDS.length;
const ATLAS_W = ATLAS_CELL * ATLAS_COLS;
const ATLAS_H = ATLAS_CELL * ATLAS_ROWS;

type BulletSpriteTable = Record<BulletKind, Record<BulletColor, Sprite>>;

let bulletTable: BulletSpriteTable | null = null;

function buildBulletAtlas(): BulletSpriteTable {
  const table = {} as BulletSpriteTable;
  for (const kind of BULLET_KINDS) table[kind] = {} as Record<BulletColor, Sprite>;

  const atlas = createCanvas(ATLAS_W, ATLAS_H);
  const ctx = atlas ? atlas.getContext('2d') : null;

  for (let row = 0; row < BULLET_KINDS.length; row += 1) {
    const kind = BULLET_KINDS[row] as BulletKind;
    const size = BULLET_SIZE[kind];
    const painter = BULLET_PAINTERS[kind];
    for (let col = 0; col < BULLET_COLOR_ORDER.length; col += 1) {
      const color = BULLET_COLOR_ORDER[col] as BulletColor;
      const palette = BULLET_PALETTES[color];
      if (!ctx) {
        table[kind][color] = fallbackSprite(
          size.w,
          size.h,
          palette.base,
          palette.core,
          Math.min(size.w, size.h) * 0.3,
        );
        continue;
      }
      const cellX = col * ATLAS_CELL;
      const cellY = row * ATLAS_CELL;
      ctx.save();
      ctx.translate(cellX + ATLAS_CELL / 2, cellY + ATLAS_CELL / 2);
      ctx.scale(SS, SS);
      painter(ctx, palette);
      ctx.restore();

      const sw = Math.round(size.w * SS);
      const sh = Math.round(size.h * SS);
      table[kind][color] = {
        width: size.w,
        height: size.h,
        image: atlas,
        sx: cellX + Math.round((ATLAS_CELL - sw) / 2),
        sy: cellY + Math.round((ATLAS_CELL - sh) / 2),
        sw,
        sh,
        color: palette.base,
        core: palette.core,
        radius: Math.min(size.w, size.h) * 0.3,
      };
    }
  }
  return table;
}

function ensureBulletTable(): BulletSpriteTable {
  if (!bulletTable) bulletTable = buildBulletAtlas();
  return bulletTable;
}

export function getBulletSprite(kind: BulletKind, color: BulletColor): Sprite {
  return ensureBulletTable()[kind][color];
}

// --------------------------------------------------------------- standalone sprites

interface ExtraSprites {
  readonly player: Sprite;
  readonly shot: Sprite;
  readonly hitbox: Sprite;
  readonly enemies: Record<EnemyKind, Sprite>;
  readonly items: Record<Item['kind'], Sprite>;
  readonly glow: Record<GlowTint, Sprite>;
}

let extras: ExtraSprites | null = null;

function makeStandalone(
  width: number,
  height: number,
  color: string,
  core: string,
  radius: number,
  painter: (ctx: CanvasRenderingContext2D) => void,
): Sprite {
  const canvas = createCanvas(width * SS, height * SS);
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!canvas || !ctx) return fallbackSprite(width, height, color, core, radius);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(SS, SS);
  painter(ctx);
  ctx.restore();
  return {
    width,
    height,
    image: canvas,
    sx: 0,
    sy: 0,
    sw: canvas.width,
    sh: canvas.height,
    color,
    core,
    radius,
  };
}

function paintPlayer(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 22, CYAN_RGB, 0.3);
  paintGlow(ctx, 9, MAGENTA_RGB, 0.32);

  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(6, -7);
  ctx.lineTo(21, 10);
  ctx.lineTo(19, 16);
  ctx.lineTo(6, 11);
  ctx.lineTo(3, 19);
  ctx.lineTo(-3, 19);
  ctx.lineTo(-6, 11);
  ctx.lineTo(-19, 16);
  ctx.lineTo(-21, 10);
  ctx.lineTo(-6, -7);
  ctx.closePath();
  ctx.fillStyle = '#0b1030';
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#8ef6ff';
  ctx.stroke();

  const hull = ctx.createLinearGradient(0, -20, 0, 18);
  hull.addColorStop(0, '#f0ffff');
  hull.addColorStop(0.35, '#57dcff');
  hull.addColorStop(1, '#6a4bff');
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(4.2, -4);
  ctx.lineTo(8.4, 8);
  ctx.lineTo(0, 5);
  ctx.lineTo(-8.4, 8);
  ctx.lineTo(-4.2, -4);
  ctx.closePath();
  ctx.fillStyle = hull;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -4.5, 3, 6.4, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -5, 1.4, 3.6, 0, 0, TAU);
  ctx.fillStyle = '#2ad8ff';
  ctx.fill();

  ctx.fillStyle = rgba(MAGENTA_RGB, 0.8);
  fillDot(ctx, -12.5, 12, 2.2);
  fillDot(ctx, 12.5, 12, 2.2);

  ctx.fillStyle = '#f6ffff';
  ctx.beginPath();
  ctx.moveTo(-3.4, 16);
  ctx.lineTo(0, 27);
  ctx.lineTo(3.4, 16);
  ctx.closePath();
  ctx.fill();
}

function paintFairy(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 21, MAGENTA_RGB, 0.24);
  ctx.fillStyle = rgba(VIOLET_RGB, 0.5);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 10, -2);
    ctx.rotate(side * 0.55);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#34114f';
  fillEllipse(ctx, 5.4, 12.6);
  ctx.fillStyle = '#b45cff';
  fillEllipse(ctx, 4.4, 11.2);
  ctx.fillStyle = '#ffd8f6';
  fillCircle(ctx, 4.2);
  ctx.fillStyle = '#331144';
  fillDot(ctx, -1.4, -0.4, 1);
  fillDot(ctx, 1.4, -0.4, 1);
  ctx.fillStyle = '#ff4fb2';
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(3.4, 7.4);
  ctx.lineTo(0, 12);
  ctx.lineTo(-3.4, 7.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(WHITE_RGB, 0.95);
  fillDot(ctx, 0, 8, 1.6);
}

function paintTurret(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 24, CYAN_RGB, 0.2);
  const hex = (radius: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i * TAU) / 6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#160b2c';
  hex(19);
  ctx.strokeStyle = '#8c72ff';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#3b2468';
  hex(14.5);
  ctx.fillStyle = '#17294a';
  ctx.fillRect(-4.2, 6, 8.4, 16);
  ctx.strokeStyle = '#5ce8ff';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-4.2, 6, 8.4, 16);
  ctx.fillStyle = '#5ce8ff';
  fillDot(ctx, 0, 19, 2.3);
  ctx.fillStyle = '#9f7bff';
  fillCircle(ctx, 8.2);
  ctx.fillStyle = '#eaffff';
  fillCircle(ctx, 3.4);
  ctx.fillStyle = rgba(CYAN_RGB, 0.7);
  fillCircle(ctx, 1.4);
}

function paintSpinner(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 23, GOLD_RGB, 0.18);
  for (let i = 0; i < 6; i += 1) {
    ctx.save();
    ctx.rotate((i * TAU) / 6);
    ctx.fillStyle = i % 2 === 0 ? '#4d2a86' : '#2a1750';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(5, -18);
    ctx.lineTo(0, -22);
    ctx.lineTo(-5, -18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#1b0c34';
  fillCircle(ctx, 11);
  ctx.strokeStyle = '#ffd76b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffbf4d';
  starPath(ctx, 7, 3, 6);
  ctx.fill();
  ctx.fillStyle = '#fff9e8';
  fillCircle(ctx, 2.4);
}

function paintBoss(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 84, MAGENTA_RGB, 0.24);
  paintGlow(ctx, 46, VIOLET_RGB, 0.2);

  ctx.fillStyle = '#0d0620';
  fillCircle(ctx, 71);
  ctx.strokeStyle = rgba(VIOLET_RGB, 0.75);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 69, 0, TAU);
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    ctx.save();
    ctx.rotate((i * TAU) / 12);
    ctx.fillStyle = i % 2 === 0 ? '#3c145e' : '#241044';
    ctx.beginPath();
    ctx.ellipse(0, -49, 8.5, 21, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(MAGENTA_RGB, i % 2 === 0 ? 0.5 : 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#1d0a38';
  fillCircle(ctx, 41);
  ctx.strokeStyle = rgba(CYAN_RGB, 0.48);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 37, 0, TAU);
  ctx.stroke();

  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 27);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.3, '#ff8ce6');
  core.addColorStop(0.7, '#b44cff');
  core.addColorStop(1, 'rgba(70,20,130,0.9)');
  ctx.fillStyle = core;
  fillCircle(ctx, 26);

  ctx.fillStyle = rgba(WHITE_RGB, 0.95);
  fillCircle(ctx, 8);
  ctx.strokeStyle = '#ff9bf0';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 31, -2.5, -0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 31, 0.65, 2.65);
  ctx.stroke();
}

function paintShot(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 8, CYAN_RGB, 0.55);
  ctx.fillStyle = '#d9fbff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.4, 8.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, -1.2, 1.1, 4.6, 0, 0, TAU);
  ctx.fill();
}

function paintHitbox(ctx: CanvasRenderingContext2D): void {
  paintGlow(ctx, 9, CYAN_RGB, 0.55);
  ctx.strokeStyle = rgba(CYAN_RGB, 0.85);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, 5.8, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  fillCircle(ctx, 2.5);
  ctx.fillStyle = rgba(WHITE_RGB, 0.55);
  fillCircle(ctx, 4);
}

type GemSize = { readonly w: number; readonly h: number; readonly r: number };

const ITEM_SIZES: Record<Item['kind'], GemSize> = {
  point: { w: 22, h: 22, r: 8 },
  power: { w: 24, h: 24, r: 9 },
  bigPower: { w: 34, h: 34, r: 12.5 },
};

const ITEM_COLORS: Record<Item['kind'], { base: string; core: string; rgb: string }> = {
  point: { base: '#5b8cff', core: '#dbe8ff', rgb: '91,140,255' },
  power: { base: '#ff5a7c', core: '#ffe0e8', rgb: '255,90,124' },
  bigPower: { base: '#ff7ae0', core: '#fff0fb', rgb: '255,122,224' },
};

function paintGem(
  ctx: CanvasRenderingContext2D,
  kind: Item['kind'],
): void {
  const size = ITEM_SIZES[kind];
  const palette = ITEM_COLORS[kind];
  const r = size.r;
  // Keep the baked glow inside the sprite bounds so the atlas source rect does
  // not crop it.
  paintGlow(ctx, r * 1.28, palette.rgb, kind === 'bigPower' ? 0.62 : 0.45);
  if (kind === 'bigPower') {
    ctx.strokeStyle = rgba(palette.rgb, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3.6, 0, TAU);
    ctx.stroke();
  }
  const diamond = (radius: number): void => {
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.78, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius * 0.78, 0);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#0a0b22';
  diamond(r + 1.8);
  ctx.fillStyle = palette.base;
  diamond(r);
  ctx.fillStyle = palette.core;
  diamond(r * 0.52);
  ctx.fillStyle = rgba(WHITE_RGB, 0.9);
  fillDot(ctx, -r * 0.22, -r * 0.3, r * 0.18);
}

function paintGlowSprite(ctx: CanvasRenderingContext2D, rgb: string): void {
  paintGlow(ctx, 62, rgb, 0.85);
}

function buildExtras(): ExtraSprites {
  const enemyColors: Record<EnemyKind, { base: string; core: string; radius: number }> = {
    fairy: { base: '#b45cff', core: '#ffd8f6', radius: 21 },
    turret: { base: '#5ce8ff', core: '#eaffff', radius: 26 },
    spinner: { base: '#ffd76b', core: '#fff9e8', radius: 23 },
    boss: { base: '#ff6ad8', core: '#ffffff', radius: 78 },
  };
  const enemyPainters: Record<EnemyKind, (ctx: CanvasRenderingContext2D) => void> = {
    fairy: paintFairy,
    turret: paintTurret,
    spinner: paintSpinner,
    boss: paintBoss,
  };
  const enemies = {} as Record<EnemyKind, Sprite>;
  for (const kind of ['fairy', 'turret', 'spinner', 'boss'] as const) {
    const info = enemyColors[kind];
    const size = kind === 'boss' ? 170 : kind === 'turret' ? 56 : 50;
    enemies[kind] = makeStandalone(
      size,
      size,
      info.base,
      info.core,
      info.radius,
      enemyPainters[kind],
    );
  }

  const items = {} as Record<Item['kind'], Sprite>;
  for (const kind of ['point', 'power', 'bigPower'] as const) {
    const size = ITEM_SIZES[kind];
    const palette = ITEM_COLORS[kind];
    items[kind] = makeStandalone(size.w, size.h, palette.base, palette.core, size.r, (ctx) =>
      paintGem(ctx, kind),
    );
  }

  const glow = {} as Record<GlowTint, Sprite>;
  const glowColors: Record<GlowTint, string> = {
    white: WHITE_RGB,
    cyan: CYAN_RGB,
    violet: VIOLET_RGB,
  };
  for (const tint of ['white', 'cyan', 'violet'] as const) {
    glow[tint] = makeStandalone(128, 128, '#ffffff', '#ffffff', 64, (ctx) =>
      paintGlowSprite(ctx, glowColors[tint]),
    );
  }

  return {
    player: makeStandalone(48, 56, '#5ce8ff', '#ffffff', 18, paintPlayer),
    shot: makeStandalone(16, 24, '#5ce8ff', '#ffffff', 6, paintShot),
    hitbox: makeStandalone(20, 20, '#5ce8ff', '#ffffff', 6, paintHitbox),
    enemies,
    items,
    glow,
  };
}

function ensureExtras(): ExtraSprites {
  if (!extras) extras = buildExtras();
  return extras;
}

export function getPlayerSprite(): Sprite {
  return ensureExtras().player;
}

export function getPlayerShotSprite(): Sprite {
  return ensureExtras().shot;
}

export function getHitboxSprite(): Sprite {
  return ensureExtras().hitbox;
}

export function getEnemySprite(kind: EnemyKind): Sprite {
  return ensureExtras().enemies[kind];
}

export function getItemSprite(kind: Item['kind']): Sprite {
  return ensureExtras().items[kind];
}

export function getGlowSprite(tint: GlowTint): Sprite {
  return ensureExtras().glow[tint];
}

/**
 * Blits a sprite centred on (x, y). `rotation` is radians, `scale` multiplies
 * the logical size. No state other than the transform is changed, so callers
 * keep control of globalAlpha / composite mode.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  rotation = 0,
  scale = 1,
): void {
  const dw = sprite.width * scale;
  const dh = sprite.height * scale;
  const image = sprite.image;
  if (image !== null) {
    if (rotation === 0) {
      ctx.drawImage(image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    return;
  }

  // Headless fallback: enough shape for tests and for a canvas-less platform.
  const radius = sprite.radius * scale;
  ctx.fillStyle = sprite.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = sprite.core;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.48, 0, TAU);
  ctx.fill();
}
