# CHANGELOG

## 2026-10-26 — 使い方ガイドを1操作ずつのGIFへ置き換え

- 9項目のSVG中心のガイドを、51本の日本語GIFと短い操作説明へ置き換え
- 全33コマンドを網羅し、CSSの追加先・適用・キャンセル、履歴、個別設定を分けて説明
- VS CodeのWebviewでGIFと静止画を参照できるようにし、VSIXにも画像一式を同梱
- Windowsで再生成できるシナリオと描画スクリプトを追加。画面は操作説明用で、実機録画ではない

## 2026-10-26 — 発行者名・拡張機能ID・ロゴ

- 発行者・作者をElliot Veyne、Publisher IDを`elliotveyne`に設定
- 拡張機能名をCoding Tools、`name`を`coding-tools`に設定（完全ID：`elliotveyne.coding-tools`）
- 下部の文字を除いた`ロゴ-文字なし.png`をREADMEと拡張機能アイコンに設定し、VSIXにも同梱（元画像の`ロゴ.png`は保存）
- MITライセンスの著作権者名をElliot Veyneに変更
- VSIXの表示名・説明・アイコンを`package.json`に合わせ、出力先を`dist/`に統一
- 旧IDのインストールとは別の拡張機能になる。Marketplace登録・公開とVS Code実機確認は未実施

## v0.8.2 β — CSS自動配置の安全制限

- 新しい `safe-placement.js` でCSSの挿入前後をPostCSS解析
- 既存ルールの変更・移動・削除を許可せず、空ルール1件だけ新規挿入
- ASTから既存CSSのルール・宣言・構造・順序が保たれることを検証
- `safe-preview.js` による読み取り専用Diffプレビューを追加
- 解析不能、SCSS/LESS、確認中のCSS変更時は編集せず中止
- 通常コピペ・クラス移動など既存機能はそのまま
- `test/safe-placement-tests.js` の10件を追加
- Nodeテスト通過、VS Code実機検証は未完了

## v0.8.1 β — 以前のベース

- HTMLとCSSのクラス移動・相互ジャンプ（候補はエディタ内Tab巡回）
- 番号付きコピー・貼り付けを2枠に整理
- CSS配置・Diff履歴・設定などを継続
- 通常のCtrl+C/Vへのショートカット割り当てなし
- 自動テスト通過。VS Code実機での検証は未完了

## 2026-10-25 — プロジェクト管理を開始

- コード自体はv0.8.1 βから変更せず、Wiki型のMarkdown正本（CURRENT / VISION / SPEC / DECISIONS / ROADMAP）を追加
- Git管理を初期化し、VSIXと利用時のDiffをGitの対象から分離
- テスト手順、データ扱い、GitHub移行手順を明文化

※過去のv0.1〜0.8.0は配布物単位で存在しており、Gitの個別コミット履歴をこのリポジトリに再現してはいません。
