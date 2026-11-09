import { clamp, TAU } from '../core/math';
import {
  DIFFICULTIES,
  FIELD_H,
  FIELD_W,
  HUD_H,
  MAX_BOMBS,
  MAX_POWER,
} from '../game/constants';
import type { AppScreen, Difficulty, UiAction, UiModel } from '../game/types';
import {
  createGradientCache,
  drawButton,
  drawDiamond,
  drawDimOverlay,
  drawPanel,
  drawShipIcon,
  drawSparkle,
  drawSpacedText,
  drawText,
  fillHorizontalGradient,
  fillRoundRect,
  fillRoundRectGradient,
  fillVerticalGradient,
  roundRectPath,
  strokeRoundRect,
  type GradientCache,
  type GradientStops,
} from './draw';
import { formatScore, formatTime } from './format';
import {
  contains,
  NO_INSETS,
  normalizeInsets,
  pauseLayout,
  playLayout,
  resultLayout,
  titleLayout,
  type Insets,
  type PauseLayout,
  type PlayLayout,
  type Rect,
  type ResultLayout,
  type TitleLayout,
} from './layout';
import { COLORS, font } from './theme';

export interface Ui {
  draw(ctx: CanvasRenderingContext2D, model: UiModel, time: number): void;
  hitTest(x: number, y: number): UiAction | null;
  isFocusHeld(x: number, y: number): boolean;
  setSafeArea(top: number, bottom: number): void;
}

const DIFFICULTY_JP: Record<Difficulty, string> = {
  easy: '易しい',
  normal: 'ふつう',
  hard: '難しい',
};

/** Keeps progress-style values finite; NaN would produce NaN paths. */
function safeRatio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return clamp(value / total, 0, 1);
}

interface SparkleSpot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly phase: number;
  readonly color: string;
}

const SPARKLES: readonly SparkleSpot[] = [
  { x: 36, y: 96, r: 2.6, phase: 0.2, color: COLORS.cyan },
  { x: 402, y: 84, r: 2.2, phase: 1.7, color: COLORS.magenta },
  { x: 64, y: 214, r: 1.8, phase: 2.9, color: COLORS.white },
  { x: 388, y: 206, r: 2.4, phase: 0.9, color: COLORS.cyan },
  { x: 28, y: 332, r: 2, phase: 3.6, color: COLORS.violetBright },
  { x: 420, y: 356, r: 2, phase: 2.1, color: COLORS.white },
  { x: 54, y: 468, r: 2.2, phase: 4.2, color: COLORS.cyan },
  { x: 398, y: 500, r: 2, phase: 1.3, color: COLORS.magenta },
  { x: 86, y: 606, r: 1.8, phase: 5.1, color: COLORS.white },
  { x: 360, y: 640, r: 2.2, phase: 0.5, color: COLORS.cyan },
  { x: 30, y: 724, r: 2.4, phase: 2.6, color: COLORS.magenta },
  { x: 418, y: 738, r: 1.8, phase: 3.9, color: COLORS.white },
  { x: 110, y: 46, r: 1.6, phase: 1.1, color: COLORS.cyan },
  { x: 330, y: 40, r: 1.6, phase: 4.7, color: COLORS.magenta },
];

const TITLE_BG: GradientStops = [
  [0, '#06030f'],
  [0.38, '#120728'],
  [0.72, '#0a041c'],
  [1, '#04020c'],
];

const PILL_SELECTED: GradientStops = [
  [0, 'rgba(122, 40, 126, 0.95)'],
  [0.55, 'rgba(62, 20, 90, 0.96)'],
  [1, 'rgba(26, 10, 48, 0.97)'],
];

const PILL_IDLE: GradientStops = [
  [0, 'rgba(24, 18, 50, 0.86)'],
  [1, 'rgba(10, 7, 26, 0.9)'],
];

const START_STOPS: GradientStops = [
  [0, 'rgba(100, 30, 112, 0.95)'],
  [0.52, 'rgba(54, 18, 88, 0.96)'],
  [1, 'rgba(18, 8, 40, 0.97)'],
];

