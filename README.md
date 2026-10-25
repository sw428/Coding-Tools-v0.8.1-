# Coding Tools β — 開発リポジトリ

> **現行の基準：v0.8.2 β（2026-10-25時点）**。自動テストは通過。Windows / MacのVS Code実機での操作確認は未完了。**正式版ではありません。**

Coding Toolsは、HTML/CSSの学習とコーディング作業を効率化し、将来的には現場の規約・作業手順をプロファイルで切り替えられることを目指すVS Code拡張機能です。自動化の判断根拠と問題点を確認できることを重視します。

## 最初に読むファイル

| ファイル | 役割 |
| --- | --- |
| [CURRENT.md](CURRENT.md) | **進捗の正本**：今動くもの・未検証・次の作業 |
| [docs/00_INDEX.md](docs/00_INDEX.md) | 文書の目次・正本の扱い |
| [docs/VISION.md](docs/VISION.md) | 目的と開発方針 |
| [docs/SPEC.md](docs/SPEC.md) | **採用済み仕様**と現行実装の差異 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 判断・変更理由 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 未着手の構想 |
| [docs/TEST_CASES.md](docs/TEST_CASES.md) | テスト・実機検証の手順 |
| [CHANGELOG.md](CHANGELOG.md) | 版ごとの変更記録 |

### ディレクトリ

```text
coding-tools-repository/
├── README.md / CURRENT.md / CHANGELOG.md
├── package.json / extension.js / *.js    # 実装の正本（現行の平坦な構造を保持）
├── safe-placement.js / safe-preview.js  # CSS安全挿入・Diffプレビュー
├── vendor/postcss/                      # CSS構文検査ライブラリ同梱（MIT）
├── test/                                 # 自動テスト
├── docs/                                 # 構想・採用仕様・判断・検証
│   ├── reference/                        # 元のv0.8.1説明書
│   └── media/gif/                        # 仮想画面の操作デモ（実機録画ではない）
├── profiles/                             # 将来の案件別プロファイル構想
├── fixtures/                             # 実機確認用サンプル
├── dist/                                 # VSIX（Git管理しない）
├── build-vsix.py                         # VSIXを生成
└── .gitignore                            # 履歴・秘密情報・生成物の除外
```

## 開発を始める

1. このフォルダーをVS Codeで開く（VSIXファイル自体を編集するのではない）。
2. ターミナルで `npm test` を実行する。Node.jsが必要。
3. 変更内容を `CURRENT.md` に記録し、テストしてGitコミットする。
4. 配布用のVSIXは `python build-vsix.py` で生成可能（現在のスクリプトでは親フォルダーに出力）。必要なら `dist/` に移動する。
5. `dist/coding-tools-0.8.2-beta.vsix` が今回の安全配置版です。旧 `v0.8.1` は比較用として残します。

## ユーザー向けの現行動作

- クラス名を前後に移動・選択する。HTML ⇄ CSSの相互ジャンプも可能。
- 複数候補のジャンプ後はエディタ内でTab / Shift+Tab、Escで巡回を終える。
- 2つの番号付き保存枠でコピー・貼り付けする。
- 専用コマンドによるCSS配置・スマート貼り付け、月別Diff履歴、保存とGit pushの記録を扱う。
- **v0.8.2 β：CSS自動配置を安全側に制限。** 既存ルールを書き換えず、空のCSSルール1件だけを追加。編集前後をPostCSSで構文解析し、既存ルールの構造と順序の不変性を検査。差分プレビューと適用確認を行う。解析できない場合は中止。SCSS / LESSは非対応。
- **通常の `Ctrl+C / Ctrl+V` と `⌘C / ⌘V` のキー割り当てを上書きしない。**
- 各コマンドはVS Code標準のキーボードショートカット一覧で検索・変更できる。

CSS安全版の仕様は [docs/SAFE_PLACEMENT.md](docs/SAFE_PLACEMENT.md) を参照。

詳細な現行操作説明は [元のREADME](docs/reference/README-v0.8.1-original.md) を参照。

## 現行版と構想の区別

**現行版の履歴設定（ON/OFF・保持期間・最終確認）は拡張専用の `globalState` に保存**されます。一部のCSS配置設定はVS Codeの `settings.json` を利用します。以前希望された「同じ履歴設定をUIと`settings.json`の両方で編集・同期」は**まだ未実装**。実装予定は [ROADMAP](docs/ROADMAP.md) に記録しています。

職場別プロファイル、CSS配置解析の独立モジュール化も**未実装の構想**です。

## 開発と配布の切り分け

- **ソース・仕様・テスト**：このGitリポジトリが正本。
- **VSIX**：配布・インストール成果物。Gitでは通常コミットしない。GitHub Releasesに版ごとに添付する想定。
- **学習や仕事のDiff履歴・内部データ**：絶対にこのリポジトリにコミットしない。個人版と職場版を分離する。
- **GIF**：操作の仮想デモ。**実機で動く証明ではない**。

GitHubのPrivateリポジトリへの公開・pushは、このローカル一式を確認してから行います。初期Git履歴はローカルで用意してありますが、GitHub上にリモートリポジトリが作成済みとは限りません。詳しくは [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md)。

## 修正の手順

構想記録 → 採用仕様の合意 → ソース修正 → 自動テスト → 実機検証 → CURRENT更新 → Gitコミット → 必要ならVSIX作成。**確認なしに採用済み仕様や履歴を上書きしない。**

## 同梱するCSS構文解析ライブラリ

PostCSS 8.5.6 とその依存ライブラリ（nanoid、picocolors、source-map-js）を`vendor/postcss/`に同梱しています。MITライセンス等の通知は各同梱パッケージ内のLICENSEを参照。利用者のPCでnpm installしなくてもVSIXが動作するようにするためです。

**注意**：構文解析・差分確認は、ブラウザで表示が絶対に変化しないことの数学的証明ではありません。実機ブラウザ検証も継続します。
