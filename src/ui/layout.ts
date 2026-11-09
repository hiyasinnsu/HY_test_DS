import { clamp } from '../core/math';
import { DIFFICULTY_ORDER, FIELD_H, FIELD_W, HUD_H } from '../game/constants';
import type { Difficulty } from '../game/types';

/** Axis-aligned rectangle in playfield units (origin top-left). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Safe-area insets measured inward from the top / bottom field edges. */
export interface Insets {
  readonly top: number;
  readonly bottom: number;
}

export const NO_INSETS: Insets = { top: 0, bottom: 0 };

export function normalizeInsets(top: number, bottom: number): Insets {
  return {
    top: Number.isFinite(top) ? clamp(top, 0, 240) : 0,
    bottom: Number.isFinite(bottom) ? clamp(bottom, 0, 240) : 0,
  };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// --------------------------------------------------------------------- playing

export interface PlayLayout {
  readonly hud: Rect;
  readonly pause: Rect;
  readonly bomb: Rect;
  readonly focus: Rect;
  /** Right edge available to HUD text, kept clear of the pause button. */
  readonly hudRight: number;
  readonly bossBar: Rect;
  readonly powerBar: Rect;
  readonly hintPrimaryY: number;
  readonly hintSecondaryY: number;
}

export function playLayout(insets: Insets): PlayLayout {
  const top = Math.max(0, insets.top);
  const bottom = Math.max(10, insets.bottom);
  const controlSize = 96;
  const controlY = clamp(
    FIELD_H - bottom - controlSize,
    HUD_H + 140,
    FIELD_H - controlSize - 10,
  );
  const pauseY = clamp(Math.max(10, top), 10, FIELD_H - 44 - 20);
  const pause: Rect = { x: FIELD_W - 10 - 64, y: pauseY, w: 64, h: 44 };
  return {
    hud: { x: 0, y: 0, w: FIELD_W, h: HUD_H },
    pause,
    bomb: { x: FIELD_W - 14 - controlSize, y: controlY, w: controlSize, h: controlSize },
    focus: { x: 14, y: controlY, w: controlSize, h: controlSize },
    hudRight: pause.y < HUD_H ? pause.x - 10 : FIELD_W - 12,
    bossBar: { x: 26, y: HUD_H + 20, w: FIELD_W - 52, h: 9 },
    powerBar: { x: 246, y: 46, w: 72, h: 6 },
    hintPrimaryY: controlY - 60,
    hintSecondaryY: controlY - 36,
  };
}

// ----------------------------------------------------------------------- title

export interface DifficultyPill {
  readonly id: Difficulty;
  readonly rect: Rect;
}

export interface TitleLayout {
  readonly logoY: number;
  readonly subtitleY: number;
  readonly dividerY: number;
  readonly bestY: number;
  readonly difficultyLabelY: number;
  readonly pills: readonly DifficultyPill[];
  readonly start: Rect;
  readonly sound: Rect;
  readonly hints: readonly string[];
  readonly hintsY: number;
}

export const TITLE_HINTS: readonly string[] = [
  'ドラッグで移動',
  'ショット自動',
  'ボム・低速は画面下',
];

export function titleLayout(insets: Insets): TitleLayout {
  // Shift the block down under a notch and lift the hints above a home bar.
  const shift = clamp(Math.max(0, insets.top) - 10, 0, 40);
  const lift = clamp(Math.max(0, insets.bottom) - 10, 0, 40);
  const logoY = 150 + shift;
  const subtitleY = logoY + 28;
  const dividerY = logoY + 46;
  const bestY = logoY + 72;
  const difficultyLabelY = logoY + 106;
  const pillsY = logoY + 120;
  const pillW = 130;
  const pillGap = 9;
  const pills = DIFFICULTY_ORDER.map((id, index) => ({
    id,
    rect: { x: 20 + index * (pillW + pillGap), y: pillsY, w: pillW, h: 48 },
  }));
  const start: Rect = { x: 30, y: pillsY + 72, w: FIELD_W - 60, h: 96 };
  const sound: Rect = { x: (FIELD_W - 170) / 2, y: start.y + 116, w: 170, h: 44 };
  return {
    logoY,
    subtitleY,
    dividerY,
    bestY,
    difficultyLabelY,
    pills,
    start,
    sound,
    hints: TITLE_HINTS,
    hintsY: sound.y + 92 - lift,
  };
}

// ---------------------------------------------------------------------- paused

export interface PauseLayout {
  readonly panel: Rect;
  readonly headingY: number;
  readonly subtitleY: number;
  /** resume, retry, title, sound. */
  readonly buttons: readonly Rect[];
}

export function pauseLayout(insets: Insets): PauseLayout {
  const top = Math.max(10, Math.min(insets.top, 100));
  const bottom = Math.max(10, Math.min(insets.bottom, 100));
  const height = 392;
  const y = clamp(FIELD_H / 2 - height / 2, top, FIELD_H - bottom - height);
  const buttons: Rect[] = [];
  for (let i = 0; i < 4; i += 1) {
    buttons.push({ x: 105, y: y + 108 + i * 66, w: 240, h: 54 });
  }
  return {
    panel: { x: 75, y, w: 300, h: height },
    headingY: y + 58,
    subtitleY: y + 84,
    buttons,
  };
}

// ---------------------------------------------------------------- result screens

export interface ResultLayout {
  readonly panel: Rect;
  readonly eyebrowY: number;
  readonly headingY: number;
  readonly scoreLabelY: number;
  readonly scoreY: number;
  readonly bestLabelY: number;
  readonly bestY: number;
  readonly grazeY: number;
  readonly newRecordY: number;
  /** retry, title. */
  readonly buttons: readonly Rect[];
}

export function resultLayout(insets: Insets): ResultLayout {
  const top = Math.max(10, Math.min(insets.top, 100));
  const bottom = Math.max(10, Math.min(insets.bottom, 100));
  const height = 440;
  const y = clamp(FIELD_H / 2 - height / 2, top, FIELD_H - bottom - height);
  return {
    panel: { x: 55, y, w: 340, h: height },
    eyebrowY: y + 44,
    headingY: y + 76,
    scoreLabelY: y + 118,
    scoreY: y + 154,
    bestLabelY: y + 186,
    bestY: y + 210,
    grazeY: y + 244,
    newRecordY: y + 278,
    buttons: [
      { x: 95, y: y + 312, w: 260, h: 54 },
      { x: 95, y: y + 380, w: 260, h: 54 },
    ],
  };
}
