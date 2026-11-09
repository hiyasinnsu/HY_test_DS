import { createLoop } from './core/loop';
import { createViewport } from './core/viewport';
import { createAudio, type SfxName } from './audio/audio';
import { DIFFICULTIES, FIELD_H, FIELD_W, SCORE } from './game/constants';
import { createStage1 } from './game/stage';
import type {
  AppScreen,
  Difficulty,
  EffectEvent,
  EffectKind,
  ResultSummary,
  UiAction,
  UiModel,
} from './game/types';
import { World } from './game/world';
import { createRenderer } from './render/renderer';
import { createUi } from './ui/ui';
import {
  loadBest,
  loadDifficulty,
  loadSoundEnabled,
  saveBest,
  saveDifficulty,
  saveSoundEnabled,
} from './ui/storage';

const EFFECT_SFX: Partial<Record<EffectKind, SfxName>> = {
  shot: 'shot',
  enemyHit: 'enemyHit',
  enemyKilled: 'enemyKilled',
  graze: 'graze',
  playerHit: 'playerHit',
  playerRespawn: 'extend',
  bomb: 'bomb',
  itemGet: 'item',
  bossWarning: 'bossWarning',
  bossPhase: 'phase',
  laserCharge: 'laser',
  extend: 'extend',
  cancel: 'cancel',
};

const FPS_WINDOW = 1.5;
const LOW_FPS_THRESHOLD = 48;

/** CSS env() insets are not readable from JS, so measure them with a probe. */
function readSafeAreaCss(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const top = Number.parseFloat(style.paddingTop) || 0;
  const bottom = Number.parseFloat(style.paddingBottom) || 0;
  probe.remove();
  return { top, bottom };
}

class Game {
  private readonly viewport = createViewport(document.querySelector<HTMLCanvasElement>('#game')!);
  private readonly renderer = createRenderer();
  private readonly ui = createUi();
  private readonly audio = createAudio();
  private readonly loop = createLoop(
    { update: (dt) => this.update(dt), render: (alpha, elapsed) => this.render(alpha, elapsed) },
    1 / 60,
  );

  private screen: AppScreen = 'title';
  private world: World | null = null;
  private difficulty: Difficulty = loadDifficulty();
  private soundEnabled = loadSoundEnabled();
  private bestScores: Record<Difficulty, number> = {
    easy: loadBest('easy'),
    normal: loadBest('normal'),
    hard: loadBest('hard'),
  };
  private result: ResultSummary | null = null;
  private elapsed = 0;
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private quality: 'high' | 'low' = 'high';
  private lowFpsTime = 0;

  // Drag state: the ship moves by the finger delta from where the drag began
  // (relative dragging) so the thumb never covers the ship.
  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private shipStartX = 0;
  private shipStartY = 0;
  private focusPointerId: number | null = null;
  private lastEffects: readonly EffectEvent[] = [];

  constructor() {
    this.audio.setEnabled(this.soundEnabled);
    this.applySafeArea();
    this.bindInput();
    this.bindLifecycle();
    this.ui.draw(this.viewport.ctx, this.buildUiModel(), 0);
    this.loop.start();
    this.audio.playBgm('title');
  }

  // ------------------------------------------------------------------- helpers

  private get best(): number {
    return this.bestScores[this.difficulty];
  }

  private buildUiModel(): UiModel {
    const world = this.world;
    return {
      screen: this.screen,
      difficulty: this.difficulty,
      score: world?.score ?? 0,
      best: this.best,
      lives: world?.lives ?? DIFFICULTIES[this.difficulty].lives,
      bombs: world?.bombs ?? DIFFICULTIES[this.difficulty].bombs,
      graze: world?.graze ?? 0,
      power: world?.power ?? 0,
      maxPower: 4,
      bossHp: world?.bossHp ?? 0,
      bossMaxHp: world?.bossMaxHp ?? 0,
      bossName: world?.bossName ?? '',
      spellName: world?.spellName ?? null,
      banner: world?.banner ?? null,
      bannerTimer: world?.bannerTimer ?? 0,
      soundEnabled: this.soundEnabled,
      fps: this.fps,
      stageProgress: world?.stageProgress ?? 0,
      elapsed: world?.time ?? 0,
      result: this.result,
    };
  }