const POWER_STOPS: GradientStops = [
  [0, 'rgba(111, 244, 255, 0.95)'],
  [1, 'rgba(255, 107, 224, 0.95)'],
];

const BOSS_STOPS: GradientStops = [
  [0, '#ff6be0'],
  [0.55, '#b79cff'],
  [1, '#6ff4ff'],
];

const HUD_LINE_STOPS: GradientStops = [
  [0, 'rgba(111, 244, 255, 0)'],
  [0.18, 'rgba(111, 244, 255, 0.6)'],
  [0.82, 'rgba(255, 107, 224, 0.6)'],
  [1, 'rgba(255, 107, 224, 0)'],
];

const BOMB_STOPS: GradientStops = [
  [0, 'rgba(112, 32, 96, 0.94)'],
  [0.55, 'rgba(58, 16, 74, 0.95)'],
  [1, 'rgba(22, 8, 40, 0.96)'],
];

const BOMB_OFF_STOPS: GradientStops = [
  [0, 'rgba(26, 22, 48, 0.88)'],
  [1, 'rgba(10, 8, 24, 0.92)'],
];

const FOCUS_STOPS: GradientStops = [
  [0, 'rgba(22, 72, 100, 0.92)'],
  [0.55, 'rgba(16, 40, 70, 0.94)'],
  [1, 'rgba(8, 18, 40, 0.96)'],
];

const DRAG_DASH: number[] = [5, 5];
const NO_DASH: number[] = [];

// ---------------------------------------------------------------------- title

