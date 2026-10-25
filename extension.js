'use strict';

const vscode = require('vscode');
const { findCssClasses, nextClass, findHtmlClasses } = require('./selectors');
const placement = require('./placement');
const safety = require('./safe-placement');
const safePreview = require('./safe-preview');
const path = require('node:path');
const { showConfirmation } = require('./confirmation');
const history = require('./history');
const { makeHistoryUI } = require('./history-view');
const { startSaveHistory } = require('./save-history');
const { registerGitPushHistory } = require('./git-push-history');
const settings = require('./settings');
const jump = require('./cross-navigation');

let historyUI = null;
let activeContext = null;
let jumpSession = null;
let jumpStatusItem = null;
let visualGuidePanel = null;

function clearJumpSession() {
  jumpSession = null;
  jumpStatusItem?.hide();
  // Custom context key affects Tab ONLY during an active candidate cycle.
  void vscode.commands.executeCommand('setContext','codingTools.jumpCycle',false);
}

// Jump is read-only and navigates directly in the text editor (no QuickPick).
async function displayJumpCandidate(index) {
  const session = jumpSession;
  if (!session || !session.candidates.length) return;
  session.index = (index + session.candidates.length) % session.candidates.length;
  const item = session.candidates[session.index];
  session.changing = true;
  try {
    const doc = await vscode.workspace.openTextDocument(item.uri);
    const targetEditor = await vscode.window.showTextDocument(doc,{preview:false});
    const start = doc.positionAt(item.start);
    const end = doc.positionAt(item.end);
    session.expectedUri = doc.uri.toString();
    session.expectedStart = item.start;
    session.expectedEnd = item.end;
    targetEditor.selection = new vscode.Selection(start,end);
    targetEditor.revealRange(new vscode.Range(start,end),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    const filename = vscode.workspace.asRelativePath(item.uri,false);
    const line = start.line + 1;
    if (session.candidates.length > 1) {
      jumpStatusItem.text = `$(arrow-swap) Coding Tools: ${item.name} (${session.index+1}/${session.candidates.length})`;
      jumpStatusItem.tooltip = `${filename}:${line} | Tab 次へ / Shift+Tab 前へ / Esc 終了`;
      jumpStatusItem.show();
      await vscode.commands.executeCommand('setContext','codingTools.jumpCycle',true);
      notify(`${filename}:${line} (${session.index+1}/${session.candidates.length})　Tab: 次 / Shift+Tab: 前 / Esc: 終了`);
    } else {
      clearJumpSession();
    }
  } catch (error) {
    clearJumpSession();
    vscode.window.showWarningMessage(`Coding Tools: ジャンプできませんでした: ${error.message}`);
  } finally {
    session.changing = false;
  }
}

function cycleJump(delta) {
  if (!jumpSession) return;
  return displayJumpCandidate(jumpSession.index + delta);
}

function preserveJumpOnSelectionChange(event) {
  const session=jumpSession;
  if(!session || session.changing) return;
  if(event.textEditor.document.uri.toString()!==session.expectedUri) return;
  const selection=event.selections[0];
  if(!selection || event.selections.length!==1 ||
    event.textEditor.document.offsetAt(selection.start)!==session.expectedStart ||
    event.textEditor.document.offsetAt(selection.end)!==session.expectedEnd) clearJumpSession();
}
const SLOT_COUNT = 2;
const SLOT_PREFIX = 'coding-tools.slot.';
const CLASS_SLOT_PREFIX = 'coding-tools.class-slot.';
const LAST_CLASS_KEY = 'coding-tools.lastClassClipboard';
const LAST_CONTEXT_KEY = 'coding-tools.lastClassContext';
const CSS_LANGUAGES = new Set(['css', 'scss', 'less']);
const HTML_LANGUAGES = new Set(['html', 'vue', 'php', 'javascriptreact', 'typescriptreact']);

function notify(message) {
  vscode.window.setStatusBarMessage(`Coding Tools: ${message}`, 2500);
}

// History is separate from the VS Code undo stack; edits remain native editor
// operations, so Ctrl/Cmd+Z can undo them immediately after focus returns.
async function loggedEdit(context, editor, action, operation) {
  const before = editor.document.getText();
  const result = await operation();
  const after = editor.document.getText();
  if (before !== after && settings.enabled(context,'operation')) {
    try {
      await history.record(context, {
        before, after, action, sourceUri: editor.document.uri,
        targetLine: editor.selection.active.line,
      });
      await history.prune(context);
      historyUI?.refresh();
    } catch (error) {
      vscode.window.showWarningMessage(`Coding Tools: 貼り付けは完了しましたが差分履歴を保存できません: ${error.message}`);
    }
  }
  return result;
}

async function nativePaste(context, editor, action='通常の貼り付け') {
  return loggedEdit(context, editor, action, () =>
    vscode.commands.executeCommand('editor.action.clipboardPasteAction'));
}

// Enter in the arrow-key confirmation screen chooses a plan, not yet the edit.
// The final modal makes the pending operation explicit before changing CSS.
async function confirmExecution(choice) {
  if (!choice) return;
  if(activeContext && !settings.enabled(activeContext,'confirm')) return choice.run();
  const response = await vscode.window.showInformationMessage(
    `この操作を実行しますか？：${choice.label}`,
    { modal: true, detail: `${choice.description || ''}\n実行後の編集は、エディタで Ctrl+Z（Macは ⌘Z）で取り消せます。` },
    '実行する'
  );
  if (response === '実行する') return choice.run();
}

function activeEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) vscode.window.showWarningMessage('Coding Tools: テキストエディタを開いてください。');
  return editor;
}