  private applySafeArea(): void {
    const { top, bottom } = readSafeAreaCss();
    const scale = this.viewport.scale || 1;
    const topInset = Math.max(0, top - this.viewport.offsetY) / scale;
    const bottomInset = Math.max(0, bottom - this.viewport.offsetY) / scale;
    this.ui.setSafeArea(topInset, bottomInset);
  }

  // --------------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.viewport.canvas;
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event), { passive: false });
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event), { passive: false });
    window.addEventListener('pointerup', (event) => this.onPointerUp(event));
    window.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
  }

  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    this.audio.unlock();
    const point = this.viewport.toField(event.clientX, event.clientY);
    const action = this.ui.hitTest(point.x, point.y);
    if (action) {
      this.handleAction(action);
      return;
    }
    // Anywhere else on the title screen starts a run, so the player never has
    // to find one exact rectangle on a phone.
    if (this.screen === 'title') {
      this.handleAction({ type: 'start', difficulty: this.difficulty });
      return;
    }
    if (this.screen !== 'playing' || !this.world) return;

    if (this.ui.isFocusHeld(point.x, point.y)) {
      this.focusPointerId = event.pointerId;
      this.world.setFocus(true);
      return;
    }
    if (this.dragPointerId === null) {
      this.dragPointerId = event.pointerId;
      this.dragStartX = point.x;
      this.dragStartY = point.y;
      this.shipStartX = this.world.player.x;
      this.shipStartY = this.world.player.y;
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointerId || !this.world) return;
    event.preventDefault();
    const point = this.viewport.toField(event.clientX, event.clientY);
    this.world.setPlayerTarget(
      this.shipStartX + (point.x - this.dragStartX),
      this.shipStartY + (point.y - this.dragStartY),
    );
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
    if (event.pointerId === this.focusPointerId) {
      this.focusPointerId = null;
      this.world?.setFocus(false);
    }
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    const world = this.world;
    const step = 34;
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        if (down && world) world.setPlayerTarget(world.player.x - step, world.player.y);
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (down && world) world.setPlayerTarget(world.player.x + step, world.player.y);
        break;
      case 'ArrowUp':
      case 'KeyW':
        if (down && world) world.setPlayerTarget(world.player.x, world.player.y - step);
        break;
      case 'ArrowDown':
      case 'KeyS':
        if (down && world) world.setPlayerTarget(world.player.x, world.player.y + step);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        world?.setFocus(down);
        break;
      case 'KeyZ':
      case 'KeyJ':
        if (down) this.handleAction({ type: 'bomb' });
        break;
      case 'Escape':
      case 'KeyP':
        if (down) this.handleAction({ type: this.screen === 'paused' ? 'resume' : 'pause' });
        break;
      case 'Enter':
      case 'Space':
        if (!down) break;
        if (this.screen === 'title') this.handleAction({ type: 'start', difficulty: this.difficulty });
        else if (this.screen === 'gameover' || this.screen === 'clear') this.handleAction({ type: 'retry' });
        break;
      default:
        break;
    }
  }

  private handleAction(action: UiAction): void {
    this.audio.unlock();
    switch (action.type) {
      case 'start':
        this.audio.play('uiTap');
        this.startRun(action.difficulty);
        break;
      case 'selectDifficulty':
        this.difficulty = action.difficulty;
        this.bestScores[action.difficulty] = loadBest(action.difficulty);
        saveDifficulty(action.difficulty);
        this.audio.play('uiTap');
        break;
      case 'resume':
        this.audio.play('uiTap');
        this.resume();
        break;
      case 'retry':
        this.audio.play('uiTap');
        this.startRun(this.difficulty);
        break;
      case 'title':
        this.audio.play('uiBack');
        this.toTitle();
        break;
      case 'pause':
        this.audio.play('uiTap');
        this.pause();
        break;
      case 'toggleSound':
        this.soundEnabled = !this.soundEnabled;
        this.audio.setEnabled(this.soundEnabled);
        saveSoundEnabled(this.soundEnabled);
        this.audio.play('uiTap');
        this.audio.playBgm(this.screen === 'title' ? 'title' : 'stage');
        break;
      case 'bomb':
        this.world?.useBomb();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- transitions

  private startRun(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.world = new World({ difficulty, stage: createStage1() });
    this.result = null;
    this.screen = 'playing';
    this.dragPointerId = null;
    this.focusPointerId = null;
    this.loop.setPaused(false);
    this.audio.playBgm('stage');
  }

  private pause(): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.loop.setPaused(true);
    this.audio.playBgm('title');
  }

  private resume(): void {
    if (this.screen !== 'paused') return;
    this.screen = 'playing';
    this.loop.setPaused(false);
    this.audio.playBgm('stage');
  }

  private toTitle(): void {
    this.screen = 'title';
    this.world = null;
    this.result = null;
    this.loop.setPaused(false);
    this.audio.playBgm('title');
  }

  private finishRun(cleared: boolean): void {
    const world = this.world;
    if (!world) return;
    if (cleared) {
      // Clear bonus is added once, at the moment the stage is completed.
      world.score +=
        Math.round(
          (SCORE.stageClear + world.lives * SCORE.perLife + world.bombs * SCORE.perBomb) *
            world.difficulty.score,
        );
    }
    const previousBest = this.bestScores[this.difficulty];
    const isNewRecord = world.score > previousBest;
    if (isNewRecord) {
      this.bestScores[this.difficulty] = world.score;
      saveBest(this.difficulty, world.score);
    }
    this.result = {
      score: world.score,
      best: this.bestScores[this.difficulty],
      isNewRecord,
      graze: world.graze,
      difficulty: this.difficulty,
      stageCleared: cleared,
    };
    this.screen = cleared ? 'clear' : 'gameover';
    this.audio.playBgm(cleared ? 'clear' : 'gameover');
  }

  // ---------------------------------------------------------------- frame hooks

  private update(dt: number): void {
    this.elapsed += dt;
    const world = this.world;
    if (this.screen !== 'playing' || !world) {
      this.lastEffects = [];
      return;
    }

    world.update(dt);
    const effects = world.takeEffects();
    this.lastEffects = effects;
    for (const effect of effects) {
      const sfx = EFFECT_SFX[effect.kind];
      if (sfx) this.audio.play(sfx);
    }

    if (world.status === 'gameover') this.finishRun(false);
    else if (world.status === 'complete') this.finishRun(true);
  }

  private render(alpha: number, elapsed: number): void {
    const ctx = this.viewport.ctx;
    const { canvas, dpr } = this.viewport;

    // Letterbox area: painted before the field transform so the playfield can be
    // drawn in logical units afterwards without clipping artefacts.
    this.viewport.resetTransform();
    ctx.fillStyle = '#05030d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.viewport.applyFieldTransform();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();
    this.renderer.draw(ctx, {
      world: this.world,
      time: elapsed,
      alpha,
      effects: this.lastEffects,
      screen: this.screen,
      paused: this.screen === 'paused',
    });
    this.lastEffects = [];
    this.ui.draw(ctx, this.buildUiModel(), elapsed);
    ctx.restore();

    this.trackFps(dpr);
  }

  private trackFps(dpr: number): void {
    this.fpsAccum += 1 / 60;
    this.fpsFrames += 1;
    if (this.fpsAccum < FPS_WINDOW) return;
    this.fps = Math.round(this.fpsFrames / this.fpsAccum);
    this.fpsAccum = 0;
    this.fpsFrames = 0;

    // Adaptive quality: one-way downgrade only, to avoid oscillation.
    if (this.fps < LOW_FPS_THRESHOLD && this.quality === 'high' && dpr > 1) {
      this.lowFpsTime += FPS_WINDOW;
      if (this.lowFpsTime >= FPS_WINDOW * 2) {
        this.quality = 'low';
        this.renderer.setQuality('low');
      }
    } else {
      this.lowFpsTime = 0;
    }
  }

  private bindLifecycle(): void {
    const onResize = (): void => {
      this.viewport.resize();
      this.applySafeArea();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.screen === 'playing') this.pause();
    });
    window.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}

function boot(): void {
  const game = new Game();
  // Exposed for manual debugging from the device console; harmless in prod.
  (window as unknown as { __game?: unknown }).__game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
