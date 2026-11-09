import { FIELD_H, FIELD_W } from '../game/constants';

export interface Viewport {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS pixels per playfield unit. */
  readonly scale: number;
  /** Playfield origin in CSS pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Device pixel ratio actually used (clamped for performance). */
  readonly dpr: number;
  resize(): void;
  /** Converts a client (CSS) point into playfield units. */
  toField(clientX: number, clientY: number): { x: number; y: number };
  /** Sets the canvas transform to playfield units. */
  applyFieldTransform(): void;
  /** Restores the untransformed device-pixel space. */
  resetTransform(): void;
}

const MAX_DPR = 2;

export function createViewport(canvas: HTMLCanvasElement): Viewport {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('2D canvas context is unavailable');

  const viewport: Viewport = {
    canvas,
    ctx,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      // visualViewport follows the on-screen keyboard / URL bar collapse more
      // reliably than innerHeight on iOS Safari.
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const scale = Math.min(width / FIELD_W, height / FIELD_H);
      Object.assign(viewport, {
        dpr,
        scale,
        offsetX: (width - FIELD_W * scale) / 2,
        offsetY: (height - FIELD_H * scale) / 2,
      });
    },
    toField(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewport.offsetX) / viewport.scale,
        y: (clientY - rect.top - viewport.offsetY) / viewport.scale,
      };
    },
    applyFieldTransform() {
      const s = viewport.scale * viewport.dpr;
      ctx.setTransform(s, 0, 0, s, viewport.offsetX * viewport.dpr, viewport.offsetY * viewport.dpr);
    },
    resetTransform() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };

  viewport.resize();
  return viewport;
}
