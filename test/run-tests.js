'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const history = require('../src/history');
const settings = require('../src/settings');
const { findCssClasses, nextClass, findHtmlClasses, htmlClassAtCursor } = require('../src/selectors');

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.then(() => console.log('✓', name));
    console.log('✓', name);
    return Promise.resolve();
  } catch (err) {
    console.error('✗', name);
    throw err;
  }
}

class Position {
  constructor(line, character) { this.line = line; this.character = character; }
}
class Selection {
  constructor(anchor, active) { this.anchor = anchor; this.active = active; }
  get isEmpty() { return this.anchor.line === this.active.line && this.anchor.character === this.active.character; }
  get start() {return this.anchor.line<this.active.line||(this.anchor.line===this.active.line&&this.anchor.character<=this.active.character)?this.anchor:this.active;}
  get end() {return this.start===this.anchor?this.active:this.anchor;}
}
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}
function makeDocument(input, languageId='css') {
  return {
    languageId, eol: 1, text: input, uri: {path:'/example/style.css', toString() {return this.path;}},
    getText(selection) {
      if (!selection) return this.text;
      return this.text.slice(this.offsetAt(selection.anchor), this.offsetAt(selection.active));
    },
    offsetAt(pos) {
      const lines = this.text.split('\n');
      return lines.slice(0, pos.line).reduce((sum, str) => sum + str.length + 1, 0) + pos.character;
    },
    positionAt(offset) {
      const upto = this.text.slice(0, offset).split('\n');
      return new Position(upto.length - 1, upto.at(-1).length);
    },
    lineAt(line) { return {text: this.text.split('\n')[line]}; },
  };
}
function makeEditor(text, language = 'css') {
  const document = makeDocument(text, language);
  const p = new Position(0,0);
  const editor = {
    document,
    selections: [new Selection(p,p)],
    get selection() { return this.selections[0]; },
    set selection(sel) { this.selections = [sel]; },
    async edit(fn) {
      const changes = [];
      fn({replace(sel, newText) {
        changes.push({start: document.offsetAt(sel.anchor), end: document.offsetAt(sel.active), value:newText});
      }});
      for (const c of changes.sort((a,b) => b.start-a.start)) {
        document.text = document.text.slice(0,c.start)+c.value+document.text.slice(c.end);
      }
      return true;
    },
    revealRange() {},
  };
  return editor;
}