function getClasses(document) {
  if (CSS_LANGUAGES.has(document.languageId)) return findCssClasses(document.getText());
  if (HTML_LANGUAGES.has(document.languageId)) return findHtmlClasses(document.getText());
  return [];
}

// Returns a class only when the current selection is *exactly one class token*.
// An ordinary CSS block, class attribute, or arbitrary word is copied normally.
function selectedClassName(editor) {
  if (editor.selections.length !== 1 || editor.selection.isEmpty) return null;
  const document = editor.document;
  const { anchor, active } = editor.selection;
  const a = document.offsetAt(anchor);
  const b = document.offsetAt(active);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const css = CSS_LANGUAGES.has(document.languageId);
  const match = getClasses(document).find((item) =>
    (item.start === start && item.end === end) ||
    (css && item.start + 1 === start && item.end === end)
  );
  return match ? match.name : null;
}

// When a class name was copied using this extension, remember that the plain
// clipboard text represents a class. Searching anywhere still sees plain text;
// only our CSS paste command adds the selector dot.
function classContextFromEditor(editor, name) {
  if (!HTML_LANGUAGES.has(editor.document.languageId)) return null;
  const names=findHtmlClasses(editor.document.getText());
  const cursor=editor.document.offsetAt(editor.selection.active);
  const current=names.findIndex(item=>item.name===name && item.start<=cursor+name.length && item.end>=cursor);
  if (current<0) return null;
  const prefix=name.includes('__')?name.split('__')[0]+'__':null;
  if (!prefix) return null;
  let before=null, after=null;
  for(let i=current-1;i>=0;i--) if(names[i].name.startsWith(prefix)) { before=names[i].name; break; }
  for(let i=current+1;i<names.length;i++) if(names[i].name.startsWith(prefix)) { after=names[i].name; break; }
  return {name,before,after,source:editor.document.uri?.toString()};
}

async function copyPlainClass(context, className, editor) {
  await vscode.env.clipboard.writeText(className);
  await context.globalState.update(LAST_CLASS_KEY, className);
  await context.globalState.update(LAST_CONTEXT_KEY, editor ? classContextFromEditor(editor,className) : null);
}

function readSlot(context, n) {
  const value = context.globalState.get(`${SLOT_PREFIX}${n}`);
  return typeof value === 'string' ? value : undefined;
}

function isClassSlot(context, n) {
  return context.globalState.get(`${CLASS_SLOT_PREFIX}${n}`) === true;
}

async function copyToSlot(context, n) {
  const editor = activeEditor();
  if (!editor) return;
  const selection = editor.selection;
  const className = selectedClassName(editor);
  // No selection: preserve the previous behavior of copying the whole line.
  const text = className !== null ? className : selection.isEmpty
    ? editor.document.lineAt(selection.active.line).text + (editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')
    : editor.document.getText(selection);
  if (text.length === 0) {
    vscode.window.showWarningMessage(`Coding Tools: 保存枠${n}にコピーする文字がありません。`);
    return;
  }
  await context.globalState.update(`${SLOT_PREFIX}${n}`, text);
  await context.globalState.update(`${CLASS_SLOT_PREFIX}${n}`, className !== null);
  if (className !== null) await copyPlainClass(context, className, editor);
  else {
    await vscode.env.clipboard.writeText(text);
    await context.globalState.update(LAST_CLASS_KEY, null);
    await context.globalState.update(LAST_CONTEXT_KEY, null);
  }
  notify(`${n}にコピーしました${className !== null ? '（クラス名）' : selection.isEmpty ? '（現在行）' : ''}`);
}

// Avoid a double dot when pasting after an existing '.' (e.g. typing the
// class name into an already prepared CSS selector). For replacement ranges,
// only the text just before the range is examined.
function classTextForSelection(document, selection, name) {
  const at = Math.min(document.offsetAt(selection.anchor), document.offsetAt(selection.active));
  const before = document.getText().charAt(at - 1);
  return before === '.' ? name : `.${name}`;
}

async function insertIntoEditor(editor, text, isClass) {
  const css = CSS_LANGUAGES.has(editor.document.languageId);
  return editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      const inserted = isClass && css
        ? classTextForSelection(editor.document, selection, text)
        : text;
      editBuilder.replace(selection, inserted);
    }
  }, { undoStopBefore: true, undoStopAfter: true });
}

