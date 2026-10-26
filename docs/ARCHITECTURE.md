# ARCHITECTURE — 実装を分割して理解する

## 現在の構成（実際のファイル）

| ファイル | 主な責務 |
| --- | --- |
| `extension.js` | コマンド登録・コピー枠・移動・貼り付けの入口 |
| `paste-context.js` | コメント・文字列・宣言値・セレクタ・構造位置の判定 |
| `selectors.js` | CSS/HTMLクラスの抽出 |
| `cross-navigation.js` | HTML ⇄ CSS の対応候補探索 |
| `placement.js` | CSSの配置候補判定 |
| `confirmation.js` | 配置確認UI |
| `history.js`, `history-view.js` | Diff保存・履歴ビュー |
| `save-history.js`, `git-push-history.js` | 保存・push履歴 |
| `settings.js` | 既存の内部設定 |
| `test/` | Node.jsによる自動テスト |

※ソースのファイル名とrequire相対パスを変えるだけでは動かなくなるため、**今回は再配置をしていません**。

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