function drawTitleScreen(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  time: number,
  layout: TitleLayout,
): void {
  fillVerticalGradient(
    ctx,
    cache,
    'title-bg',
    { x: 0, y: 0, w: FIELD_W, h: FIELD_H },
    TITLE_BG,
  );

  // Soft nebula washes, kept to solid translucent circles so no gradient is
  // allocated per frame.
  ctx.save();
  ctx.fillStyle = 'rgba(64, 28, 122, 0.16)';
  ctx.beginPath();
  ctx.arc(352, 468, 94, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(16, 70, 118, 0.12)';
  ctx.beginPath();
  ctx.arc(88, 232, 80, 0, TAU);
  ctx.fill();
  ctx.restore();

  for (const star of SPARKLES) {
    const twinkle = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(time * 1.6 + star.phase));
    ctx.save();
    ctx.globalAlpha = twinkle * 0.8;
    drawSparkle(ctx, star.x, star.y, star.r, star.color);
    ctx.restore();
  }

  const cx = FIELD_W / 2;
  const logoFontSize = 44;

  // Thin rotating orbits behind the logo.
  ctx.save();
  ctx.translate(cx, layout.logoY - 12);
  ctx.rotate(time * 0.16);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(111, 244, 255, 0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0.15, 1.45);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 107, 224, 0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, 96, Math.PI * 1.02, Math.PI * 1.42);
  ctx.stroke();
  ctx.restore();

  drawText(ctx, 'DANMAKU SHOOTER', cx, layout.logoY - 66, {
    size: 13,
    color: COLORS.cyan,
    align: 'center',
    spacing: 5,
    alpha: 0.72,
  });

  ctx.save();
  ctx.font = font(logoFontSize, 700);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255, 107, 224, 0.3)';
  drawSpacedText(ctx, '星屑リフレクション', cx + 1.5, layout.logoY + 2, 4, 'center');
  ctx.fillStyle = '#eef7ff';
  drawSpacedText(ctx, '星屑リフレクション', cx, layout.logoY, 4, 'center');
  ctx.restore();

  drawText(ctx, 'STARDUST REFLECTION', cx, layout.subtitleY, {
    size: 14,
    color: 'rgba(150, 244, 255, 0.8)',
    align: 'center',
    spacing: 7,
  });

  ctx.save();
  ctx.strokeStyle = 'rgba(111, 244, 255, 0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 132, layout.dividerY);
  ctx.lineTo(cx - 26, layout.dividerY);
  ctx.moveTo(cx + 26, layout.dividerY);
  ctx.lineTo(cx + 132, layout.dividerY);
  ctx.stroke();
  ctx.restore();
  drawDiamond(ctx, cx, layout.dividerY, 6, 'rgba(255, 107, 224, 0.85)');

  // Best score for the selected difficulty.
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const bestValue = formatScore(model.best);
  ctx.font = font(14, 600);
  const bestLabelWidth = ctx.measureText('ベスト').width;
  ctx.font = font(18, 700, true);
  const bestValueWidth = ctx.measureText(bestValue).width;
  const gap = 12;
  const bestStart = cx - (bestLabelWidth + gap + bestValueWidth) / 2;
  ctx.font = font(14, 600);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('ベスト', bestStart, layout.bestY);
  ctx.font = font(18, 700, true);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(bestValue, bestStart + bestLabelWidth + gap, layout.bestY);
  ctx.restore();

  drawText(ctx, '難易度', cx, layout.difficultyLabelY, {
    size: 14,
    color: COLORS.dim,
    align: 'center',
    spacing: 4,
  });

  for (const pill of layout.pills) {
    const selected = pill.id === model.difficulty;
    fillRoundRectGradient(
      ctx,
      cache,
      selected ? 'pill-on' : 'pill-off',
      pill.rect,
      12,
      selected ? PILL_SELECTED : PILL_IDLE,
    );
    strokeRoundRect(
      ctx,
      selected ? 'rgba(255, 140, 236, 0.9)' : 'rgba(150, 172, 230, 0.3)',
      pill.rect,
      12,
      selected ? 1.8 : 1.1,
    );
    const pillCx = pill.rect.x + pill.rect.w / 2;
    const pillCy = pill.rect.y + pill.rect.h / 2;
    drawText(ctx, DIFFICULTIES[pill.id].label, pillCx, pillCy - 7, {
      size: 16,
      weight: 700,
      color: selected ? COLORS.white : COLORS.soft,
      align: 'center',
      baseline: 'middle',
      spacing: 2,
    });
    drawText(ctx, DIFFICULTY_JP[pill.id], pillCx, pillCy + 13, {
      size: 13,
      color: selected ? COLORS.cyan : COLORS.dim,
      align: 'center',
      baseline: 'middle',
      spacing: 1,
    });
    if (selected) {
      drawSparkle(ctx, pill.rect.x + pill.rect.w - 13, pill.rect.y + 12, 3.4, COLORS.cyan);
    }
  }

  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  strokeRoundRect(
    ctx,
    `rgba(255, 107, 224, ${0.1 + pulse * 0.16})`,
    { x: layout.start.x - 5, y: layout.start.y - 5, w: layout.start.w + 10, h: layout.start.h + 10 },
    22,
    2,
  );
  fillRoundRectGradient(ctx, cache, 'start', layout.start, 18, START_STOPS);
  strokeRoundRect(
    ctx,
    `rgba(120, 244, 255, ${0.48 + pulse * 0.4})`,
    layout.start,
    18,
    1.6,
  );
  const startCx = layout.start.x + layout.start.w / 2;
  const startCy = layout.start.y + layout.start.h / 2;
  drawText(ctx, 'タップでスタート', startCx, startCy - 12, {
    size: 27,
    weight: 700,
    color: COLORS.white,
    align: 'center',
    baseline: 'middle',
    spacing: 2,
  });
  drawText(ctx, `${DIFFICULTIES[model.difficulty].label} でスタート`, startCx, startCy + 22, {
    size: 13,
    color: COLORS.cyan,
    align: 'center',
    baseline: 'middle',
    spacing: 2,
  });

  drawButton(
    ctx,
    cache,
    layout.sound,
    model.soundEnabled ? 'サウンド ON' : 'サウンド OFF',
    { tone: 'ghost', fontSize: 15, spacing: 1 },
  );

  layout.hints.forEach((line, index) => {
    const y = layout.hintsY + index * 24;
    ctx.save();
    ctx.strokeStyle = 'rgba(111, 244, 255, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 96, y - 4);
    ctx.lineTo(cx - 82, y - 4);
    ctx.moveTo(cx + 82, y - 4);
    ctx.lineTo(cx + 96, y - 4);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, line, cx, y, {
      size: 14,
      color: index === 0 ? COLORS.soft : COLORS.dim,
      align: 'center',
      spacing: 1,
    });
  });
}

