# Coding Tools

**作者：Elliot Veyne**

Coding Toolsは、**クラスに特化した、シームレスなコピー・貼り付け・移動**を目的としたVS Code拡張機能です。HTMLとCSSの行き来やクラス名の受け渡しをつなぎ、整理の手間を減らします。

標準のコピー・貼り付けとは別に、2つのテキスト保存枠を使えます。専用のCSS貼り付けでは、コピー時に取得したクラス情報を手がかりに追加先を自動で探し、差分を確認して追加できます。

コード・コピー内容・操作履歴を作者へ送信する機能はありません。変更履歴は利用者の環境に保存します。

**v0.8.2 β（初期開発版）**

## 使う前に

- HTMLとCSSが入ったフォルダーをVS Codeで開き、操作するエディタをクリックしてください。
- 通常の `Ctrl+C / Ctrl+V`（Macは `⌘C / ⌘V`）は、そのまま使えます。
- GIFのキーは初期設定です。VS Codeのキーボードショートカット一覧で「Coding Tools」を検索すると変更できます。
- CSSの自動追加はSCSS / LESSに対応していません。

<!-- BEGIN EXTENSION GIF DETAILS -->
## GIFで使い方を見る

拡張機能の「詳細」で、各GIFと1行説明をそのまま確認できます。全31本です。

下部の「Coding Tools」から設定全般を開けます。コピー枠1・2は「番号 → コピー → 貼り付け → 保存内容」の順に表示し、コピー／貼り付けを直接クリックできます。番号や保存内容をクリックすると操作を選べます。枠ごとに番号・操作名・初期キー・保存内容の表示をON/OFFでき、非表示でもキー操作は使えます。クラス名はドットなしで保存します。CSSの空行に貼ると、今のファイルで既存ルールへの移動・空ルール追加・記述済み条件内への追加を選べます。Tab／Shift+Tabで選択しEnterで決定できます。セレクタ入力ではドットを1つ付け、コメント・文字列・値や他言語には付けません。

キーや詳しい手順は、コマンド「Coding Tools: GIFで使い方ガイドを開く（1操作ずつ）」から確認できます。

### クラス選択

#### 01 次のクラス名を選ぶ（Win: Ctrl + Alt + J / Mac: Cmd + Alt + J）

![操作GIF：次のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/01-next-class.gif)

キーを押すたびに、次のクラス名へ選択が移ります。

#### 02 前のクラス名を選ぶ（Win: Ctrl + Alt + K / Mac: Cmd + Alt + K）

![操作GIF：前のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/02-previous-class.gif)

後ろから前へ、クラス名を1つずつ選べます。

### コピー・貼り付け

#### 05 保存枠1へコピーする（Win: Ctrl + Alt + Shift + 1 / Mac: Cmd + Alt + Shift + 1）

![操作GIF：保存枠1へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/05-copy-slot1.gif)

選択した文字やカーソル上のクラス名を枠1に保存します。クラス名はドットなしで保存します。

#### 06 保存枠1から貼り付ける（Win: Ctrl + Alt + 1 / Mac: Cmd + Alt + 1）

![操作GIF：保存枠1から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/06-paste-slot1.gif)

枠1の内容を貼り付けます。クラス名はCSSではドット付き、HTMLでは名前だけになります。

#### 07 保存枠2へコピーする（Win: Ctrl + Alt + Shift + 2 / Mac: Cmd + Alt + Shift + 2）

![操作GIF：保存枠2へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/07-copy-slot2.gif)

選択した文字やカーソル上のクラス名を枠2に保存します。クラス名はドットなしで保存します。

#### 08 保存枠2から貼り付ける（Win: Ctrl + Alt + 2 / Mac: Cmd + Alt + 2）

![操作GIF：保存枠2から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/08-paste-slot2.gif)

枠2の内容を貼り付けます。クラス名はCSSではドット付き、HTMLでは名前だけになります。

### HTMLとCSSの移動

#### 14 HTMLからCSS定義へ移動（Win: Ctrl + Alt + 3 / Mac: Cmd + Alt + 3）

![操作GIF：HTMLからCSS定義へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/14-html-to-css.gif)

HTMLのクラス名を選んで、対応するCSSの場所へ直接移動します。

#### 15 CSSからHTMLの使用箇所へ移動（Win: Ctrl + Alt + 4 / Mac: Cmd + Alt + 4）

![操作GIF：CSSからHTMLの使用箇所へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/15-css-to-html.gif)

CSSのクラス名から、そのクラスを使っているHTMLへ移動します。

#### 16 次のジャンプ候補へ移動（Tab）

![操作GIF：次のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/16-next-jump-candidate.gif)

ジャンプ先が複数あるとき、Tabで次の候補へ移れます。

#### 17 前のジャンプ候補へ移動（Shift + Tab）

![操作GIF：前のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/17-previous-jump-candidate.gif)

ジャンプ候補をShift + Tabで逆順に見られます。

#### 18 ジャンプ候補の切り替えを終える（Esc）

![操作GIF：ジャンプ候補の切り替えを終える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/18-finish-jump.gif)

