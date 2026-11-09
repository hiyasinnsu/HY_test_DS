# 作業進捗 — HY_test_DS（スマホ向け弾幕シューティング）

最終更新: 2026-11-09

## 1. 目的と成功条件

**目的**: スマートフォンのブラウザで遊べる縦スクロール弾幕シューティングを作り、GitHub Pages（https://github.com/hiyasinnsu/HY_test_DS ）で公開する。

**成功条件**
1. GitHub Pages 上で公開され、スマホのブラウザで起動する
2. タッチ操作（ドラッグ移動・自動ショット・ボム・低速・ポーズ）で完結し、スクロールや拡大が誤発火しない
3. タイトル → 難易度選択 → ステージ（雑魚ウェーブ） → ボス（複数スペルカード） → クリア/ゲームオーバー → リトライ、が成立する
4. 残機/ボム/グレイズ/スコア/ハイスコア保存が動作する
5. ミドルレンジ端末で 60fps 相当を維持できる構造（プール + 事前描画スプライト）
6. ロジックの自動テストと本番ビルドが通り、CI で Pages へ自動デプロイされる

## 2. 重要な設計判断

| 判断 | 理由 |
| --- | --- |
| Vite + TypeScript + Canvas2D、実行時依存ゼロ | スマホでの挙動を制御しやすく、Pages へは静的出力のみで済む。Phaser 等は ~1MB の実行時依存になり描画制御も間接化される |
| 論理解像度 450x800 を letterbox | 端末差を吸収し、入力座標変換を 1 箇所（`src/core/viewport.ts`）に集約 |
| 固定タイムステップ 1/60（accumulator、最大 5 ステップ） | 120Hz 端末でも弾幕と当たり判定を一致させる。タブ復帰時の弾のワープを防ぐ |
| 弾は極小判定（半径 2.6）＋グレイズ半径 20 | 弾幕STGの標準的な手触り。被弾は明確、かすりは報酬 |
| 相対ドラッグ（指の移動量で自機が動く） | 指で自機が隠れない。絶対追従より誤タッチに強い |
| 弾・敵・アイテム・レーザーをプール | 1画面 1500 弾でも GC スパイクを出さない |
| スプライトをオフスクリーンで事前描画（glow 焼き込み） | `shadowBlur` を毎フレーム使わずにネオン表現を維持 |
| コンテンツ（パターン/ステージ）は TypeScript モジュール + spawn コンテキスト | JSON スキーマ検証の依存を避け、パターンをテスト可能な純関数に保つ |
| 画像・音声アセットなし（全て手続き生成） | リポジトリを軽く保ち、ライセンス問題をゼロにする |
| 効果音は WebAudio 合成 + 30ms レート制限 + 同時発音上限 | 弾幕では秒間数十回のヒット音が鳴るため |

## 3. モジュール構成

```
src/core/      math, rng, pool, loop, viewport
src/game/      types, constants, world（シミュレーション本体）, patterns/, stage/
src/render/    sprites, background, particles, renderer（描画）
src/ui/        ui（画面・HUD・タッチボタン）, storage（localStorage）, format
src/audio/     WebAudio 合成（SFX + BGM）
src/main.ts    アプリ状態機械・入力・画面遷移・配線
tests/         vitest（ロジック中心、canvas/WebAudio はスタブ）
scripts/       build.mjs / test.mjs / serve.mjs / sandbox-shim.mjs
```

## 4. 完了した主要工程

