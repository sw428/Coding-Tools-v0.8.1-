<<<<<<< HEAD
# Coding Tools

**作者：Elliot Veyne**

Coding Toolsは、**クラスに特化した、シームレスなコピー・貼り付け・移動**を目的としたVS Code拡張機能です。HTMLとCSSの行き来やクラス名の受け渡しをつなぎ、整理の手間を減らします。

標準のコピー・貼り付けとは別に、2つのテキスト保存枠を使えます。専用のCSS貼り付けでは、コピー元の情報から追加先を探し、既存箇所への移動または空ルール追加を自動で行います。

コード・コピー内容・操作履歴を作者へ送信する機能はありません。変更履歴は利用者の環境に保存します。

**v0.8.2 β（初期開発版）**

## 使う前に

- HTMLとCSSが入ったフォルダーをVS Codeで開き、操作するエディタをクリックしてください。
- 通常の `Ctrl+C / Ctrl+V`（Macは `⌘C / ⌘V`）は、そのまま使えます。
- GIFのキーは初期設定です。VS Codeのキーボードショートカット一覧で「Coding Tools」を検索すると変更できます。
- CSSの自動追加はSCSS / LESSに対応していません。

WindowsではVS Codeを開いている間、Chromeなど他アプリの入力欄にもCtrl+Alt+1/2で貼れます。ON/OFFと制限は[外部貼り付けの説明](docs/EXTERNAL_PASTE.md)を参照してください。Macの外部貼り付けは未実装です。

## 開発フォルダーの見方

| 場所 | 内容 |
| --- | --- |
| `src/` | 拡張機能の本体。入口は`src/extension.js`。補助機能・画像・同梱ライブラリもここにまとめる |
| `test/` | 自動テスト。`test/fixtures/`は確認用のHTML／CSS |
| `tools/` | VSIXの作成やガイド画像の生成 |
| `docs/` | 仕様・使い方・設計。将来用の説明は`docs/reference/` |
| `dist/` | 配布用VSIXと過去版 |

普段の編集は`src/`、動作確認はルートで`npm.cmd test`、配布版の作成は`python tools/build-vsix.py`。渡すファイルは`dist/配布用/coding-tools-latest.vsix`です。

`.git/`はGitの管理情報、`.cache/`は作業用データです。以前の`%SystemDrive%/`フォルダーは削除せず`.cache/legacy-paths/`へ保管しています。

## VSIXの配布と保存

人に渡すのは [dist/配布用/coding-tools-latest.vsix](dist/配布用/coding-tools-latest.vsix)。配布用には最新版を1つだけ置き、旧版は `dist/過去版/` へ保管します。

`python tools/build-vsix.py` で、新しいVSIXの検査後に旧版を退避して最新版を更新します。残す目安は「最新版」「一つ前の実際に使って問題なかった版」「大きな変更前・配布済みの版」。自動削除はしません。渡し方と保存ルールは [dist/README.md](dist/README.md) を参照してください。

クラス移動の現在の初期キーは、**前：Ctrl + 1／次：Ctrl + 2**（MacはCmd + 1／2）です。以下の公開GIFの01・02には旧キー、05・07には以前の記号なし保存の表示が残っています。現在はクラスを`.名前`、IDを`#名前`で保存します。最新のキー表示と操作GIFは、Coding Toolsの設定から開く同梱ガイドで確認してください。

<!-- BEGIN EXTENSION GIF DETAILS -->
## GIFで使い方を見る

拡張機能の「詳細」で、各GIFと1行説明をそのまま確認できます。全34本です。

キーや詳しい手順は、下部の「Coding Tools」→「GIFで使い方を確認」から開けます。

### クラス選択

#### 01 次のクラス名を選ぶ（Win: Ctrl + 2 / Mac: Cmd + 2）

![操作GIF：次のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/01-next-class.gif)

キーを押すたびに、次のクラス名へ選択が移ります。

#### 02 前のクラス名を選ぶ（Win: Ctrl + 1 / Mac: Cmd + 1）

![操作GIF：前のクラス名を選ぶ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/02-previous-class.gif)

後ろから前へ、クラス名を1つずつ選べます。

#### 03 同じファイル内の次の同名クラスへ（Ctrl + Tab）

![操作GIF：同じファイル内の次の同名クラスへ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/52-next-same-class.gif)

HTML/CSSの同名クラスだけを同じファイル内で次へたどります。端では循環します。

#### 04 同じファイル内の前の同名クラスへ（Ctrl + Shift + Tab）

