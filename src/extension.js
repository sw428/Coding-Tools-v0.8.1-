'use strict';

const vscode = require('vscode');
const { findCssClasses, findCssIds, nextClass, findHtmlClasses, findHtmlIds } = require('./selectors');
const placement = require('./placement');
const safety = require('./safe-placement');
const path = require('node:path');
const { showConfirmation } = require('./confirmation');
const history = require('./history');
const { makeHistoryUI } = require('./history-view');
const { startSaveHistory } = require('./save-history');
const { registerGitPushHistory } = require('./git-push-history');
const settings = require('./settings');
const {storedIdentifier, encodeSlot, decodeSlot} = require('./slot-values');
const {createExternalPaste} = require('./external-paste');
const jump = require('./cross-navigation');
const isMac = require('node:os').platform() === 'darwin';
const { cssPasteContext } = require('./paste-context');
const { htmlCopyContext } = require('./html-context');
const { workflowOptions, selectedCopyInformation } = require('./workflow-options');
const { registerInlineHelp } = require('./inline-help');
const pastePolicy = require('./paste-policy');
const { automaticPlacement } = require('./automatic-placement');
const { sameClass, registerClassContext } = require('./class-navigation');

const liveSlots = new WeakMap();
let externalPaste = null;
let historyUI = null;
let jumpSession = null;
let jumpStatusItem = null;
let visualGuidePanel = null;
let slotStatusItems = [];
let inputPasteQueue = Promise.resolve();

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
      jumpStatusItem.tooltip = `${filename}:${line} | クリックで次の候補 / Esc 終了`;
      jumpStatusItem.show();
      await vscode.commands.executeCommand('setContext','codingTools.jumpCycle',true);
      notify(`${filename}:${line} (${session.index+1}/${session.candidates.length})　下部の候補表示をクリック: 次 / Esc: 終了`);
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
const KIND_SLOT_PREFIX = 'coding-tools.selector-kind.';
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

// Explicit token selection wins. Default group copying prefers one class
// without a conventional role/state prefix; arbitrary code remains plain text.
function selectedIdentifier(editor) {
  if (editor.selections.length !== 1) return null;
  const document = editor.document;
  const source = document.getText();
  const identifiers = getClasses(document).map(item => ({...item, kind:'class'}));
  const ids = CSS_LANGUAGES.has(document.languageId) ? findCssIds(source)
    : HTML_LANGUAGES.has(document.languageId) ? findHtmlIds(source) : [];
  identifiers.push(...ids.map(item => ({...item, kind:'id'})));
  // Escaped CSS identifiers need a decoder; do not copy partial names.
  const tokens = identifiers.filter(item => !CSS_LANGUAGES.has(document.languageId) ||
    (source[item.start - 1] !== '\\' && source[item.end] !== '\\'));
  const css = CSS_LANGUAGES.has(document.languageId);
  if (editor.selection.isEmpty) {
    const offset = document.offsetAt(editor.selection.active);
    const token = tokens.find(item => item.start <= offset && offset < item.end);
    if (token) return defaultCopyIdentifier(source, tokens, token, css);
    if (!css) {
      const next = tokens.find(item => item.kind === 'class' && item.start >= offset);
      const previous = tokens.filter(item => item.kind === 'class' && item.end <= offset).at(-1);
      return previous && next && /^\s+$/.test(source.slice(previous.end, next.start))
        ? defaultCopyIdentifier(source, tokens, next, false) : null;
    }
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
    const newline = source.indexOf('\n', offset);
    const lineEnd = newline < 0 ? source.length : newline;
    return ruleHeaderIdentifier(source, tokens, lineStart, lineEnd);
  }
  const { anchor, active } = editor.selection;
  const a = document.offsetAt(anchor);
  const b = document.offsetAt(active);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const match = tokens.find((item) =>
    (item.start === start && item.end === end) ||
    (css && item.start + 1 === start && item.end === end)
  );
  return match || identifierGroupSelection(source, tokens, start, end, css);
}

// A rule header can copy one class/ID when its opening brace is included.
// Complete blocks and selectors separated by combinators remain plain text.
function ruleHeaderIdentifier(source, tokens, start, end) {
  return identifierGroupSelection(source, tokens, start, end, true, true);
}

