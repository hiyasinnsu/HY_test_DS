/**
 * Neon stardust palette. The game renders with canvas primitives only, so the
 * look is carried by a small set of translucent fills, thin strokes and a
 * consistent cyan/magenta pairing.
 */
export const COLORS = {
  ink: '#05030d',
  navyDeep: '#080416',
  navy: '#100826',
  violet: '#241046',
  white: '#f2f6ff',
  soft: '#c9d6ff',
  dim: 'rgba(188, 202, 245, 0.64)',
  faint: 'rgba(146, 168, 228, 0.28)',
  line: 'rgba(128, 238, 255, 0.34)',
  cyan: '#6ff4ff',
  cyanSoft: 'rgba(111, 244, 255, 0.32)',
  magenta: '#ff6be0',
  magentaSoft: 'rgba(255, 107, 224, 0.32)',
  violetBright: '#b79cff',
  danger: '#ff5470',
  gold: '#ffe08a',
} as const;

/** CJK-first stack; every Japanese glyph falls back to the platform JP font. */
export const FONT_JP =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif';

/** Fixed-width digits keep the right-aligned HUD score from jittering. */
export const FONT_MONO =
  '"SFMono-Regular", ui-monospace, "Roboto Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

export function font(size: number, weight = 600, mono = false): string {
  return `${weight} ${size}px ${mono ? FONT_MONO : FONT_JP}`;
}