![操作GIF：同じファイル内の前の同名クラスへ](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/53-previous-same-class.gif)

HTML/CSSの同名クラスだけを同じファイル内で前へたどります。端では循環します。

### コピー・貼り付け

#### 05 保存枠1へコピーする（Win: Ctrl + Alt + Shift + 1 / Mac: Cmd + Alt + Shift + 1）

![操作GIF：保存枠1へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/05-copy-slot1.gif)

選択した文字やカーソル上のクラス名・ID名を枠1に保存します。クラスは`.名前`、IDは`#名前`で保存し、種別も内部で保持します。CSS以外へ貼るときは記号を外します。

#### 06 保存枠1から貼り付ける（Win: Ctrl + Alt + 1 / Mac: Cmd + Alt + 1）

![操作GIF：保存枠1から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/06-paste-slot1.gif)

枠1の内容を貼り付けます。CSSでは位置に合わせてクラスに `.`、IDに `#` を付けます。検索欄では同じキーで検索語全体を名前だけに置き換えます。通常のCtrl+C／Ctrl+Vの内容は変えません。 Windowsでは他アプリにも同じキーで名前だけを貼れます。通常クリップボードは一時使用後に復元します。Macの外部貼り付けは未対応です。

#### 07 保存枠2へコピーする（Win: Ctrl + Alt + Shift + 2 / Mac: Cmd + Alt + Shift + 2）

![操作GIF：保存枠2へコピーする](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/07-copy-slot2.gif)

選択した文字やカーソル上のクラス名・ID名を枠2に保存します。クラスは`.名前`、IDは`#名前`で保存し、種別も内部で保持します。CSS以外へ貼るときは記号を外します。

#### 08 保存枠2から貼り付ける（Win: Ctrl + Alt + 2 / Mac: Cmd + Alt + 2）

![操作GIF：保存枠2から貼り付ける](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/08-paste-slot2.gif)

枠2の内容を貼り付けます。CSSでは位置に合わせてクラスに `.`、IDに `#` を付けます。検索欄では同じキーで検索語全体を名前だけに置き換えます。通常のCtrl+C／Ctrl+Vの内容は変えません。 Windowsでは他アプリにも同じキーで名前だけを貼れます。通常クリップボードは一時使用後に復元します。Macの外部貼り付けは未対応です。

### HTMLとCSSの移動

#### 09 HTMLからCSS定義へ移動（Win: Ctrl + Alt + 3 / Mac: Cmd + Alt + 3）

![操作GIF：HTMLからCSS定義へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/14-html-to-css.gif)

HTMLのクラス名を選んで、対応するCSSの場所へ直接移動します。

#### 10 CSSからHTMLの使用箇所へ移動（Win: Ctrl + Alt + 4 / Mac: Cmd + Alt + 4）

![操作GIF：CSSからHTMLの使用箇所へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/15-css-to-html.gif)

CSSのクラス名から、そのクラスを使っているHTMLへ移動します。

#### 11 次のジャンプ候補へ移動（下部のジャンプ候補表示をクリック）

![操作GIF：次のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/16-next-jump-candidate.gif)

ジャンプ先が複数ファイルにあるとき、下部の候補表示をクリックして次へ移れます。

#### 12 前のジャンプ候補へ移動（任意のキーを割り当て）

![操作GIF：前のジャンプ候補へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/17-previous-jump-candidate.gif)

前のジャンプ候補コマンドに独自のキーを割り当てると、複数ファイルの候補を逆順に見られます。

#### 13 ジャンプ候補の切り替えを終える（Esc）

![操作GIF：ジャンプ候補の切り替えを終える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/18-finish-jump.gif)

Escで切り替えを終了し、今の場所から編集を続けられます。

#### 14 同じコマンドでHTMLとCSSを行き来する（任意のキーを割り当て）

![操作GIF：同じコマンドでHTMLとCSSを行き来する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/54-related-html-css.gif)

開いている言語に合わせて、HTMLのクラスからCSSへ、CSSのクラスからHTMLへ移動します。既存の相互ジャンプ処理を使います。

### CSSへの追加

#### 15 CSSに空のルールを追加する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：CSSに空のルールを追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/19-safe-css-add.gif)

CSSの空行で枠1・2から貼ると、コピー元の構造と今のCSSから位置を決め、目印と空ルールを直接追加します。

#### 16 同名のCSSがあれば、その場所へ移動（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：同名のCSSがあれば、その場所へ移動](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/20-existing-css.gif)

