import { clamp } from '../../core/math';
import type { Rng } from '../../core/rng';
import { FIELD_W } from '../constants';
import { resolveRng, scaledCount, scaledSpeed, spawnBulletAt } from './shared';
import type { BulletStyle, PatternContext } from './shared';

/** Every curtain gap is at least this wide, so the ship can always pass. */
export const CURTAIN_MIN_GAP = 60;

/** Bullets start this far inside the left/right field edges. */
const CURTAIN_EDGE = 22;

/** Bullets in a row before the gaps are punched out. */
const CURTAIN_BULLETS = 14;

export interface CurtainOptions extends BulletStyle {
  readonly speed: number;
  /** Bullets in the row, scaled by difficulty.bulletCount. */
  readonly count?: number;
  /** 1 or 2 passable gaps; defaults to 2 on easy/normal and 1 on hard. */
  readonly gaps?: number;
  /** Requested gap width; clamped to CURTAIN_MIN_GAP. */
  readonly gapWidth?: number;
  /** Preferred gap centres (x units); snapped to the bullet grid. */
  readonly gapX?: readonly number[];
  /** Bullet heading; defaults to straight down. */
  readonly angle?: number;
  readonly rng?: Rng;
}

function defaultGaps(ctx: PatternContext): number {
  return ctx.difficulty.id === 'hard' ? 1 : 2;
}

function defaultGapWidth(ctx: PatternContext): number {
  if (ctx.difficulty.id === 'easy') return 88;
  return ctx.difficulty.id === 'hard' ? CURTAIN_MIN_GAP : 72;
}

/**
 * Fires a full-width row of bullets with 1-2 safe gaps. Gaps are punched on the
 * bullet grid: `slots` bullets are removed so the remaining opening is
 * `(slots + 1) * step`, which is always >= the requested width.
 */
export function curtain(
  ctx: PatternContext,
  _x: number,
  y: number,
  opts: CurtainOptions,
): void {
  const count = scaledCount(ctx, opts.count ?? CURTAIN_BULLETS);
  const speed = scaledSpeed(ctx, opts.speed);
  const rng = resolveRng(opts.rng);
  const wanted = clamp(Math.round(opts.gaps ?? defaultGaps(ctx)), 1, 2);
  const gapWidth = Math.max(CURTAIN_MIN_GAP, opts.gapWidth ?? defaultGapWidth(ctx));
  const span = FIELD_W - CURTAIN_EDGE * 2;
  const step = count > 1 ? span / (count - 1) : span;
  const slots = Math.max(1, Math.ceil(gapWidth / step));
  // Gaps may not eat the first or last bullet, so the row always has an anchor
  // on both sides of every opening.
  const maxStart = count - 1 - slots;

  const starts: number[] = [];
  if (maxStart >= 1) {
    for (const desired of opts.gapX ?? []) {
      if (starts.length >= wanted) break;
      starts.push(clamp(Math.round((desired - CURTAIN_EDGE) / step - slots / 2), 1, maxStart));
    }
    while (starts.length < wanted) {
      const candidates: number[] = [];
      for (let start = 1; start <= maxStart; start += 1) {
        // Keep at least one bullet between neighbouring gaps.
        if (starts.every((other) => Math.abs(start - other) > slots)) candidates.push(start);
      }
      if (candidates.length === 0) break;
      starts.push(candidates[Math.floor(rng.next() * candidates.length)]);
    }
  }

  const skipped = new Set<number>();
  for (const start of starts) {
    for (let i = start; i < start + slots; i += 1) skipped.add(i);
  }

  const angle = opts.angle ?? Math.PI / 2;
  for (let i = 0; i < count; i += 1) {
    if (skipped.has(i)) continue;
    spawnBulletAt(ctx, CURTAIN_EDGE + i * step, y, angle, speed, opts);
  }
}