// ---------------------------------------------------------------------- HUD

function drawHud(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  layout: PlayLayout,
): void {
  ctx.fillStyle = 'rgba(6, 3, 18, 0.86)';
  ctx.fillRect(0, 0, FIELD_W, HUD_H);
  fillHorizontalGradient(
    ctx,
    cache,
    'hud-line',
    { x: 0, y: HUD_H - 2, w: FIELD_W, h: 2 },
    HUD_LINE_STOPS,
  );

  const progress = safeRatio(model.stageProgress, 1);
  if (progress > 0.001) {
    ctx.fillStyle = 'rgba(111, 244, 255, 0.5)';
    ctx.fillRect(0, HUD_H - 3, FIELD_W * progress, 2);
    ctx.fillStyle = COLORS.magenta;
    ctx.fillRect(Math.max(0, FIELD_W * progress - 2), HUD_H - 4.5, 2, 4.5);
  }

  drawText(ctx, 'スコア', 12, 25, { size: 14, color: COLORS.dim, spacing: 2 });
  drawSparkle(ctx, 124, 19, 3.4, 'rgba(111, 244, 255, 0.85)');
  drawText(ctx, `かすり ${Math.max(0, Math.floor(model.graze))}`, 132, 25, {
    size: 14,
    color: COLORS.soft,
  });
  drawText(ctx, formatScore(model.score), layout.hudRight, 26, {
    size: 18,
    weight: 700,
    mono: true,
    color: COLORS.white,
    align: 'right',
  });

  const lives = clamp(Math.floor(model.lives), 0, 8);
  let lifeX = 15;
  for (let i = 0; i < lives; i += 1) {
    drawShipIcon(ctx, lifeX + 5, 46, 12, 'rgba(111, 244, 255, 0.9)');
    lifeX += 14;
  }

  const bombs = clamp(Math.floor(model.bombs), 0, MAX_BOMBS);
  let bombX = 141;
  for (let i = 0; i < bombs; i += 1) {
    drawDiamond(ctx, bombX + 4, 46, 5, 'rgba(255, 107, 224, 0.9)');
    bombX += 13;
  }

  drawText(ctx, 'パワー', layout.powerBar.x, 41, {
    size: 13,
    color: COLORS.dim,
    spacing: 1,
  });
  fillRoundRect(ctx, 'rgba(120, 140, 220, 0.22)', layout.powerBar, 3);
  const maxPower = Math.max(1, Math.floor(model.maxPower || MAX_POWER));
  const powerRatio = safeRatio(model.power, maxPower);
  if (powerRatio > 0.001) {
    fillVerticalGradient(
      ctx,
      cache,
      'power-fill',
      {
        x: layout.powerBar.x,
        y: layout.powerBar.y,
        w: layout.powerBar.w * powerRatio,
        h: layout.powerBar.h,
      },
      POWER_STOPS,
    );
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 216, 255, 0.3)';
  ctx.lineWidth = 1;
  for (let i = 1; i < maxPower; i += 1) {
    const tickX = layout.powerBar.x + (layout.powerBar.w * i) / maxPower;
    ctx.beginPath();
    ctx.moveTo(tickX, layout.powerBar.y);
    ctx.lineTo(tickX, layout.powerBar.y + layout.powerBar.h);
    ctx.stroke();
  }
  ctx.restore();

  drawText(ctx, formatTime(model.elapsed), layout.hudRight, 51, {
    size: 14,
    mono: true,
    color: COLORS.dim,
    align: 'right',
  });

  drawButton(ctx, cache, layout.pause, 'ポーズ', { tone: 'ghost', fontSize: 13, spacing: 1 });
}

