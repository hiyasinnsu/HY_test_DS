import { afterEach, describe, expect, it } from 'vitest';
import { FIELD_H, FIELD_W, STORAGE_KEYS } from '../src/game/constants';
import type { AppScreen, UiModel } from '../src/game/types';
import { formatScore, formatTime } from '../src/ui/format';
import {
  pauseLayout,
  playLayout,
  resultLayout,
  titleLayout,
  type Rect,
} from '../src/ui/layout';
import {
  loadBest,
  loadDifficulty,
  loadSoundEnabled,
  saveBest,
  saveDifficulty,
  saveSoundEnabled,
} from '../src/ui/storage';
import { createUi } from '../src/ui/ui';

// ------------------------------------------------------------------- storage

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear(): void {
      data.clear();
    },
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
  };
}

/** Mimics Safari private mode: the storage object exists but every call throws. */
function hostileStorage(): Storage {
  const denied = (): never => {
    throw new Error('storage denied');
  };
  return {
    get length(): number {
      return 0;
    },
    clear: denied,
    getItem: denied,
    key: denied,
    removeItem: denied,
    setItem: denied,
  };
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function installStorage(mode: Storage | 'throws-on-access'): void {
  if (mode === 'throws-on-access') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage disabled');
      },
    });
    return;
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mode,
  });
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('ui storage', () => {
  it('falls back to defaults when localStorage access throws', () => {
    installStorage('throws-on-access');
    expect(loadBest('normal')).toBe(0);
    expect(loadSoundEnabled()).toBe(true);
    expect(loadDifficulty()).toBe('normal');
    expect(() => {
      saveBest('normal', 1200);
      saveSoundEnabled(false);
      saveDifficulty('hard');
    }).not.toThrow();
  });

  it('falls back when storage exists but every method throws', () => {
    installStorage(hostileStorage());
    expect(loadBest('hard')).toBe(0);
    expect(loadSoundEnabled()).toBe(true);
    expect(loadDifficulty()).toBe('normal');
    expect(() => {
      saveBest('hard', 5000);
      saveSoundEnabled(false);
      saveDifficulty('easy');
    }).not.toThrow();
  });

  it('ignores malformed stored values', () => {
    const storage = memoryStorage();
    installStorage(storage);
    storage.setItem(STORAGE_KEYS.best, '{ not json');
    storage.setItem(STORAGE_KEYS.sound, '"loud"');
    storage.setItem(STORAGE_KEYS.difficulty, '{"level":"hard"}');
    expect(loadBest('easy')).toBe(0);
    expect(loadSoundEnabled()).toBe(true);
    expect(loadDifficulty()).toBe('normal');
  });

  it('saveBest keeps the maximum and stores one JSON object', () => {
    const storage = memoryStorage();
    installStorage(storage);
    saveBest('normal', 12000);
    saveBest('normal', 5000);
    expect(loadBest('normal')).toBe(12000);
    saveBest('normal', 20000);
    saveBest('easy', 900);

    expect(loadBest('normal')).toBe(20000);
    expect(loadBest('easy')).toBe(900);
    expect(loadBest('hard')).toBe(0);

    const raw = storage.getItem(STORAGE_KEYS.best);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(parsed.normal).toBe(20000);
    expect(parsed.easy).toBe(900);
  });

  it('round trips sound and difficulty', () => {
    installStorage(memoryStorage());
    saveSoundEnabled(false);
    expect(loadSoundEnabled()).toBe(false);
    saveSoundEnabled(true);
    expect(loadSoundEnabled()).toBe(true);
    saveDifficulty('hard');
    expect(loadDifficulty()).toBe('hard');
    saveDifficulty('easy');
    expect(loadDifficulty()).toBe('easy');
  });
});

// -------------------------------------------------------------------- helpers

interface DrawProbe {
  ctx: CanvasRenderingContext2D;
  readonly texts: string[];
  readonly rects: Rect[];
  gradientCount: number;
}