- [x] リポジトリ初期化（空リポジトリ、main ブランチ）、Vite/TS/Vitest 導入
- [x] ツールチェーン検証（typecheck / build / test / preview が動作）
- [x] コア基盤（math, rng, pool, loop, viewport）
- [x] 共有契約（types.ts: Bullet/Enemy/Laser/StageContext/UiModel 等）と定数（難易度・スコア・容量）
- [x] ワールドシミュレーション（移動・自動射撃・弾/レーザー/アイテム・当たり判定・グレイズ・ボム・スコア）
- [x] アプリ本体（状態機械・相対ドラッグ・キーボード・ポーズ・リザルト・ハイスコア保存・FPS 連動の品質降下）
- [x] GitHub Pages ワークフロー（Actions: npm ci → test → build → deploy-pages、`enablement: true`）
- [x] README（日本語）と docs/research.md（OSS 比較）
- [x] パターン/ステージ/ボス（ring/fan/curtain/laser/firework/emitter、13ウェーブ、5スペルカード）
- [x] レンダラ（事前描画スプライト atlas、背景、パーティクル、レーザー/ボス表現）
- [x] UI 画面・タッチボタン（title/playing/paused/gameover/clear、HUD、相対ドラッグ用ボタン）
- [x] WebAudio（SFX 14種 + BGM 5曲、レート制限・同時発音上限つき）
- [x] ヘッドレス統合テスト（実ステージを通しで実行、難易度3種すべてクリア到達）
- [x] ヘッドレス実行時スモークテスト（ビルド済みバンドルを疑似DOMで駆動、10,717フレーム）
- [ ] 実機ブラウザ確認、GitHub へ push、Pages 公開 URL の確認

## 5. 未解決事項と次の作業

**検証済み（2026-11-09）**

| 項目 | 結果 |
| --- | --- |
| 型チェック `npx tsc --noEmit` | エラー 0 |
| 単体/統合テスト `npm test` | 8 ファイル / 91 テスト 全通過（統合テストでステージ1を easy/normal/hard すべてクリアまで実行） |
| 本番ビルド `npm run build` | 成功。JS 91.2 kB（gzip 30.4 kB）、CSS 0.6 kB、`base: './'` の相対 URL を確認 |
| スモークテスト `npm run smoke` | 成功。title→playing→pause/resume→gameover→retry→自動ポーズ→ボス→clear を実フレームで通過、実行時例外 0、drawImage 約158万回 |
| 弾幕密度（実測, Normal） | ピーク 246 発 / 平均 114 発 / ボス戦ピーク 244 発。弾プール容量 2400 に対し余裕（将来ステージを増やす余地） |
| ステージ所要時間 | 雑魚 69.8 秒でボス出現、無強化・無敵のスクリプト操作で 163.4 秒クリア（スコア 67,305） |
| 実機・ブラウザ | **未検証**（この環境にブラウザ・音声出力がない） |
| Pages デプロイ | **未検証**（push 権限がないため未実行） |

1. **push 権限**: このエージェント環境には GitHub 認証情報がない（`git push` が `could not read Username` で失敗）。公開にはユーザーの push（またはトークン提供）が必要。
2. **Pages 有効化**: 初回は `configure-pages` の `enablement: true` で自動有効化を試みる。失敗時は Settings → Pages → Source = GitHub Actions を手動設定（README に記載）。
3. **実機のフレームレート**: ヘッドレスでは検証不能。FPS<48 が続くと low quality へ自動降下する実装を入れてある。
4. **サウンドの音色**: 合成パラメータは実機で聴くまで未確認。

## 6. 再発しやすい問題と対策（この環境固有）

- **`git config` が書けない / safe.directory エラー**: 所有権情報を持たない FS のため `dubious ownership` になる。`git -c safe.directory='*'` を毎回付ける（グローバル設定への書き込みはポリシーで拒否）。
- **HTTPS が schannel で失敗**: `SEC_E_NO_CREDENTIALS`。`git -c http.sslBackend=openssl` を付けると通る。
- **子プロセス禁止（`spawn EPERM`）**: `npx vite build` / `npx vitest` が Vite 内部の `net use` 呼び出しで落ちる。`scripts/sandbox-shim.mjs` で `child_process.exec/execFile` を潰し、`node scripts/build.mjs` / `node scripts/test.mjs` 経由で実行する。vitest は `pool: 'threads'`。
- **npm キャッシュの書き込み権限**: `npm_config_cache` をワークスペース内（`.npm-cache/`、gitignore 済み）に向ける。
- **設定ファイルは `.ts` でなく `.mjs`**: TS 設定のバンドル時に子プロセスを使うため。CI（Linux）ではどちらでも動く。