function drawBossInfo(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  layout: PlayLayout,
): void {
  const bar = layout.bossBar;
  const hpRatio = safeRatio(model.bossHp, model.bossMaxHp);
  const plate: Rect = { x: 18, y: HUD_H + 2, w: FIELD_W - 36, h: 54 };
  fillRoundRect(ctx, 'rgba(6, 3, 18, 0.58)', plate, 12);
  strokeRoundRect(ctx, 'rgba(255, 107, 224, 0.18)', plate, 12, 1);

  drawText(ctx, model.bossName || 'ボス', 26, HUD_H + 14, {
    size: 15,
    weight: 700,
    color: COLORS.white,
    maxWidth: 380,
  });

  fillRoundRect(ctx, 'rgba(92, 74, 158, 0.38)', bar, 4);
  ctx.save();
  roundRectPath(ctx, bar.x, bar.y, Math.max(1, bar.w * hpRatio), bar.h, 4);
  ctx.clip();
  fillHorizontalGradient(ctx, cache, 'boss-hp', bar, BOSS_STOPS);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bar.x + 4, bar.y + 1.5);
  ctx.lineTo(bar.x + bar.w - 4, bar.y + 1.5);
  ctx.stroke();
  ctx.restore();

  if (model.spellName) {
    const spellY = bar.y + 28;
    drawDiamond(ctx, 70, spellY - 5, 4, 'rgba(255, 107, 224, 0.8)');
    drawDiamond(ctx, FIELD_W - 70, spellY - 5, 4, 'rgba(255, 107, 224, 0.8)');
    drawText(ctx, model.spellName, FIELD_W / 2, spellY, {
      size: 14,
      weight: 700,
      color: COLORS.magenta,
      align: 'center',
      maxWidth: 300,
    });
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, model: UiModel): void {
  if (!model.banner || !Number.isFinite(model.bannerTimer) || model.bannerTimer <= 0) return;
  const alpha = clamp(model.bannerTimer / 0.55, 0, 1);
  const y = 330;
  const plate: Rect = { x: 36, y: y - 40, w: FIELD_W - 72, h: 72 };
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRoundRect(ctx, 'rgba(8, 4, 22, 0.58)', plate, 16);
  strokeRoundRect(ctx, 'rgba(111, 244, 255, 0.3)', plate, 16, 1.2);
  ctx.strokeStyle = 'rgba(111, 244, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plate.x + 30, y + 17);
  ctx.lineTo(plate.x + plate.w - 30, y + 17);
  ctx.stroke();
  drawText(ctx, model.banner, FIELD_W / 2, y, {
    size: 28,
    weight: 700,
    color: COLORS.white,
    align: 'center',
    maxWidth: 320,
  });
  ctx.restore();
}

function drawBombButton(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  rect: Rect,
  bombs: number,
  time: number,
): void {
  const disabled = bombs <= 0;
  const cx = rect.x + rect.w / 2;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);

  if (!disabled) {
    strokeRoundRect(
      ctx,
      `rgba(255, 107, 224, ${0.1 + pulse * 0.14})`,
      { x: rect.x - 5, y: rect.y - 5, w: rect.w + 10, h: rect.h + 10 },
      30,
      2.5,
    );
  }
  fillRoundRectGradient(
    ctx,
    cache,
    disabled ? 'bomb-off' : 'bomb-on',
    rect,
    26,
    disabled ? BOMB_OFF_STOPS : BOMB_STOPS,
  );
  strokeRoundRect(
    ctx,
    disabled ? 'rgba(160, 170, 220, 0.26)' : 'rgba(255, 120, 224, 0.7)',
    rect,
    26,
    disabled ? 1.1 : 1.8,
  );
  strokeRoundRect(
    ctx,
    disabled ? 'rgba(180, 190, 230, 0.14)' : 'rgba(255, 160, 240, 0.24)',
    { x: rect.x + 7, y: rect.y + 7, w: rect.w - 14, h: rect.h - 14 },
    20,
    1,
  );

  drawDiamond(ctx, cx, rect.y + 27, 12, disabled ? 'rgba(200, 200, 230, 0.32)' : COLORS.magenta);
  drawText(ctx, 'ボム', cx, rect.y + 57, {
    size: 18,
    weight: 700,
    color: disabled ? 'rgba(200, 210, 255, 0.4)' : COLORS.white,
    align: 'center',
    baseline: 'middle',
    spacing: 2,
  });
  drawText(ctx, `× ${clamp(Math.floor(bombs), 0, MAX_BOMBS)}`, cx, rect.y + 79, {
    size: 13,
    mono: true,
    color: disabled ? 'rgba(200, 210, 255, 0.36)' : COLORS.soft,
    align: 'center',
    baseline: 'middle',
  });
}