/** Stub 2D context that records what the UI asked the canvas to paint. */
function createProbe(): DrawProbe {
  const gradient = { addColorStop(): void {} } as unknown as CanvasGradient;
  const noop = (): void => {};
  const probe: DrawProbe = {
    ctx: undefined as unknown as CanvasRenderingContext2D,
    texts: [],
    rects: [],
    gradientCount: 0,
  };
  const ctx = {
    measureText: (text: string): TextMetrics => ({ width: text.length * 8 }) as TextMetrics,
    createLinearGradient: (): CanvasGradient => {
      probe.gradientCount += 1;
      return gradient;
    },
    createRadialGradient: (): CanvasGradient => gradient,
    fillText: (text: string): void => {
      probe.texts.push(String(text));
    },
    fillRect: (x: number, y: number, w: number, h: number): void => {
      probe.rects.push({ x, y, w, h });
    },
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    rect: noop,
    arc: noop,
    arcTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    strokeRect: noop,
    clearRect: noop,
    strokeText: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setLineDash: noop,
  };
  probe.ctx = ctx as unknown as CanvasRenderingContext2D;
  return probe;
}

function stubContext(): CanvasRenderingContext2D {
  return createProbe().ctx;
}

function makeModel(screen: AppScreen, overrides: Partial<UiModel> = {}): UiModel {
  return {
    screen,
    difficulty: 'normal',
    score: 1_234_560,
    best: 9_000_000,
    lives: 3,
    bombs: 3,
    graze: 42,
    power: 2.5,
    maxPower: 4,
    bossHp: 0,
    bossMaxHp: 0,
    bossName: '',
    spellName: null,
    banner: null,
    bannerTimer: 0,
    soundEnabled: true,
    fps: 60,
    stageProgress: 0.25,
    elapsed: 10,
    result: null,
    ...overrides,
  };
}

const centerX = (rect: Rect): number => rect.x + rect.w / 2;
const centerY = (rect: Rect): number => rect.y + rect.h / 2;

function expectInsideField(rect: Rect): void {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.w).toBeLessThanOrEqual(FIELD_W);
  expect(rect.y + rect.h).toBeLessThanOrEqual(FIELD_H);
}

// -------------------------------------------------------------------- drawing

describe('formatScore / formatTime', () => {
  it('zero-pads and groups scores into tabular columns', () => {
    expect(formatScore(0)).toBe('000,000,000');
    expect(formatScore(1_234_560)).toBe('001,234,560');
    expect(formatScore(12_345_678)).toBe('012,345,678');
    expect(formatScore(-42)).toBe('000,000,000');
    expect(formatScore(Number.NaN)).toBe('000,000,000');
  });

  it('formats elapsed seconds as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(83.9)).toBe('01:23');
  });
});

describe('title screen', () => {
  it('maps each difficulty pill and the start area to the right action', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    ui.draw(stubContext(), makeModel('title', { difficulty: 'hard', best: 7_654_321 }), 1.2);
    const layout = titleLayout({ top: 0, bottom: 0 });

    for (const pill of layout.pills) {
      expect(ui.hitTest(centerX(pill.rect), centerY(pill.rect))).toEqual({
        type: 'selectDifficulty',
        difficulty: pill.id,
      });
    }
    expect(ui.hitTest(centerX(layout.start), centerY(layout.start))).toEqual({
      type: 'start',
      difficulty: 'hard',
    });
    expect(ui.hitTest(centerX(layout.sound), centerY(layout.sound))).toEqual({
      type: 'toggleSound',
    });
    expect(ui.hitTest(FIELD_W / 2, 700)).toBeNull();
  });

  it('draws every screen through a stub 2D context', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    const ctx = stubContext();
    const result = {
      score: 12000,
      best: 12000,
      isNewRecord: true,
      graze: 33,
      difficulty: 'normal' as const,
      stageCleared: false,
    };
    const screens: readonly AppScreen[] = ['title', 'playing', 'paused', 'gameover', 'clear'];
    for (const screen of screens) {
      expect(() => ui.draw(ctx, makeModel(screen, { result }), 2.5)).not.toThrow();
    }
  });
});

