import { STORAGE_KEYS } from '../game/constants';
import type { Difficulty } from '../game/types';

/**
 * localStorage is unavailable in some embeds (private mode, sandboxed iframe)
 * and both reading the property and writing can throw, so every access goes
 * through these guards. The game must stay playable without persistence.
 */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readText(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeText(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota exceeded / private mode: scores and settings simply do not persist.
  }
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function safeScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function readBestTable(): Record<string, unknown> {
  const parsed = parseJson(readText(STORAGE_KEYS.best));
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function loadBest(difficulty: Difficulty): number {
  return safeScore(readBestTable()[difficulty]);
}

/** Stores the higher of the stored and the supplied score, per difficulty. */
export function saveBest(difficulty: Difficulty, score: number): void {
  const next = safeScore(score);
  if (next <= 0) return;
  const table = readBestTable();
  const previous = safeScore(table[difficulty]);
  if (next <= previous) return;
  table[difficulty] = next;
  writeText(STORAGE_KEYS.best, JSON.stringify(table));
}

export function loadSoundEnabled(): boolean {
  const parsed = parseJson(readText(STORAGE_KEYS.sound));
  return typeof parsed === 'boolean' ? parsed : true;
}

export function saveSoundEnabled(enabled: boolean): void {
  writeText(STORAGE_KEYS.sound, JSON.stringify(enabled === true));
}

export function loadDifficulty(): Difficulty {
  const parsed = parseJson(readText(STORAGE_KEYS.difficulty));
  return isDifficulty(parsed) ? parsed : 'normal';
}

export function saveDifficulty(difficulty: Difficulty): void {
  if (!isDifficulty(difficulty)) return;
  writeText(STORAGE_KEYS.difficulty, JSON.stringify(difficulty));
}