同じ適用範囲に同じセレクタがあれば、追加せず既存箇所へ自動で移動します。

#### 17 既存の条件内へ追加する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：既存の条件内へ追加する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/22-add-inside-media.gif)

記述済みの@mediaなどの空行で貼ると、その条件の範囲内へ空ルールを直接追加します。

#### 18 CSSを解析できなければ中止する（Win: Ctrl + Alt + 1 / 2 / Mac: Cmd + Alt + 1 / 2）

![操作GIF：CSSを解析できなければ中止する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/29-stop-unsafe-css.gif)

構文が壊れているなど、安全に追加できない場合は編集を中止します。

### 履歴

#### 19 履歴の行をクリックして差分を見る（履歴の行をクリック / Enter）

![操作GIF：履歴の行をクリックして差分を見る](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/34-selected-diff.gif)

月の中にある履歴の行を選ぶと、その変更内容が開きます。

#### 20 履歴から変更元ファイルを開く（履歴の行を右クリック → 変更元ファイルへ移動）

![操作GIF：履歴から変更元ファイルを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/35-source-from-history.gif)

履歴の行から、編集した元ファイルの場所へ戻れます。

#### 21 履歴の表示を更新する（履歴欄上部の更新アイコン）

![操作GIF：履歴の表示を更新する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/36-refresh-history.gif)

保存済みの履歴を読み直して、パネルの表示を更新します。

#### 22 履歴フォルダーを開く（履歴欄上部のフォルダーアイコン）

![操作GIF：履歴フォルダーを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/37-history-folder.gif)

保存された履歴のフォルダーを、OSのエクスプローラーで開きます。

#### 23 ファイル保存時の差分を残す（Win: Ctrl + S / Mac: Cmd + S）

![操作GIF：ファイル保存時の差分を残す](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/38-save-history.gif)

保存履歴がONなら、前回保存した内容からの変更を保存時に記録します。

#### 24 Coding ToolsからGit pushして記録する（履歴欄上部のGit pushアイコン）

![操作GIF：Coding ToolsからGit pushして記録する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/39-push-and-log.gif)

専用コマンドでpushが成功した場合に、Git push履歴を記録します。

### 設定

#### 25 Coding Toolsの設定を開く（下部のCoding Toolsをクリック）

![操作GIF：Coding Toolsの設定を開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/40-open-settings.gif)

下部のCoding Toolsから設定を開けます。操作ヘルプの表示はON/OFFに切り替えられます。

#### 26 操作履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：操作履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/41-toggle-operation.gif)

操作履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 27 保存履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：保存履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/42-toggle-save.gif)

保存履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 28 Git push履歴の記録を停止・再開する（設定欄の対象行をクリック / Enter）

![操作GIF：Git push履歴の記録を停止・再開する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/43-toggle-push.gif)

Git push履歴の保存期間でOFFを選ぶと停止し、日数を選ぶと記録を再開します。

#### 29 操作履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：操作履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/45-retention-operation.gif)

操作履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 30 保存履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：保存履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/46-retention-save.gif)

保存履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 31 Git push履歴の保存期間を変える（設定欄の対象行をクリック / Enter）

![操作GIF：Git push履歴の保存期間を変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/47-retention-push.gif)

Git push履歴の記録をOFFにするか、保存期間を1〜360日から選べます。

#### 32 ショートカット一覧を開いて変える（Coding Tools → キーボードショートカット一覧）

![操作GIF：ショートカット一覧を開いて変える](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/48-keyboard-shortcuts.gif)

VS Code標準のショートカット一覧で、Coding Toolsのキーを変更できます。

#### 33 このGIFガイドを開く（Coding Tools → GIFで使い方を確認）

![操作GIF：このGIFガイドを開く](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/49-open-gif-guide.gif)

Coding Toolsの設定欄から、1操作ずつのGIFガイドを開けます。

### CSSの設定

#### 34 クラスの接頭辞ごとに追加先を指定する（VS Code 設定：codingTools.placementRules）

![操作GIF：クラスの接頭辞ごとに追加先を指定する](https://raw.githubusercontent.com/sw428/coding-tools-gifs/2969cfce9a47163f8a1726945287be1b860a9cda/51-placement-rules.gif)

接頭辞に応じたCSS配置設定で、基本ルールか記述済み@mediaの候補を初期選択できます。
<!-- END EXTENSION GIF DETAILS -->
=======
"# Coding-Tools-v0.8.1-" 
>>>>>>> origin/main
