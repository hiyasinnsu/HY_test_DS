# 先行 OSS 弾幕シューティングの調査

実装前に、GitHub 上の弾幕シューティング OSS を比較し、設計と依存関係の取り入れ方を決めた。調査は GitHub API でライセンス・主要言語・依存関係・構成を確認して行った（2026-11-09 時点）。**コードのコピーは行っておらず、参考にしたのは構成と設計方針のみ。**

## 比較の概要

| リポジトリ | ライセンス | 言語 / 構成 | 参考にした点 | 採用しなかった点 |
| --- | --- | --- | --- | --- |
| MakingMeans/gensokyo-danmaku-studio | MIT | TypeScript、ランタイム依存ゼロ、Vite + Vitest | モジュール分割、弾プール、固定ステップ、エミッタ、テストされたパターン計算 | zod 依存、ビジュアルエディタ |
| NyuxRGB/Touhou-Tales-of-Danmaku | MIT | TypeScript | ステージ単位のパターンデータ構成、シーン分離 | express / better-sqlite3（スコアサーバ）、Tauri |
| valsaven/SakuraStorm | MIT | TypeScript + Phaser 3 | 参考のみ（スプライト・音声の扱い） | Phaser への依存（約 1 MB のランタイム） |
| Bagoum/danmokou | C#（明示的なライセンスタグなし） | C# | 弾の「コマンド / タスク」形式のパターン記述 | エンジン固有の実装（.NET） |
| fal-works/firedancer | MIT | Haxe | パターン記述の抽象化 | エンジン固有の実装（Haxe / 独自ランタイム） |
| Dark-Peace/BulletUpHell, Moonzel/Godot-PerfBullets | MIT | Godot | 数千発の弾をまとめて描画するバッチング手法（MultiMesh 2D） | エンジン固有の描画 |

## 各プロジェクトから読み取ったこと

### MakingMeans/gensokyo-danmaku-studio（MIT, TypeScript）

ランタイム依存ゼロで、Vite + Vitest という本プロジェクトと同じ構成。エンジンが sim / pattern / math / render / input / loop に分割され、弾はプールされていた。パターンは ring / spread / spiral などのエミッタ原始関数で表現し、その入力を zod スキーマで検証していた。スペルカードは JSON データとして持ち、それを編集するビジュアルエディタも同梱していた。

- 採用: モジュール分割、弾プール、固定ステップのループ、エミッタ原始関数、パターン計算の単体テスト。
- 不採用: zod 依存（実行時依存ゼロの方針に反する）とビジュアルエディタ（本プロジェクトの範囲外）。

### NyuxRGB/Touhou-Tales-of-Danmaku（MIT, TypeScript）

シーン（メニュー）とエンティティ（弾）を分離し、ステージごとにパターンデータを持つ構成。ただしスコアサーバ用に express と better-sqlite3、デスクトップ配布用に Tauri に依存していた。

- 採用: ステージ単位のパターン構成、シーン（画面）分離。
- 不採用: サーバおよび Tauri への依存（ブラウザ単体で完結させる方針に合わない）。

### valsaven/SakuraStorm（MIT, TypeScript + Phaser 3）

Phaser 3 を使うことでスプライト描画や音声再生を自前で書かずに済むが、ランタイムが約 1 MB 増える。モバイルの初回読み込みと描画性能を予測しやすくするため、エンジン依存は採用しなかった。本プロジェクトは Canvas2D を直接使う。

### Bagoum/danmokou（C#）、fal-works/firedancer（Haxe）、Dark-Peace/BulletUpHell / Moonzel/Godot-PerfBullets（MIT, Godot）

BulletUpHell と Godot-PerfBullets は、数千発の弾を MultiMesh 2D でバッチ描画する手法の参考になった。danmokou と firedancer は、弾の生成を「コマンド / タスク」の並びとして記述するパターン記述スタイルの参考になった。いずれもエンジン固有の実装なので、描画部分は採用していない。

本プロジェクトの Canvas2D レンダラは、弾スプライトをオフスクリーンのアトラスに事前描画し、`drawImage` で描く方式にした。グラデーションやパスの生成を毎フレーム行わないことで、モバイルでも弾数が多い状況のコストを抑える。

## この調査から決めた設計

- **弾のプール**: 弾は起動時に確保して再利用し、フレーム中のアロケーションと GC の停止を避ける。
- **固定タイムステップ 1/60 秒**: シミュレーションを固定ステップで進め、描画と分離する。端末のフレームレートが揺れても挙動が変わらない。
- **パターン原始関数を spawn コンテキスト上の純関数にする**: 弾・レーザー・アイテムの生成は spawn コンテキスト経由に限定し、パターン計算は副作用のない関数として単体テストする。
- **コンテンツは JSON ではなく TypeScript モジュール**: 型チェックと補完が効き、スキーマ検証ライブラリを足さずに実行時依存ゼロを保てる。
- **画像・音声はプログラム生成**: 外部アセットを持たず、リポジトリをアセットフリーに保つ。
