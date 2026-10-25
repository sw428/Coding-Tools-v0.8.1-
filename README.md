# Coding Tools

**作者：Elliot Veyne**

HTML/CSSのクラス選択、HTMLとCSSの移動、2枠のコピー・貼り付け、CSS追加、変更履歴の確認ができるVS Code拡張機能です。

**v0.8.2 β（検証中）**：Windows / MacのVS Codeでの実機確認は未完了です。

## 使う前に

- HTMLとCSSが入ったフォルダーをVS Codeで開き、操作するエディタをクリックしてください。
- 通常の `Ctrl+C / Ctrl+V`（Macは `⌘C / ⌘V`）は、そのまま使えます。
- GIFのキーは初期設定です。VS Codeのキーボードショートカット一覧で「Coding Tools」を検索すると変更できます。
- CSSの自動追加はSCSS / LESSに対応していません。

<!-- BEGIN EXTENSION GIF DETAILS -->
## GIFで使い方を見る

拡張機能の「詳細」で、各GIFと1行説明をそのまま確認できます。全51本です。

操作説明用の仮想画面です。実機録画ではありません。

キーや詳しい手順は、コマンド「Coding Tools: GIFで使い方ガイドを開く（1操作ずつ）」から確認できます。

### クラス選択

#### 01 次のクラス名を選ぶ

![操作GIF：次のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/01-next-class.gif)

キーを押すたびに、次のクラス名へ選択が移ります。

#### 02 前のクラス名を選ぶ

![操作GIF：前のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/02-previous-class.gif)

後ろから前へ、クラス名を1つずつ選べます。

#### 03 次のクラスも追加選択する

![操作GIF：次のクラスも追加選択する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/03-extend-next-class.gif)

元の選択を残し、次のクラス名を追加します。

#### 04 前のクラスも追加選択する

![操作GIF：前のクラスも追加選択する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/04-extend-previous-class.gif)

元の選択を残し、前のクラス名を追加します。

### コピー・貼り付け

#### 05 保存枠1へコピーする

![操作GIF：保存枠1へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/05-copy-slot1.gif)

選んだ文字を保存枠1に覚えさせます。コピーだけではコードは変わりません。

#### 06 保存枠1から貼り付ける

![操作GIF：保存枠1から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/06-paste-slot1.gif)

保存枠1に覚えた内容を、今のカーソル位置へ貼り付けます。

#### 07 保存枠2へコピーする

![操作GIF：保存枠2へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/07-copy-slot2.gif)

選んだ文字を保存枠2に覚えさせます。コピーだけではコードは変わりません。

#### 08 保存枠2から貼り付ける

![操作GIF：保存枠2から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/08-paste-slot2.gif)

保存枠2に覚えた内容を、今のカーソル位置へ貼り付けます。

#### 09 一覧でコピー先の枠を選ぶ

![操作GIF：一覧でコピー先の枠を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/09-choose-copy-slot.gif)

番号を覚えていなくても、一覧から保存枠を選べます。

#### 10 一覧で貼り付け元の枠を選ぶ

![操作GIF：一覧で貼り付け元の枠を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/10-choose-paste-slot.gif)

保存してある文字を見ながら、使う枠を選べます。

#### 11 カーソル上のクラス名をコピー

![操作GIF：カーソル上のクラス名をコピー](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/11-copy-class-name.gif)

クラス名の上にカーソルを置くだけで、その名前をコピーできます。

#### 12 スマートコピーでドットを外す

![操作GIF：スマートコピーでドットを外す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/12-smart-copy.gif)

クラス名全体を選んで実行すると、ドットなしの名前をコピーします。

#### 13 スマート貼り付けでドットを付ける

![操作GIF：スマート貼り付けでドットを付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/13-smart-paste.gif)

拡張機能でコピーしたクラスを、CSSの入力中の位置へ貼り付けます。

### HTMLとCSSの移動

#### 14 HTMLからCSS定義へ移動

![操作GIF：HTMLからCSS定義へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/14-html-to-css.gif)

