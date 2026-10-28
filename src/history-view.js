'use strict';
const fs = require('node:fs/promises');
const history = require('./history');
const settings = require('./settings');

function makeHistoryUI(vscode, context) {
  const changed = new vscode.EventEmitter();
  let cachedEntries = null;
  const load = async () => {if (!cachedEntries) cachedEntries = await history.entries(context); return cachedEntries;};
  const provider = {
    onDidChangeTreeData: changed.event,
    async getChildren(element) {
      const logs = await load();
      if (!element) return Object.keys(history.STAGES).map(stage=>({kind:'stage',stage}));
      if(element.kind==='stage') return [...new Set(logs.filter(log=>log.stage===element.stage).map(log=>log.month))].map(month=>({kind:'month',month,stage:element.stage}));
      if (element.kind==='month') return logs.filter(log=>log.month===element.month&&log.stage===element.stage).map(log=>({kind:'entry',log}));
      return [];
    },
    getTreeItem(item) {
      if(item.kind==='stage') {
        const labels={operation:`01 操作履歴（${settings.retentionDays(context,'operation')}日）`,save:`02 保存履歴（${settings.retentionDays(context,'save')}日）`,push:`03 Git履歴（${settings.retentionDays(context,'push')}日）`};
        const node=new vscode.TreeItem(labels[item.stage],vscode.TreeItemCollapsibleState.Collapsed);
        node.iconPath=new vscode.ThemeIcon('folder');
        return node;
      }
      if (item.kind==='month') {
        const node=new vscode.TreeItem(item.month, vscode.TreeItemCollapsibleState.Collapsed);
        node.iconPath = new vscode.ThemeIcon('calendar');
        node.contextValue = 'codingToolsHistoryMonth';
        return node;
      }
      const log=item.log;
      const t = new Date(log.createdAt);
      const time = new Intl.DateTimeFormat('ja-JP', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(t);
      const node = new vscode.TreeItem(`${time}  ${log.sourceName}`,vscode.TreeItemCollapsibleState.None);
      const kinds={operation:'操作',save:'保存',push:'Git push'};
      node.description=`[${kinds[log.stage] || '操作'}] ${log.action}`;
      node.tooltip=`${new Date(log.createdAt).toLocaleString('ja-JP')}\n${log.sourceName}\n${log.action}\nクリックで差分を開く。右クリックから元ファイルへ移動。`;
      node.iconPath=new vscode.ThemeIcon(log.stage==='push'?'repo-push':log.stage==='save'?'save':'diff');
      node.contextValue='codingToolsHistoryEntry';
      node.command={command:'codingTools.openDiff',title:'差分を開く',arguments:[log]};
      return node;
    }
  };
  // History is opened directly from the Explorer view.
  const treeView = vscode.window.createTreeView('codingTools.history', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(
    treeView,changed,
    vscode.commands.registerCommand('codingTools.refreshHistory',()=>{cachedEntries=null;changed.fire(undefined);}),
    vscode.commands.registerCommand('codingTools.openDiff',async value => {
      const entry = value?.log || value;
      if(!entry?.diffPath)return;
      try {
        const uri=vscode.Uri.file(entry.diffPath);
        const doc=await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(doc,'diff');
        await vscode.window.showTextDocument(doc,{preview:false});
      } catch(e){vscode.window.showErrorMessage(`差分ファイルを開けません: ${e.message}`);}
    }),
    vscode.commands.registerCommand('codingTools.openSource',async value => {
      const entry=value?.log||value;
      if(entry?.stage==='push') {await vscode.commands.executeCommand('workbench.view.scm');return;}
      if(!entry?.sourceUri)return;
      try {
        const uri=vscode.Uri.parse(entry.sourceUri,true);
        const doc=await vscode.workspace.openTextDocument(uri);
        const editor=await vscode.window.showTextDocument(doc,{preview:false});
        const line=Math.max(0,Math.min(entry.targetLine,doc.lineCount-1));
        const pos=new vscode.Position(line,0);
        editor.selection=new vscode.Selection(pos,pos);
        editor.revealRange(new vscode.Range(pos,pos),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      } catch(e){vscode.window.showWarningMessage(`変更元ファイルを開けません: ${e.message}`);}
    }),
    vscode.commands.registerCommand('codingTools.revealHistoryFolder',async()=>{
      await fs.mkdir(history.folder(context),{recursive:true});
      await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(history.folder(context)));
    })
  );
  return { refresh:()=>{cachedEntries=null;changed.fire(undefined);} };
}
module.exports={makeHistoryUI};
