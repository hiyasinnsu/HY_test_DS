import type { Rect } from './layout';
import { COLORS, font } from './theme';

/**
 * Gradients are the one canvas object that is expensive to build, and the UI
 * look uses a lot of them. They only depend on size, so every helper below
 * creates one on first use and reuses it by key at local coordinates.
 */
export interface GradientCache {
  readonly gradients: Map<string, CanvasGradient>;
}

export function createGradientCache(): GradientCache {
  return { gradients: new Map<string, CanvasGradient>() };
}

export type GradientStops = readonly (readonly [number, string])[];

function verticalGradient(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  key: string,
  height: number,
  stops: GradientStops,
): CanvasGradient {
  const cacheKey = `v|${key}|${height}`;
  const cached = cache.gradients.get(cacheKey);
  if (cached) return cached;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  cache.gradients.set(cacheKey, gradient);
  return gradient;
}

function horizontalGradient(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  key: string,
  width: number,
  stops: GradientStops,
): CanvasGradient {
  const cacheKey = `h|${key}|${width}`;
  const cached = cache.gradients.get(cacheKey);
  if (cached) return cached;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  cache.gradients.set(cacheKey, gradient);
  return gradient;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  color: string,
  rect: Rect,
  radius: number,
): void {
  ctx.fillStyle = color;
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fill();
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  color: string,
  rect: Rect,
  radius: number,
  lineWidth = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.stroke();
}

export function fillVerticalGradient(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  key: string,
  rect: Rect,
  stops: GradientStops,
): void {
  const gradient = verticalGradient(ctx, cache, key, rect.h, stops);
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, rect.w, rect.h);
  ctx.restore();
}

export function fillRoundRectGradient(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  key: string,
  rect: Rect,
  radius: number,
  stops: GradientStops,
): void {
  const gradient = verticalGradient(ctx, cache, key, rect.h, stops);
  ctx.save();
  ctx.translate(rect.x, rect.y);
  roundRectPath(ctx, 0, 0, rect.w, rect.h, radius);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

export function fillHorizontalGradient(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  key: string,
  rect: Rect,
  stops: GradientStops,
): void {
  const gradient = horizontalGradient(ctx, cache, key, rect.w, stops);
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, rect.w, rect.h);
  ctx.restore();
}

// ------------------------------------------------------------------------ text

export interface TextStyle {
  readonly size: number;
  readonly weight?: number;
  readonly mono?: boolean;
  readonly color?: string;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
  readonly spacing?: number;
  readonly alpha?: number;
  readonly maxWidth?: number;
}

/** fillText with manual letter spacing (canvas has no letter-spacing). */
export function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: CanvasTextAlign = 'left',
): void {
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width + spacing;
  width = Math.max(0, width - spacing);
  let cursor =
    align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.textAlign = 'left';
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  ctx.save();
  ctx.font = font(style.size, style.weight ?? 600, style.mono ?? false);
  ctx.fillStyle = style.color ?? COLORS.white;
  ctx.textBaseline = style.baseline ?? 'alphabetic';
  if (style.alpha !== undefined) ctx.globalAlpha = style.alpha;
  const spacing = style.spacing ?? 0;
  if (spacing > 0) drawSpacedText(ctx, text, x, y, spacing, style.align ?? 'left');
  else {
    ctx.textAlign = style.align ?? 'left';
    // Dynamic strings (boss / spell names) can be squeezed so they never
    // escape the playfield.
    if (style.maxWidth !== undefined) ctx.fillText(text, x, y, style.maxWidth);
    else ctx.fillText(text, x, y);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------- panels

export const PANEL_STOPS: GradientStops = [
  [0, 'rgba(30, 18, 66, 0.96)'],
  [0.55, 'rgba(16, 9, 38, 0.97)'],
  [1, 'rgba(8, 4, 22, 0.98)'],
];

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  rect: Rect,
  accent: string = COLORS.cyan,
): void {
  fillRoundRectGradient(ctx, cache, 'panel', rect, 22, PANEL_STOPS);
  strokeRoundRect(ctx, 'rgba(128, 238, 255, 0.32)', rect, 22, 1.4);
  strokeRoundRect(
    ctx,
    'rgba(255, 255, 255, 0.05)',
    { x: rect.x + 6, y: rect.y + 6, w: rect.w - 12, h: rect.h - 12 },
    18,
    1,
  );

  // Thin neon brackets on the four corners.
  const len = 18;
  const inset = 13;
  const x0 = rect.x + inset;
  const y0 = rect.y + inset;
  const x1 = rect.x + rect.w - inset;
  const y1 = rect.y + rect.h - inset;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x0, y1 - len);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0 + len, y1);
  ctx.moveTo(x1 - len, y1);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, y1 - len);
  ctx.stroke();
  ctx.restore();
}