describe('playing screen', () => {
  it('places touch controls inside the field and matches the focus hold rect', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    ui.draw(
      stubContext(),
      makeModel('playing', {
        bombs: 2,
        bossMaxHp: 900,
        bossHp: 450,
        bossName: '星喰い',
        spellName: '星屑結界',
        banner: 'WARNING',
        bannerTimer: 1.2,
        elapsed: 12,
      }),
      3,
    );
    const layout = playLayout({ top: 0, bottom: 0 });

    expectInsideField(layout.pause);
    expectInsideField(layout.bomb);
    expectInsideField(layout.focus);
    expect(layout.pause.w).toBeGreaterThanOrEqual(64);
    expect(layout.pause.h).toBeGreaterThanOrEqual(44);
    expect(layout.bomb.w).toBeGreaterThanOrEqual(84);
    expect(layout.bomb.h).toBeGreaterThanOrEqual(84);
    expect(layout.focus.w).toBeGreaterThanOrEqual(84);
    expect(layout.focus.h).toBeGreaterThanOrEqual(84);

    expect(ui.hitTest(centerX(layout.pause), centerY(layout.pause))).toEqual({ type: 'pause' });
    expect(ui.hitTest(centerX(layout.bomb), centerY(layout.bomb))).toEqual({ type: 'bomb' });
    expect(ui.hitTest(centerX(layout.focus), centerY(layout.focus))).toBeNull();
    expect(ui.isFocusHeld(centerX(layout.focus), centerY(layout.focus))).toBe(true);
    expect(ui.isFocusHeld(layout.focus.x - 1, centerY(layout.focus))).toBe(false);
    expect(ui.hitTest(FIELD_W / 2, FIELD_H / 2)).toBeNull();
    expect(ui.hitTest(FIELD_W / 2, 420)).toBeNull();
  });

  it('honours the safe area after redraw', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    ui.setSafeArea(24, 40);
    ui.draw(stubContext(), makeModel('playing'), 0.5);
    const layout = playLayout({ top: 24, bottom: 40 });

    expectInsideField(layout.bomb);
    expectInsideField(layout.focus);
    expect(layout.bomb.y + layout.bomb.h).toBeLessThanOrEqual(FIELD_H - 40);
    expect(layout.pause.y).toBeGreaterThanOrEqual(24);
    expect(ui.hitTest(centerX(layout.bomb), centerY(layout.bomb))).toEqual({ type: 'bomb' });
    expect(ui.isFocusHeld(centerX(layout.focus), centerY(layout.focus))).toBe(true);
  });

  it('clears the focus state when another screen is drawn', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    const ctx = stubContext();
    ui.draw(ctx, makeModel('playing'), 0);
    const focus = playLayout({ top: 0, bottom: 0 }).focus;
    expect(ui.isFocusHeld(centerX(focus), centerY(focus))).toBe(true);
    ui.draw(ctx, makeModel('paused'), 0);
    expect(ui.isFocusHeld(centerX(focus), centerY(focus))).toBe(false);
  });
});

describe('menu screens', () => {
  it('maps the pause and result buttons to actions at their drawn rects', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    const ctx = stubContext();

    ui.draw(ctx, makeModel('paused'), 0);
    const pause = pauseLayout({ top: 0, bottom: 0 });
    const pauseActions = ['resume', 'retry', 'title', 'toggleSound'] as const;
    pause.buttons.forEach((rect, index) => {
      expectInsideField(rect);
      expect(ui.hitTest(centerX(rect), centerY(rect))).toEqual({ type: pauseActions[index] });
    });

    const result = {
      score: 15000,
      best: 15000,
      isNewRecord: true,
      graze: 64,
      difficulty: 'easy' as const,
      stageCleared: false,
    };
    ui.draw(ctx, makeModel('gameover', { difficulty: 'easy', result }), 0);
    const gameOver = resultLayout({ top: 0, bottom: 0 });
    expect(ui.hitTest(centerX(gameOver.buttons[0]), centerY(gameOver.buttons[0]))).toEqual({
      type: 'retry',
    });
    expect(ui.hitTest(centerX(gameOver.buttons[1]), centerY(gameOver.buttons[1]))).toEqual({
      type: 'title',
    });

    ui.draw(ctx, makeModel('clear', { result: { ...result, stageCleared: true } }), 0);
    const clear = resultLayout({ top: 0, bottom: 0 });
    expect(ui.hitTest(centerX(clear.buttons[0]), centerY(clear.buttons[0]))).toEqual({
      type: 'retry',
    });
    expect(ui.hitTest(centerX(clear.buttons[1]), centerY(clear.buttons[1]))).toEqual({
      type: 'title',
    });
  });
});

