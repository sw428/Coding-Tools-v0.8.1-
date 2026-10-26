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
const isMac = require('node:os').platform() === 'darwin';
const { cssPasteContext } = require('./paste-context');

let historyUI = null;
let jumpSession = null;
let jumpStatusItem = null;
let visualGuidePanel = null;
let slotStatusItems = [];

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
const CONTEXT_SLOT_PREFIX = 'coding-tools.slot-context.';
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

// Copy a class under the caret or an exactly selected class token.
// An ordinary CSS block, class attribute, or arbitrary word is copied normally.
function selectedClassName(editor) {
  if (editor.selections.length !== 1) return null;
  if (editor.selection.isEmpty) {
    const offset = editor.document.offsetAt(editor.selection.active);
    const item = getClasses(editor.document).find(item => item.start <= offset && offset < item.end);
    return item ? item.name : null;
  }
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
  // Outside a class, an empty selection still copies the whole line.
  const text = className !== null ? className : selection.isEmpty
    ? editor.document.lineAt(selection.active.line).text + (editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')
    : editor.document.getText(selection);
  if (text.length === 0) {
    vscode.window.showWarningMessage(`Coding Tools: 保存枠${n}にコピーする文字がありません。`);
    return;
  }
  await context.globalState.update(`${SLOT_PREFIX}${n}`, text);
  await context.globalState.update(`${CLASS_SLOT_PREFIX}${n}`, className !== null);
  await context.globalState.update(`${CONTEXT_SLOT_PREFIX}${n}`, className !== null ? classContextFromEditor(editor, className) : null);
  refreshSlotStatus(context);
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
  const text = document.getText();
  if (cssPasteContext(text, at) === 'plain') return name;
  return text.charAt(at - 1) === '.' ? name : `.${name}`;
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
  if (isClassSlot(context, n) && editor.document.languageId === 'css' &&
      editor.selections.length === 1 && editor.selection.isEmpty &&
      cssPasteContext(editor.document.getText(), editor.document.offsetAt(editor.selection.active)) === 'structure') {
    return routeCssPaste(context, editor, text, context.globalState.get(`${CONTEXT_SLOT_PREFIX}${n}`));
  }
  const success = await loggedEdit(context, editor, `保存枠${n}の貼り付け`, () => insertIntoEditor(editor, text, isClassSlot(context, n)));
  if (!success) vscode.window.showWarningMessage('Coding Tools: 貼り付けできませんでした（読み取り専用など）。');
  else notify(`${n}を貼り付けました`);
}

function slotPreview(value, limit = 22) {
  if (value === undefined) return '空';
  const text = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(text || '（空白）');
  return chars.slice(0, limit).join('') + (chars.length > limit ? '…' : '');
}

function refreshSlotStatus(context) {
  slotStatusItems.forEach((items, i) => {
    const n = i + 1;
    const value = readSlot(context, n);
    // Clipboard text must not turn into status-bar icons.
    const preview = slotPreview(value).replace(/\$\(/g, '＄(');
    const shown = part => settings.enabled(context, settings.slotDisplayKey(n, part));
    const prefix = isMac ? 'Cmd+Alt+' : 'Ctrl+Alt+';
    const copyKey = prefix + 'Shift+' + n;
    const pasteKey = prefix + n;
    const actionText = (label, key) => [shown('actions') ? label : '', shown('shortcuts') ? `(${key})` : ''].filter(Boolean).join(' ');
    const update = (item, text, tooltip, label) => {
      item.text = text;
      item.tooltip = tooltip;
      item.accessibilityInformation = { label };
      if (text) item.show(); else item.hide();
    };
    const help = `コピー枠${n} — ${value === undefined ? '未保存' : slotPreview(value, 200)}`;
    update(items.number, shown('number') ? `(${n})` : '', `${help}\nクリックしてコピー／貼り付け`, `コピー枠${n}の操作を選択`);
    update(items.copy, actionText('コピー', copyKey), `コピー枠${n}へコピー\n初期キー: ${copyKey}（変更した場合は変更後のキー）`, `コピー枠${n}へコピー`);
    update(items.paste, actionText('貼り付け', pasteKey), `${help}\n初期キー: ${pasteKey}（変更した場合は変更後のキー）`, `コピー枠${n}から貼り付け`);
    update(items.content, shown('content') ? `/ ${preview}` : '', `${help}\nクリックしてコピー／貼り付け`, `コピー枠${n}の保存内容: ${slotPreview(value)}`);
  });
}

async function showSlotActions(context, n) {
  const editor = activeEditor();
  if (!editor) return;
  const items = [{ label: '$(copy) この枠にコピー', action: 'copy', description: '選択した文字、またはカーソル上のクラス名' }];
  if (readSlot(context, n) !== undefined) {
    items.push({ label: '$(paste) この枠から貼り付け', action: 'paste', description: slotPreview(readSlot(context, n), 65) });
  }
  const choice = await vscode.window.showQuickPick(items, {
    title: `コピー枠${n}`, placeHolder: 'コピーまたは貼り付けを選択',
  });
  if (!choice || vscode.window.activeTextEditor !== editor || editor.document.isClosed) return;
  if (choice.action === 'copy') await copyToSlot(context, n);
  else if (choice.action === 'paste') await pasteFromSlot(context, n);
}

function moveClass(direction) {
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
  // When a token is selected, moving back must skip that token.
  const current = editor.selection;
  const cursor = editor.document.offsetAt(current.isEmpty ? current.active : current.start);
  const item = nextClass(positions, cursor, direction);
  const begin = editor.document.positionAt(item.start);
  const finish = editor.document.positionAt(item.end);
  const newSelection = new vscode.Selection(begin, finish);
  editor.selection = newSelection;
  editor.revealRange(new vscode.Range(begin, finish), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  notify(`${CSS_LANGUAGES.has(languageId) ? '.' : ''}${item.name} を選択`);
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
  if(editor.document.isClosed || editor.document.version!==version || editor.document.getText()!==original){
    vscode.window.showWarningMessage('Coding Tools: Diff確認中にCSSが変更または閉じられたため、自動配置を中止しました。');
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

async function routeCssPaste(context, editor, name, copiedContext) {
  const selector = '.' + name;
  if (!placement.isSafeSelector(selector)) {
    vscode.window.showWarningMessage('Coding Tools: このクラス名を安全に配置できません。');
    return;
  }
  const text = editor.document.getText();
  const version = editor.document.version;
  const neighbors = copiedContext?.name === name ? copiedContext : {};
  const offset = editor.document.offsetAt(editor.selection.active);
  const plan = placement.candidates(text, selector, { offset, neighbors });
  if (!plan.safe) { vscode.window.showWarningMessage(plan.reason); return; }
  const configured = scopeChoiceFromSettings(editor, selector, plan.tree);
  const preferred = configured || plan.current;
  const items = [];
  for (const rule of plan.allExact) {
    const line = editor.document.positionAt(rule.start).line + 1;
    items.push({ ...option('既存ルールへ移動：' + placement.scopeLabel(rule),
      `L${line} / ${rule.prelude}（CSSは変更しない）`, () => jumpTo(editor, rule)), scope: placement.scopeKey(rule), kind: 'jump' });
  }
  const rootPlan = placement.candidates(text, selector, { offset: 0, neighbors });
  const rootRelated = rootPlan.anchor?.container.type === 'root' &&
    !placement.flatten(plan.tree).some(node => node.brace < rootPlan.anchor.offset && rootPlan.anchor.offset < node.end - 1);
  const rootAnchor = rootRelated ? rootPlan.anchor : {offset:text.length,container:plan.tree.root};
  items.push({ ...option('空ルールを追加：基本ルール',
    rootRelated && rootPlan.reason ? rootPlan.reason : '@mediaなどの外側に追加',
    () => insertAt(context, editor, selector, placement.formatInsert(text, selector, rootAnchor))), scope:'', kind:'insert' });
  for (const at of placement.flatten(plan.tree)) {
    if (at.type !== 'at' || at.end === null || !/^@(media|supports|container|layer)\b/.test(at.prelude)) continue;
    let parent = at.parent;
    let eligible = true;
    while (parent?.type !== 'root') {
      if (!parent || parent.type === 'rule' || !/^@(media|supports|container|layer)\b/.test(parent.prelude)) { eligible = false; break; }
      parent = parent.parent;
    }
    if (!eligible) continue;
    const line = editor.document.positionAt(at.start).line + 1;
    items.push({ ...option('空ルールを追加：' + placement.scopeLabel(at),
      `L${line} / 記述済みの条件内へ追加`,
      () => insertAt(context, editor, selector, placement.formatInsert(text, selector, {offset:at.end-1,container:at}))),
      scope:placement.scopeKey(at), kind:'insert' });
  }
  const preferredScope = placement.scopeKey(preferred);
  const preferredJump = items.findIndex(item => item.kind === 'jump' && item.scope === preferredScope);
  const preferredInsert = items.findIndex(item => item.kind === 'insert' && item.scope === preferredScope);
  const defaultIndex = preferredJump >= 0 ? preferredJump : preferredInsert >= 0 ? preferredInsert : 0;
  const pick = await showConfirmation(vscode, {title:'CSS貼り付け',
    subtitle:`${path.basename(editor.document.uri.fsPath || editor.document.uri.path || 'CSS')}：${selector} の移動先／追加先を選択`, items, defaultIndex});
  if (!pick) return;
  if (editor.document.isClosed || editor.document.version !== version || editor.document.getText() !== text) {
    vscode.window.showWarningMessage('Coding Tools: 候補を選んでいる間にCSSが変更されたため中止しました。');
    return;
  }
  return pick.run();
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
  // Native multi-cursor selections may contain several classes.
  // Search all exact selected class tokens; the primary one wins ties.
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
  slotStatusItems = [];
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
  }, () => refreshSlotStatus(context));
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
    const items = {};
    for (const [index, part] of ['number', 'copy', 'paste', 'content'].entries()) {
      const id = part === 'number' ? `codingTools.slot${n}` : `codingTools.slot${n}.${part}`;
      const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Right, 99 - (n - 1) * 4 - index);
      const labels = {number:'番号',copy:'コピー',paste:'貼り付け',content:'保存内容'};
      item.name = `Coding Tools コピー枠${n} ${labels[part]}`;
      item.command = part === 'copy' || part === 'paste' ? `codingTools.${part}${n}` : `codingTools.showSlot${n}`;
      items[part] = item;
      context.subscriptions.push(item);
    }
    slotStatusItems.push(items);
    context.subscriptions.push(
      vscode.commands.registerCommand(`codingTools.showSlot${n}`, () => showSlotActions(context, n)),
      vscode.commands.registerCommand(`codingTools.copy${n}`, () => copyToSlot(context, n)),
      vscode.commands.registerCommand(`codingTools.paste${n}`, () => pasteFromSlot(context, n)),
    );
  }
  refreshSlotStatus(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('codingTools.jumpToCss', () => crossJump('css')),
    vscode.commands.registerCommand('codingTools.jumpToHtml', () => crossJump('html')),
    vscode.commands.registerCommand('codingTools.cycleNextJump', () => cycleJump(1)),
    vscode.commands.registerCommand('codingTools.cyclePreviousJump', () => cycleJump(-1)),
    vscode.commands.registerCommand('codingTools.endJumpCycle', clearJumpSession),
    vscode.commands.registerCommand('codingTools.nextClass', () => moveClass(1)),
    vscode.commands.registerCommand('codingTools.previousClass', () => moveClass(-1)),
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