export function drawDimOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tint: string = 'rgba(4, 2, 12, 0.74)',
): void {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
}

// --------------------------------------------------------------------- buttons

export type ButtonTone = 'primary' | 'cyan' | 'ghost' | 'danger';

const BUTTON_STOPS: Record<ButtonTone, GradientStops> = {
  primary: [
    [0, 'rgba(118, 40, 122, 0.95)'],
    [0.55, 'rgba(58, 20, 84, 0.96)'],
    [1, 'rgba(24, 10, 46, 0.97)'],
  ],
  cyan: [
    [0, 'rgba(26, 74, 108, 0.92)'],
    [0.55, 'rgba(18, 38, 74, 0.95)'],
    [1, 'rgba(8, 18, 42, 0.97)'],
  ],
  ghost: [
    [0, 'rgba(24, 20, 52, 0.9)'],
    [1, 'rgba(10, 7, 26, 0.94)'],
  ],
  danger: [
    [0, 'rgba(104, 26, 60, 0.95)'],
    [1, 'rgba(34, 8, 28, 0.96)'],
  ],
};

export interface ButtonOptions {
  readonly tone?: ButtonTone;
  readonly disabled?: boolean;
  readonly sub?: string;
  readonly fontSize?: number;
  readonly spacing?: number;
  /** 0..1 extra border glow for the primary call to action. */
  readonly pulse?: number;
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  rect: Rect,
  label: string,
  options: ButtonOptions = {},
): void {
  const tone = options.disabled ? 'ghost' : (options.tone ?? 'ghost');
  const pulse = options.pulse ?? 0;
  fillRoundRectGradient(ctx, cache, `btn|${tone}`, rect, 14, BUTTON_STOPS[tone]);

  const border =
    tone === 'primary'
      ? `rgba(255, 140, 236, ${0.66 + pulse * 0.34})`
      : tone === 'cyan'
        ? 'rgba(120, 244, 255, 0.62)'
        : tone === 'danger'
          ? 'rgba(255, 84, 112, 0.72)'
          : 'rgba(150, 172, 230, 0.3)';
  strokeRoundRect(ctx, border, rect, 14, tone === 'ghost' ? 1.1 : 1.8);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x + 18, rect.y + 2.5);
  ctx.lineTo(rect.x + rect.w - 18, rect.y + 2.5);
  ctx.stroke();

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const color = options.disabled
    ? 'rgba(200, 212, 255, 0.38)'
    : tone === 'ghost'
      ? COLORS.soft
      : COLORS.white;
  const size = options.fontSize ?? 18;
  if ((options.spacing ?? 0) > 0) {
    ctx.font = font(size, 700);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    drawSpacedText(ctx, label, cx, cy + (options.sub ? -8 : 1), options.spacing ?? 0, 'center');
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(size, 700);
    ctx.fillStyle = color;
    ctx.fillText(label, cx, cy + (options.sub ? -8 : 1));
  }
  if (options.sub) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(13, 600);
    ctx.fillStyle = options.disabled ? 'rgba(200, 212, 255, 0.3)' : COLORS.dim;
    ctx.fillText(options.sub, cx, cy + 15);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------- glyphs

export function shipPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const halfW = size * 0.42;
  const halfH = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy + halfH);
  ctx.lineTo(cx, cy + halfH * 0.42);
  ctx.lineTo(cx - halfW, cy + halfH);
  ctx.closePath();
}

export function drawShipIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  shipPath(ctx, cx, cy, size);
  ctx.fillStyle = color;
  ctx.fill();
}

export function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx + radius * 0.8, cy);
  ctx.lineTo(cx, cy + radius);
  ctx.lineTo(cx - radius * 0.8, cy);
  ctx.closePath();
}

export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
): void {
  diamondPath(ctx, cx, cy, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Four-point sparkle used for the stardust motif. */
export function drawSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
): void {
  const inner = radius * 0.16;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx + inner, cy - inner, cx + radius, cy);
  ctx.quadraticCurveTo(cx + inner, cy + inner, cx, cy + radius);
  ctx.quadraticCurveTo(cx - inner, cy + inner, cx - radius, cy);
  ctx.quadraticCurveTo(cx - inner, cy - inner, cx, cy - radius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
