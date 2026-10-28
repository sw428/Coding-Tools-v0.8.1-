'use strict';
const { findCssClasses, findHtmlClasses } = require('./selectors');
const { workflowOptions } = require('./workflow-options');
const HTML = new Set(['html', 'vue', 'php', 'javascriptreact', 'typescriptreact']);
const CSS = new Set(['css', 'scss', 'less']);

function helpAt(editor, isMac) {
  if (!editor || editor.selections.length !== 1) return null;
  const doc = editor.document;
  const html = HTML.has(doc.languageId), css = CSS.has(doc.languageId);
  if (!html && !css) return null;
  const at = doc.offsetAt(editor.selection.active);
  const tokens = html ? findHtmlClasses(doc.getText()) : findCssClasses(doc.getText());
  const token = tokens.find(t => t.start <= at && at < t.end ||
    !editor.selection.isEmpty && doc.offsetAt(editor.selection.start) === t.start && doc.offsetAt(editor.selection.end) === t.end);
  if (!token || /[{}<>]/.test(token.name) || css && doc.getText()[token.end] === '\\') return null;
  const key = isMac ? 'Cmd+Alt+' : 'Ctrl+Alt+';
  const moveKey = isMac ? 'Cmd+' : 'Ctrl+';
  return { token, text: ' ⓘ ' + moveKey + '1: 前 / ' + moveKey + '2: 次  ｜  Ctrl+Tab: 同名の次 / Ctrl+Shift+Tab: 同名の前  ｜  ' + (html ? 'CSSへ: ' + key + '3' : 'HTMLへ: ' + key + '4') + '（初期キー）' };
}

function registerInlineHelp(vscode, context, isMac, timers = { setTimeout, clearTimeout }) {
  // Existing offline mocks and environments without decorations can still run.
  if (!vscode.window.createTextEditorDecorationType) return;
  const decoration = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1em' },
  });
  let timer, shownEditor, lastKey;
  function clear() {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    if (shownEditor) shownEditor.setDecorations(decoration, []);
    shownEditor = undefined;
  }
  function update(force = false) {
    const editor = vscode.window.activeTextEditor;
    const options = workflowOptions(vscode, editor?.document.uri);
    if (!options.helpEnabled) { clear(); lastKey = undefined; return; }
    const help = helpAt(editor, isMac);
    const key = help ? `${editor.document.uri}:${editor.document.version}:${help.token.start}:${help.token.end}` : undefined;
    if (!force && key && key === lastKey) return;
    clear(); lastKey = key;
    if (!help) return;
    shownEditor = editor;
    const end = editor.document.lineAt(editor.selection.active.line).range.end;
    editor.setDecorations(decoration, [{ range: new vscode.Range(end, end), renderOptions: { after: { contentText: help.text } } }]);
    timer = timers.setTimeout(clear, options.helpSeconds * 1000);
    timer.unref?.();
  }
  const disposables = [
    vscode.window.onDidChangeTextEditorSelection(event => { if (event.textEditor === vscode.window.activeTextEditor) update(); }),
    vscode.window.onDidChangeActiveTextEditor(() => update(true)),
    vscode.workspace.onDidChangeTextDocument(event => { if (event.document === vscode.window.activeTextEditor?.document) update(true); }),
    vscode.workspace.onDidChangeConfiguration?.(event => { if (event.affectsConfiguration('codingTools')) update(true); }),
  ].filter(Boolean);
  context.subscriptions.push({ dispose() {
    clear(); lastKey = undefined;
    for (const disposable of disposables) disposable.dispose();
    decoration.dispose();
  } });
  update();
}
module.exports = { helpAt, registerInlineHelp };