async function pasteFromSlot(context, n) {
  const editor = activeEditor();
  if (!editor) return;
  const text = readSlot(context, n);
  if (text === undefined) {
    vscode.window.showInformationMessage(`Coding Tools: 保存枠${n}は空です。先に「コピー ${n}」を実行してください。`);
    return;
  }
  const success = await loggedEdit(context, editor, `保存枠${n}の貼り付け`, () => insertIntoEditor(editor, text, isClassSlot(context, n)));
  if (!success) vscode.window.showWarningMessage('Coding Tools: 貼り付けできませんでした（読み取り専用など）。');
  else notify(`${n}を貼り付けました`);
}

async function pickSlot(context, action) {
  const items = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const n = i + 1;
    const value = readSlot(context, n);
    const preview = value === undefined ? '未保存' : value.replace(/[\r\n\t]+/g, ' ↵ ').slice(0, 65);
    return { label: `${n}：${preview}`, description: value === undefined ? '空' : `${value.length}文字${isClassSlot(context,n) ? '・クラス' : ''}`, n };
  });
  const choice = await vscode.window.showQuickPick(items, {
    placeHolder: action === 'copy' ? 'コピー先の番号を選択（1〜2）' : '貼り付ける番号を選択（1〜2）',
  });
  if (!choice) return;
  if (action === 'copy') await copyToSlot(context, choice.n);
  else await pasteFromSlot(context, choice.n);
}

