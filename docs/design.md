# 設計メモ

## 座標系とループ

- 論理解像度は 450 x 800（縦）。`src/core/viewport.ts` が端末サイズに合わせて letterbox し、CSS ピクセル ↔ 論理座標の変換と canvas の DPR スケーリングを担当する。
- シミュレーションは `src/core/loop.ts` の固定ステップ（1/60 秒、accumulator、最大 5 ステップ）。描画は `requestAnimationFrame` ごとに 1 回。
- 論理座標の原点は左上、y は下方向。弾の角度は 0 が +x、`Math.PI / 2` が下向き。

## データフロー

```
input (main.ts)
   │  setPlayerTarget / useBomb / setFocus
   ▼
World (src/game/world.ts)  ── StageController を毎ステップ駆動
   │  takeEffects() -> EffectEvent[]
   ├────────────► AudioEngine（EffectKind → SfxName）
   └────────────► Renderer（EffectEvent → パーティクル）
                        │
                        ▼
                     canvas へ描画（背景 → 実体 → 弾 → 自機 → パーティクル）
   UiModel（World の読み取り専用ビュー）──► Ui（HUD・メニュー・タッチボタン）
```

World は DOM に触れない。描画と UI は World を読むだけで書き換えない。入力と画面遷移だけが `src/main.ts` に集約されている。

## 主要な契約

- `StageContext`（`src/game/types.ts`）: ステージ側（`src/game/stage/`）が使える API。`spawnBullet` / `spawnLaser` / `spawnEnemy` / `spawnItem` / `spawnEffect` / `aimAtPlayer` / `setBoss` / `setSpell` / `setBanner`。
- `StageController`: `start` / `update` / `progress` / `isComplete`。World が毎ステップ呼ぶ。
- `EnemySpec.update(enemy, ctx, dt)`: 敵ごとの挙動。移動は `enemy.vx/vy` に入れる（World が積分する）。
- `UiModel`: UI が必要とする値だけを持つスナップショット。毎フレーム組み立てる。
- `UiAction`: タップ結果。`hitTest` が返し、`main.ts` が解釈する。

## 当たり判定

| 対象 | 判定 |
| --- | --- |
| 自機 vs 弾 | 円（自機半径 2.6 + 弾半径 x0.85）。グレイズは半径 20 以内で弾ごとに 1 回 |
| 自機弾 vs 敵 | 円（敵半径 + 弾半径）。命中で自機弾は消滅 |
| 自機 vs レーザー | 点と線分の距離が `width/2 + 自機半径` 未満 |
| 自機 vs アイテム | 円（自機半径 + 20）。画面上部（HUD 直下 78u 以内）かボム中は全回収 |

## パフォーマンス方針

- 弾・自機弾・敵・アイテム・レーザーはすべて固定容量プール（`src/core/pool.ts`）。弾は 2400 発で頭打ち。
- 描画は事前生成スプライトの `drawImage` のみ。`shadowBlur`・毎フレームのグラデーション生成・ループ内アロケーションを禁止。
- FPS が 48 を下回る状態が続くと `setQuality('low')` に一度だけ落とす（パーティクル数と弾の描画を抑制）。
- canvas の DPR は 2 で頭打ち（高 DPR 端末での塗りつぶしコストを抑える）。

## テスト戦略

- `tests/core.test.ts`: 数学・乱数・プールの純粋ロジック。
- `tests/world.test.ts`: スタブステージで World の機構（移動・射撃・被弾・グレイズ・ボム・プール枯渇・ポス HP 通知）を検証。
- `tests/content.test.ts` / `tests/render.test.ts` / `tests/ui.test.ts` / `tests/audio.test.ts`: 各レイヤー。canvas と WebAudio はスタブ。
- サンドボックスでは子プロセスが禁止されているため `node scripts/test.mjs`（`vitest` をインプロセス起動）を使う。CI でも同じコマンド。