function drawFocusButton(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  rect: Rect,
  time: number,
): void {
  const cx = rect.x + rect.w / 2;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
  strokeRoundRect(
    ctx,
    `rgba(111, 244, 255, ${0.1 + pulse * 0.12})`,
    { x: rect.x - 5, y: rect.y - 5, w: rect.w + 10, h: rect.h + 10 },
    30,
    2.5,
  );
  fillRoundRectGradient(ctx, cache, 'focus', rect, 26, FOCUS_STOPS);
  strokeRoundRect(ctx, 'rgba(120, 244, 255, 0.62)', rect, 26, 1.8);
  strokeRoundRect(
    ctx,
    'rgba(140, 250, 255, 0.2)',
    { x: rect.x + 7, y: rect.y + 7, w: rect.w - 14, h: rect.h - 14 },
    20,
    1,
  );

  const iconY = rect.y + 27;
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 248, 255, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, iconY, 12, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = COLORS.cyan;
  ctx.beginPath();
  ctx.arc(cx, iconY, 4, 0, TAU);
  ctx.fill();
  ctx.restore();

  drawText(ctx, '低速', cx, rect.y + 57, {
    size: 18,
    weight: 700,
    color: COLORS.white,
    align: 'center',
    baseline: 'middle',
    spacing: 2,
  });
  drawText(ctx, '長押し', cx, rect.y + 79, {
    size: 13,
    color: COLORS.soft,
    align: 'center',
    baseline: 'middle',
    spacing: 1,
  });
}

function drawDragHint(
  ctx: CanvasRenderingContext2D,
  model: UiModel,
  layout: PlayLayout,
): void {
  if (!Number.isFinite(model.elapsed) || model.elapsed >= 6) return;
  const fadeIn = clamp(model.elapsed / 0.45, 0, 1);
  const fadeOut = clamp((6 - model.elapsed) / 1.5, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0.01) return;

  const cx = FIELD_W / 2;
  const panel: Rect = { x: 120, y: layout.hintPrimaryY - 40, w: 210, h: 80 };
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRoundRect(ctx, 'rgba(8, 4, 22, 0.55)', panel, 16);
  strokeRoundRect(ctx, 'rgba(111, 244, 255, 0.22)', panel, 16, 1);

  const glyphY = layout.hintPrimaryY - 19;
  ctx.strokeStyle = 'rgba(111, 244, 255, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash(DRAG_DASH);
  ctx.beginPath();
  ctx.moveTo(cx - 58, glyphY);
  ctx.lineTo(cx - 16, glyphY);
  ctx.moveTo(cx + 16, glyphY);
  ctx.lineTo(cx + 58, glyphY);
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.beginPath();
  ctx.arc(cx, glyphY, 8, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 107, 224, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, glyphY, 3.2, 0, TAU);
  ctx.fill();

  drawText(ctx, 'ドラッグで移動', cx, layout.hintPrimaryY, {
    size: 15,
    weight: 700,
    color: COLORS.white,
    align: 'center',
    spacing: 1,
  });
  drawText(ctx, 'ショットは自動', cx, layout.hintSecondaryY, {
    size: 13,
    color: COLORS.soft,
    align: 'center',
    spacing: 1,
  });
  ctx.restore();
}

function drawPlayingScreen(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  time: number,
  layout: PlayLayout,
): void {
  // Boss plate first: the pause button can sit below the HUD on notched
  // devices and must stay tappable on top of it.
  if (model.bossMaxHp > 0) drawBossInfo(ctx, cache, model, layout);
  drawHud(ctx, cache, model, layout);
  drawBanner(ctx, model);
  drawDragHint(ctx, model, layout);
  drawBombButton(ctx, cache, layout.bomb, model.bombs, time);
  drawFocusButton(ctx, cache, layout.focus, time);
}

// -------------------------------------------------------------------- menus

