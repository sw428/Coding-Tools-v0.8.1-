 'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const settings=require('../src/settings');
const history=require('../src/history');
async function run(){
  const values=new Map();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ct-v07-'));
  const context={globalState:{get:(key,f)=>values.has(key)?values.get(key):f,update:async(key,value)=>{values.set(key,value)}},globalStorageUri:{fsPath:root}};
  try{
    assert.deepEqual(['operation','save','push'].map(s=>settings.retentionDays(context,s)),[30,90,90]);
    for(const opt of settings.OPTIONS)assert.equal(settings.enabled(context,opt.key),true);
    for(const stage of ['operation','save','push']){
      await settings.setRetentionDays(context,stage,360);
      assert.equal(settings.retentionDays(context,stage),360);
      await settings.setRetentionDays(context,stage,1);
      assert.equal(settings.retentionDays(context,stage),1);
      for(const bad of [0,361,2.5,NaN])await assert.rejects(settings.setRetentionDays(context,stage,bad),RangeError);
    }
    const uri={fsPath:path.join(root,'style.css'),toString(){return pathToFileURL(this.fsPath).href}};
    const now=new Date('2026-10-25T10:00:00Z');
    const recent=new Date('2026-10-23T10:00:00Z');
    for(const stage of ['operation','save','push']){
      await settings.setRetentionDays(context,stage,360);
      await history.record(context,{stage,before:'a',after:'b',action:'test',sourceUri:uri,now:recent});
    }
    assert.equal((await history.prune(context,now)),0);
    assert.equal((await history.entries(context)).length,3);
    await settings.setRetentionDays(context,'operation',1);
    await history.prune(context,now);
    assert.deepEqual((await history.entries(context)).map(x=>x.stage).sort(),['push','save']);
    const pkg=JSON.parse(await fs.readFile(path.join(__dirname,'..','package.json'),'utf8'));
    for(const id of ['codingTools.openKeyboardShortcuts','codingTools.openVisualGuide','codingTools.chooseRetentionDays']){
      assert.ok(pkg.contributes.commands.some(x=>x.command===id),`missing command ${id}`);
    }
    assert.ok(/^0\.8\./.test(pkg.version),'v0.8.x version');
    const docs=await fs.readdir(path.join(__dirname,'..','docs'));
    for(const name of ['01-class-navigation.svg','02-four-slots.svg','03-smart-paste.svg','04-css-placement.svg','05-confirmation.svg','06-history.svg','07-internal-settings.svg','08-shortcuts.svg','09-cross-jump.svg'])assert.ok(docs.includes(name),`Missing guide diagram: ${name}`);
    assert.ok(docs.includes('module-overview.svg'));
    const test_svg=await fs.readFile(path.join(__dirname,'..','docs','07-internal-settings.svg'),'utf8');
    assert.match(test_svg,/@keyframes/);
    assert.match(test_svg,/360/);
    const source=await fs.readFile(path.join(__dirname,'..','src','settings.js'),'utf8');
    assert.match(source,/globalState/);
    assert.doesNotMatch(source,/getConfiguration\(/);
    const repoRoot=path.resolve(__dirname,'..');
    let settingsProvider;
    let nextPick;
    let nextInput;
    let menuItems;
    let changedCount=0;
    let displayChangedCount=0;
    const pickQueue=[];
    const executed=[];
    const statuses=[];
    const handlers=new Map();
    const disposable={dispose(){}};
    const vscode={
      StatusBarAlignment:{Right:2},
      EventEmitter:class {constructor(){this.event=()=>disposable;}fire(){}dispose(){}},
      TreeItem:class {constructor(label){this.label=label;}},
      TreeItemCollapsibleState:{None:0}, ThemeIcon:class {constructor(id){this.id=id;}},
      Uri:{file:fsPath=>({fsPath})},
      window:{createTreeView(_id,{treeDataProvider}){settingsProvider=treeDataProvider;return disposable;},
        createStatusBarItem(id,alignment,priority){const item={id,alignment,priority,visible:false,show(){this.visible=true;},dispose(){}};statuses.push(item);return item;},
        async showQuickPick(items,options){
          menuItems=items;
          if(pickQueue.length){const selector=pickQueue.shift();return typeof selector==='function'?selector(items,options):selector===null?undefined:items.find(item=>item.label===selector);}
          return items.find(item=>item.value===nextPick);
        },
        async showInputBox(){return nextInput;}, setStatusBarMessage(){}},
      commands:{registerCommand(id,handler){handlers.set(id,handler);return disposable;},async executeCommand(id,...args){executed.push([id,...args]);if(handlers.has(id))return handlers.get(id)(...args);}}
    };
    settings.registerSettingsUI(vscode,{...context,extensionPath:repoRoot,subscriptions:[]},async()=>{changedCount++;},async()=>{displayChangedCount++;});
    const rows=settingsProvider.getChildren();
    assert.deepEqual(rows.filter(item=>item.kind==='toggle').map(item=>item.key),[]);
    assert.equal(rows.filter(item=>item.kind==='days').length,3);
    const chooseRetention=handlers.get('codingTools.chooseRetentionDays');
    for(const stage of ['operation','save','push']){
      const savedDays=settings.retentionDays(context,stage);
      const prunesBefore=changedCount;
      const historyBefore=await history.entries(context);
      nextPick='off';
      await chooseRetention(stage);
      assert.equal(menuItems[0].value,'off');
      assert.equal(settings.enabled(context,stage),false);
      assert.equal(settings.retentionDays(context,stage),savedDays);
      assert.equal(changedCount,prunesBefore,'OFF must not trigger history cleanup');
      assert.deepEqual(await history.entries(context),historyBefore,'OFF must not delete saved history');
      const row=rows.find(item=>item.kind==='days'&&item.stage===stage);
      assert.equal(settingsProvider.getTreeItem(row).description,'OFF（記録しない）');
      nextPick=undefined;
      const offState=[...values];
      await chooseRetention(stage);
      assert.match(menuItems[0].label,/（現在）/);
      assert.deepEqual([...values],offState,'Cancelling must preserve the OFF state and saved period');
      nextPick=180;
      await chooseRetention(stage);
      assert.equal(settings.enabled(context,stage),true);
      assert.equal(settings.retentionDays(context,stage),180);
      assert.equal(changedCount,prunesBefore+1);
      assert.match(settingsProvider.getTreeItem(row).description,/180日/);
      nextPick='off'; await chooseRetention(stage);
      nextPick='custom'; nextInput='120'; await chooseRetention(stage);
      assert.equal(settings.enabled(context,stage),true);
      assert.equal(settings.retentionDays(context,stage),120);
      nextPick='off'; await chooseRetention(stage);
      for(const invalid of [undefined,'','0','361','1.5']){
        nextPick='custom'; nextInput=invalid;
        const beforeCancel=[...values];
        await chooseRetention(stage);
        assert.deepEqual([...values],beforeCancel,'Invalid or cancelled custom days must not enable recording');
      }
    }
    const about=settingsProvider.getChildren().find(item=>item.kind==='about');
    assert.ok(about,'Settings must provide an entry for the separate project information');
    const aboutItem=settingsProvider.getTreeItem(about);
    assert.equal(aboutItem.command.command,'markdown.showPreview');
    assert.equal(aboutItem.command.arguments[0].fsPath,path.join(repoRoot,'docs','VISION.md'));
    const vision=await fs.readFile(aboutItem.command.arguments[0].fsPath,'utf8');
    const documentLinks=[...vision.matchAll(/\]\(([^)]+\.md)\)/g)];
    assert.ok(documentLinks.some(([,link])=>link==='DATA_POLICY.md'));
    assert.ok(documentLinks.some(([,link])=>link==='ROADMAP.md'));
    for(const [,link] of documentLinks)await fs.access(path.resolve(repoRoot,'docs',link));
    const hub=statuses.find(item=>item.id==='codingTools.settings');
    assert.equal(hub.text,'$(settings-gear) Coding Tools');
    assert.equal(hub.command,'codingTools.openSettings');
    assert.ok(hub.visible);
    const prunesBeforeDisplay=changedCount;
    for(const n of [1,2]) {
      const group=rows.find(item=>item.kind==='slotGroup'&&item.n===n);
      assert.ok(group);
      const options=settingsProvider.getChildren(group);
      assert.equal(options.length,4);
      const row=options.find(item=>item.key===settings.slotDisplayKey(n,'number'));
      assert.equal(settingsProvider.getTreeItem(row).description,'ON');
      await handlers.get('codingTools.toggleSetting')(row.key);
      assert.equal(settings.enabled(context,row.key),false);
      assert.equal(settingsProvider.getTreeItem(row).description,'OFF');
      assert.equal(settings.enabled(context,settings.slotDisplayKey(n===1?2:1,'content')),true);
    }
    assert.equal(displayChangedCount,2);
    assert.equal(changedCount,prunesBeforeDisplay,'Display settings must not prune history');
    const openSettings=handlers.get('codingTools.openSettings');
    const beforeCancel=[...values];
    pickQueue.push(null);await openSettings();
    assert.deepEqual([...values],beforeCancel);
    assert.ok(menuItems.some(item=>item.label==='コピー枠1の表示'));
    assert.ok(menuItems.some(item=>item.label==='操作履歴の保存期間'));
    assert.ok(menuItems.some(item=>item.label==='CSS配置ルールの設定'));
    assert.ok(menuItems.some(item=>item.label==='キーボードショートカット一覧'));
    assert.ok(!menuItems.some(item=>item.label==='履歴を開く'));
    pickQueue.push('コピー枠1の表示',(items,options)=>{
      assert.equal(options.canPickMany,true);
      assert.equal(items.find(item=>item.part==='number').picked,false);
      return items.filter(item=>['number','content'].includes(item.part));
    });
    await openSettings();
    assert.deepEqual(settings.SLOT_DISPLAY_OPTIONS.map(option=>settings.enabled(context,settings.slotDisplayKey(1,option.part))),[true,false,false,true]);
    assert.equal(settings.enabled(context,settings.slotDisplayKey(2,'content')),true);
    assert.equal(displayChangedCount,3);
    const beforePickerCancel=[...values];
    pickQueue.push('コピー枠1の表示',null);await openSettings();
    assert.deepEqual([...values],beforePickerCancel,'Cancel must preserve all display choices');
    for(const n of [1,2]){pickQueue.push(`コピー枠${n}の表示`,()=>[]);await openSettings();}
    assert.ok([1,2].every(n=>settings.SLOT_DISPLAY_OPTIONS.every(option=>!settings.enabled(context,settings.slotDisplayKey(n,option.part)))));
    assert.ok(hub.visible,'Settings remain visible with both slots hidden');
    pickQueue.push('コピー枠1の表示',items=>items);await openSettings();
    assert.ok(settings.SLOT_DISPLAY_OPTIONS.every(option=>settings.enabled(context,settings.slotDisplayKey(1,option.part))));
    for(const [label,command] of [['CSS配置ルールの設定','workbench.action.openSettings'],['GIFで使い方を確認','codingTools.openVisualGuide'],['サイドバーで設定を開く','codingTools.settingsView.focus']]){
      pickQueue.push(label);await openSettings();
      assert.equal(executed.at(-1)[0],command);
    }
    assert.equal(changedCount,prunesBeforeDisplay);
    assert.equal(pickQueue.length,0);
    console.log('v07-tests: passed');
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