(async () => {
  await test('detects multiple class selectors, including element.class', () => {
    const actual = findCssClasses('a.button, .card:hover, #main.item {color: red;}').map(x=>x.name);
    assert.deepEqual(actual, ['button', 'card', 'item']);
  });
  await test('detects selectors within @media and CSS nesting', () => {
    assert.deepEqual(findCssClasses('@media (min-width: 800px) { .teacher { & .child { color: red; } } }').map(x=>x.name), ['teacher','child']);
  });
  await test('ignores comments, strings, @supports selector function', () => {
    const css = '/* .ghost {} */ .real { content: ".notreal"; background: url(img.png); } @supports selector(.unsupported) { .valid {} }';
    assert.deepEqual(findCssClasses(css).map(x=>x.name), ['real','valid']);
  });
  await test('navigation wraps and skips current class when inside it', () => {
    const css='.one{} .two{} .three{}';
    const matches=findCssClasses(css);
    assert.equal(nextClass(matches, 2, +1).name,'two');
    assert.equal(nextClass(matches, 2, -1).name,'three');
    assert.equal(nextClass(matches, 100, +1).name,'one');
  });
  await test('HTML class tokens are chosen by cursor', () => {
    assert.equal(htmlClassAtCursor('<div class="first second">', 20),'second');
    assert.equal(htmlClassAtCursor('<div class="first second">', 0),null);
  });
  await test('HTML navigation recognizes individual class tokens across tags and lines', () => {
    const html = '<div class="card active">\n  <p id="text" class="title\n   emphasized"></p>\n</div>';
    assert.deepEqual(findHtmlClasses(html).map((x) => x.name), ['card','active','title','emphasized']);
    assert.equal(nextClass(findHtmlClasses(html), html.indexOf('card') + 1, 1).name, 'active');
    assert.equal(nextClass(findHtmlClasses(html), html.indexOf('active') + 1, 1).name, 'title');
    assert.equal(nextClass(findHtmlClasses(html), html.indexOf('emphasized') + 1, 1).name, 'card');
    assert.equal(nextClass(findHtmlClasses(html), html.indexOf('title') + 1, -1).name, 'active');
    assert.equal(nextClass(findHtmlClasses(html), html.indexOf('card'), -1).name, 'emphasized');
  });
  await test('HTML parser ignores comments, script/style content, and other attributes', () => {
    const html = `<!-- <div class="comment"> -->\n<script>const s='<div class="script">'</script>\n<style>.x::before { content: '<a class="style">'; }</style>\n<div data-class="data" title='class="title"' class='real chosen'>`;
    assert.deepEqual(findHtmlClasses(html).map((x) => x.name), ['real', 'chosen']);
  });
  await test('HTML navigation supports multiple attributes, quotes, and JSX className', () => {
    const html = `<span class = 'left right' id="A"><button className="rounded primary">`;
    assert.deepEqual(findHtmlClasses(html).map((x) => x.name), ['left','right','rounded','primary']);
  });

  await test('ID scanning ignores color values, comments and template values', () => {
    const {findCssIds,findHtmlIds}=require('../src/selectors');
    assert.deepEqual(findCssIds('/* #ghost {} */ #main[href=#fragment], .item#active { color: #abcdef; content: "#text"; }').map(x=>x.name),['main','active']);
    assert.deepEqual(findHtmlIds('<p id="main" class="other"></p><!-- <p id="ghost"> --><script><p id="script"></script><p id={dynamic}></p>').map(x=>x.name),['main']);
  });

  const registered = new Map();
  const store = new Map([['coding-tools.slot.2', '前回の保存']]);
  const statusItems = [];
  let quickPickItems = [];
  let pickAction = 'paste';
  const warnings=[];
  const confirmationPanels=[];
  const confirmationActions=[];
  const treeProviders=new Map();
  let lastOpenedDocument=null;
  const fallbackCommands=[];
  const contextKeys=new Map();
  // Legacy editing cases exercise the optional ungrouped mode. The default
  // comment-group workflow is tested separately below.
  const workflowConfig=new Map([['requireCommentGroup',false],['automaticPaste',false]]);
  let clipboard='normal native clipboard';
  function slotText(key) { const value = store.get(key); return typeof value === 'object' && value !== null ? value.text : value; }
  let clipboardWrites=0, lastCopiedSlotText;
  let focusedInput=null;
  const vscodeMock = {
    commands: {
      registerCommand(name, cb) {
        const copy=name.match(/^codingTools\.copy([12])$/);
        registered.set(name, copy ? async (...args) => {
          const previous=clipboard, writes=clipboardWrites;
          const result=await cb(...args);
          assert.equal(clipboard,previous,'Slot copy must preserve ordinary clipboard text');
          assert.equal(clipboardWrites,writes,'Slot copy must not write to the OS clipboard');
          lastCopiedSlotText=slotText('coding-tools.slot.'+copy[1]);
          return result;
        } : cb);
        return {dispose() {}};
      },
      async executeCommand(command,...args) {
        fallbackCommands.push(command);
        if(registered.has(command)) return registered.get(command)(...args);
        if (command === 'actions.find' || command === 'workbench.action.focusActiveEditorGroup') return;
        if (command === 'setContext') {contextKeys.set(args[0],args[1]);return;}
        if(command==='workbench.action.findInFiles'||command==='editor.actions.findWithArgs'){
          if(focusedInput)focusedInput.text=command==='workbench.action.findInFiles'?args[0].query:args[0].searchString;
          return;
        }
        if (command === 'workbench.view.explorer' || command === 'codingTools.history.focus' || command === 'vscode.diff') return;
        const editor=vscodeMock.window.activeTextEditor;
        if (command === 'editor.action.clipboardCopyAction') {
          clipboard=editor.selection.isEmpty ? editor.document.lineAt(editor.selection.active.line).text+'\n' : editor.document.getText(editor.selection);
        } else if (command === 'editor.action.clipboardPasteAction') {
          if (focusedInput) focusedInput.text=clipboard;
          else await editor.edit((builder) => builder.replace(editor.selection, clipboard));
        } else throw new Error(`Unknown mock command: ${command}`);
      },
    },
    ViewColumn: {Active: 1},
    EventEmitter: class {constructor(){this.event=()=>{};}fire(){}dispose(){}},
    ThemeIcon: class {constructor(id){this.id=id;}},
    StatusBarAlignment:{Right:2},
    TreeItemCollapsibleState:{None:0,Collapsed:1},
    TreeItem: class {constructor(label,collapsibleState){this.label=label;this.collapsibleState=collapsibleState;}},
    Uri:{from(o){const u=o.scheme+':'+o.path;return {scheme:o.scheme,path:o.path,toString(){return u;}};},file(p){return {fsPath:p,path:p,toString(){return 'file://'+p;}};}, parse(u){return {path:u.replace('file://',''), toString(){return u;}};}},
    languages:{async setTextDocumentLanguage(doc){return doc;}},
    window: {
      activeTextEditor: null,
      createWebviewPanel(type, title, column, options) {
        const view = {html:'', onDidReceiveMessage(cb) {this.message = cb;}};
        const panel = {webview:view, disposed:false, dispose() { if(!this.disposed) {this.disposed=true; if(this.didDispose)this.didDispose();} }, onDidDispose(cb) {this.didDispose=cb;}};
        confirmationPanels.push(panel);
        // UI simulation: accept the first (recommended) ON option after render.
        queueMicrotask(() => {
          if(panel.disposed)return;
          let chosen=confirmationActions.length?confirmationActions.shift():undefined;
          if(typeof chosen==='function')chosen=chosen(view.html);
          if(chosen==='cancel')return view.message({type:'cancel'});
          const initial=Number(view.html.match(/class="item on[^"]*"[^>]*data-id="(\d+)"/)?.[1]||0);
          view.message({type:'confirm',index:Number.isInteger(chosen)?chosen:initial});
        });
        return panel;
      },
      showInformationMessage(message,options) { warnings.push(message); return undefined; },
      showWarningMessage(message) { warnings.push(message); },
      setStatusBarMessage() {},
      createStatusBarItem(id,alignment,priority){const item={id,alignment,priority,visible:false,disposed:false,show(){this.visible=true;},hide(){this.visible=false;},dispose(){this.disposed=true;}};statusItems.push(item);return item;},
      onDidChangeTextEditorSelection(){return {dispose(){}};},
      onDidChangeActiveTextEditor(){return {dispose(){}};},
      registerTreeDataProvider(id,provider){treeProviders.set(id,provider);return {dispose(){}};},
      createTreeView(id,options){treeProviders.set(id,options.treeDataProvider);return {dispose(){}};},
      async showQuickPick(items) { quickPickItems=items; return items.find(item=>item.action===pickAction) || (pickAction === 'cancel' ? undefined : items[Math.min(2,items.length-1)]); },
      async showTextDocument(document) {lastOpenedDocument=document;const editor=this.activeTextEditor;if(editor.document!==document) {this.activeTextEditor=makeEditor(document.getText(),document.languageId);this.activeTextEditor.document.uri=document.uri;}return this.activeTextEditor;}
    },
    workspace: {
      registerTextDocumentContentProvider(){return {dispose(){}};},
      onDidChangeTextDocument(){return {dispose(){}};},
      async openTextDocument(uri){return makeDocument(fs.readFileSync(uri.fsPath || uri.path, 'utf8'),'diff');},
      getConfiguration() { return {get(name, fallback) {return workflowConfig.has(name)?workflowConfig.get(name):fallback;}}; },
      async findFiles() {return []},
      async applyEdit(change) { for(const op of change.ops) { const doc=vscodeMock.window.activeTextEditor.document; const idx=doc.offsetAt(op.position); doc.text=doc.text.slice(0,idx)+op.value+doc.text.slice(idx); }return true; }
    },
    WorkspaceEdit: class {constructor() {this.ops=[];}insert(uri,position,value){this.ops.push({uri,position,value});}},
    env: {clipboard: { async writeText(text) { clipboardWrites++; clipboard=text; }, async readText() {return clipboard;} }},
    EndOfLine: {LF:1, CRLF:2},
    Position, Selection, Range,
    TextEditorRevealType: {InCenterIfOutsideViewport:0}
  };
  const originalLoad=Module._load;
  Module._load = function(request,parent,isMain) {
    if(request === 'vscode') return vscodeMock;
    return originalLoad.call(this,request,parent,isMain);
  };
  let extension;
  try {extension=require('../src/extension');} finally {Module._load=originalLoad;}
  const context={globalStorageUri:{fsPath:fs.mkdtempSync(path.join(os.tmpdir(),'coding-tools-extension-test-'))},subscriptions:[],globalState:{get(k) {return store.get(k);}, async update(k,v) {store.set(k,v);}}};
  extension.activate(context);

  await test('status bar restores both slots and removed commands are unavailable', () => {
    const slots=statusItems.filter(item=>typeof item.id==='string'&&item.id.startsWith('codingTools.slot'));
    assert.equal(slots.length,8);
    assert.equal(statusItems.find(item=>item.id==='codingTools.slot1').text,'(1)');
    assert.equal(statusItems.find(item=>item.id==='codingTools.slot1.content').text,'/ 空');
    assert.equal(statusItems.find(item=>item.id==='codingTools.slot2.content').text,'/ 前回の保存');
    assert.ok(slots.every(item=>item.visible));
    assert.ok(slots.every((item,i)=>!i||slots[i-1].priority>item.priority));
    const hub=statusItems.find(item=>item.id==='codingTools.settings');
    assert.equal(hub.text,'$(settings-gear) Coding Tools');
    assert.equal(hub.command,'codingTools.openSettings');
    assert.ok(hub.visible);
    assert.ok(hub.priority < 100, 'Coding Tools must appear to the right of Go Live (priority 100)');
    assert.ok(slots.every(item=>item.priority < hub.priority), 'Keep slots to the right of the settings entry');
    assert.equal(statusItems.find(item=>item.id==='codingTools.slot1.copy').command,'codingTools.copy1');
    assert.equal(statusItems.find(item=>item.id==='codingTools.slot1.paste').command,'codingTools.paste1');
    for(const id of ['extendNextClass','extendPreviousClass','chooseCopySlot','choosePasteSlot','copyClassName','smartCopy','smartPaste'])assert.ok(!registered.has('codingTools.'+id));
    const pkg=require('../package.json');
    for(const id of ['copy1','paste1','copy2','paste2']) {
      assert.ok(pkg.contributes.menus.commandPalette.some(item=>item.command==='codingTools.'+id&&item.when==='false'));
      assert.ok(pkg.contributes.keybindings.some(item=>item.command==='codingTools.'+id));
    }
  });
  await test('registers two numbered copy/paste slots and two cross-file navigation commands', () => {
    for(let i=1;i<=2;i++) {assert.ok(registered.has(`codingTools.copy${i}`));assert.ok(registered.has(`codingTools.paste${i}`));}
    assert.ok(registered.has('codingTools.jumpToCss'));
    assert.ok(registered.has('codingTools.jumpToHtml'));
    assert.ok(!registered.has('codingTools.copy3'));
    assert.ok(!registered.has('codingTools.paste4'));
    assert.ok(!registered.has('codingTools.openLatestDiff'));
    assert.ok(!registered.has('codingTools.openHistory'));
    assert.ok(!registered.has('codingTools.showHistoryPanel'));
  });
  await test('copies selected text into independent numbered slots', async () => {
    const editor=makeEditor('alpha beta gamma','html');
    vscodeMock.window.activeTextEditor=editor;
    for(let i=1;i<=2;i++) {
      editor.selection=new Selection(new Position(0,(i-1)*2),new Position(0,(i-1)*2+2));
      await registered.get(`codingTools.copy${i}`)();
    }
    assert.deepEqual([1,2].map(n=>slotText(`coding-tools.slot.${n}`)), ['al','ph']);
    assert.equal(lastCopiedSlotText,'ph');
  });
  await test('pastes slot 2 even if OS clipboard changes, and supports undo edit', async () => {
    const editor=makeEditor('hello','html');
    editor.selection=new Selection(new Position(0,1),new Position(0,4));
    vscodeMock.window.activeTextEditor=editor;
    clipboard='other';
    await registered.get('codingTools.paste2')();
    assert.equal(editor.document.text, 'hpho');
    const logs=await history.entries(context);
    assert.ok(logs.some(x=>x.action==='保存枠2の貼り付け'));
  });
  await test('Explorer history opens a selected entry directly from its row', async () => {
    const provider=treeProviders.get('codingTools.history');
    assert.ok(provider);
    const months=await provider.getChildren();
    assert.ok(months.length>=1);
    const stage=months.find(x=>x.stage==='operation');
    const monthNodes=await provider.getChildren(stage);
    assert.ok(monthNodes.length>=1);
    const logs=await provider.getChildren(monthNodes[0]);
    assert.ok(logs.length>=1);
    const item=provider.getTreeItem(logs[0]);
    assert.equal(item.command.command,'codingTools.openDiff');
    await registered.get(item.command.command)(...item.command.arguments);
    assert.match(lastOpenedDocument.getText(), /^--- /);
  });
  await test('when no selection, copies full current line including newline' , async () => {
    const editor=makeEditor('one\ntwo','css');
    editor.selection=new Selection(new Position(1,1), new Position(1,1));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy2')();
    assert.equal(slotText('coding-tools.slot.2'),'two\n');
  });
  await test('CSS next/previous moves to exact selector position', () => {
    const editor=makeEditor('.a { color: red; }\n@media screen {.b:hover { }}', 'css');
    vscodeMock.window.activeTextEditor=editor;
    registered.get('codingTools.nextClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), 34);
    registered.get('codingTools.previousClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), 0);
  });
  await test('HTML next/previous jumps token by token across class attributes and wraps', () => {
    const html='<div class="card active">\n<p class="title emphasized"></p>';
    const editor=makeEditor(html,'html');
    vscodeMock.window.activeTextEditor=editor;
    const moves=['card','active','title','emphasized','card'];
    for (const name of moves) {
      registered.get('codingTools.nextClass')();
      assert.equal(editor.document.offsetAt(editor.selection.start), html.indexOf(name));
    }
    registered.get('codingTools.previousClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), html.indexOf('emphasized'));
    registered.get('codingTools.previousClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), html.indexOf('title'));
  });
  await test('HTML class navigation skips comments and unrelated quoted attributes', () => {
    const html='<!-- <p class="skip"> -->\n<p data-label="wrong" class="actual next">';
    const editor=makeEditor(html,'html');
    vscodeMock.window.activeTextEditor=editor;
    registered.get('codingTools.nextClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), html.indexOf('actual'));
    registered.get('codingTools.nextClass')();
    assert.equal(editor.document.offsetAt(editor.selection.start), html.indexOf('next'));
  });
  await test('HTML class name copy works for attributes spanning multiple lines', async () => {
    const html='<div class="first\n   second">';
    const editor=makeEditor(html,'html');
    editor.selection=new Selection(new Position(1,5),new Position(1,5));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.second');
  });
  await test('class slot stores a marked name without replacing the ordinary clipboard', async () => {
    const editor=makeEditor('<div class="card highlight">', 'html');
    editor.selection=new Selection(new Position(0,17),new Position(0,17));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.highlight');
  });

  await test('status bar slot 2 pastes without a slot-number picker', async () => {
    const editor=makeEditor('','css');
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.showSlot2')();
    assert.equal(editor.document.text,'two\n');
  });
  await test('does not paste from unset slot', async () => {
    const editor=makeEditor('untouched');
    vscodeMock.window.activeTextEditor=editor;
    store.delete('coding-tools.slot.1');
    await registered.get('codingTools.paste1')();
    assert.equal(editor.document.text,'untouched');
    assert.match(warnings.at(-1), /保存枠1は空/);
  });
  await test('HTML class slot copy retains the marker and CSS paste uses one marker', async () => {
    const html='<div class="card active">';
    const editor=makeEditor(html,'html');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(editor.document.positionAt(html.indexOf('active')),editor.document.positionAt(html.indexOf('active')+6));
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.active');
    const cssEditor=makeEditor('','css');
    vscodeMock.window.activeTextEditor=cssEditor;
    await registered.get('codingTools.paste1')();
    assert.equal(cssEditor.document.text,'.active {\n}\n');
  });
  await test('CSS .class slot copy retains its dot and paste avoids a duplicate dot', async () => {
    const css='.card:hover { color: red; }';
    const editor=makeEditor(css,'css');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(editor.document.positionAt(0), editor.document.positionAt(5));
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.card');
    const dest=makeEditor('.','css');
    dest.selection=new Selection(new Position(0,1),new Position(0,1));
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.card'); // do not add a second dot
  });
  await test('slot copy handles a CSS class under the caret and pastes with dot', async () => {
    const css='.teacher {display:block;}';
    const editor=makeEditor(css,'css');
    editor.selection=new Selection(new Position(0,3),new Position(0,3));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.teacher');
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.teacher {\n}\n');
  });
  await test('numbered slot class copy from CSS pastes with dot in CSS and without dot in HTML', async () => {
    const editor=makeEditor('.subject {}', 'css');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(new Position(0,0),new Position(0,8));
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.subject');
    assert.equal(slotText('coding-tools.slot.1'),'.subject');
    assert.equal(store.get('coding-tools.class-slot.1'), true);
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.subject {\n}\n');
    const htmlDest=makeEditor('<div class="">', 'html');
    htmlDest.selection=new Selection(new Position(0,12),new Position(0,12));
    vscodeMock.window.activeTextEditor=htmlDest;
    await registered.get('codingTools.paste1')();
    assert.equal(htmlDest.document.text,'<div class="subject">');
  });
  await test('numbered slot class copy from HTML pastes with dot only in CSS', async () => {
    const html='<div class="card active">';
    const editor=makeEditor(html,'html');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(editor.document.positionAt(html.indexOf('card')),editor.document.positionAt(html.indexOf('card')+4));
    await registered.get('codingTools.copy2')();
    assert.equal(lastCopiedSlotText,'.card');
    const cssDest=makeEditor('','css');
    vscodeMock.window.activeTextEditor=cssDest;
    await registered.get('codingTools.paste2')();
    assert.equal(cssDest.document.text,'.card {\n}\n');
  });
  await test('ordinary CSS snippet copy and paste remains unchanged without class conversion', async () => {
    const editor=makeEditor('.card {color: red;}', 'css');
    editor.selection=new Selection(new Position(0,0),new Position(0,19));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.card {color: red;}');
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.card {color: red;}');
  });
  await test('slot class paste remains independent from later OS clipboard changes', async () => {
    const editor=makeEditor('<p class="new">','html');
    editor.selection=new Selection(new Position(0,10),new Position(0,10));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    clipboard='hello world';
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.new {\n}\n');
  });
  await test('ordinary copy after class copy resets the class flag', async () => {
    const editor=makeEditor('.item {}', 'css');
    editor.selection=new Selection(new Position(0,0),new Position(0,5));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy1')();
    editor.selection=new Selection(new Position(0,0),new Position(0,8));
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.item {}');
    assert.equal(store.get('coding-tools.lastClassClipboard'),null);
  });
  await test('numbered slot non-class contents remain unmodified across CSS paste', async () => {
    const src=makeEditor('.card { color: blue; }', 'css');
    src.selection=new Selection(new Position(0,0),new Position(0,22));
    vscodeMock.window.activeTextEditor=src;
    await registered.get('codingTools.copy2')();
    assert.equal(store.get('coding-tools.class-slot.2'),false);
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste2')();
    assert.equal(dest.document.text,'.card { color: blue; }');
  });
  await test('explicit CSS placement inserts a rule between HTML-adjacent classes', async () => {
    const html='<section class="course"><h2 class="course__title"></h2><p class="course__text"></p><a class="course__link"></a></section>';
    const source=makeEditor(html,'html');
    const start=html.indexOf('course__text');
    source.selection=new Selection(source.document.positionAt(start),source.document.positionAt(start+'course__text'.length));
    vscodeMock.window.activeTextEditor=source;
    await registered.get('codingTools.copy1')();
    assert.equal(lastCopiedSlotText,'.course__text');
    const css=makeEditor('.course {}\n.course__title {}\n.course__link {}','css');
    vscodeMock.window.activeTextEditor=css;
    css.selection=new Selection(css.document.positionAt(css.document.text.length),css.document.positionAt(css.document.text.length));
    await registered.get('codingTools.paste1')();
    const updated=css.document.text;
    assert.ok(updated.indexOf('.course__title')<updated.indexOf('.course__text'));
    assert.ok(updated.indexOf('.course__text')<updated.indexOf('.course__link'));
    assert.match(updated,/\.course__text \{/);
  });
  await test('a unique matching rule navigates without changing source CSS', async () => {
    const html=makeEditor('<div class="card"></div>','html');
    html.selection=new Selection(new Position(0,13),new Position(0,13));
    vscodeMock.window.activeTextEditor=html;
    await registered.get('codingTools.copy1')();
    const css=makeEditor('.title {}\n.card { color: blue; }','css');
    vscodeMock.window.activeTextEditor=css;
    const old=css.document.text;
    css.selection=new Selection(css.document.positionAt(css.document.text.length),css.document.positionAt(css.document.text.length));
    await registered.get('codingTools.paste1')();
    assert.equal(css.document.text,old);
    assert.equal(css.document.offsetAt(css.selection.active),css.document.text.indexOf('.card'));
  });
  await test('copying normal HTML text pastes normally without a CSS conversion', async () => {
    const html=makeEditor('<p style="font-size:24px">title</p>','html');
    html.selection=new Selection(new Position(0,26),new Position(0,31));
    vscodeMock.window.activeTextEditor=html;
    await registered.get('codingTools.copy1')();
    const destination=makeEditor('body {font-family: }','css');
    destination.selection=new Selection(new Position(0,18),new Position(0,18));
    vscodeMock.window.activeTextEditor=destination;
    await registered.get('codingTools.paste1')();
    assert.equal(destination.document.text,'body {font-family:title }');
  });
  await test('ambiguous existing base/media shows conditions rather than auto merging', async () => {
    const editor=makeEditor('.card {}\n@media (min-width: 768px) {.card {}}','css');
    editor.selection=new Selection(new Position(0,0),new Position(0,0));
    vscodeMock.window.activeTextEditor=editor;
    store.set('coding-tools.slot.1','card');
    store.set('coding-tools.class-slot.1',true);
    editor.selection=new Selection(editor.document.positionAt(editor.document.text.length),editor.document.positionAt(editor.document.text.length));
    clipboard='card';
    const original=vscodeMock.window.showQuickPick;
    let options=[];
    vscodeMock.window.showQuickPick=async(items)=>{options=items;return items[0]};
    try {await registered.get('codingTools.paste1')();} finally {vscodeMock.window.showQuickPick=original;}
    const display=confirmationPanels.at(-1).webview.html;
    assert.match(display, /既存ルールへ移動/);
    assert.match(display, /空ルールを追加：@media/);
    assert.match(display, /ArrowRight/);
    assert.match(display, /ArrowLeft/);
    assert.match(display, /ArrowDown/);
    assert.match(display, /ArrowUp/);
    assert.match(display, /Enter/);
    assert.equal(editor.document.text,'.card {}\n@media (min-width: 768px) {.card {}}');
  });
  await test('standalone CSS placement and paste-option commands are removed', () => {
    for(const id of ['codingTools.placeCss','codingTools.pasteOptions']) {
      assert.ok(!registered.has(id));
      assert.ok(!require('../package.json').contributes.commands.some(item=>item.command===id));
      assert.ok(!require('../package.json').contributes.keybindings.some(item=>item.command===id));
    }
  });
  await test('cross-jumps HTML to CSS and CSS back to HTML without edits', async()=>{
    const html='<section class="card active"><p class="card">hello</p></section>';
    const css='.card {display:block;}\n@media(min-width:768px) { .card {display:grid;} }';
    const saved={folders:vscodeMock.workspace.workspaceFolders,findFiles:vscodeMock.workspace.findFiles,
      fs:vscodeMock.workspace.fs,openTextDocument:vscodeMock.workspace.openTextDocument,
      docs:vscodeMock.workspace.textDocuments,relative:vscodeMock.workspace.asRelativePath};
    const savedPick=vscodeMock.window.showQuickPick;
    try {
      const cssUri=vscodeMock.Uri.file('/project/style.css');
      const htmlUri=vscodeMock.Uri.file('/project/index.html');
      vscodeMock.workspace.workspaceFolders=[{uri:vscodeMock.Uri.file('/project')}];
      vscodeMock.workspace.textDocuments=[];
      vscodeMock.workspace.findFiles=async(glob)=>glob.includes('css,scss,less')?[cssUri]:[htmlUri];
      vscodeMock.workspace.fs={readFile:async uri=>Buffer.from(uri.path.endsWith('.css')?css:html,'utf8')};
      vscodeMock.workspace.openTextDocument=async uri=>{
        const d=makeDocument(uri.path.endsWith('.css')?css:html,uri.path.endsWith('.css')?'css':'html');
        d.uri=uri;return d;
      };
      vscodeMock.workspace.asRelativePath=uri=>uri.path.slice('/project/'.length);
      vscodeMock.window.showQuickPick=async items=>{throw new Error('相互ジャンプが候補一覧を出した');};
      const source=makeEditor(html,'html');source.document.uri=htmlUri;
      const offset=html.indexOf('card');
      source.selection=new Selection(source.document.positionAt(offset),source.document.positionAt(offset+4));
      vscodeMock.window.activeTextEditor=source;
      await registered.get('codingTools.jumpToCss')();
      const target=vscodeMock.window.activeTextEditor;
      assert.equal(target.document.languageId,'css');
      assert.equal(target.document.getText(),css);
      assert.equal(target.document.getText(target.selection),'.card');
      assert.equal(contextKeys.get('codingTools.jumpCycle'),true);
      const firstOffset=target.document.offsetAt(target.selection.start);
      await registered.get('codingTools.cycleNextJump')();
      const afterNext=vscodeMock.window.activeTextEditor;
      const secondOffset=afterNext.document.offsetAt(afterNext.selection.start);
      assert.notEqual(secondOffset,firstOffset,'Tab should navigate to the other CSS rule');
      await registered.get('codingTools.cyclePreviousJump')();
      const afterPrev=vscodeMock.window.activeTextEditor;
      assert.equal(afterPrev.document.offsetAt(afterPrev.selection.start),firstOffset,'Shift+Tab returns to first');
      await registered.get('codingTools.endJumpCycle')();
      assert.equal(contextKeys.get('codingTools.jumpCycle'),false,'Esc / end-cycle restores normal Tab');
      await registered.get('codingTools.jumpToHtml')();
      const back=vscodeMock.window.activeTextEditor;
      assert.equal(back.document.languageId,'html');
      assert.equal(back.document.getText(back.selection),'card');
      assert.equal(back.document.getText(),html);
      // The derived command chooses a direction and reuses the same search,
      // ranking and candidate navigation without invoking VS Code definitions.
      await registered.get('codingTools.jumpBetweenHtmlCss')();
      const commonCss=vscodeMock.window.activeTextEditor;
      assert.equal(commonCss.document.languageId,'css');
      assert.equal(commonCss.document.getText(commonCss.selection),'.card');
      assert.equal(commonCss.document.getText(),css);
      await registered.get('codingTools.jumpBetweenHtmlCss')();
      const commonHtml=vscodeMock.window.activeTextEditor;
      assert.equal(commonHtml.document.languageId,'html');
      assert.equal(commonHtml.document.getText(commonHtml.selection),'card');
      assert.equal(commonHtml.document.getText(),html);
      const notClass=makeEditor('<p>ordinary text</p>','html');
      notClass.selection=new Selection(new Position(0,4),new Position(0,4));
      vscodeMock.window.activeTextEditor=notClass;
      await registered.get('codingTools.jumpBetweenHtmlCss')();
      assert.equal(vscodeMock.window.activeTextEditor,notClass);
      const unsupported=makeEditor('const card = 1;','javascript');
      vscodeMock.window.activeTextEditor=unsupported;
      vscodeMock.workspace.findFiles=async()=>{throw Error('Unsupported languages must not search');};
      await registered.get('codingTools.jumpBetweenHtmlCss')();
      assert.equal(vscodeMock.window.activeTextEditor,unsupported);
    } finally {
      vscodeMock.workspace.workspaceFolders=saved.folders;
      vscodeMock.workspace.findFiles=saved.findFiles;
      vscodeMock.workspace.fs=saved.fs;
      vscodeMock.workspace.openTextDocument=saved.openTextDocument;
      vscodeMock.workspace.textDocuments=saved.docs;
      vscodeMock.workspace.asRelativePath=saved.relative;
      vscodeMock.window.showQuickPick=savedPick;
    }
  });
  await test('status bar click copies, updates its preview and cancels without changes', async () => {
    const editor=makeEditor('<p class="sample">','html');
    editor.selection=new Selection(new Position(0,12),new Position(0,12));
    vscodeMock.window.activeTextEditor=editor;
    pickAction='copy';
    await registered.get('codingTools.showSlot1')();
    assert.equal(slotText('coding-tools.slot.1'),'.sample');
    assert.equal(store.get('coding-tools.class-slot.1'),true);
    const item=statusItems.find(item=>item.id==='codingTools.slot1.content');
    assert.equal(item.text,'/ .sample');
    pickAction='cancel';
    const before=[...store];
    const source=editor.document.text;
    await registered.get('codingTools.showSlot1')();
    assert.deepEqual([...store],before);
    assert.equal(editor.document.text,source);
    pickAction='paste';
  });
  await test('empty slot offers copy only and non-class preview escapes icons and truncates', async () => {
    store.delete('coding-tools.slot.2');
    const text='$(alert)\n'+ 'a'.repeat(80);
    const editor=makeEditor(text,'plaintext');
    editor.selection=new Selection(new Position(0,0),new Position(1,80));
    vscodeMock.window.activeTextEditor=editor;
    pickAction='copy';
    await registered.get('codingTools.showSlot2')();
    assert.deepEqual(quickPickItems.map(item=>item.action),['copy']);
    assert.equal(slotText('coding-tools.slot.2'),text);
    assert.equal(store.get('coding-tools.class-slot.2'),false);
    const item=statusItems.find(item=>item.id==='codingTools.slot2.content');
    assert.ok(item.text.includes('＄(alert)'));
    assert.ok(item.text.endsWith('…'));
    assert.ok(!item.text.includes('\n'));
    assert.ok(item.tooltip.includes('クリック'));
    pickAction='paste';
  });
  await test('both slots add a single dot only for class tokens in CSS, SCSS and Less', async () => {
    for(const n of [1,2]) {
      const source=makeEditor('.sample {}','css');
      source.selection=new Selection(new Position(0,2),new Position(0,2));
      vscodeMock.window.activeTextEditor=source;
      await registered.get('codingTools.copy'+n)();
      for(const language of ['css','scss','less'])for(const prefix of ['', '.']) {
        const dest=makeEditor(prefix,language);
        dest.selection=new Selection(new Position(0,prefix.length),new Position(0,prefix.length));
        vscodeMock.window.activeTextEditor=dest;
        await registered.get('codingTools.paste'+n)();
        assert.equal(dest.document.text,language==='css'&&prefix===''?'.sample {\n}\n':'.sample');
      }
      const dest=makeEditor('', 'html');
      vscodeMock.window.activeTextEditor=dest;
      await registered.get('codingTools.paste'+n)();
      assert.equal(dest.document.text,'sample');
    }
  });
  await test('slot menu does not edit a different editor or act after closing the source', async () => {
    const original=vscodeMock.window.showQuickPick;
    const editor=makeEditor('original','plaintext');
    const other=makeEditor('other','plaintext');
    const before=[...store];
    try {
      vscodeMock.window.activeTextEditor=editor;
      vscodeMock.window.showQuickPick=async()=>{vscodeMock.window.activeTextEditor=other;return {action:'copy'};};
      await registered.get('codingTools.showSlot1')();
      assert.deepEqual([...store],before);
      assert.equal(other.document.text,'other');
      vscodeMock.window.activeTextEditor=editor;
      vscodeMock.window.showQuickPick=async()=>{editor.document.isClosed=true;return {action:'paste'};};
      await registered.get('codingTools.showSlot1')();
      assert.equal(editor.document.text,'original');
      vscodeMock.window.activeTextEditor=null;
      await registered.get('codingTools.showSlot1')();
      assert.match(warnings.at(-1),/テキストエディタ/);
    } finally {vscodeMock.window.showQuickPick=original;}
  });
  await test('each slot display combination is independent and hidden controls retain keyboard operations', async () => {
    const opts=settings.SLOT_DISPLAY_OPTIONS;
    for(const n of [1,2]) {
      const other=n===1?2:1;
      const otherItems=statusItems.filter(item=>typeof item.id==='string'&&item.id.startsWith(`codingTools.slot${other}`));
      const otherBefore=otherItems.map(item=>({text:item.text,visible:item.visible}));
      for(let mask=0;mask<16;mask++) {
        for(const [bit,option] of opts.entries()) {
          const key=settings.slotDisplayKey(n,option.part);
          const expected=Boolean(mask&(1<<bit));
          if(settings.enabled(context,key)!==expected)await registered.get('codingTools.toggleSetting')(key);
          assert.equal(settings.enabled({...context},key),expected,'Display state must persist');
        }
        const shown=part=>Boolean(mask&(1<<opts.findIndex(option=>option.part===part)));
        const number=statusItems.find(item=>item.id===`codingTools.slot${n}`);
        const copy=statusItems.find(item=>item.id===`codingTools.slot${n}.copy`);
        const paste=statusItems.find(item=>item.id===`codingTools.slot${n}.paste`);
        const content=statusItems.find(item=>item.id===`codingTools.slot${n}.content`);
        assert.equal(number.visible,shown('number'));
        assert.equal(content.visible,shown('content'));
        assert.equal(copy.visible,shown('actions')||shown('shortcuts'));
        assert.equal(paste.visible,shown('actions')||shown('shortcuts'));
        assert.equal(copy.text.includes('コピー'),shown('actions'));
        assert.equal(paste.text.includes('貼り付け'),shown('actions'));
        assert.equal(copy.text.includes('+Shift+'),shown('shortcuts'));
        assert.deepEqual(otherItems.map(item=>({text:item.text,visible:item.visible})),otherBefore);
      }
      for(const option of opts) {
        const key=settings.slotDisplayKey(n,option.part);
        if(settings.enabled(context,key))await registered.get('codingTools.toggleSetting')(key);
      }
      const source=makeEditor('<p class="still-active">','html');
      source.selection=new Selection(new Position(0,12),new Position(0,12));
      vscodeMock.window.activeTextEditor=source;
      await registered.get('codingTools.copy'+n)();
      const destination=makeEditor('','css');
      vscodeMock.window.activeTextEditor=destination;
      await registered.get('codingTools.paste'+n)();
      assert.equal(destination.document.text,'.still-active {\n}\n');
      assert.ok(statusItems.find(item=>item.id==='codingTools.settings').visible,'Settings must remain reachable');
      for(const option of opts)await registered.get('codingTools.toggleSetting')(settings.slotDisplayKey(n,option.part));
    }
  });
  function chooseCssOption(label){
    return html=>{
      const rows=[...html.matchAll(/<li[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<\/li>/g)];
      const row=rows.find(row=>row[0].includes(label));
      assert.ok(row,'Missing CSS option: '+label);
      for(const removed of ['新規 @media','新しい @media','関係・位置・状態のセレクタを指定','通常の貼り付け','CSSファイルを選択'])assert.ok(!html.includes(removed),removed);
      return Number(row[1]);
    };
  }
  await test('slot paste uses the current CSS and offers existing media in one selection screen', async () => {
    store.set('coding-tools.slot.1','panel');store.set('coding-tools.class-slot.1',true);
    const before='.base {}\n@media (min-width: 600px) { .base {} }\n@media (min-width: 1000px) { .base {} }\n';
    const editor=makeEditor(before,'css');editor.selection=new Selection(editor.document.positionAt(before.length),editor.document.positionAt(before.length));
    vscodeMock.window.activeTextEditor=editor;
    const previousFind=vscodeMock.workspace.findFiles;
    vscodeMock.workspace.findFiles=async()=>{throw Error('Paste must not choose another CSS file');};
    const panelsBefore=confirmationPanels.length;
    try {confirmationActions.push(chooseCssOption('空ルールを追加：@media (min-width: 1000px)'));await registered.get('codingTools.paste1')();}
    finally {vscodeMock.workspace.findFiles=previousFind;}
    assert.equal(confirmationPanels.length,panelsBefore+1,'Media must not require a second picker');
    const rules=require('../src/placement').rules(require('../src/placement').parseCss(editor.document.text));
    const added=rules.find(rule=>rule.prelude==='.panel');
    assert.equal(added.parent.prelude,'@media (min-width: 1000px)');
    assert.ok(editor.document.text.includes('@media (min-width: 600px) { .base {} }'));
  });
  await test('slot 2 can jump to the selected existing media rule without editing CSS', async () => {
    store.set('coding-tools.slot.2','panel');store.set('coding-tools.class-slot.2',true);
    const before='.panel {}\n@media screen { .panel {} }\n';
    const editor=makeEditor(before,'css');editor.selection=new Selection(editor.document.positionAt(before.length),editor.document.positionAt(before.length));
    vscodeMock.window.activeTextEditor=editor;
    confirmationActions.push(chooseCssOption('既存ルールへ移動：@media screen'));
    await registered.get('codingTools.paste2')();
    assert.equal(editor.document.text,before);
    assert.equal(editor.document.offsetAt(editor.selection.active),before.lastIndexOf('.panel'));
  });
  await test('cancelled or stale CSS placement never applies an insertion', async () => {
    store.set('coding-tools.slot.1','cancelled');store.set('coding-tools.class-slot.1',true);
    const editor=makeEditor('','css');vscodeMock.window.activeTextEditor=editor;
    confirmationActions.push('cancel');await registered.get('codingTools.paste1')();assert.equal(editor.document.text,'');
    confirmationActions.push(()=>{editor.document.text='/* external change */';return 0;});
    await registered.get('codingTools.paste1')();assert.equal(editor.document.text,'/* external change */');
    assert.match(warnings.at(-1),/選んでいる間にCSSが変更/);
  });
  await test('CSS comments, strings and declaration values paste names without dots or menus', async () => {
    store.set('coding-tools.slot.1','literal');store.set('coding-tools.class-slot.1',true);
    for(const example of ['/* ¦ */','// ¦','.x { content: "¦"; }','.x { color: ¦; }','.x { background: url(https://example.com/¦); }']) {
      const at=example.indexOf('¦');const text=example.replace('¦','');
      const editor=makeEditor(text,'css');editor.selection=new Selection(editor.document.positionAt(at),editor.document.positionAt(at));
      vscodeMock.window.activeTextEditor=editor;const panels=confirmationPanels.length;
      await registered.get('codingTools.paste1')();
      assert.equal(editor.document.text,example.replace('¦','literal'));assert.equal(confirmationPanels.length,panels);
    }
  });
  await test('copy slots retain their own HTML neighbors for empty-rule placement', async () => {
    for(const [n,previous,next] of [[1,'course__title','course__link'],[2,'course__other','course__end']]) {
      const html='<div class="'+previous+'"></div><p class="course__text"></p><a class="'+next+'"></a>';
      const source=makeEditor(html,'html');const at=html.indexOf('course__text');
      source.selection=new Selection(source.document.positionAt(at),source.document.positionAt(at+12));vscodeMock.window.activeTextEditor=source;
      await registered.get('codingTools.copy'+n)();
      assert.equal(store.get('coding-tools.slot-context.'+n).before,previous);
    }
    const before='.course__title {}\n.other {}\n.course__link {}\n.course__other {}\n.course__end {}\n';
    const editor=makeEditor(before,'css');editor.selection=new Selection(editor.document.positionAt(before.length),editor.document.positionAt(before.length));vscodeMock.window.activeTextEditor=editor;
    confirmationActions.push(chooseCssOption('空ルールを追加：基本ルール'));await registered.get('codingTools.paste1')();
    assert.ok(editor.document.text.indexOf('.course__text')<editor.document.text.indexOf('.course__link'));
  });
  await test('copy slots persist independent source structure and clear stale metadata on other copies', async () => {
    for (const [n,region] of [[1,'section'],[2,'aside']]) {
      const html=`<main><${region} id="area${n}"><h2 class="title"></h2><p class="text"><span class="label"></span></p><a class="link"></a></${region}></main>`;
      const source=makeEditor(html,'html');const at=html.indexOf('text');
      // Reverse selections must identify the exact occurrence too.
      source.selection=new Selection(source.document.positionAt(at+4),source.document.positionAt(at));
      vscodeMock.window.activeTextEditor=source;
      await registered.get('codingTools.copy'+n)();
      const data=store.get('coding-tools.slot-context.'+n);
      assert.equal(data.structure.parent.id,'area'+n);
      assert.equal(data.structure.siblings.previous.classes[0],'title');
      assert.equal(data.structure.siblings.next.classes[0],'link');
      assert.equal(data.structure.children[0].classes[0],'label');
      assert.equal(data.structure.sectioning.current.tag,region);
      assert.deepEqual(data,store.get('coding-tools.lastClassContext'));
      assert.doesNotThrow(()=>JSON.stringify(data));
    }
    const first=JSON.parse(JSON.stringify(store.get('coding-tools.slot-context.1')));
    assert.equal(first.structure.sectioning.current.tag,'section');
    const plain=makeEditor('ordinary words','plaintext');
    plain.selection=new Selection(new Position(0,0),new Position(0,8));
    vscodeMock.window.activeTextEditor=plain;
    await registered.get('codingTools.copy2')();
    assert.equal(store.get('coding-tools.slot-context.2'),null);
    assert.deepEqual(store.get('coding-tools.slot-context.1'),first);
    const css=makeEditor('.other {}','css');css.selection=new Selection(new Position(0,2),new Position(0,2));
    vscodeMock.window.activeTextEditor=css;await registered.get('codingTools.copy2')();
    assert.equal(store.get('coding-tools.slot-context.2'),null, 'CSS copies must not reuse old HTML structure');
  });
  await test('root empty-rule placement stays outside nested CSS rules and recognizes leading comments', async () => {
    store.set('coding-tools.slot.1','course__text');store.set('coding-tools.class-slot.1',true);
    store.set('coding-tools.slot-context.1',{name:'course__text',before:'course__title',after:'course__link'});
    const before='/* heading */\n.container { .course__title {} .course__link {} }\n';
    const editor=makeEditor(before,'css');editor.selection=new Selection(editor.document.positionAt(before.length),editor.document.positionAt(before.length));vscodeMock.window.activeTextEditor=editor;
    confirmationActions.push(chooseCssOption('空ルールを追加：基本ルール'));await registered.get('codingTools.paste1')();
    const rules=require('../src/placement').rules(require('../src/placement').parseCss(editor.document.text));
    assert.ok(rules.some(rule=>rule.prelude==='.container'));
    assert.equal(rules.find(rule=>rule.prelude==='.course__text').parent.type,'root');
    assert.ok(editor.document.text.startsWith(before));
    store.set('coding-tools.slot.1','container');
    editor.selection=new Selection(editor.document.positionAt(editor.document.text.length),editor.document.positionAt(editor.document.text.length));
    const original=editor.document.text;confirmationActions.push(chooseCssOption('既存ルールへ移動：基本'));await registered.get('codingTools.paste1')();
    assert.equal(editor.document.text,original);assert.equal(editor.document.offsetAt(editor.selection.active),before.indexOf('.container'));
  });
  await test('configured comments and metadata choices flow through real slot copy and CSS paste', async () => {
    async function copyClass(html,name){
      const source=makeEditor(html,'html');const at=html.indexOf(name);
      source.selection=new Selection(source.document.positionAt(at),source.document.positionAt(at+name.length));
      vscodeMock.window.activeTextEditor=source;await registered.get('codingTools.copy1')();
    }
    async function pasteCss(before=''){
      const destination=makeEditor(before,'css');const end=destination.document.positionAt(before.length);
      destination.selection=new Selection(end,end);vscodeMock.window.activeTextEditor=destination;
      confirmationActions.push(chooseCssOption('空ルールを追加：基本ルール'));
      await registered.get('codingTools.paste1')();return destination.document.text;
    }
    try{
      workflowConfig.set('sectionComments',{header:'/* ===== HEADER ===== */',footer:'/* ===== FOOTER ===== */','#news':'/* ===== NEWS ===== */'});
      await copyClass('<header><a class="brand"></a></header>','brand');
      assert.equal(await pasteCss(),'/* ===== HEADER ===== */\n\n.brand {\n}\n');
      await copyClass('<footer><p class="copyright"></p></footer>','copyright');
      const footer=await pasteCss('/* ===== FOOTER ===== */\n.footer {}\n');
      assert.equal((footer.match(/\/\* ===== FOOTER ===== \*\//g)||[]).length,1);
      assert.ok(footer.includes('.copyright {'));
      await copyClass('<section id="news"><h2 class="headline"></h2></section>','headline');
      const news=await pasteCss();assert.ok(news.startsWith('/* ===== NEWS ===== */'));
      assert.ok(!news.includes('@media'));
      workflowConfig.set('addSectionComments',false);
      assert.equal(await pasteCss(),'.headline {\n}\n');
      workflowConfig.set('addSectionComments',true);
      workflowConfig.set('pasteInformation',[]);
      assert.equal(await pasteCss(),'.headline {\n}\n');
      workflowConfig.delete('pasteInformation');workflowConfig.set('copyInformation',[]);
      await copyClass('<header><a class="brand"></a></header>','brand');
      assert.deepEqual(store.get('coding-tools.slot-context.1'),{schemaVersion:1,name:'brand'});
      assert.equal(await pasteCss(),'.brand {\n}\n');
      workflowConfig.delete('copyInformation');workflowConfig.set('sectionComments',{header:'/* header */ .bad { color:red }'});
      await copyClass('<header><a class="brand"></a></header>','brand');
      assert.equal(await pasteCss(),'');assert.match(warnings.at(-1),/CSSコメントを1つ/);
    }finally{workflowConfig.clear();workflowConfig.set('requireCommentGroup',false);workflowConfig.set('automaticPaste',false);}
  });
  await test('default basic insertion requires a registered or explicitly chosen comment group', async () => {
    workflowConfig.delete('requireCommentGroup');
    store.set('coding-tools.slot.1','grouped');store.set('coding-tools.class-slot.1',true);
    store.set('coding-tools.slot-context.1',null);
    try{
      const before='.outside {}\n/* Header */\n.header {}\n/* Main */\n.main {}\n';
      const destination=makeEditor(before,'css');const end=destination.document.positionAt(before.length);
      destination.selection=new Selection(end,end);vscodeMock.window.activeTextEditor=destination;
      confirmationActions.push(html=>{
        assert.ok(html.includes('基本ルール / Header'));assert.ok(html.includes('基本ルール / Main'));
        return chooseCssOption('基本ルール / Header')(html);
      });
      await registered.get('codingTools.paste1')();
      assert.ok(destination.document.text.indexOf('.grouped')>destination.document.text.indexOf('/* Header */'));
      assert.ok(destination.document.text.indexOf('.grouped')<destination.document.text.indexOf('/* Main */'));
      assert.equal((destination.document.text.match(/\/\*/g)||[]).length,2);
      const nestedHtml='<header><p class="before"></p><p class="grouped"></p><p class="after"></p></header>';
      store.set('coding-tools.slot-context.1',require('../src/html-context').htmlCopyContext(nestedHtml,{name:'grouped',start:nestedHtml.indexOf('grouped')}));
      workflowConfig.set('sectionComments',{header:'/* Header */'});
      const nestedBefore='/* Header */\n.container { .before {} .after {} }\n/* Main */\n.main {}\n';
      const nestedEditor=makeEditor(nestedBefore,'css');const nestedEnd=nestedEditor.document.positionAt(nestedBefore.length);
      nestedEditor.selection=new Selection(nestedEnd,nestedEnd);vscodeMock.window.activeTextEditor=nestedEditor;
      confirmationActions.push(chooseCssOption('空ルールを追加：基本ルール'));await registered.get('codingTools.paste1')();
      assert.ok(nestedEditor.document.text.indexOf('.grouped')<nestedEditor.document.text.indexOf('/* Main */'),'Nested neighbor hints must not escape the matching comment group');
      assert.ok(nestedEditor.document.text.indexOf('.grouped')>nestedEditor.document.text.indexOf('.after {} }'));
      workflowConfig.delete('sectionComments');store.set('coding-tools.slot-context.1',null);
      const empty=makeEditor('','css');vscodeMock.window.activeTextEditor=empty;
      confirmationActions.push(html=>{assert.ok(html.includes('コメントを用意'));return 0;});
      const original=vscodeMock.commands.executeCommand;
      vscodeMock.commands.executeCommand=async(id,...args)=>id==='workbench.action.openSettings'?undefined:original(id,...args);
      try{await registered.get('codingTools.paste1')();}finally{vscodeMock.commands.executeCommand=original;}
      assert.equal(empty.document.text,'','No ungrouped rule may be created by default');
    }finally{workflowConfig.set('requireCommentGroup',false);}
  });
  await test('empty-rule paste applies directly without a diff or extra confirmation', async () => {
    store.set('coding-tools.slot.1','direct');store.set('coding-tools.class-slot.1',true);
    const editor=makeEditor('','css');vscodeMock.window.activeTextEditor=editor;
    const original=vscodeMock.window.showInformationMessage;
    const commandStart=fallbackCommands.length;const panels=confirmationPanels.length;
    vscodeMock.window.showInformationMessage=()=>{throw Error('Unexpected extra confirmation');};
    try {confirmationActions.push(0);await registered.get('codingTools.paste1')();}
    finally {vscodeMock.window.showInformationMessage=original;}
    assert.equal(editor.document.text,'.direct {\n}\n');
    assert.equal(confirmationPanels.length,panels+1);
    assert.ok(!fallbackCommands.slice(commandStart).includes('vscode.diff'));
  });
  await test('automatic slot paste creates and reuses landmarks without any selection screen', async () => {
    workflowConfig.delete('automaticPaste');workflowConfig.delete('requireCommentGroup');
    const originalQuickPick=vscodeMock.window.showQuickPick;
    const panels=confirmationPanels.length;
    vscodeMock.window.showQuickPick=()=>{throw Error('Automatic paste must not ask for a selection');};
    try{
      const html='<section class="news"><p class="news__body"></p><p class="news__link"></p></section>';
      const source=makeEditor(html,'html');const at=html.indexOf('news__body');
      source.selection=new Selection(source.document.positionAt(at),source.document.positionAt(at+10));
      vscodeMock.window.activeTextEditor=source;await registered.get('codingTools.copy1')();
      const destination=makeEditor('','css');vscodeMock.window.activeTextEditor=destination;
      await registered.get('codingTools.paste1')();
      assert.ok(destination.document.text.startsWith('/* news\n--------------------------------*/'));
      assert.ok(destination.document.text.includes('.news__body {\n}'));
      const inserted=destination.document.text;
      const end=destination.document.positionAt(inserted.length);destination.selection=new Selection(end,end);
      await registered.get('codingTools.paste1')();
      assert.equal(destination.document.text,inserted,'Repeat paste navigates without duplicating');
      assert.equal(destination.document.offsetAt(destination.selection.active),inserted.indexOf('.news__body'));
      store.set('coding-tools.slot.2','unknown');store.set('coding-tools.class-slot.2',true);store.set('coding-tools.slot-context.2',null);
      const fallback=makeEditor('','css');vscodeMock.window.activeTextEditor=fallback;
      await registered.get('codingTools.paste2')();
      assert.ok(fallback.document.text.startsWith('/* 仮置き: unknown\n'));
      assert.equal(confirmationPanels.length,panels);
    }finally{
      vscodeMock.window.showQuickPick=originalQuickPick;
      workflowConfig.set('automaticPaste',false);workflowConfig.set('requireCommentGroup',false);
    }
  });
  await test('same-name commands move forward and backward inside the current HTML or CSS only', async () => {
    for(const [text,language] of [['<p class="target"></p><b class="other target"></b>','html'],['.target {} .other {} @media screen { .target {} }','css']]){
      const editor=makeEditor(text,language);const token=language==='css'?'.target':'target';
      const first=text.indexOf(token),last=text.lastIndexOf(token);
      editor.selection=new Selection(editor.document.positionAt(first),editor.document.positionAt(first));
      vscodeMock.window.activeTextEditor=editor;
      await registered.get('codingTools.nextSameClass')();
      assert.equal(editor.document.offsetAt(editor.selection.start),last);
      await registered.get('codingTools.nextSameClass')();
      assert.equal(editor.document.offsetAt(editor.selection.start),first);
      await registered.get('codingTools.previousSameClass')();
      assert.equal(editor.document.offsetAt(editor.selection.start),last);
      assert.equal(editor.document.text,text);
    }
  });
  await test('single class and ID rule headers omit the opening brace in both copy slots', async () => {
    for (const n of [1, 2]) for (const [kind, prefix] of [['class', '.'], ['id', '#']]) {
      for (const language of ['css', 'scss', 'less']) for (const eol of ['\n', '\r\n']) {
        const header = '  ' + prefix + 'panel \t{';
        const css = header + eol + '  color: red;' + eol + '}' + eol;
        for (const mode of ['selection', 'reverse', 'name-and-brace', 'brace', 'after-brace', 'whitespace']) {
          const source = makeEditor(css, language);
          const a = mode === 'name-and-brace' ? 3 : 0, b = header.length;
          const offset = mode === 'brace' ? header.indexOf('{') : mode === 'after-brace' ? b : header.indexOf(' \t');
          source.selection = mode === 'selection' || mode === 'name-and-brace' || mode === 'reverse'
            ? new Selection(source.document.positionAt(mode === 'reverse' ? b : a), source.document.positionAt(mode === 'reverse' ? a : b))
            : new Selection(source.document.positionAt(offset), source.document.positionAt(offset));
          vscodeMock.window.activeTextEditor = source;
          await registered.get('codingTools.copy' + n)();
          assert.equal(slotText('coding-tools.slot.' + n), prefix + 'panel', language + ':' + mode);
          assert.equal(store.get('coding-tools.selector-kind.' + n), kind);
          assert.equal(lastCopiedSlotText, prefix + 'panel', 'slot stores the selector independently from the ordinary clipboard');
          assert.equal(source.document.text, css);
        }
      }
      for (const [language, text, expected] of [['html', '', 'panel'], ['plaintext', '', 'panel'], ['css', 'article ', 'article ' + prefix + 'panel'], ['css', prefix, prefix + 'panel']]) {
        const destination = makeEditor(text, language), p = destination.document.positionAt(text.length);
        destination.selection = new Selection(p, p); vscodeMock.window.activeTextEditor = destination;
        await registered.get('codingTools.paste' + n)();
        assert.equal(destination.document.text, expected);
      }
      const behind = makeEditor('.unchanged {}', 'css'); vscodeMock.window.activeTextEditor = behind;
      focusedInput = {text: ''};
      try {await registered.get('codingTools.paste' + n)({target: 'input'}); assert.equal(focusedInput.text, 'panel'); assert.equal(behind.document.text, '.unchanged {}');}
      finally {focusedInput = null;}
    }
    store.delete('coding-tools.selector-kind.1'); store.delete('coding-tools.selector-kind.2');
  });
  await test('brace handling preserves ordinary blocks, compound selectors and non-CSS text', async () => {
    for (const [text, language] of [['.panel { color: red; }', 'css'], ['.parent .child {', 'css'], ['.one, .two {', 'css'], ['.panel:hover {', 'css'], ['const value = {', 'javascript'], ['.panel {', 'plaintext']]) {
      const source = makeEditor(text, language);
      source.selection = new Selection(source.document.positionAt(0), source.document.positionAt(text.length));
      vscodeMock.window.activeTextEditor = source; await registered.get('codingTools.copy1')();
      assert.equal(slotText('coding-tools.slot.1'), text);
      assert.equal(store.get('coding-tools.selector-kind.1'), null);
    }
  });
  await test('default HTML and CSS group copy prefers one unprefixed class and preserves its source', async () => {
    for (const n of [1, 2]) {
      for (const names of ['js-button c-button button', 'button js-button', 'is-active u-flex button', 'js-form contact-form', 'l-card card__body']) {
        const expected = names.includes('contact-form') ? 'contact-form' : names.includes('card__body') ? 'card__body' : 'button';
        for (const language of ['html', 'css', 'scss', 'less']) {
          const group = language === 'html' ? names : names.split(' ').map(name => '.' + name).join('');
          const text = language === 'html'
            ? '<div id="earlier" class="' + expected + '"></div><p id="target" class="' + group + '"></p>'
            : group + ' {\n  color: red;\n}';
          const start = language === 'html' ? text.lastIndexOf(group) : 0;
          for (const mode of ['caret', 'selection', 'reverse']) {
            const source = makeEditor(text, language);
            const end = start + group.length;
            const at = start + (language === 'html' ? 1 : 2);
            source.selection = mode === 'caret' ? new Selection(source.document.positionAt(at), source.document.positionAt(at))
              : new Selection(source.document.positionAt(mode === 'reverse' ? end : start), source.document.positionAt(mode === 'reverse' ? start : end));
            vscodeMock.window.activeTextEditor = source; await registered.get('codingTools.copy' + n)();
            assert.equal(slotText('coding-tools.slot.' + n), '.' + expected, names + ':' + language + ':' + mode);
            assert.equal(store.get('coding-tools.selector-kind.' + n), 'class');
            assert.equal(lastCopiedSlotText, '.' + expected);
            assert.equal(source.document.text, text);
            if (language === 'html') {
              const data = store.get('coding-tools.slot-context.' + n);
              assert.equal(data.structure.element.id, 'target');
              assert.equal(data.token.start, findHtmlClasses(text).findLast(item => item.name === expected).start);
            }
          }
        }
      }
      for (const [language, text, expected] of [['html', '', 'card__body'], ['plaintext', '', 'card__body'], ['css', 'article ', 'article .card__body'], ['css', '.', '.card__body']]) {
        const destination = makeEditor(text, language), p = destination.document.positionAt(text.length);
        destination.selection = new Selection(p, p); vscodeMock.window.activeTextEditor = destination;
        await registered.get('codingTools.paste' + n)(); assert.equal(destination.document.text, expected);
      }
    }
    store.delete('coding-tools.selector-kind.1'); store.delete('coding-tools.selector-kind.2');
  });
  await test('default group priority respects explicit selection, caret ties and prefix-only groups', async () => {
    for (const [language, text, chosen, select, expected] of [
      ['html', '<p class="js-button button"></p>', 'js-button', true, 'js-button'],
      ['css', '.js-button.button {}', 'js-button', true, 'js-button'],
      ['html', '<p class="first second"></p>', 'second', false, 'second'],
      ['css', '.first.second {}', 'second', false, 'second'],
      ['html', '<p class="js-button c-button"></p>', 'c-button', false, 'c-button'],
      ['css', '.js-button.c-button {}', 'c-button', false, 'c-button'],
      ['html', '<p id="main" class="js-button button"></p>', 'main', false, 'main'],
      ['css', '#main.js-button.button {}', 'main', false, 'main']
    ]) {
      const source = makeEditor(text, language), start = text.indexOf(chosen), end = start + chosen.length;
      source.selection = select ? new Selection(source.document.positionAt(start), source.document.positionAt(end))
        : new Selection(source.document.positionAt(start + 1), source.document.positionAt(start + 1));
      vscodeMock.window.activeTextEditor = source; await registered.get('codingTools.copy1')();
      assert.equal(slotText('coding-tools.slot.1'), (chosen === 'main' ? '#' : '.') + expected);
    }
    for (const language of ['html', 'css']) {
      const text = language === 'html' ? '<p class="js-button  button"></p>' : '.js-button.button {';
      const at = language === 'html' ? text.indexOf('  ') + 1 : text.indexOf('{');
      const source = makeEditor(text, language), p = source.document.positionAt(at); source.selection = new Selection(p, p);
      vscodeMock.window.activeTextEditor = source; await registered.get('codingTools.copy2')(); assert.equal(lastCopiedSlotText, '.button');
    }
    store.delete('coding-tools.selector-kind.1'); store.delete('coding-tools.selector-kind.2');
  });
  await test('class and ID slots keep their markers and route bare names outside CSS selectors', async () => {
    workflowConfig.set('addSectionComments',false);
    for (const [n,kind,token] of [[1,'class','.panel'],[2,'id','#panel']]) {
      for (const language of ['html','css']) {
        const html='<section id="region"><p class="panel" id="panel"></p></section>';
        const input=language==='html'?html:token+' {}';
        const start=language==='html'?input.indexOf(kind==='id'?'id="panel"':'class="panel"')+(kind==='id'?4:7):0;
        const source=makeEditor(input,language);
        source.selection=new Selection(source.document.positionAt(start),source.document.positionAt(start+(language==='html'?5:token.length)));
        vscodeMock.window.activeTextEditor=source;await registered.get('codingTools.copy'+n)();
        assert.equal(slotText('coding-tools.slot.'+n),token);assert.equal(lastCopiedSlotText,token);
        assert.equal(store.get('coding-tools.slot.'+n).format,'selector-v1');
        assert.equal(store.get('coding-tools.slot.'+n).kind,kind);
        assert.equal(store.get('coding-tools.selector-kind.'+n),kind);
        if(language==='html'){const data=store.get('coding-tools.slot-context.'+n);assert.equal(data.structure.element.id,'panel');if(kind==='id')assert.equal(data.kind,'id');}
        for (const [target,expected] of [['',''+token+' {\n}\n'],[token[0],token],['/* ¦ */','/* panel */'],['.x {color: ¦;}','.x {color: panel;}']]) {
          const at=target.includes('¦')?target.indexOf('¦'):target.length;const destination=makeEditor(target.replace('¦',''),'css');
          destination.selection=new Selection(destination.document.positionAt(at),destination.document.positionAt(at));vscodeMock.window.activeTextEditor=destination;
          if(target==='')confirmationActions.push(chooseCssOption('空ルールを追加：基本ルール'));
          await registered.get('codingTools.paste'+n)();assert.equal(destination.document.text,expected);
        }
      }
    }
    workflowConfig.delete('addSectionComments');
    // Arbitrary text must clear selector metadata and paste unchanged.
    const ordinary=makeEditor('ordinary','plaintext');ordinary.selection=new Selection(new Position(0,0),new Position(0,8));vscodeMock.window.activeTextEditor=ordinary;
    await registered.get('codingTools.copy2')();assert.equal(store.get('coding-tools.selector-kind.2'),null);
    store.delete('coding-tools.selector-kind.1');store.delete('coding-tools.selector-kind.2');
  });
  await test('slot copies and dedicated input paste leave ordinary Ctrl+C and Ctrl+V independent', async () => {
    clipboard = 'normal Ctrl+C text';
    for (const n of [1, 2]) {
      const source = makeEditor('<p class="slot' + n + '"></p>', 'html');
      const at = source.document.text.indexOf('slot' + n) + 1;
      source.selection = new Selection(source.document.positionAt(at), source.document.positionAt(at));
      vscodeMock.window.activeTextEditor = source;
      await registered.get('codingTools.copy' + n)();
      assert.equal(clipboard, 'normal Ctrl+C text');
    }
    const behind = makeEditor('.unchanged {}', 'css'); vscodeMock.window.activeTextEditor = behind;
    focusedInput = {text: ''};
    const execute = vscodeMock.commands.executeCommand;
    try {
      await execute('editor.action.clipboardPasteAction');
      assert.equal(focusedInput.text, 'normal Ctrl+C text');
      for (const n of [1, 2]) {
        await registered.get('codingTools.paste' + n)({target: 'input'});
        assert.equal(focusedInput.text, 'slot' + n);
        assert.equal(clipboard, 'normal Ctrl+C text');
        await execute('editor.action.clipboardPasteAction');
        assert.equal(focusedInput.text, 'normal Ctrl+C text');
      }
      const received = [];
      vscodeMock.commands.executeCommand = async (command, ...args) => {
        if (command === 'editor.action.clipboardPasteAction') received.push(clipboard);
        return execute(command, ...args);
      };
      await Promise.all([registered.get('codingTools.paste1')({target: 'input'}), registered.get('codingTools.paste2')({target: 'input'})]);
      assert.deepEqual(received, ['slot1', 'slot2']);
      assert.equal(clipboard, 'normal Ctrl+C text');
      vscodeMock.commands.executeCommand = async command => {
        if (command === 'editor.action.clipboardPasteAction') throw new Error('native paste failed');
        return execute(command);
      };
      await registered.get('codingTools.paste1')({target: 'input'});
      assert.equal(clipboard, 'normal Ctrl+C text', 'Failure must restore the previous clipboard');
      vscodeMock.commands.executeCommand = async (command, ...args) => {
        const result = await execute(command, ...args);
        if (command === 'editor.action.clipboardPasteAction') clipboard = 'new Ctrl+C during paste';
        return result;
      };
      await registered.get('codingTools.paste1')({target: 'input'});
      assert.equal(clipboard, 'new Ctrl+C during paste', 'Do not overwrite a newer normal copy');
      assert.equal(behind.document.text, '.unchanged {}');
    } finally {vscodeMock.commands.executeCommand = execute; focusedInput = null;}
  });
  await test('search fields use explicit queries without reading or overwriting the ordinary clipboard', async () => {
    const behind=makeEditor('.unchanged {}','css');vscodeMock.window.activeTextEditor=behind;
    const nativePaste=vscodeMock.commands.executeCommand;
    focusedInput={text:''};
    try {
      for(const n of [1,2]) for(const target of ['workspaceSearch','editorSearch']) {
        store.set('coding-tools.slot.'+n,'search_name_'+n);
        store.set('coding-tools.selector-kind.'+n,n===1?'class':'id');
        clipboard='normal Ctrl+C content';
        const beforeWrites=clipboardWrites;
        await registered.get('codingTools.paste'+n)({target});
        assert.equal(focusedInput.text,'search_name_'+n);
        assert.equal(clipboard,'normal Ctrl+C content');
        assert.equal(clipboardWrites,beforeWrites);
        assert.equal(behind.document.text,'.unchanged {}');
        await nativePaste('editor.action.clipboardPasteAction');
        assert.equal(focusedInput.text,'normal Ctrl+C content');
      }
      store.delete('coding-tools.slot.2');focusedInput.text='keep';
      await registered.get('codingTools.paste2')({target:'workspaceSearch'});
      assert.equal(focusedInput.text,'keep');
    } finally {focusedInput=null;store.delete('coding-tools.selector-kind.1');store.delete('coding-tools.selector-kind.2');}
  });
  await test('input paste uses either saved slot as plain text without touching the active code editor', async () => {
    const behind=makeEditor('.unchanged {}','css');vscodeMock.window.activeTextEditor=behind;
    focusedInput={text:''};
    try {
      for(const [n,kind] of [[1,'class'],[2,'id']]){store.set('coding-tools.slot.'+n,'panel'+n);store.set('coding-tools.selector-kind.'+n,kind);
        clipboard='other clipboard';await registered.get('codingTools.paste'+n)({target:'input'});assert.equal(clipboard,'other clipboard');
        assert.equal(focusedInput.text,'panel'+n);assert.equal(behind.document.text,'.unchanged {}');}
      vscodeMock.window.activeTextEditor=null;await registered.get('codingTools.paste1')({target:'input'});assert.equal(focusedInput.text,'panel1');
      store.delete('coding-tools.slot.2');focusedInput.text='keep';await registered.get('codingTools.paste2')({target:'input'});assert.equal(focusedInput.text,'keep');
    }finally{focusedInput=null;store.delete('coding-tools.selector-kind.1');store.delete('coding-tools.selector-kind.2');}
  });
  await test('ID automatic placement adds section comment and reuses only the matching ID rule', async () => {
    workflowConfig.delete('automaticPaste');
    try {
      const html='<section id="news"><h2 id="heading"></h2></section>';const source=makeEditor(html,'html');const at=html.indexOf('heading');
      source.selection=new Selection(source.document.positionAt(at),source.document.positionAt(at));vscodeMock.window.activeTextEditor=source;await registered.get('codingTools.copy2')();
      const destination=makeEditor('.heading {}\n','css');vscodeMock.window.activeTextEditor=destination;const end=destination.document.positionAt(destination.document.text.length);destination.selection=new Selection(end,end);
      await registered.get('codingTools.paste2')();assert.ok(destination.document.text.includes('#heading {\n}'));assert.ok(destination.document.text.includes('/* news\n'));assert.ok(destination.document.text.startsWith('.heading {}'));
      const before=destination.document.text;const tail=destination.document.positionAt(before.length);destination.selection=new Selection(tail,tail);await registered.get('codingTools.paste2')();assert.equal(destination.document.text,before);assert.equal(destination.document.offsetAt(destination.selection.active),before.indexOf('#heading'));
    }finally{workflowConfig.set('automaticPaste',false);store.delete('coding-tools.selector-kind.2');}
  });
  for(const s of context.subscriptions) s.dispose?.();
  assert.ok(statusItems.every(item=>item.disposed),'Status bar items must be disposed');
  await require('node:fs/promises').rm(context.globalStorageUri.fsPath,{recursive:true,force:true});
  console.log(`\nAll tests passed.`);
})().catch((err)=>{console.error(err);process.exitCode=1;});