function drawPausedScreen(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  layout: PauseLayout,
): void {
  drawDimOverlay(ctx, FIELD_W, FIELD_H, 'rgba(4, 2, 12, 0.76)');
  drawPanel(ctx, cache, layout.panel, COLORS.magenta);

  drawText(ctx, 'PAUSED', FIELD_W / 2, layout.headingY - 44, {
    size: 13,
    mono: true,
    color: COLORS.cyan,
    align: 'center',
    spacing: 6,
    alpha: 0.72,
  });
  drawText(ctx, 'ポーズ', FIELD_W / 2, layout.headingY, {
    size: 36,
    weight: 700,
    color: COLORS.white,
    align: 'center',
    spacing: 8,
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 107, 224, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FIELD_W / 2 - 90, layout.headingY + 12);
  ctx.lineTo(FIELD_W / 2 + 90, layout.headingY + 12);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '一時停止中', FIELD_W / 2, layout.subtitleY, {
    size: 13,
    color: COLORS.dim,
    align: 'center',
    spacing: 2,
  });

  drawButton(ctx, cache, layout.buttons[0], '再開', {
    tone: 'primary',
    fontSize: 20,
    spacing: 3,
  });
  drawButton(ctx, cache, layout.buttons[1], 'リトライ', { tone: 'cyan', fontSize: 18, spacing: 2 });
  drawButton(ctx, cache, layout.buttons[2], 'タイトル', { tone: 'ghost', fontSize: 18, spacing: 2 });
  drawButton(
    ctx,
    cache,
    layout.buttons[3],
    model.soundEnabled ? 'サウンド ON' : 'サウンド OFF',
    { tone: 'ghost', fontSize: 16, spacing: 1 },
  );
}

function drawResultScreen(
  ctx: CanvasRenderingContext2D,
  cache: GradientCache,
  model: UiModel,
  layout: ResultLayout,
  cleared: boolean,
  time: number,
): void {
  const cx = FIELD_W / 2;
  const accent = cleared ? COLORS.cyan : COLORS.magenta;
  drawDimOverlay(
    ctx,
    FIELD_W,
    FIELD_H,
    cleared ? 'rgba(3, 10, 18, 0.78)' : 'rgba(10, 3, 14, 0.8)',
  );
  drawPanel(ctx, cache, layout.panel, accent);

  const result = model.result;
  const score = result?.score ?? model.score;
  const best = result?.best ?? model.best;
  const graze = result?.graze ?? model.graze;

  drawText(ctx, cleared ? 'STAGE CLEAR' : 'GAME OVER', cx, layout.eyebrowY, {
    size: 13,
    mono: true,
    color: accent,
    align: 'center',
    spacing: 5,
    alpha: 0.8,
  });
  drawText(ctx, cleared ? 'ステージクリア' : 'ゲームオーバー', cx, layout.headingY, {
    size: 32,
    weight: 700,
    color: cleared ? COLORS.white : COLORS.magenta,
    align: 'center',
    spacing: 3,
  });
  drawText(ctx, `難易度 ${DIFFICULTIES[model.difficulty].label}`, cx, layout.headingY + 23, {
    size: 13,
    color: COLORS.dim,
    align: 'center',
    spacing: 2,
  });
  ctx.save();
  ctx.strokeStyle = cleared ? 'rgba(111, 244, 255, 0.35)' : 'rgba(255, 107, 224, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 108, layout.scoreLabelY - 12);
  ctx.lineTo(cx + 108, layout.scoreLabelY - 12);
  ctx.stroke();
  ctx.restore();

  drawText(ctx, 'スコア', cx, layout.scoreLabelY, {
    size: 13,
    color: COLORS.dim,
    align: 'center',
    spacing: 3,
  });
  drawText(ctx, formatScore(score), cx, layout.scoreY, {
    size: 34,
    weight: 700,
    mono: true,
    color: COLORS.white,
    align: 'center',
  });
  drawText(ctx, 'ベスト', cx, layout.bestLabelY, {
    size: 13,
    color: COLORS.dim,
    align: 'center',
    spacing: 3,
  });
  drawText(ctx, formatScore(best), cx, layout.bestY, {
    size: 18,
    weight: 600,
    mono: true,
    color: COLORS.soft,
    align: 'center',
  });

  drawSparkle(ctx, cx - 78, layout.grazeY - 5, 4, COLORS.cyan);
  drawText(ctx, `かすり ${Math.max(0, Math.floor(graze))}`, cx + 4, layout.grazeY, {
    size: 15,
    color: COLORS.soft,
    align: 'center',
    spacing: 1,
  });

  if (result?.isNewRecord) {
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 5));
    drawSparkle(ctx, cx - 96, layout.newRecordY - 5, 4.2, COLORS.gold);
    drawSparkle(ctx, cx + 96, layout.newRecordY - 5, 4.2, COLORS.gold);
    drawText(ctx, 'NEW RECORD!', cx, layout.newRecordY, {
      size: 18,
      weight: 700,
      mono: true,
      color: COLORS.gold,
      align: 'center',
      spacing: 2,
      alpha: pulse,
    });
  }

  drawButton(ctx, cache, layout.buttons[0], 'リトライ', {
    tone: 'primary',
    fontSize: 20,
    spacing: 2,
  });
  drawButton(ctx, cache, layout.buttons[1], 'タイトル', {
    tone: 'ghost',
    fontSize: 18,
    spacing: 2,
  });
}

