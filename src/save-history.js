'use strict';
const fs = require('node:fs/promises');
const history = require('./history');
const settings = require('./settings');

function startSaveHistory(vscode,context,refresh) {
  const baseline = new Map();
  async function track(doc) {
    if (doc.uri.scheme !== 'file') return;
    try {baseline.set(doc.uri.toString(),await fs.readFile(doc.uri.fsPath,'utf8'));}
    catch (_) {baseline.set(doc.uri.toString(),doc.getText());}
  }
  for (const doc of (vscode.workspace.textDocuments||[])) void track(doc);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument?.(doc=>{void track(doc);}),
    vscode.workspace.onDidCloseTextDocument?.(doc=>baseline.delete(doc.uri.toString())),
    vscode.workspace.onDidSaveTextDocument?.(async doc=>{
      if(doc.uri.scheme!=='file')return;
      const key=doc.uri.toString();
      const after=doc.getText();
      const before=baseline.get(key);
      baseline.set(key,after);
      if(!settings.enabled(context,'save')||before===undefined||before===after)return;
      try {
        await history.record(context,{stage:'save',before,after,
          action:'ファイル保存',sourceUri:doc.uri});
        await history.prune(context);
        refresh();
      } catch(e) {vscode.window.showWarningMessage(`Coding Tools: 保存Diffの記録に失敗: ${e.message}`);}
    })
  );
  // Calls may be absent in lightweight offline test mocks.
  context.subscriptions.splice(0,context.subscriptions.length,...context.subscriptions.filter(Boolean));
}
module.exports={startSaveHistory};
