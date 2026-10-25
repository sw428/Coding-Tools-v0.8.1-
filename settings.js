 'use strict';
// Persistent extension-owned state: never writes user/workspace settings.json.
const DEFAULT_DAYS={operation:30,save:90,push:90};
const MIN_DAYS=1;
const MAX_DAYS=360;
const OPTIONS=[
  {key:'operation', label:'操作ごとのDiffを記録',description:'拡張機能による1回の編集ごとに記録'},
  {key:'save',label:'ファイル保存時のDiffを記録',description:'保存のたびに前回保存内容との差分を記録'},
  {key:'push',label:'Coding Toolsで行ったGit pushを記録',description:'拡張機能経由で成功したpushのみ記録'},
  {key:'confirm',label:'CSS適用前の最終確認',description:'OFFでも配置候補の選択は残る'}
];
const prefix='codingTools.internal.';
const allowed=new Set(OPTIONS.map(x=>x.key));
function read(context,k,fallback){ return context.globalState?.get(prefix+k,fallback)??fallback; }
function enabled(context,key) {
  if(!allowed.has(key))throw new Error('Unknown setting: '+key);
  return read(context,key,true)!==false;
}
async function setEnabled(context,key,value){
  if(!allowed.has(key))throw new Error('Unknown setting: '+key);
  await context.globalState.update(prefix+key,!!value);
}
function retentionDays(context,stage){
  if(!Object.hasOwn(DEFAULT_DAYS,stage))throw new Error('Unknown history stage: '+stage);
  const days=read(context,`retention.${stage}`,DEFAULT_DAYS[stage]);
  return Number.isInteger(days) ? Math.min(MAX_DAYS,Math.max(MIN_DAYS,days)) : DEFAULT_DAYS[stage];
}
async function setRetentionDays(context,stage,days){
  if(!Object.hasOwn(DEFAULT_DAYS,stage))throw new Error('Unknown history stage: '+stage);
  if(!Number.isInteger(days)||days<MIN_DAYS||days>MAX_DAYS)throw new RangeError('保存日数は1〜360日の整数');
  await context.globalState.update(prefix+`retention.${stage}`,days);
}
function registerSettingsUI(vscode,context,changedHandler=async()=>{}){
  const emitter=new vscode.EventEmitter();
  const STAGE_NAMES={operation:'操作履歴',save:'保存履歴',push:'Git push履歴'};
  const provider={
    onDidChangeTreeData:emitter.event,
    getChildren: element=>element?[]:[
      ...OPTIONS.map(x=>({...x,kind:'toggle'})),
      ...Object.keys(DEFAULT_DAYS).map(stage=>({kind:'days',stage})),
      {kind:'shortcuts'}, {kind:'guide'}
    ],
    getTreeItem(item){
      if(item.kind==='toggle'){
        const on=enabled(context,item.key);
        const tree=new vscode.TreeItem(`${on?'☑':'☐'} ${item.label}`,vscode.TreeItemCollapsibleState.None);
        tree.description=on?'ON':'OFF';
        tree.tooltip=`${item.description}\nEnterでON/OFF。設定は拡張機能のglobalStateに保存。settings.jsonには書き込みません。`;
        tree.iconPath=new vscode.ThemeIcon(on?'check':'circle-slash');
        tree.command={command:'codingTools.toggleSetting',title:'ON/OFF切替',arguments:[item.key]};
        return tree;
      }
      if(item.kind==='days'){
        const days=retentionDays(context,item.stage);
        const tree=new vscode.TreeItem(`${STAGE_NAMES[item.stage]}の保存期間`,vscode.TreeItemCollapsibleState.None);
        tree.description=`${days}日 / 最大360日`;
        tree.tooltip=`現在${days}日。クリックして1〜360日から選択（既存の古い履歴は次回整理で削除）。`;
        tree.iconPath=new vscode.ThemeIcon('calendar');
        tree.command={command:'codingTools.chooseRetentionDays',title:'保存期間を選択',arguments:[item.stage]};
        return tree;
      }
      const tree=new vscode.TreeItem(item.kind==='guide'?'アニメーション図で使い方を確認':'キーボードショートカット一覧を開く',vscode.TreeItemCollapsibleState.None);
      tree.iconPath=new vscode.ThemeIcon(item.kind==='guide'?'book':'keyboard');
      tree.command={command:item.kind==='guide'?'codingTools.openVisualGuide':'codingTools.openKeyboardShortcuts',title:'開く'};
      tree.tooltip=item.kind==='guide'?'ブラウザでSVG付きガイドを開く':'VS Codeの標準ショートカット画面でCoding Toolsを検索・変更する';
      return tree;
    }
  };
  const view=vscode.window.createTreeView('codingTools.settingsView',{treeDataProvider:provider});
  const toggle=vscode.commands.registerCommand('codingTools.toggleSetting',async key=>{
    if(!allowed.has(key))return;
    const on=!enabled(context,key);
    await setEnabled(context,key,on);
    emitter.fire();
    vscode.window.setStatusBarMessage(`Coding Tools: ${OPTIONS.find(x=>x.key===key).label} → ${on?'ON':'OFF'}`,3500);
  });
  const choose=vscode.commands.registerCommand('codingTools.chooseRetentionDays',async stage=>{
    if(!Object.hasOwn(DEFAULT_DAYS,stage))return;
    const current=retentionDays(context,stage);
    const presets=[7,14,30,60,90,180,360].map(day=>({label:`${day}日${day===current?'（現在）':''}`,value:day,description:day===360?'保存可能な上限':''}));
    const custom={label:'$(edit) 1〜360日を数字で指定',value:'custom',description:'日数を直接入力'};
    const picked=await vscode.window.showQuickPick([...presets,custom],{placeHolder:`${STAGE_NAMES[stage]}：保存期間を選択（最大360日）`});
    if(!picked)return;
    let value=picked.value;
    if(value==='custom'){
      const input=await vscode.window.showInputBox({prompt:`${STAGE_NAMES[stage]}の保存期間（1〜360日）`,value:String(current),
        validateInput:s=>/^\d+$/.test(s)&&Number(s)>=1&&Number(s)<=360?null:'1〜360の整数を入力してください'});
      if(input===undefined)return;
      value=Number(input);
    }
    if(!Number.isInteger(value)||value<1||value>360)return;
    await setRetentionDays(context,stage,value);
    emitter.fire();
    await changedHandler();
    vscode.window.setStatusBarMessage(`Coding Tools: ${STAGE_NAMES[stage]}の保存期間を${value}日に変更`,4000);
  });
  const open=vscode.commands.registerCommand('codingTools.openSettings',async()=>{
    await vscode.commands.executeCommand('workbench.view.explorer');
    await vscode.commands.executeCommand('codingTools.settingsView.focus');
  });
  const shortcuts=vscode.commands.registerCommand('codingTools.openKeyboardShortcuts',async()=>{
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
    vscode.window.showInformationMessage('ショートカット一覧の検索欄に「Coding Tools」を入力すると、各コマンドを設定できます。');
  });
  context.subscriptions.push(view,emitter,toggle,choose,open,shortcuts);
}
module.exports={OPTIONS,DEFAULT_DAYS,MIN_DAYS,MAX_DAYS,enabled,setEnabled,retentionDays,setRetentionDays,registerSettingsUI};