const COPY_CLASS_PREFIX = /^(?:js|c|p|l|u|is|has)-/;

function preferredCopyClass(tokens, current = null) {
  const classes = tokens.filter(item => item.kind === 'class');
  const plain = classes.filter(item => !COPY_CLASS_PREFIX.test(item.name));
  return plain.find(item => item === current) || plain[0] ||
    (current?.kind === 'class' ? current : classes[0]) || current || tokens[0] || null;
}

// HTML whitespace separates names in one attribute; adjacent CSS identifiers
// belong to one compound selector. Never cross tags or CSS combinators.
function defaultCopyIdentifier(source, tokens, token, css) {
  if (token.kind !== 'class') return token;
  const items = (css ? tokens : tokens.filter(item => item.kind === 'class'))
    .slice().sort((a, b) => a.start - b.start);
  const adjacent = (left, right) => css ? left.end === right.start
    : /^\s+$/.test(source.slice(left.end, right.start));
  let first = items.indexOf(token), last = first;
  while (first > 0 && adjacent(items[first - 1], items[first])) first--;
  while (last + 1 < items.length && adjacent(items[last], items[last + 1])) last++;
  return preferredCopyClass(items.slice(first, last + 1), token);
}

function identifierGroupSelection(source, tokens, start, end, css, requireBrace = false) {
  const items = tokens.filter(item => item.end <= end &&
    (item.start >= start || (css && item.start + 1 === start)))
    .sort((a, b) => a.start - b.start);
  if (!items.length || (!css && items.some(item => item.kind !== 'class'))) return null;
  const first = items[0], last = items.at(-1);
  if (!(css && start === first.start + 1) &&
      !/^\s*$/.test(source.slice(start, first.start))) return null;
  for (let i = 1; i < items.length; i++) {
    const gap = source.slice(items[i - 1].end, items[i].start);
    if (css ? gap !== '' : !/^\s+$/.test(gap)) return null;
  }
  const tail = source.slice(last.end, end);
  if (!(css ? (requireBrace ? /^\s*\{\s*$/ : /^\s*(?:\{\s*)?$/) : /^\s*$/).test(tail)) return null;
  return preferredCopyClass(items);
}


// Keep source structure separate from the plain clipboard name. CSS paste uses
// the saved identifier kind to add its selector prefix.
function classContextFromEditor(editor, name, kind = 'class', identifier = null) {
  if (!HTML_LANGUAGES.has(editor.document.languageId)) return null;
  const doc = editor.document;
  const a = doc.offsetAt(editor.selection.anchor), b = doc.offsetAt(editor.selection.active);
  const info = htmlCopyContext(doc.getText(), { name, kind, start: identifier?.start ?? Math.min(a, b), end: identifier?.end ?? Math.max(a, b),
    source: doc.uri?.toString(), languageId: doc.languageId, documentVersion: doc.version ?? null });
  return selectedCopyInformation(info, workflowOptions(vscode, doc.uri).copyFields);
}

async function rememberCopiedIdentifier(context, className, copiedContext, kind) {
  await context.globalState.update(LAST_CLASS_KEY, kind === 'id' ? null : className);
  await context.globalState.update(LAST_CONTEXT_KEY, copiedContext);
}

function readSlotDetails(context, n) {
  let value = context.globalState.get(`${SLOT_PREFIX}${n}`);
  // VS Code storage notifications can lag behind completed writes. Keep the
  // newest complete record live, while accepting newer records from other windows.
  if (Number.isInteger(context.extensionMode)) {
    if (!liveSlots.has(context)) liveSlots.set(context, new Map());
    const cache = liveSlots.get(context), saved = cache.get(n);
    if (saved && (!Number.isSafeInteger(value?.version) || saved.version >= value.version)) value = saved;
    else if (Number.isSafeInteger(value?.version)) cache.set(n, value);
  }
  const kind = context.globalState.get(`${KIND_SLOT_PREFIX}${n}`);
  const legacy = context.globalState.get(`${CLASS_SLOT_PREFIX}${n}`) === true ? 'class' : null;
  return decodeSlot(value, kind ?? legacy, context.globalState.get('codingTools.slotFormat.' + n),
    context.globalState.get('codingTools.slotChangedAt.' + n, 0));
}
function readSlot(context, n) { return readSlotDetails(context, n).text; }
function slotKind(context, n) { return readSlotDetails(context, n).kind; }

async function copyToSlot(context, n) {
  const editor = activeEditor();
  if (!editor) return;
  const selection = editor.selection;
  const identifier = selectedIdentifier(editor);
  const className = identifier?.name ?? null;
  // Outside an identifier, an empty selection still copies the whole line.
  const text = className !== null ? storedIdentifier(className, identifier.kind) : selection.isEmpty
    ? editor.document.lineAt(selection.active.line).text + (editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')
    : editor.document.getText(selection);
  if (text.length === 0) {
    vscode.window.showWarningMessage(`Coding Tools: 保存枠${n}にコピーする文字がありません。`);
    return;
  }
  const copiedContext = className !== null ? classContextFromEditor(editor, className, identifier.kind, identifier) : null;
  await context.globalState.update(`${CLASS_SLOT_PREFIX}${n}`, identifier?.kind === 'class');
  await context.globalState.update(`${KIND_SLOT_PREFIX}${n}`, identifier?.kind ?? null);
  await context.globalState.update(`${CONTEXT_SLOT_PREFIX}${n}`, copiedContext);
  if (className !== null) await rememberCopiedIdentifier(context, className, copiedContext, identifier.kind);
  else {
    await context.globalState.update(LAST_CLASS_KEY, null);
    await context.globalState.update(LAST_CONTEXT_KEY, null);
  }
  // One memento value holds text, marker, kind and timestamp atomically.
  const previous = readSlotDetails(context, n);
  const record = encodeSlot(text, identifier?.kind, Math.max(Date.now(), previous.version + 1));
  if (Number.isInteger(context.extensionMode)) {
    if (!liveSlots.has(context)) liveSlots.set(context, new Map());
    liveSlots.get(context).set(n, record);
  }
  await context.globalState.update(`${SLOT_PREFIX}${n}`, record);
  refreshSlotStatus(context);
  externalPaste?.sync();
  notify(`${n}にコピーしました${className !== null ? (identifier.kind === 'id' ? '（ID名）' : '（クラス名）') : selection.isEmpty ? '（現在行）' : ''}`);
  return record;
}

// Avoid a double dot when pasting after an existing '.' (e.g. typing the
// class name into an already prepared CSS selector). For replacement ranges,
// only the text just before the range is examined.
function classTextForSelection(document, selection, name, kind) {
  const at = Math.min(document.offsetAt(selection.anchor), document.offsetAt(selection.active));
  const text = document.getText();
  if (cssPasteContext(text, at) === 'plain') return name;
  const prefix = kind === 'id' ? '#' : '.';
  return text.charAt(at - 1) === prefix ? name : prefix + name;
}

async function insertIntoEditor(editor, text, kind) {
  const css = CSS_LANGUAGES.has(editor.document.languageId);
  return editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      const inserted = kind && css
        ? classTextForSelection(editor.document, selection, text, kind)
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
  const kind = slotKind(context, n);
  if (kind && editor.document.languageId === 'css' &&
      editor.selections.length === 1 && editor.selection.isEmpty &&
      cssPasteContext(editor.document.getText(), editor.document.offsetAt(editor.selection.active)) === 'structure') {
    return routeCssPaste(context, editor, text, context.globalState.get(`${CONTEXT_SLOT_PREFIX}${n}`), kind);
  }
  const success = await loggedEdit(context, editor, `保存枠${n}の貼り付け`, () => insertIntoEditor(editor, text, kind));
  if (!success) vscode.window.showWarningMessage('Coding Tools: 貼り付けできませんでした（読み取り専用など）。');
  else notify(`${n}を貼り付けました`);
}

// Search inputs can leave the previous code editor active. Native paste uses
// the focused input; borrow its clipboard text only for this explicit action.
// Search fields accept an explicit query. Do not borrow the OS clipboard or
// rely on native paste completion to populate them.
async function pasteIntoSearch(context, n, target) {
  const text = readSlot(context, n);
  if (text === undefined) {
    vscode.window.showInformationMessage(`Coding Tools: 保存枠${n}は空です。先に「コピー ${n}」を実行してください。`);
    return;
  }
  try {
    if (target === 'workspaceSearch') {
      await vscode.commands.executeCommand('workbench.action.findInFiles', {query: text, triggerSearch: true});
    } else {
      // VS Code seeds an empty find widget from the editor selection, even
      // when findWithArgs supplies a query. Open it first, then set our query.
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      await vscode.commands.executeCommand('actions.find');
      await vscode.commands.executeCommand('editor.actions.findWithArgs', {searchString: text});
    }
  } catch (error) {
    vscode.window.showWarningMessage(`Coding Tools: 検索欄へ入力できませんでした: ${error.message}`);
  }
}

async function pasteIntoInput(context, n) {
  const text = readSlot(context, n);
  if (text === undefined) {
    vscode.window.showInformationMessage(`Coding Tools: 保存枠${n}は空です。先に「コピー ${n}」を実行してください。`);
    return;
  }
  const paste = async () => {
    try {
      const previous = await vscode.env.clipboard.readText();
      const temporary = previous !== text;
      try {
        if (temporary) await vscode.env.clipboard.writeText(text);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      } finally {
        // Preserve a newer Ctrl+C made while native paste was in progress.
        if (temporary && await vscode.env.clipboard.readText() === text) {
          await vscode.env.clipboard.writeText(previous);
        }
      }
    } catch (error) {
      vscode.window.showWarningMessage(`Coding Tools: 入力欄へ貼り付けできませんでした: ${error.message}`);
    }
  };
  // Two slot pastes must not snapshot each other's temporary clipboard text.
  const pending = inputPasteQueue.then(paste, paste);
  inputPasteQueue = pending.catch(() => {});
  return pending;
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
    const name = readSlot(context, n);
    const kind = slotKind(context, n);
    const value = name !== undefined && kind ? storedIdentifier(name, kind) : name;
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
  const items = [{ label: '$(copy) この枠にコピー', action: 'copy', description: '選択した文字、またはカーソル上のクラス名・ID名' }];
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

function moveSameClass(direction) {
  clearJumpSession();
  const editor=activeEditor();
  if(!editor)return;
  const item=sameClass(editor,direction);
  if(!item){notify('このファイル内にほかの同名クラスはありません');return;}
  const start=editor.document.positionAt(item.start),end=editor.document.positionAt(item.end);
  editor.selection=new vscode.Selection(start,end);
  editor.revealRange(new vscode.Range(start,end),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// CSS editing is scoped by the location of the cursor. Never silently rewrite
// existing rules or move declarations across @media / @layer boundaries.
function scopeChoiceFromSettings(editor, selector, tree) {
  const rules=vscode.workspace.getConfiguration('codingTools',editor.document.uri).get('placementRules',{});
  const name=selector.slice(1);
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

async function insertAt(context, editor, selector, insertion, commentText=null, reason='') {
  // CSS safe mode: do not rewrite, move, or delete existing rules. No edit
  // takes place until an independent parser validates before/after states.
  const original=editor.document.getText();
  const version=editor.document.version;
  const check=safety.preflight(original,selector,insertion,editor.document.languageId,commentText);
  if(!check.ok){
    vscode.window.showWarningMessage(`Coding Tools: 自動配置を中止しました。${check.reason}`);
    return false;
  }
  // The selected action applies directly after validation.
  if(editor.document.isClosed || editor.document.version!==version || editor.document.getText()!==original){
    vscode.window.showWarningMessage('Coding Tools: CSSが変更または閉じられたため、自動配置を中止しました。');
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
    notify(`「${selector}」を追加${reason?'：'+reason:''}（Ctrl+Zで取消可）`);
  } else vscode.window.showWarningMessage('Coding Tools: 編集できませんでした。読み取り専用や競合を確認してください。');
  return ok;
}

function option(label,description,run,detail) {return {label:label.replace(/^\$\([\w-]+\)\s*/, ''),description,detail,run};}

async function routeCssPaste(context, editor, name, copiedContext, kind = 'class') {
  const selector = (kind === 'id' ? '#' : '.') + name;
  if (!placement.isSafeSelector(selector)) {
    vscode.window.showWarningMessage('Coding Tools: この名前を安全に配置できません。');
    return;
  }
  const text = editor.document.getText();
  const version = editor.document.version;
  const preferences = workflowOptions(vscode, editor.document.uri);
  const neighbors = copiedContext?.name === name && (copiedContext.kind || 'class') === kind
    ? selectedCopyInformation(copiedContext,preferences.copyFields) : {name, kind};
  const offset = editor.document.offsetAt(editor.selection.active);
  const currentTree=placement.parseCss(text);
  if(preferences.automaticPaste){
    const configured=scopeChoiceFromSettings(editor,selector,currentTree);
    const action=automaticPlacement(text,selector,neighbors,preferences,{offset,configuredScope:configured?placement.scopeKey(configured):null});
    if(action.kind==='error'){vscode.window.showWarningMessage('Coding Tools: '+action.reason);return;}
    if(editor.document.isClosed || editor.document.version!==version || editor.document.getText()!==text){
      vscode.window.showWarningMessage('Coding Tools: CSSが変更または閉じられたため中止しました。');return;
    }
    if(action.kind==='jump')return jumpTo(editor,action.rule);
    return insertAt(context,editor,selector,action.insertion,action.commentText,action.reason);
  }
  const currentScope=placement.scopeKey(placement.treeAtOffset(currentTree,offset));
  const plan = placement.candidates(text, selector, pastePolicy.placementOptions(neighbors,preferences,offset,text,currentScope));
  if (!plan.safe) { vscode.window.showWarningMessage(plan.reason); return; }
  const comment=pastePolicy.registeredComment(neighbors,preferences);
  const addAt=(anchor,useComment=true)=>{
    if(useComment && preferences.addComments && comment?.error){vscode.window.showWarningMessage('Coding Tools: '+comment.error);return false;}
    const prepared=pastePolicy.withSectionComment(text,placement.formatInsert(text,selector,anchor),anchor.container,useComment && preferences.addComments?comment:null);
    return insertAt(context,editor,selector,prepared.insertion,prepared.commentText);
  };
  const configured = scopeChoiceFromSettings(editor, selector, plan.tree);
  const preferred = configured || plan.current;
  const items = [];
  for (const rule of plan.allExact) {
    const line = editor.document.positionAt(rule.start).line + 1;
    items.push({ ...option('既存ルールへ移動：' + placement.scopeLabel(rule),
      `L${line} / ${rule.prelude}（CSSは変更しない）`, () => jumpTo(editor, rule)), scope: placement.scopeKey(rule), kind: 'jump' });
  }
  const rootPlan = placement.candidates(text, selector, pastePolicy.placementOptions(neighbors,preferences,0,text,''));
  const rootRelated = rootPlan.anchor?.container.type === 'root' &&
    !placement.flatten(plan.tree).some(node => node.brace < rootPlan.anchor.offset && rootPlan.anchor.offset < node.end - 1);
  let rootAnchor = rootRelated ? rootPlan.anchor : {offset:text.length,container:plan.tree.root};
  const rootComment=comment && !comment.error?pastePolicy.commentGroup(text,comment,''):null;
  const rootHasUniqueComment=rootComment?.start!=null;
  if(rootHasUniqueComment && !rootRelated){
    const direct=plan.tree.root.children.filter(node=>node.start>=rootComment.start && node.end<=rootComment.end);
    rootAnchor={offset:direct.length?direct.at(-1).end:rootComment.start,container:plan.tree.root};
  }
  const canCreateComment=preferences.addComments && comment?.text && !rootComment?.exists;
  if(!preferences.requireCommentGroup || rootHasUniqueComment || canCreateComment){
    items.push({ ...option('空ルールを追加：基本ルール',
      rootRelated && rootPlan.reason ? rootPlan.reason : '@mediaなどの外側に追加',
      () => addAt(rootAnchor), preferences.addComments && comment?.text ? '登録コメント：'+comment.text : undefined), scope:'', kind:'insert' });
  } else {
    const groups=pastePolicy.existingCommentGroups(text);
    for(const group of groups){
      const groupPlan=placement.candidates(text,selector,{...pastePolicy.placementOptions(neighbors,preferences,0,text,''),sectionRange:group});
      const proposed=groupPlan.anchor;
      const safeRoot=proposed?.container.type==='root' &&
        !placement.flatten(plan.tree).some(node=>node.brace<proposed.offset && proposed.offset<node.end-1);
      const anchor=safeRoot?proposed:{offset:group.start,container:plan.tree.root};
      items.push({...option('空ルールを追加：基本ルール / '+group.label,
        `L${group.line} / このコメントのグループ内へ追加`,()=>addAt(anchor,false)),scope:'',kind:'insert'});
    }
    if(!groups.length)items.push({...option('基本ルールのコメントを用意する',
      '追加先のコメントがありません。CSSへ見出しコメントを書くか、使うコメントを登録してください。',
      ()=>vscode.commands.executeCommand('workbench.action.openSettings','@ext:elliotveyne.coding-tools sectionComments')),kind:'settings'});
  }
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
    const scopedPlan=placement.candidates(text,selector,pastePolicy.placementOptions(neighbors,preferences,at.brace+1,text,placement.scopeKey(at)));
    const scopedAnchor=scopedPlan.anchor?.container===at?scopedPlan.anchor:{offset:at.end-1,container:at};
    items.push({ ...option('空ルールを追加：' + placement.scopeLabel(at),
      `L${line} / ${scopedPlan.reason || '記述済みの条件内へ追加'}`,
      () => addAt(scopedAnchor), preferences.addComments && comment?.text ? '登録コメント：'+comment.text : undefined),
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
// never open a confirmation picker. The status-bar item cycles the matches.
async function crossJump(destination) {
  clearJumpSession();
  const editor = activeEditor();
  if (!editor) return;
  const srcDoc = editor.document;
  const isHtml = HTML_LANGUAGES.has(srcDoc.languageId);
  const isCss = CSS_LANGUAGES.has(srcDoc.languageId);
  if (destination === undefined) {
    if (!isHtml && !isCss) {
      vscode.window.showInformationMessage('Coding Tools: HTML / CSSなどのクラス名の上で実行してください。');
      return;
    }
    destination = isHtml ? 'css' : 'html';
  }
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
  externalPaste = createExternalPaste(vscode, context, () => [1, 2].map(n => ({
    n, text: readSlotDetails(context, n).text ?? null, version: readSlotDetails(context, n).version
  })));
  context.subscriptions.push(externalPaste);
  registerInlineHelp(vscode,context,isMac);
  registerClassContext(vscode,context);
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
  }, () => refreshSlotStatus(context), () => externalPaste?.refresh());
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
      const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Right, 89 - (n - 1) * 4 - index);
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
      vscode.commands.registerCommand(`codingTools.paste${n}`, args =>
        ['workspaceSearch', 'editorSearch'].includes(args?.target) ? pasteIntoSearch(context, n, args.target) :
        args?.target === 'input' ? pasteIntoInput(context, n) : pasteFromSlot(context, n)),
    );
  }
  refreshSlotStatus(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('codingTools.jumpToCss', () => crossJump('css')),
    vscode.commands.registerCommand('codingTools.jumpToHtml', () => crossJump('html')),
    vscode.commands.registerCommand('codingTools.jumpBetweenHtmlCss', () => crossJump()),
    vscode.commands.registerCommand('codingTools.cycleNextJump', () => cycleJump(1)),
    vscode.commands.registerCommand('codingTools.cyclePreviousJump', () => cycleJump(-1)),
    vscode.commands.registerCommand('codingTools.endJumpCycle', clearJumpSession),
    vscode.commands.registerCommand('codingTools.nextClass', () => moveClass(1)),
    vscode.commands.registerCommand('codingTools.previousClass', () => moveClass(-1)),
    vscode.commands.registerCommand('codingTools.nextSameClass', () => moveSameClass(1)),
    vscode.commands.registerCommand('codingTools.previousSameClass', () => moveSameClass(-1)),
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
  if (context.extensionMode === 3) return {slotForTest: n => readSlotDetails(context, n)};
}

function deactivate() { externalPaste?.dispose(); externalPaste = null; }
module.exports = { activate, deactivate };