HTMLのクラス名を選んで、対応するCSSの場所へ直接移動します。

#### 15 CSSからHTMLの使用箇所へ移動

![操作GIF：CSSからHTMLの使用箇所へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/15-css-to-html.gif)

CSSのクラス名から、そのクラスを使っているHTMLへ移動します。

#### 16 次のジャンプ候補へ移動

![操作GIF：次のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/16-next-jump-candidate.gif)

ジャンプ先が複数あるとき、Tabで次の候補へ移れます。

#### 17 前のジャンプ候補へ移動

![操作GIF：前のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/17-previous-jump-candidate.gif)

ジャンプ候補をShift + Tabで逆順に見られます。

#### 18 ジャンプ候補の切り替えを終える

![操作GIF：ジャンプ候補の切り替えを終える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/18-finish-jump.gif)

Escで切り替えを終了し、今の場所から編集を続けられます。

### CSSへの追加

#### 19 CSSに空のルールを追加する

![操作GIF：CSSに空のルールを追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/19-safe-css-add.gif)

コピーしたクラスの追加先を調べ、差分を確認してから空のCSSルールを追加します。

#### 20 同名のCSSがあれば、その場所へ移動

![操作GIF：同名のCSSがあれば、その場所へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/20-existing-css.gif)

既存ルールへ移動する候補を選ぶと、CSSを書き換えずに目的の場所を開きます。

#### 21 追加先のCSSファイルを選ぶ

![操作GIF：追加先のCSSファイルを選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/21-choose-stylesheet.gif)

CSSファイルが複数あり追加先を決められない場合は、自分でファイルを選びます。

#### 22 既存の条件内へ追加する

![操作GIF：既存の条件内へ追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/22-add-inside-media.gif)

既存の@mediaなどを選び、その条件の中へ空のルールを追加できます。

#### 23 新しい@mediaを作って追加する

![操作GIF：新しい@mediaを作って追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/23-new-media.gif)

条件付きCSSの候補から、新しい@mediaを入力して追加できます。

#### 24 関係や状態を指定して追加する

![操作GIF：関係や状態を指定して追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/24-custom-selector.gif)

追加先の候補から、隣接・状態などを表すセレクタを入力できます。

#### 25 貼り付け方法から通常貼り付けを選ぶ

![操作GIF：貼り付け方法から通常貼り付けを選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/25-paste-options-plain.gif)

貼り付け方法の画面で「通常の貼り付け」を選ぶと、今の位置へ文字を入れます。

#### 26 貼り付け方法からCSS追加を選ぶ

![操作GIF：貼り付け方法からCSS追加を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/26-paste-options-css.gif)

CSSへ整理する方を選ぶと、CSS追加先の判断と差分確認へ進みます。

#### 27 差分を確認してから適用する

![操作GIF：差分を確認してから適用する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/27-confirm-css.gif)

最終確認ONのときは、差分を見て適用ボタンを押すまで元のCSSは変わりません。

#### 28 CSS追加をキャンセルする

![操作GIF：CSS追加をキャンセルする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/28-cancel-css.gif)

差分確認でキャンセルすると、元のCSSを変更せずに終わります。

#### 29 CSSを解析できなければ中止する

![操作GIF：CSSを解析できなければ中止する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/29-stop-unsafe-css.gif)

構文が壊れているなど、安全に追加できない場合は編集を中止します。

#### 30 追加したCSSを元に戻す

![操作GIF：追加したCSSを元に戻す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/30-undo-css.gif)

追加直後にVS Code標準のCtrl + Zで、その編集を取り消せます。

### 履歴

#### 31 履歴パネルを開く

![操作GIF：履歴パネルを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/31-history-panel.gif)

エクスプローラー内の「Coding Tools 履歴」を開きます。

#### 32 履歴を一覧から選ぶ

![操作GIF：履歴を一覧から選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/32-history-list.gif)

日時とファイル名の一覧から、見たい差分を選べます。

#### 33 最新の差分を開く

![操作GIF：最新の差分を開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/33-latest-diff.gif)