// ----------------------------------------------------------------------- Ui

export function createUi(): Ui {
  const cache = createGradientCache();
  let insets: Insets = NO_INSETS;
  let screen: AppScreen | null = null;
  let difficulty: Difficulty = 'normal';
  let title: TitleLayout | null = null;
  let playing: PlayLayout | null = null;
  let paused: PauseLayout | null = null;
  let result: ResultLayout | null = null;

  return {
    draw(ctx, model, time): void {
      const safeTime = Number.isFinite(time) ? time : 0;
      screen = model.screen;
      difficulty = model.difficulty;
      title = null;
      playing = null;
      paused = null;
      result = null;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, FIELD_W, FIELD_H);
      ctx.clip();
      switch (model.screen) {
        case 'title': {
          const layout = titleLayout(insets);
          title = layout;
          drawTitleScreen(ctx, cache, model, safeTime, layout);
          break;
        }
        case 'playing': {
          const layout = playLayout(insets);
          playing = layout;
          drawPlayingScreen(ctx, cache, model, safeTime, layout);
          break;
        }
        case 'paused': {
          const layout = pauseLayout(insets);
          paused = layout;
          drawPausedScreen(ctx, cache, model, layout);
          break;
        }
        case 'gameover':
        case 'clear': {
          const layout = resultLayout(insets);
          result = layout;
          drawResultScreen(ctx, cache, model, layout, model.screen === 'clear', safeTime);
          break;
        }
      }
      ctx.restore();
    },

    hitTest(x, y): UiAction | null {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      switch (screen) {
        case 'title': {
          if (!title) return null;
          for (const pill of title.pills) {
            if (contains(pill.rect, x, y)) {
              return { type: 'selectDifficulty', difficulty: pill.id };
            }
          }
          if (contains(title.start, x, y)) return { type: 'start', difficulty };
          if (contains(title.sound, x, y)) return { type: 'toggleSound' };
          return null;
        }
        case 'playing': {
          if (!playing) return null;
          if (contains(playing.pause, x, y)) return { type: 'pause' };
          if (contains(playing.bomb, x, y)) return { type: 'bomb' };
          return null;
        }
        case 'paused': {
          if (!paused) return null;
          if (contains(paused.buttons[0], x, y)) return { type: 'resume' };
          if (contains(paused.buttons[1], x, y)) return { type: 'retry' };
          if (contains(paused.buttons[2], x, y)) return { type: 'title' };
          if (contains(paused.buttons[3], x, y)) return { type: 'toggleSound' };
          return null;
        }
        case 'gameover':
        case 'clear': {
          if (!result) return null;
          if (contains(result.buttons[0], x, y)) return { type: 'retry' };
          if (contains(result.buttons[1], x, y)) return { type: 'title' };
          return null;
        }
        default:
          return null;
      }
    },

    isFocusHeld(x, y): boolean {
      return screen === 'playing' && playing !== null && contains(playing.focus, x, y);
    },

    setSafeArea(top, bottom): void {
      insets = normalizeInsets(top, bottom);
    },
  };
}
