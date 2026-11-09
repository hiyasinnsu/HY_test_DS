/**
 * Danmaku pattern library. Every helper is a pure "spawn through ctx" call:
 * pass the enemy or stage position, get bullets back via `ctx.spawnBullet`.
 * Difficulty scaling (bullet speed + count) is applied inside each helper.
 */
export * from './shared';
export * from './ring';
export * from './fan';
export * from './curtain';
export * from './laser';
export * from './split';
export * from './emitter';
