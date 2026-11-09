/** Stage content barrel: the world only needs `createStage1`. */
export { createStage1, Stage1, STAGE_NAME, BOSS_WARNING_AT, BOSS_SPAWN_AT, BOSS_DEFEAT_DELAY } from './stage1';
export { BOSS_NAME, BOSS_HP, PHASE_COUNT, PHASE_NAMES, PHASE_PAUSE, PHASE_THRESHOLDS } from './boss';
export {
  fairySpec,
  turretSpec,
  spinnerSpec,
  midbossSpec,
} from './enemies';
export type { FairyOptions, TurretOptions, SpinnerOptions } from './enemies';