describe('render output', () => {
  it('shows the required Japanese labels on every screen', () => {
    installStorage(memoryStorage());
    const ui = createUi();

    const title = createProbe();
    ui.draw(title.ctx, makeModel('title'), 0.5);
    title.rects.forEach(expectInsideField);
    const titleText = title.texts.join('');
    expect(titleText).toContain('星屑リフレクション');
    expect(titleText).toContain('STARDUST REFLECTION');
    expect(titleText).toContain('タップでスタート');
    expect(titleText).toContain('難易度');
    expect(titleText).toContain('ドラッグで移動');
    expect(titleText).toContain('ショット自動');
    expect(titleText).toContain('ボム・低速は画面下');

    const play = createProbe();
    ui.draw(
      play.ctx,
      makeModel('playing', {
        bombs: 2,
        bossMaxHp: 100,
        bossHp: 50,
        bossName: '星喰い',
        spellName: '星屑結界',
        banner: 'WARNING',
        bannerTimer: 1,
        elapsed: 2,
      }),
      1,
    );
    play.rects.forEach(expectInsideField);
    const playText = play.texts.join('');
    expect(playText).toContain('スコア');
    expect(playText).toContain('ボム');
    expect(playText).toContain('低速');
    expect(playText).toContain('ポーズ');
    expect(playText).toContain('星喰い');
    expect(playText).toContain('星屑結界');
    expect(playText).toContain('ドラッグで移動');
    expect(playText).toContain('ショットは自動');
    expect(playText).toContain('00:02');

    const late = createProbe();
    ui.draw(late.ctx, makeModel('playing', { elapsed: 7 }), 1);
    expect(late.texts.join('')).not.toContain('ドラッグで移動');

    const paused = createProbe();
    ui.draw(paused.ctx, makeModel('paused'), 0);
    paused.rects.forEach(expectInsideField);
    const pausedText = paused.texts.join('');
    expect(pausedText).toContain('ポーズ');
    expect(pausedText).toContain('再開');
    expect(pausedText).toContain('リトライ');
    expect(pausedText).toContain('タイトル');

    const result = {
      score: 12_000,
      best: 12_000,
      isNewRecord: true,
      graze: 33,
      difficulty: 'normal' as const,
      stageCleared: false,
    };
    const gameOver = createProbe();
    ui.draw(gameOver.ctx, makeModel('gameover', { result }), 0);
    gameOver.rects.forEach(expectInsideField);
    const gameOverText = gameOver.texts.join('');
    expect(gameOverText).toContain('ゲームオーバー');
    expect(gameOverText).toContain('NEW RECORD!');
    expect(gameOverText).toContain('リトライ');
    expect(gameOverText).toContain('タイトル');

    const clear = createProbe();
    ui.draw(clear.ctx, makeModel('clear', { result: { ...result, stageCleared: true } }), 0);
    clear.rects.forEach(expectInsideField);
    expect(clear.texts.join('')).toContain('ステージクリア');
  });

  it('reuses cached gradients on later frames', () => {
    installStorage(memoryStorage());
    const ui = createUi();
    const probe = createProbe();
    const model = makeModel('title');
    ui.draw(probe.ctx, model, 1);
    const firstFrameGradients = probe.gradientCount;
    expect(firstFrameGradients).toBeGreaterThan(0);
    ui.draw(probe.ctx, model, 1.25);
    expect(probe.gradientCount).toBe(firstFrameGradients);
  });
});