function moveClass(direction, expand = false) {
  clearJumpSession();
  const editor = activeEditor();
  if (!editor) return;
  const languageId = editor.document.languageId;
  if (!CSS_LANGUAGES.has(languageId) && !HTML_LANGUAGES.has(languageId)) {
    vscode.window.showInformationMessage('Coding Tools: HTML / CSS / SCSS / Lessなどで使ってください。');
    return;
  }
  const positions = getClasses(editor.document);
  if (!positions.length) {
    vscode.window.showInformationMessage('Coding Tools: 移動できるクラスが見つかりません。');
    return;
  }
  // When a token is selected, moving back must skip that token instead of
  // selecting it again. For multi-selection, move from the most recent token.
  const current = expand && editor.selections.length > 1
    ? editor.selections[editor.selections.length - 1]
    : editor.selection;
  const cursor = editor.document.offsetAt(current.isEmpty ? current.active : current.start);
  const item = nextClass(positions, cursor, direction);
  const begin = editor.document.positionAt(item.start);
  const finish = editor.document.positionAt(item.end);
  const newSelection = new vscode.Selection(begin, finish);
  if (expand) {
    const exists = editor.selections.some(sel =>
      editor.document.offsetAt(sel.start) === item.start && editor.document.offsetAt(sel.end) === item.end);
    if (!exists) editor.selections = [...editor.selections, newSelection];
    else notify(`「${item.name}」は既に選択されています`);
  } else {
    editor.selection = newSelection;
  }
  editor.revealRange(new vscode.Range(begin, finish), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  notify(`${CSS_LANGUAGES.has(languageId) ? '.' : ''}${item.name} を${expand ? '追加' : ''}選択`);
}

async function copyClassName(context) {
  const editor = activeEditor();
  if (!editor) return;
  const doc = editor.document;
  const offset = doc.offsetAt(editor.selection.active);
  const css = CSS_LANGUAGES.has(doc.languageId);
  const match = getClasses(doc).find((item) => item.start <= offset && (css ? offset <= item.end : offset < item.end)) || getClasses(doc).find(item => item.start === doc.offsetAt(editor.selection.start));
  if (!match) {
    vscode.window.showInformationMessage('Coding Tools: CSSの .class またはHTMLの class="..." 内にカーソルを置いてください。');
    return;
  }
  await copyPlainClass(context, match.name, editor);
  notify(`クラス名「${match.name}」をコピー（検索はドットなし・CSS貼り付けはドット付き）`);
}

// Optional command (unbound by default). Never intercept native Ctrl/Cmd+C.
// Non-class selections delegate to the built-in copy command.
async function smartCopy(context) {
  const editor = activeEditor();
  if (!editor) return;
  const name = selectedClassName(editor);
  if (name === null) {
    await context.globalState.update(LAST_CLASS_KEY, null);
    await context.globalState.update(LAST_CONTEXT_KEY, null);
    return vscode.commands.executeCommand('editor.action.clipboardCopyAction');
  }
  await copyPlainClass(context, name, editor);
  notify(`「${name}」をコピー（ドットなし）`);
}

// CSS editing is scoped by the location of the cursor. Never silently rewrite
// existing rules or move declarations across @media / @layer boundaries.
function scopeChoiceFromSettings(editor, selector, tree) {
  const rules=vscode.workspace.getConfiguration('codingTools',editor.document.uri).get('placementRules',{});
  const name=placement.baseClass(selector)||'';
  const prefix=Object.keys(rules).filter(key=>name.startsWith(key)).sort((a,b)=>b.length-a.length)[0];
  const configured=prefix ? rules[prefix] : null;
  if (!configured) return null;
  if(configured==='base') return tree.root;
  const match=placement.atRules(tree,'media').filter(n=>n.prelude.trim()===configured.trim());
  return match.length===1 ? match[0] : null;
}

function cssCursorInlinePaste(editor) {
  const text=editor.document.getText();
  const offset=editor.document.offsetAt(editor.selection.active);
  const fragment=text.slice(Math.max(0,text.lastIndexOf('\n',offset-1)+1),offset);
  // If a selector is being typed, inserting a whole new block elsewhere would
  // be surprising. Inline smart paste maintains the v0.3 dot behavior.
  if (fragment.trim() && !fragment.includes('}') && !fragment.includes('{')) return true;
  return cssCursorInsideRule(editor);
}

function cssCursorInsideRule(editor) {
  const offset=editor.document.offsetAt(editor.selection.active);
  const tree=placement.parseCss(editor.document.getText());
  if(tree.invalid)return false;
  return placement.rules(tree).some(n=>n.brace<offset && offset<n.end-1);
}

async function jumpTo(editor, rule) {
  const loc=editor.document.positionAt(rule.start);
  const select=new vscode.Selection(loc,loc);
  if(vscode.window.activeTextEditor?.document.uri?.toString()!==editor.document.uri.toString())
    editor=await vscode.window.showTextDocument(editor.document,{preview:false});
  editor.selection=select;
  editor.revealRange(new vscode.Range(loc,loc),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  notify(`既存の ${rule.prelude} へ移動しました（変更なし）`);
}

async function insertAt(context, editor, selector, insertion) {
  // CSS safe mode: do not rewrite, move, or delete existing rules. No edit
  // takes place until an independent parser validates before/after states.
  const original=editor.document.getText();
  const version=editor.document.version;
  const check=safety.preflight(original,selector,insertion,editor.document.languageId);
  if(!check.ok){
    vscode.window.showWarningMessage(`Coding Tools: 自動配置を中止しました。${check.reason}`);
    return false;
  }
  try {
    await safePreview.show(vscode,original,check.after,selector);
  } catch(error) {
    vscode.window.showWarningMessage(`Coding Tools: Diffプレビューを開けないため中止しました: ${error.message}`);
    return false;
  }
  if(settings.enabled(context,'confirm')){
    const response=await vscode.window.showInformationMessage(
      `CSSの変更前後を確認してください：${selector}`,
      '差分を確認して適用', 'キャンセル');
    if(response!=='差分を確認して適用')return false;
  }
  // Opening the preview may have taken time; abort instead of inserting at a
  // stale position if any editor/extension changed the file in the meantime.
  if(editor.document.version!==version || editor.document.getText()!==original){
    vscode.window.showWarningMessage('Coding Tools: Diff確認中にCSSが変更されたため、自動配置を中止しました。');
    return false;
  }
  const change=new vscode.WorkspaceEdit();
  change.insert(editor.document.uri,editor.document.positionAt(insertion.offset),insertion.text);
  const ok=await loggedEdit(context,editor,`CSSへ安全追加：${selector}`,()=>vscode.workspace.applyEdit(change));
  if(ok){
    const shown=await vscode.window.showTextDocument(editor.document,{preview:false});
    const start=shown.document.positionAt(insertion.offset+insertion.text.indexOf(selector));
    shown.selection=new vscode.Selection(start,start);
    shown.revealRange(new vscode.Range(start,start),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    notify(`空の「${selector}」を安全追加しました（Ctrl+Zで取消可）`);
  } else vscode.window.showWarningMessage('Coding Tools: 編集できませんでした。読み取り専用や競合を確認してください。');
  return ok;
}

function option(label,description,run,detail) {return {label:label.replace(/^\$\([\w-]+\)\s*/, ''),description,detail,run};}

async function chooseStylesheet(sourceEditor) {
  if(CSS_LANGUAGES.has(sourceEditor.document.languageId))return sourceEditor;
  if(!vscode.workspace?.findFiles) { vscode.window.showInformationMessage('Coding Tools: CSSファイルを開いてください。');return null; }
  const uris=await vscode.workspace.findFiles('**/*.{css,scss,less}','**/{node_modules,dist,build,.git}/**',100);
  if(!uris.length) {vscode.window.showInformationMessage('Coding Tools: ワークスペースにCSSファイルがありません。');return null;}
  const configured=vscode.workspace.getConfiguration('codingTools',sourceEditor.document.uri).get('preferredStylesheet','');
  const selected=configured?uris.filter(uri=>uri.path.endsWith('/'+configured.replaceAll('\\','/'))):[];
  let uri=selected.length===1?selected[0]:uris.length===1?uris[0]:null;
  if(!uri) {
    const picked=await vscode.window.showQuickPick(uris.map(u=>({label:path.basename(u.path),description:u.path,uri:u})),{placeHolder:'CSSを書き込むファイルを選択（自動では決められません）'});
    if(!picked)return null; uri=picked.uri;
  }
  const doc=await vscode.workspace.openTextDocument(uri);
  return vscode.window.showTextDocument(doc,{preview:false});
}

// The explicit route command works even while focused in an HTML editor.
// It offers normal paste and safe routing as separate actions.
async function routeCss(context,{showMenu=false,forceRoute=false,fallbackPlain=false,sourceEditor=null,sourceText=null,knownClass=null}={}) {
  const origin=sourceEditor||activeEditor();if(!origin)return;
  const copied=sourceText==null?await vscode.env.clipboard.readText():sourceText;
  const saved=knownClass==null?context.globalState.get(LAST_CLASS_KEY):knownClass;
  const isKnown=typeof saved==='string' && copied===saved;
  const selector=placement.selectorFromClipboard(copied,isKnown?saved:null);
  if(!selector) {
    // Never interpret HTML text, font settings, a multiline block, or arbitrary
    // clipboard content as a selector.
    if(showMenu || fallbackPlain) return nativePaste(context, origin, '通常の貼り付け');
    vscode.window.showInformationMessage('CSSセレクタではありません。通常の文字列には Ctrl+V を使ってください。');
    return;
  }
  if(!showMenu && !forceRoute && CSS_LANGUAGES.has(origin.document.languageId) && (cssCursorInlinePaste(origin)||origin.selection.isEmpty===false)) {
    // Inline replacement is intentionally distinct from structural insertion.
    return loggedEdit(context, origin, 'CSSクラス貼り付け', () => insertIntoEditor(origin,copied,isKnown));
  }
  // With the options command, let the user choose regular paste before editing another file.
  if(showMenu) {
    const pick=await showConfirmation(vscode,{title:'貼り付け方法',subtitle:`${selector}：処理を選んで確定`,items:[
      {label:'通常の貼り付け',description:'HTMLの文字・フォント指定・CSSの値など（現在位置）',kind:'plain'},
      {label:'CSSへ整理して追加 / 既存へ移動',description:`${selector} の関連ルール・メディアクエリを調べる`,kind:'css'}
    ],defaultIndex:0});
    if(!pick)return;
    if(pick.kind==='plain')return confirmExecution({...pick,run:()=>nativePaste(context,origin,'通常の貼り付け')});
  }
  const editor=await chooseStylesheet(origin);if(!editor)return;
  if(!placement.isSafeSelector(selector)){vscode.window.showWarningMessage('このセレクタは自動配置に対応していません。');return;}
  const text=editor.document.getText();
  const htmlCtx=context.globalState.get(LAST_CONTEXT_KEY);
  const neighbors=isKnown && htmlCtx?.name===saved ? htmlCtx : {};
  let offset=editor.document.offsetAt(editor.selection.active);
  let plan=placement.candidates(text,selector,{offset,neighbors});
  if(!plan.safe){vscode.window.showWarningMessage(plan.reason);return;}
  const configured=scopeChoiceFromSettings(editor,selector,plan.tree);
  if(configured){
    const where=configured.type==='root'?0:configured.brace+1;
    plan=placement.candidates(text,selector,{offset:where,neighbors});
  }
  // When a rule already exists, the user may intend a separate @media override.
  // Therefore present explicit choices rather than silently jumping to the base rule.
  const base=placement.baseClass(selector)||'';
  const family=base.includes('__') ? base.split('__')[0] : base.split('--')[0];
  const sameFamilyElsewhere=!!family && placement.rules(plan.tree).some(r=>
    placement.scopeKey(r)!==placement.scopeKey(plan.current) &&
    [...r.prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].some(m=>m[1]===family || m[1].startsWith(family+'__') || m[1].startsWith(family+'--')));
  if(plan.preferred==='insert' && plan.allExact.length===0 && !sameFamilyElsewhere) {
    return insertAt(context,editor,selector,placement.formatInsert(text,selector,plan.anchor));
  }
  const items=[];
  // Existing matches always before newly-created variants.
  for(const rule of plan.allExact){
    const line=editor.document.positionAt(rule.start).line+1;
    items.push(option('$(go-to-file) 既存へ移動：'+placement.scopeLabel(rule),`L${line} / ${rule.prelude} （CSSは変更しない）`,()=>jumpTo(editor,rule),'同名のルールを新しく作らず、既存の場所へ移動'));
  }
  if(plan.anchor && plan.related.length>0 && plan.allExact.length===0) {
    const insert=placement.formatInsert(text,selector,plan.anchor);
    items.push(option('$(add) 推奨位置へ追加：'+placement.scopeLabel(plan.current),plan.reason||'関連するセレクタの近く',()=>insertAt(context,editor,selector,insert),'周囲のルールは移動せず、新規ルールだけ挿入'));
  }
  // Base scope at the end is always available as a fallback, not an automatic decision.
  items.push(option('$(add) 基本ルールの末尾に追加','@media / @layer の外側（新しいルール）',()=>insertAt(context,editor,selector,placement.formatInsert(text,selector,{offset:text.length,container:plan.tree.root}))));
  items.push(option('$(filter) 既存の条件内に追加 / 新しい @media を作成',
    '@media・@supports・@container・@layer を場所と理由で選択',async()=>{
      const scoped=placement.flatten(plan.tree).filter(n=>n.type==='at' && n.end!==null && /^@(media|supports|container|layer)\b/.test(n.prelude));
      const inner=[];
      for(const at of scoped){
        if(at.parent?.type==='rule')continue;
        const line=editor.document.positionAt(at.start).line+1;
        inner.push(option('$(symbol-color) '+placement.scopeLabel(at),
          `L${line} / 条件内に新規追加（既存の条件を変更・統合しない）`,
          ()=>insertAt(context,editor,selector,placement.formatInsert(text,selector,{offset:at.end-1,container:at}))));
      }
      inner.push(option('$(add) 新規 @media を作成',
        '@media (min-width: 768px) などを入力して追加',async()=>{
          const value=await vscode.window.showInputBox({
            prompt:'作成するメディアクエリ（@media ...）',value:'@media (min-width: 768px)',
            validateInput:v=>/^@media\s+[^{};\r\n]+$/.test(v.trim())?null:'@media (条件) を入力してください'});
          if(!value)return;
          const result=placement.wrapNewMedia(text,selector,value);
          if(result)await insertAt(context,editor,selector,result);
        }));
      const choice=await showConfirmation(vscode,{
        title:'条件付きCSSの追加先',subtitle:`${selector} の配置先を選択`,items:inner,defaultIndex:0});
      if(choice)await choice.run();
    }));
  // Extra selectors are genuinely useful; allow precise custom selectors, including +, ~, nth-child.
  if(/^\.[\w-]+$/.test(selector))items.push(option('$(symbol-method) 関係・位置・状態のセレクタを指定','例：'+selector+' + '+selector+'、'+selector+':nth-child(3)',async()=>{
    const custom=await vscode.window.showInputBox({prompt:'追加するセレクタ（+、~、:nth-child、:hover など）',value:selector+' + '+selector,
      validateInput:v=>placement.isSafeSelector(v)?null:'CSSセレクタを1行で指定してください'});
    if(!custom)return;
    return routeCss(context,{showMenu:false,forceRoute:true,sourceEditor:editor,sourceText:custom,knownClass:''});
  }));
  items.push(option('$(paste) 通常の貼り付け（カーソル位置）','CSSの挿入位置を変更せず、従来の貼り付けを行う',()=>nativePaste(context,editor,'通常の貼り付け')));
  const pick=await showConfirmation(vscode,{title:'CSSの追加先を確認',subtitle:`${selector} の前後関係と条件から候補を表示`,items,defaultIndex:0});
  if(pick) await pick.run();
}

// Optional smart-paste command (unbound by default). Native Ctrl/Cmd+V is untouched.
async function smartPaste(context) {
  const editor=activeEditor();if(!editor)return;
  const copied=context.globalState.get(LAST_CLASS_KEY);
  const clipboard=await vscode.env.clipboard.readText();
  if(typeof copied!=='string'||!copied||copied!==clipboard)
    return nativePaste(context, editor);
  return routeCss(context,{sourceEditor:editor,sourceText:clipboard,knownClass:copied,fallbackPlain:true});
}

// Jump directly from a selected class (or class under caret) into the editor.
// Multiple definitions are ordered by adjacent class names and file proximity;
// never open a confirmation picker. Tab / Shift+Tab cycles through the matches.
async function crossJump(destination) {
  clearJumpSession();
  const editor = activeEditor();
  if (!editor) return;
  const srcDoc = editor.document;
  const isHtml = HTML_LANGUAGES.has(srcDoc.languageId);
  const isCss = CSS_LANGUAGES.has(srcDoc.languageId);
  if ((destination === 'css' && !isHtml) || (destination === 'html' && !isCss)) {
    vscode.window.showInformationMessage(destination === 'css'
      ? 'Coding Tools: HTMLでクラス名を選択してから実行してください。'
      : 'Coding Tools: CSSでクラス名を選択してから実行してください。');
    return;
  }
  const text = srcDoc.getText();
  // The existing extend-class commands may create several selections. Search
  // all exact selected class tokens; the primary one wins ties in ranking.
  const selected = [];
  for (const selection of editor.selections) {
    const start = srcDoc.offsetAt(selection.start);
    const end = srcDoc.offsetAt(selection.end);
    const found = jump.classAt(text, srcDoc.languageId, start, end);
    if (found && !selected.some(item=>item.name===found.name)) selected.push(found);
  }
  if (!selected.length) {
    vscode.window.showInformationMessage('Coding Tools: クラス名全体を選択するか、クラス名の上にカーソルを置いてください。');
    return;
  }
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showInformationMessage('Coding Tools: HTMLとCSSが入ったフォルダーをVS Codeで開いてください。');
    return;
  }
  const glob = destination === 'css' ? '**/*.{css,scss,less}' : '**/*.{html,htm,php,vue,jsx,tsx}';
  const exclude = '**/{node_modules,.git,dist,build,coverage,.next,vendor,out}/**';
  const MAX_FILES = 500;
  const uris = await vscode.workspace.findFiles(glob,exclude,MAX_FILES + 1);
  if (uris.length > MAX_FILES) {
    vscode.window.showWarningMessage('Coding Tools: 対象ファイルが500件を超えています。対象フォルダーを絞ってください。');
    return;
  }
  const matches = [];
  for (let i=0;i<uris.length;i+=25) {
    const batch=await Promise.all(uris.slice(i,i+25).map(async uri=>{
      try {
        const opened=vscode.workspace.textDocuments.find(d=>d.uri.toString()===uri.toString());
        const content=opened ? opened.getText() : new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
        const results=[];
        for(let sourceIndex=0;sourceIndex<selected.length;sourceIndex++) {
          const source=selected[sourceIndex];
          const found=jump.findTargets(content,uri.path,destination,source.name);
          for (const item of found) results.push({...item,uri,content,
            filename:uri.fsPath||uri.path,languageId:destination==='css'?'css':'html',
            destination,sourceIndex});
        }
        return results;
      } catch(_) {return [];}
    }));
    for(const group of batch) matches.push(...group);
  }
  if(!matches.length) {
    vscode.window.setStatusBarMessage(`Coding Tools: ${selected.map(x=>x.name).join(', ')} のジャンプ先なし`,4000);
    return;
  }
  const source={filename:srcDoc.uri.fsPath||srcDoc.uri.path||'',text,
    languageId:srcDoc.languageId,start:selected[0].start};
  const ranked=jump.rankCandidates(source,matches).sort((a,b)=>
    a.sourceIndex-b.sourceIndex || b.rankScore-a.rankScore ||
    a.filename.localeCompare(b.filename) || a.start-b.start);
  jumpSession={candidates:ranked,index:0,changing:false,expectedUri:null,
    expectedStart:0,expectedEnd:0};
  await displayJumpCandidate(0);
}

function activate(context) {
  activeContext=context;
  safePreview.register(vscode,context);
  jumpStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,80);
  jumpStatusItem.command='codingTools.cycleNextJump';
  context.subscriptions.push(jumpStatusItem,
    vscode.window.onDidChangeTextEditorSelection(preserveJumpOnSelectionChange),
    vscode.window.onDidChangeActiveTextEditor(editor=>{
      if(jumpSession && !jumpSession.changing && editor?.document.uri.toString()!==jumpSession.expectedUri)
        clearJumpSession();
    }),
    vscode.workspace.onDidChangeTextDocument(event=>{
      if(jumpSession && event.document.uri.toString()===jumpSession.expectedUri && event.contentChanges.length)
        clearJumpSession();
    }));
  void vscode.commands.executeCommand('setContext','codingTools.jumpCycle',false);
  settings.registerSettingsUI(vscode,context,async()=>{
    await history.prune(context);
    historyUI?.refresh();
  });
  historyUI = makeHistoryUI(vscode, context);
  startSaveHistory(vscode, context, () => historyUI?.refresh());
  registerGitPushHistory(vscode, context, () => historyUI?.refresh());
  history.prune(context).then(() => historyUI.refresh()).catch(error =>
    vscode.window.showWarningMessage(`Coding Tools: 古い履歴の整理に失敗しました: ${error.message}`));
  const cleanupTimer = setInterval(() => {
    history.prune(context).then(() => historyUI?.refresh()).catch(() => {});
  }, 24 * 60 * 60 * 1000);
  cleanupTimer.unref?.();
  context.subscriptions.push({dispose:()=>clearInterval(cleanupTimer)});
  for (let n = 1; n <= SLOT_COUNT; n++) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`codingTools.copy${n}`, () => copyToSlot(context, n)),
      vscode.commands.registerCommand(`codingTools.paste${n}`, () => pasteFromSlot(context, n)),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('codingTools.jumpToCss', () => crossJump('css')),
    vscode.commands.registerCommand('codingTools.jumpToHtml', () => crossJump('html')),
    vscode.commands.registerCommand('codingTools.cycleNextJump', () => cycleJump(1)),
    vscode.commands.registerCommand('codingTools.cyclePreviousJump', () => cycleJump(-1)),
    vscode.commands.registerCommand('codingTools.endJumpCycle', clearJumpSession),
    vscode.commands.registerCommand('codingTools.chooseCopySlot', () => pickSlot(context, 'copy')),
    vscode.commands.registerCommand('codingTools.choosePasteSlot', () => pickSlot(context, 'paste')),
    vscode.commands.registerCommand('codingTools.nextClass', () => moveClass(1)),
    vscode.commands.registerCommand('codingTools.previousClass', () => moveClass(-1)),
    vscode.commands.registerCommand('codingTools.extendNextClass', () => moveClass(1, true)),
    vscode.commands.registerCommand('codingTools.extendPreviousClass', () => moveClass(-1, true)),
    vscode.commands.registerCommand('codingTools.copyClassName', () => copyClassName(context)),
    vscode.commands.registerCommand('codingTools.smartCopy', () => smartCopy(context)),
    vscode.commands.registerCommand('codingTools.smartPaste', () => smartPaste(context)),
    vscode.commands.registerCommand('codingTools.placeCss', () => routeCss(context,{forceRoute:true})),
    vscode.commands.registerCommand('codingTools.pasteOptions', () => routeCss(context,{showMenu:true})),
    vscode.commands.registerCommand('codingTools.openVisualGuide', async()=>{
      if(visualGuidePanel){visualGuidePanel.reveal(vscode.ViewColumn.One);return;}
      const fs=require('node:fs/promises');
      const root=path.join(context.extensionPath,'docs');
      const panel=vscode.window.createWebviewPanel('codingToolsVisualGuide','Coding Tools｜動く使い方ガイド',vscode.ViewColumn.One,{
        enableScripts:false,
        retainContextWhenHidden:true,
        localResourceRoots:[vscode.Uri.file(root)]
      });
      visualGuidePanel=panel;
      panel.onDidDispose(()=>{visualGuidePanel=null;});
      try {
        const html=await fs.readFile(path.join(root,'visual-guide.html'),'utf8');
        const mapped=html.replace(/\b(src|srcset|href)="(media\/gif\/[0-9]{2}-[a-z0-9-]+\.(?:gif|png))"/g,(_full,attr,file)=>
          `${attr}="${panel.webview.asWebviewUri(vscode.Uri.file(path.join(root,file)))}"`);
        panel.webview.html=mapped.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src 'unsafe-inline';">`);
      } catch(error){
        panel.dispose();
        vscode.window.showWarningMessage(`図解ガイドを開けません: ${error.message}`);
      }
    }),
  );
}

function deactivate() {}
module.exports = { activate, deactivate };