Escで切り替えを終了し、今の場所から編集を続けられます。

### CSSへの追加

#### 19 CSSに空のルールを追加する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

今開いているCSSの空行で枠1・2から貼り付け、空ルールの追加先を選びます。

#### 20 同名のCSSがあれば、その場所へ移動（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

枠1・2からCSSへ貼るとき、既存の同名ルールへの移動を選べます。

#### 22 既存の条件内へ追加する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

記述済みの@mediaなどがあれば、同じ候補一覧から条件内への空ルール追加を選べます。

#### 27 差分を確認してから適用する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：差分を確認してから適用する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/27-confirm-css.gif)

最終確認ONのときは、差分を見て適用ボタンを押すまで元のCSSは変わりません。

#### 28 CSS追加をキャンセルする（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：CSS追加をキャンセルする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/28-cancel-css.gif)

差分確認でキャンセルすると、元のCSSを変更せずに終わります。

#### 29 CSSを解析できなければ中止する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

構文が壊れているなど、安全に追加できない場合は編集を中止します。

#### 30 追加したCSSを元に戻す（Win: Ctrl + Z / Mac: Cmd + Z）

![操作GIF：追加したCSSを元に戻す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/30-undo-css.gif)

追加直後にVS Code標準のCtrl + Zで、その編集を取り消せます。

### 履歴

#### 31 履歴パネルを開く（Win: Ctrl + Alt + H / Mac: Cmd + Alt + H）

![操作GIF：履歴パネルを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/31-history-panel.gif)

エクスプローラー内の「Coding Tools 履歴」を開きます。

#### 32 履歴を一覧から選ぶ（コマンドパレット）

![操作GIF：履歴を一覧から選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/32-history-list.gif)

日時とファイル名の一覧から、見たい差分を選べます。

#### 33 最新の差分を開く（コマンドパレット）

![操作GIF：最新の差分を開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/33-latest-diff.gif)

一番新しく記録された差分を、一覧選択なしで開きます。

#### 34 履歴の行をクリックして差分を見る（履歴の行をクリック / Enter）

![操作GIF：履歴の行をクリックして差分を見る](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/34-selected-diff.gif)

月の中にある履歴の行を選ぶと、その変更内容が開きます。

#### 35 履歴から変更元ファイルを開く（履歴の行を右クリック → 変更元ファイルへ移動）

![操作GIF：履歴から変更元ファイルを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/35-source-from-history.gif)

履歴の行から、編集した元ファイルの場所へ戻れます。

#### 36 履歴の表示を更新する（コマンドパレット）

![操作GIF：履歴の表示を更新する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/36-refresh-history.gif)

保存済みの履歴を読み直して、パネルの表示を更新します。

#### 37 履歴フォルダーを開く（コマンドパレット）

![操作GIF：履歴フォルダーを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/37-history-folder.gif)

保存された履歴のフォルダーを、OSのエクスプローラーで開きます。

#### 38 ファイル保存時の差分を残す（Win: Ctrl + S / Mac: Cmd + S）

![操作GIF：ファイル保存時の差分を残す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/38-save-history.gif)

保存履歴がONなら、前回保存した内容からの変更を保存時に記録します。

#### 39 Coding ToolsからGit pushして記録する（コマンドパレット）

![操作GIF：Coding ToolsからGit pushして記録する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/39-push-and-log.gif)

専用コマンドでpushが成功した場合に、Git push履歴を記録します。

### 設定

#### 40 Coding Toolsの設定を開く（下部のCoding Toolsをクリック）

下部のCoding Toolsから、コピー枠の表示・履歴・CSS・キーなどの設定を選べます。

#### 41 操作履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：操作履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/41-toggle-operation.gif)

操作履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 42 保存履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：保存履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/42-toggle-save.gif)

保存履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 43 Git push履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：Git push履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/43-toggle-push.gif)

Git push履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 44 CSS適用前の最終確認をON/OFF（設定欄の対象行をクリック / Enter）

![操作GIF：CSS適用前の最終確認をON/OFF](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/44-toggle-confirm.gif)

設定欄の項目をクリックするか、選択してEnterを押すとON/OFFが切り替わります。

#### 45 操作履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：操作履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/45-retention-operation.gif)

操作履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 46 保存履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：保存履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/46-retention-save.gif)

保存履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 47 Git push履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：Git push履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/47-retention-push.gif)

Git push履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 48 ショートカット一覧を開いて変える（コマンドパレット）

![操作GIF：ショートカット一覧を開いて変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/9900d5283282e79d19240cb91c5ad90f776ba1c1/48-keyboard-shortcuts.gif)

VS Code標準のショートカット一覧で、Coding Toolsのキーを変更できます。

#### 49 このGIFガイドを開く（コマンドパレット）

Coding Toolsの設定欄から、1操作ずつのGIFガイドを開けます。

### CSSの設定

#### 51 クラスの接頭辞ごとに追加先を指定する（VS Code 設定：codingTools.placementRules）

接頭辞に応じたCSS配置設定で、基本ルールか記述済み@mediaの候補を初期選択できます。
<!-- END EXTENSION GIF DETAILS -->
