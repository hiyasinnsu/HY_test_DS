import { wrapAngle } from '../../core/math';
import { ring } from './ring';
import { styleOf } from './shared';
import type { BulletStyle, PatternContext } from './shared';

/** Largest number of shots a single step may emit, guards against long frames. */
const MAX_SHOTS_PER_STEP = 8;

/** Smallest interval accepted by the accumulator, ~240 Hz. */
const MIN_INTERVAL = 1 / 240;

/**
 * Accumulator-based repeating timer: `step(dt)` returns how many shots are due
 * this frame, so fire rates stay correct at any frame time.
 */
export class IntervalEmitter {
  private timer: number;
  private readonly interval: number;

  constructor(interval: number, initialDelay = 0) {
    this.interval = Math.max(MIN_INTERVAL, interval);
    this.timer = Math.max(0, initialDelay);
  }

  step(dt: number): number {
    this.timer -= dt;
    let shots = 0;
    while (this.timer <= 0 && shots < MAX_SHOTS_PER_STEP) {
      shots += 1;
      this.timer += this.interval;
    }
    return shots;
  }

  /** Restarts the accumulator, optionally after a fresh delay. */
  reset(initialDelay = 0): void {
    this.timer = Math.max(0, initialDelay);
  }

  get remaining(): number {
    return this.timer;
  }
}

export interface SpiralOptions extends BulletStyle {
  /** Bullets per volley, scaled by difficulty.bulletCount by `ring`. */
  readonly count: number;
  /** Seconds between volleys. */
  readonly interval: number;
  readonly speed: number;
  /** Radians added to the base angle after every volley. */
  readonly rotate: number;
  readonly startAngle?: number;
  readonly spawnRadius?: number;
}

/** Stateful spiral emitter: rotating rings fired on a fixed interval. */
export class SpiralEmitter {
  private readonly opts: SpiralOptions;
  private readonly timer: IntervalEmitter;
  private angle: number;

  constructor(opts: SpiralOptions, initialDelay = 0) {
    this.opts = opts;
    this.angle = opts.startAngle ?? 0;
    this.timer = new IntervalEmitter(opts.interval, initialDelay);
  }

  /** Current base angle; exposed for tests and for chaining patterns. */
  get currentAngle(): number {
    return this.angle;
  }

  update(ctx: PatternContext, x: number, y: number, dt: number): void {
    const shots = this.timer.step(dt);
    for (let i = 0; i < shots; i += 1) {
      ring(ctx, x, y, {
        ...styleOf(this.opts),
        count: this.opts.count,
        speed: this.opts.speed,
        baseAngle: this.angle,
        spawnRadius: this.opts.spawnRadius,
      });
      this.angle = wrapAngle(this.angle + this.opts.rotate);
    }
  }

  reset(initialDelay = 0): void {
    this.angle = this.opts.startAngle ?? 0;
    this.timer.reset(initialDelay);
  }
}
