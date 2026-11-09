export interface LoopCallbacks {
  /** Fixed-step simulation. `dt` is always the same value. */
  update(dt: number, elapsed: number): void;
  /** Called once per animation frame after the simulation. */
  render(alpha: number, elapsed: number): void;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
  /** While paused the simulation is skipped but rendering continues. */
  setPaused(paused: boolean): void;
  readonly running: boolean;
  readonly stepSeconds: number;
}

/**
 * Fixed-timestep loop with an accumulator.
 *
 * A fixed step keeps bullet patterns identical on 60 Hz and 120 Hz phones and
 * caps catch-up work after a tab has been backgrounded, which would otherwise
 * teleport bullets through the player hitbox.
 */
export function createLoop(
  callbacks: LoopCallbacks,
  stepSeconds = 1 / 60,
  maxCatchUpSteps = 5,
): LoopHandle {
  let rafId = 0;
  let last = 0;
  let accumulator = 0;
  let elapsed = 0;
  let paused = false;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    if (last === 0) last = now;
    const rawDelta = (now - last) / 1000;
    last = now;

    if (!paused) {
      accumulator += Math.min(rawDelta, stepSeconds * maxCatchUpSteps);
      let steps = 0;
      while (accumulator >= stepSeconds && steps < maxCatchUpSteps) {
        callbacks.update(stepSeconds, elapsed);
        elapsed += stepSeconds;
        accumulator -= stepSeconds;
        steps += 1;
      }
      if (steps === maxCatchUpSteps) accumulator = 0;
    }

    callbacks.render(accumulator / stepSeconds, elapsed);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    setPaused(value: boolean) {
      paused = value;
      // Drop the backlog so resuming does not fast-forward several steps.
      if (value) accumulator = 0;
      last = 0;
    },
    get running() {
      return running;
    },
    stepSeconds,
  };
}
