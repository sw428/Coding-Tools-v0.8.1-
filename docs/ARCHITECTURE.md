# ARCHITECTURE — 実装を分割して理解する

## 現在の構成（実際のファイル）

| ファイル | 主な責務 |
| --- | --- |
| `src/extension.js` | コマンド登録・コピー枠・移動・貼り付けの入口 |
| `src/paste-context.js` | コメント・文字列・宣言値・セレクタ・構造位置の判定 |
| `src/selectors.js` | CSS/HTMLクラスの抽出 |
| `src/html-context.js` | M03：コピー時点のHTML構造・セクショニング・構造上の役割の取得 |
| `src/workflow-options.js` | M01〜M04：ヘルプ・保持情報・判断材料・コメント設定と情報の絞り込み |
| `src/inline-help.js` | M01・M02：編集カーソル位置に応じた時間制限付きの操作案内 |
| `src/paste-policy.js` | M04：保持情報を判断材料へ変換、登録CSSコメントの照合・追加 |
| `src/automatic-placement.js` | M04：現在のCSS範囲で既存ルール・領域の目印・仮置きを選ぶ純粋な配置処理 |
| `src/class-navigation.js` | M01：クラス上の判定、同じファイル内の同名クラス移動、キーの有効範囲 |
| `src/cross-navigation.js` | HTML ⇄ CSS の対応候補探索 |
| `src/placement.js` | CSSの配置候補判定 |
| `src/confirmation.js` | 配置確認UI |
| `src/history.js`, `src/history-view.js` | Diff保存・履歴ビュー |
| `src/save-history.js`, `src/git-push-history.js` | 保存・push履歴 |
| `src/settings.js` | 既存の内部設定 |
| `src/slot-values.js`, `src/external-paste.js` | 保存枠形式と外部貼り付けの接続 |
| `test/` | Node.jsによる自動テスト |

M01〜M07は [VISION.md](VISION.md) の概念上のモジュールID。実ファイルとは一対一ではない。M03は`src/html-context.js`へ抽出処理を分け、`src/extension.js`が枠ごとの保存とM04への受け渡しを担当する。

本体は`src/`へまとめ、`src/native/`にWindows補助、`src/vendor/`に同梱ライブラリ、`src/assets/`に画像を置く。入口はpackage.jsonのmainと一致させる。`test/fixtures/`は確認用の文書、`tools/`は配布・ガイド生成用。移動に伴う参照だけを修正し、機能は変更しない。

## 将来のモジュール分割案（未実装）

```text
src/
  navigation/
  clipboard/
  history/
  css-analysis/
  placement/
  profile-rules/
profiles/
```

Coreは入力された文書・設定から解析結果を返し、UIはその結果を表示する。現場別プロファイルはCoreのコードを複製せず、差分規則のみを保存する。

**段階分け**：まず抽出・配置判断を純粋関数として切り出す → テスト → 拡張機能から呼び出す → 実機で安定性確認。