一番新しく記録された差分を、一覧選択なしで開きます。

#### 34 履歴の行をクリックして差分を見る

![操作GIF：履歴の行をクリックして差分を見る](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/34-selected-diff.gif)

月の中にある履歴の行を選ぶと、その変更内容が開きます。

#### 35 履歴から変更元ファイルを開く

![操作GIF：履歴から変更元ファイルを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/35-source-from-history.gif)

履歴の行から、編集した元ファイルの場所へ戻れます。

#### 36 履歴の表示を更新する

![操作GIF：履歴の表示を更新する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/36-refresh-history.gif)

保存済みの履歴を読み直して、パネルの表示を更新します。

#### 37 履歴フォルダーを開く

![操作GIF：履歴フォルダーを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/37-history-folder.gif)

保存された履歴のフォルダーを、OSのエクスプローラーで開きます。

#### 38 ファイル保存時の差分を残す

![操作GIF：ファイル保存時の差分を残す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/38-save-history.gif)

保存履歴がONなら、前回保存した内容からの変更を保存時に記録します。

#### 39 Coding ToolsからGit pushして記録する

![操作GIF：Coding ToolsからGit pushして記録する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/39-push-and-log.gif)

専用コマンドでpushが成功した場合に、Git push履歴を記録します。

### 設定

#### 40 Coding Toolsの設定を開く

![操作GIF：Coding Toolsの設定を開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/40-open-settings.gif)

エクスプローラー内の「Coding Tools 設定」を表示します。

#### 41 操作履歴の記録をON/OFF

![操作GIF：操作履歴の記録をON/OFF](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/41-toggle-operation.gif)

設定欄の項目をクリックするか、選択してEnterを押すとON/OFFが切り替わります。

#### 42 保存履歴の記録をON/OFF

![操作GIF：保存履歴の記録をON/OFF](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/42-toggle-save.gif)

設定欄の項目をクリックするか、選択してEnterを押すとON/OFFが切り替わります。

#### 43 Git push履歴の記録をON/OFF

![操作GIF：Git push履歴の記録をON/OFF](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/43-toggle-push.gif)

設定欄の項目をクリックするか、選択してEnterを押すとON/OFFが切り替わります。

#### 44 CSS適用前の最終確認をON/OFF

![操作GIF：CSS適用前の最終確認をON/OFF](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/44-toggle-confirm.gif)

設定欄の項目をクリックするか、選択してEnterを押すとON/OFFが切り替わります。

#### 45 操作履歴の保存期間を変える

![操作GIF：操作履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/45-retention-operation.gif)

操作履歴について、履歴を残す日数を1〜360日で設定できます。

#### 46 保存履歴の保存期間を変える

![操作GIF：保存履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/46-retention-save.gif)

保存履歴について、履歴を残す日数を1〜360日で設定できます。

#### 47 Git push履歴の保存期間を変える

![操作GIF：Git push履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/47-retention-push.gif)

Git push履歴について、履歴を残す日数を1〜360日で設定できます。

#### 48 ショートカット一覧を開いて変える

![操作GIF：ショートカット一覧を開いて変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/48-keyboard-shortcuts.gif)

VS Code標準のショートカット一覧で、Coding Toolsのキーを変更できます。

#### 49 このGIFガイドを開く

![操作GIF：このGIFガイドを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/49-open-gif-guide.gif)

Coding Toolsの設定欄から、1操作ずつのGIFガイドを開けます。

### CSSの設定

#### 50 優先するCSSファイルを指定する

![操作GIF：優先するCSSファイルを指定する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/50-preferred-stylesheet.gif)

VS Codeの設定で、HTMLから追加するときに使うCSSファイルを指定できます。

#### 51 クラスの接頭辞ごとに追加先を指定する

![操作GIF：クラスの接頭辞ごとに追加先を指定する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/fa5841d0e773ea3311a6703ce46ffd8e8ad01377/51-placement-rules.gif)

クラス名の接頭辞に応じて、基本ルールか既存の@mediaを優先できます。
<!-- END EXTENSION GIF DETAILS -->
