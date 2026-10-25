# SPEC — 現行採用仕様と未実装案の境界

> **基準 v0.8.1 β**。現行コードと付属テストに基づく。ユーザー環境での実機検証は未完了。

## ナビゲーション

- HTMLのclass属性は空白区切りのトークン単位で移動。空の値は飛ばす。
- CSSはクラスセレクタを対象に前後へ移動。対象名全体を選択する。
- 前・次のクラス：Windows Ctrl+Alt+J / K。Mac Cmd+Option+J / K。
- 範囲を追加：Ctrl+Alt+Shift+J / K（MacはCmd+Option+Shift）。
- HTML→CSS：Ctrl+Alt+3。CSS→HTML：Ctrl+Alt+4。
- 複数のジャンプ候補：最初の候補をエディタで開き、Tab / Shift+Tabで巡回。Escで終了。確認モーダルは出さない。

## コピーと貼り付け

- コピー保存枠は1・2の2つ。Windows Ctrl+Alt+Shift+1/2でコピー、Ctrl+Alt+1/2で貼る（MacはCmd+Option）。
- クラス名専用コピーとスマート貼り付けは別コマンド。CSSではドットの扱いを専用処理する。
- **通常のCtrl+C / Ctrl+V、MacのCmd+C / Cmd+Vは上書きしない。**

## CSS配置

- 専用コマンドにより、既存の同一セレクタ、親・兄弟・前後のルール、メディア条件などを調査し、配置を推定する。
- 関連ルールが複数・曖昧な場合はユーザー選択。CSS条件（@mediaなど）を無断で統合・変更しない。
- 自動配置の判定は**安全性検証が必要なβ機能**。判断根拠が確定できない場合は安全側に倒す。

## 履歴と設定

- 拡張機能の操作ごとのDiff、ファイル保存ごとのDiff、**Coding Tools経由で成功したGit push**を別区分で保存。
- それぞれON/OFFでき、保持期間1〜360日。初期値：操作30日、保存90日、Git push90日。
- 履歴ON/OFF・保持日数・最終確認は現行版では**globalState**に保存。利用者のsettings.jsonには書き込まない。
- `codingTools.preferredStylesheet` や `codingTools.placementRules` は、既にVS Codeの設定項目として存在する。

## まだ採用済みの動作ではないもの

- 操作履歴などのON/OFF・保存日数を **UIとsettings.jsonのどちらからも変更・同期**する機能（要実装）。
- CSS解析を複数モジュールに分け、職場プロファイルの規約で制御する機能（設計段階）。
- 外部Gitクライアントで行ったすべてのpushを自動検知する機能（未実装）。

上記の未実装案を新機能として導入する際は `DECISIONS.md` と `CURRENT.md` を更新してからソースを変更する。
