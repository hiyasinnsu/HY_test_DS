/**
 * Text formatting shared by every UI surface. Keeping the score fixed-width
 * matters on the HUD: proportional digits make the right-aligned score jitter
 * while it grows.
 */

/** Zero-padded, comma grouped score: 1234560 -> "001,234,560". */
export function formatScore(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const digits = String(safe).padStart(9, '0');
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** Seconds -> "mm:ss" (minutes keep growing past 99). */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
