 'use strict';
// Persistent extension-owned state: never writes user/workspace settings.json.
const path=require('node:path');
const DEFAULT_DAYS={operation:30,save:90,push:90};
const MIN_DAYS=1;
const MAX_DAYS=360;
const OPTIONS=[
  {key:'operation', label:'操作ごとのDiffを記録',description:'拡張機能による1回の編集ごとに記録'},
  {key:'save',label:'ファイル保存時のDiffを記録',description:'保存のたびに前回保存内容との差分を記録'},
  {key:'push',label:'Coding Toolsで行ったGit pushを記録',description:'拡張機能経由で成功したpushのみ記録'},
  {key:'confirm',label:'CSS適用前の最終確認',description:'OFFでも配置候補の選択は残る'}
];
const SLOT_DISPLAY_OPTIONS=[
  {part:'number',label:'枠番号',description:'(1) / (2) の表示'},
  {part:'actions',label:'コピー／貼り付け',description:'コピー／貼り付けのボタン名'},
  {part:'shortcuts',label:'ショートカットキー',description:'ボタンに初期キーを表示（操作は非表示でも有効）'},
  {part:'content',label:'保存内容',description:'貼り付ける内容の短いプレビュー'}
 ];
function slotDisplayKey(n,part){
  if(![1,2].includes(n)||!SLOT_DISPLAY_OPTIONS.some(option=>option.part===part))throw new Error('Unknown slot display option');
  return `slot${n}.${part}`;
}
const slotOptions=[1,2].flatMap(n=>SLOT_DISPLAY_OPTIONS.map(option=>({key:slotDisplayKey(n,option.part),label:`コピー枠${n}：${option.label}`,description:option.description})));
const allToggleOptions=[...OPTIONS,...slotOptions];
const prefix='codingTools.internal.';
const allowed=new Set(allToggleOptions.map(x=>x.key));
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
function registerSettingsUI(vscode,context,changedHandler=async()=>{},displayChangedHandler=async()=>{}){
  const emitter=new vscode.EventEmitter();
  const STAGE_NAMES={operation:'操作履歴',save:'保存履歴',push:'Git push履歴'};
  const provider={
    onDidChangeTreeData:emitter.event,
    getChildren: element=>element?.kind==='slotGroup'
      ? slotOptions.filter(option=>option.key.startsWith(`slot${element.n}.`)).map(option=>({...option,kind:'toggle'}))
      : element?[]:[
      {kind:'slotGroup',n:1}, {kind:'slotGroup',n:2},
      ...OPTIONS.filter(x=>x.key==='confirm').map(x=>({...x,kind:'toggle'})),
      ...Object.keys(DEFAULT_DAYS).map(stage=>({kind:'days',stage})),
      {kind:'css'}, {kind:'shortcuts'}, {kind:'history'}, {kind:'guide'}, {kind:'about'}
    ],
    getTreeItem(item){
      if(item.kind==='slotGroup'){
        const tree=new vscode.TreeItem(`コピー枠${item.n}の表示`,vscode.TreeItemCollapsibleState.Collapsed);
        tree.iconPath=new vscode.ThemeIcon('clippy');
        tree.tooltip='番号・コピー／貼り付け・キー・保存内容を個別に表示ON/OFF';
        return tree;
      }
      if(item.kind==='toggle'){
        const on=enabled(context,item.key);
        const tree=new vscode.TreeItem(`${on?'☑':'☐'} ${item.label}`,vscode.TreeItemCollapsibleState.None);
        tree.description=on?'ON':'OFF';
        tree.tooltip=`${item.description}\nクリックまたはEnterでON/OFF。`;
        tree.iconPath=new vscode.ThemeIcon(on?'check':'circle-slash');
        tree.command={command:'codingTools.toggleSetting',title:'ON/OFF切替',arguments:[item.key]};
        return tree;
      }
      if(item.kind==='days'){
        const days=retentionDays(context,item.stage);
        const tree=new vscode.TreeItem(`${STAGE_NAMES[item.stage]}の保存期間`,vscode.TreeItemCollapsibleState.None);
        const recording=enabled(context,item.stage);
        tree.description=recording?`${days}日 / 最大360日`:'OFF（記録しない）';
        tree.tooltip=recording?`現在${days}日。クリックしてOFFまたは1〜360日を選択。`:'記録は停止中です。日数を選ぶと、その期間で記録を再開します。';
        tree.iconPath=new vscode.ThemeIcon(recording?'calendar':'circle-slash');
        tree.command={command:'codingTools.chooseRetentionDays',title:'記録・保存期間を選択',arguments:[item.stage]};
        return tree;
      }
      if(item.kind==='css'||item.kind==='history'){
        const tree=new vscode.TreeItem(item.kind==='css'?'CSS配置ルールの設定':'履歴を開く',vscode.TreeItemCollapsibleState.None);
        tree.iconPath=new vscode.ThemeIcon(item.kind==='css'?'settings-gear':'history');
        tree.command=item.kind==='css'
          ? {command:'workbench.action.openSettings',title:'CSS設定を開く',arguments:['@ext:elliotveyne.coding-tools']}
          : {command:'codingTools.showHistoryPanel',title:'履歴を開く'};
        return tree;
      }
      if(item.kind==='about'){
        const tree=new vscode.TreeItem('開発方針・データの扱い',vscode.TreeItemCollapsibleState.None);
        tree.iconPath=new vscode.ThemeIcon('info');
        tree.command={command:'markdown.showPreview',title:'開発方針を開く',arguments:[vscode.Uri.file(path.join(context.extensionPath,'docs','VISION.md'))]};
        tree.tooltip='開発の目的・現在の段階・データの扱い・今後の計画を別タブで読む';
        return tree;
      }
      const tree=new vscode.TreeItem(item.kind==='guide'?'GIFで使い方を確認':'キーボードショートカット一覧を開く',vscode.TreeItemCollapsibleState.None);
      tree.iconPath=new vscode.ThemeIcon(item.kind==='guide'?'book':'keyboard');
      tree.command={command:item.kind==='guide'?'codingTools.openVisualGuide':'codingTools.openKeyboardShortcuts',title:'開く'};
      tree.tooltip=item.kind==='guide'?'VS Code内で1操作ずつのGIFガイドを開く':'VS Codeの標準ショートカット画面でCoding Toolsを検索・変更する';
      return tree;
    }
  };
  const view=vscode.window.createTreeView('codingTools.settingsView',{treeDataProvider:provider});
  const toggle=vscode.commands.registerCommand('codingTools.toggleSetting',async key=>{
    if(!allowed.has(key))return;
    const on=!enabled(context,key);
    await setEnabled(context,key,on);
    emitter.fire();
    if(key.startsWith('slot'))await displayChangedHandler();
    vscode.window.setStatusBarMessage(`Coding Tools: ${allToggleOptions.find(x=>x.key===key).label} → ${on?'ON':'OFF'}`,3500);
  });
  const choose=vscode.commands.registerCommand('codingTools.chooseRetentionDays',async stage=>{
    if(!Object.hasOwn(DEFAULT_DAYS,stage))return;
    const current=retentionDays(context,stage);
    const recording=enabled(context,stage);
    const off={label:`OFF（記録しない）${!recording?'（現在）':''}`,value:'off',description:'新しい履歴の記録を停止'};
    const presets=[7,14,30,60,90,180,360].map(day=>({label:`${day}日${recording&&day===current?'（現在）':''}`,value:day,description:day===360?'保存可能な上限':''}));
    const custom={label:'$(edit) 1〜360日を数字で指定',value:'custom',description:'日数を直接入力'};
    const picked=await vscode.window.showQuickPick([off,...presets,custom],{placeHolder:`${STAGE_NAMES[stage]}：OFFまたは保存期間を選択（最大360日）`});
    if(!picked)return;
    let value=picked.value;
    if(value==='off'){
      await setEnabled(context,stage,false);
      emitter.fire();
      vscode.window.setStatusBarMessage(`Coding Tools: ${STAGE_NAMES[stage]} → OFF（記録しない）`,4000);
      return;
    }
    if(value==='custom'){
      const input=await vscode.window.showInputBox({prompt:`${STAGE_NAMES[stage]}の保存期間（1〜360日）`,value:String(current),
        validateInput:s=>/^\d+$/.test(s)&&Number(s)>=1&&Number(s)<=360?null:'1〜360の整数を入力してください'});
      if(input===undefined)return;
      value=Number(input);
    }
    if(!Number.isInteger(value)||value<1||value>360)return;
    await setRetentionDays(context,stage,value);
    await setEnabled(context,stage,true);
    emitter.fire();
    await changedHandler();
    vscode.window.setStatusBarMessage(`Coding Tools: ${STAGE_NAMES[stage]}の保存期間を${value}日に変更`,4000);
  });
  async function chooseSlotDisplay(n){
    const choices=SLOT_DISPLAY_OPTIONS.map(option=>({
      label:option.label,description:option.description,part:option.part,
      picked:enabled(context,slotDisplayKey(n,option.part))
    }));
    const selected=await vscode.window.showQuickPick(choices,{
      title:`コピー枠${n}の表示`,canPickMany:true,
      placeHolder:'表示する項目にチェックして確定（非表示でもキー操作は有効）'
    });
    if(!selected)return;
    const selectedParts=new Set(selected.map(item=>item.part));
    for(const option of SLOT_DISPLAY_OPTIONS)await setEnabled(context,slotDisplayKey(n,option.part),selectedParts.has(option.part));
    emitter.fire();
    await displayChangedHandler();
  }
  const open=vscode.commands.registerCommand('codingTools.openSettings',async()=>{
    const items=[
      ...[1,2].map(n=>({label:`コピー枠${n}の表示`,description:'番号・コピー／貼り付け・キー・保存内容',run:()=>chooseSlotDisplay(n)})),
      {label:'CSS適用前の最終確認',description:enabled(context,'confirm')?'ON':'OFF',run:()=>vscode.commands.executeCommand('codingTools.toggleSetting','confirm')},
      ...Object.keys(DEFAULT_DAYS).map(stage=>({label:`${STAGE_NAMES[stage]}の保存期間`,description:enabled(context,stage)?`${retentionDays(context,stage)}日`:'OFF（記録しない）',run:()=>vscode.commands.executeCommand('codingTools.chooseRetentionDays',stage)})),
      {label:'CSS配置ルールの設定',run:()=>vscode.commands.executeCommand('workbench.action.openSettings','@ext:elliotveyne.coding-tools')},
      {label:'キーボードショートカット一覧',run:()=>vscode.commands.executeCommand('codingTools.openKeyboardShortcuts')},
      {label:'履歴を開く',run:()=>vscode.commands.executeCommand('codingTools.showHistoryPanel')},
      {label:'GIFで使い方を確認',run:()=>vscode.commands.executeCommand('codingTools.openVisualGuide')},
      {label:'開発方針・データの扱い',run:()=>vscode.commands.executeCommand('markdown.showPreview',vscode.Uri.file(path.join(context.extensionPath,'docs','VISION.md')))},
      {label:'サイドバーで設定を開く',run:async()=>{await vscode.commands.executeCommand('workbench.view.explorer');await vscode.commands.executeCommand('codingTools.settingsView.focus');}}
    ];
    const selected=await vscode.window.showQuickPick(items,{title:'Coding Tools 設定',placeHolder:'変更する設定や開く項目を選択',matchOnDescription:true});
    if(selected)await selected.run();
  });
  const status=vscode.window.createStatusBarItem('codingTools.settings',vscode.StatusBarAlignment.Right,100);
  status.name='Coding Tools 設定';
  status.text='$(settings-gear) Coding Tools';
  status.tooltip='コピー枠の表示、履歴、CSS、キーなどの設定を開く';
  status.command='codingTools.openSettings';
  status.show();
  const shortcuts=vscode.commands.registerCommand('codingTools.openKeyboardShortcuts',async()=>{
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
    vscode.window.showInformationMessage('ショートカット一覧の検索欄に「Coding Tools」を入力すると、各コマンドを設定できます。');
  });
  context.subscriptions.push(view,emitter,toggle,choose,open,shortcuts,status);
}
module.exports={OPTIONS,SLOT_DISPLAY_OPTIONS,slotDisplayKey,DEFAULT_DAYS,MIN_DAYS,MAX_DAYS,enabled,setEnabled,retentionDays,setRetentionDays,registerSettingsUI};
