'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const history = require('../history');
const { findCssClasses, nextClass, findHtmlClasses, htmlClassAtCursor } = require('../selectors');

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

  const registered = new Map();
  const store = new Map();
  const warnings=[];
  const confirmationPanels=[];
  const treeProviders=new Map();
  let lastOpenedDocument=null;
  const fallbackCommands=[];
  const contextKeys=new Map();
  let clipboard='';
  const vscodeMock = {
    commands: {
      registerCommand(name, cb) {registered.set(name, cb); return {dispose() {}};},
      async executeCommand(command,...args) {
        fallbackCommands.push(command);
        if(registered.has(command)) return registered.get(command)(...args);
        if (command === 'setContext') {contextKeys.set(args[0],args[1]);return;}
        if (command === 'workbench.view.explorer' || command === 'codingTools.history.focus' || command === 'vscode.diff') return;
        const editor=vscodeMock.window.activeTextEditor;
        if (command === 'editor.action.clipboardCopyAction') {
          clipboard=editor.selection.isEmpty ? editor.document.lineAt(editor.selection.active.line).text+'\n' : editor.document.getText(editor.selection);
        } else if (command === 'editor.action.clipboardPasteAction') {
          await editor.edit((builder) => builder.replace(editor.selection, clipboard));
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
        queueMicrotask(() => { if(!panel.disposed)view.message({type:'confirm',index:0}); });
        return panel;
      },
      showInformationMessage(message,options) { warnings.push(message); return options?.modal ? Promise.resolve('実行する') : message.startsWith('CSSの変更前後を確認してください') ? Promise.resolve('差分を確認して適用') : undefined; },
      showWarningMessage(message) { warnings.push(message); },
      setStatusBarMessage() {},
      createStatusBarItem(){return {show(){},hide(){},dispose(){}};},
      onDidChangeTextEditorSelection(){return {dispose(){}};},
      onDidChangeActiveTextEditor(){return {dispose(){}};},
      registerTreeDataProvider(id,provider){treeProviders.set(id,provider);return {dispose(){}};},
      createTreeView(id,options){treeProviders.set(id,options.treeDataProvider);return {dispose(){}};},
      async showQuickPick(items) { return items[Math.min(2,items.length-1)]; },
      async showTextDocument(document) {lastOpenedDocument=document;const editor=this.activeTextEditor;if(editor.document!==document) {this.activeTextEditor=makeEditor(document.getText(),document.languageId);this.activeTextEditor.document.uri=document.uri;}return this.activeTextEditor;}
    },
    workspace: {
      registerTextDocumentContentProvider(){return {dispose(){}};},
      onDidChangeTextDocument(){return {dispose(){}};},
      async openTextDocument(uri){return makeDocument(fs.readFileSync(uri.fsPath || uri.path, 'utf8'),'diff');},
      getConfiguration() { return {get(name, fallback) {return fallback;}}; },
      async findFiles() {return []},
      async applyEdit(change) { for(const op of change.ops) { const doc=vscodeMock.window.activeTextEditor.document; const idx=doc.offsetAt(op.position); doc.text=doc.text.slice(0,idx)+op.value+doc.text.slice(idx); }return true; }
    },
    WorkspaceEdit: class {constructor() {this.ops=[];}insert(uri,position,value){this.ops.push({uri,position,value});}},
    env: {clipboard: { async writeText(text) { clipboard=text; }, async readText() {return clipboard;} }},
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
  try {extension=require('../extension');} finally {Module._load=originalLoad;}
  const context={globalStorageUri:{fsPath:fs.mkdtempSync(path.join(os.tmpdir(),'coding-tools-extension-test-'))},subscriptions:[],globalState:{get(k) {return store.get(k);}, async update(k,v) {store.set(k,v);}}};
  extension.activate(context);

  await test('registers two numbered copy/paste slots and two cross-file navigation commands', () => {
    for(let i=1;i<=2;i++) {assert.ok(registered.has(`codingTools.copy${i}`));assert.ok(registered.has(`codingTools.paste${i}`));}
    assert.ok(registered.size >= 27);
    assert.ok(registered.has('codingTools.jumpToCss'));
    assert.ok(registered.has('codingTools.jumpToHtml'));
    assert.ok(!registered.has('codingTools.copy3'));
    assert.ok(!registered.has('codingTools.paste4'));
    assert.ok(registered.has('codingTools.openLatestDiff'));
    assert.ok(registered.has('codingTools.openHistory'));
    assert.ok(registered.has('codingTools.showHistoryPanel'));
  });
  await test('history panel has a direct command that targets Explorer and the contributed history view', async () => {
    const old = fallbackCommands.length;
    await registered.get('codingTools.showHistoryPanel')();
    assert.deepEqual(fallbackCommands.slice(old), ['workbench.view.explorer', 'codingTools.history.focus']);
  });
  await test('copies selected text into independent numbered slots', async () => {
    const editor=makeEditor('alpha beta gamma','html');
    vscodeMock.window.activeTextEditor=editor;
    for(let i=1;i<=2;i++) {
      editor.selection=new Selection(new Position(0,(i-1)*2),new Position(0,(i-1)*2+2));
      await registered.get(`codingTools.copy${i}`)();
    }
    assert.deepEqual([1,2].map(n=>store.get(`coding-tools.slot.${n}`)), ['al','ph']);
    assert.equal(clipboard,'ph');
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
  await test('Explorer history opens the newest diff directly without searching', async () => {
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
    await registered.get('codingTools.openLatestDiff')();
    assert.match(lastOpenedDocument.getText(), /^--- /);
  });
  await test('when no selection, copies full current line including newline' , async () => {
    const editor=makeEditor('one\ntwo','css');
    editor.selection=new Selection(new Position(1,1), new Position(1,1));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copy2')();
    assert.equal(store.get('coding-tools.slot.2'),'two\n');
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
    await registered.get('codingTools.copyClassName')();
    assert.equal(clipboard,'second');
  });
  await test('copy class name sends plain token to clipboard', async () => {
    const editor=makeEditor('<div class="card highlight">', 'html');
    editor.selection=new Selection(new Position(0,17),new Position(0,17));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copyClassName')();
    assert.equal(clipboard,'highlight');
  });

  await test('QuickPick selects second of two slots', async () => {
    const editor=makeEditor('','css');
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.choosePasteSlot')();
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
  await test('HTML class selection + ordinary copy gives undotted text in find/search and dotted CSS paste', async () => {
    const html='<div class="card active">';
    const editor=makeEditor(html,'html');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(editor.document.positionAt(html.indexOf('active')),editor.document.positionAt(html.indexOf('active')+6));
    await registered.get('codingTools.smartCopy')();
    assert.equal(clipboard,'active'); // Finder or Search UI uses ordinary paste.
    const cssEditor=makeEditor('','css');
    vscodeMock.window.activeTextEditor=cssEditor;
    await registered.get('codingTools.smartPaste')();
    assert.equal(cssEditor.document.text,'.active {\n}\n');
  });
  await test('CSS .class selection + ordinary copy gives undotted clipboard and dotted CSS paste', async () => {
    const css='.card:hover { color: red; }';
    const editor=makeEditor(css,'css');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(editor.document.positionAt(0), editor.document.positionAt(5));
    await registered.get('codingTools.smartCopy')();
    assert.equal(clipboard,'card');
    const dest=makeEditor('.','css');
    dest.selection=new Selection(new Position(0,1),new Position(0,1));
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.smartPaste')();
    assert.equal(dest.document.text,'.card'); // do not add a second dot
  });
  await test('copyClassName works in CSS with no selection and pastes with dot', async () => {
    const css='.teacher {display:block;}';
    const editor=makeEditor(css,'css');
    editor.selection=new Selection(new Position(0,3),new Position(0,3));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copyClassName')();
    assert.equal(clipboard,'teacher');
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.smartPaste')();
    assert.equal(dest.document.text,'.teacher {\n}\n');
  });
  await test('numbered slot class copy from CSS pastes with dot in CSS and without dot in HTML', async () => {
    const editor=makeEditor('.subject {}', 'css');
    vscodeMock.window.activeTextEditor=editor;
    editor.selection=new Selection(new Position(0,0),new Position(0,8));
    await registered.get('codingTools.copy1')();
    assert.equal(clipboard,'subject');
    assert.equal(store.get('coding-tools.slot.1'),'subject');
    assert.equal(store.get('coding-tools.class-slot.1'), true);
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.paste1')();
    assert.equal(dest.document.text,'.subject');
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
    assert.equal(clipboard,'card');
    const cssDest=makeEditor('','css');
    vscodeMock.window.activeTextEditor=cssDest;
    await registered.get('codingTools.paste2')();
    assert.equal(cssDest.document.text,'.card');
  });
  await test('ordinary CSS snippet copy and paste remains unchanged without class conversion', async () => {
    const editor=makeEditor('.card {color: red;}', 'css');
    editor.selection=new Selection(new Position(0,0),new Position(0,19));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.smartCopy')();
    assert.equal(clipboard,'.card {color: red;}');
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.smartPaste')();
    assert.equal(dest.document.text,'.card {color: red;}');
    assert.equal(fallbackCommands.at(-1), 'editor.action.clipboardPasteAction');
  });
  await test('clipboard change after class copy disables dot insertion on CSS paste', async () => {
    const editor=makeEditor('<p class="new">','html');
    editor.selection=new Selection(new Position(0,10),new Position(0,10));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.copyClassName')();
    clipboard='hello world';
    const dest=makeEditor('', 'css');
    vscodeMock.window.activeTextEditor=dest;
    await registered.get('codingTools.smartPaste')();
    assert.equal(dest.document.text,'hello world');
  });
  await test('ordinary copy after class copy resets the class flag', async () => {
    const editor=makeEditor('.item {}', 'css');
    editor.selection=new Selection(new Position(0,0),new Position(0,5));
    vscodeMock.window.activeTextEditor=editor;
    await registered.get('codingTools.smartCopy')();
    editor.selection=new Selection(new Position(0,0),new Position(0,8));
    await registered.get('codingTools.smartCopy')();
    assert.equal(clipboard,'.item {}');
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
  await test('smart paste inserts class rule between HTML-adjacent CSS classes', async () => {
    const html='<section class="course"><h2 class="course__title"></h2><p class="course__text"></p><a class="course__link"></a></section>';
    const source=makeEditor(html,'html');
    const start=html.indexOf('course__text');
    source.selection=new Selection(source.document.positionAt(start),source.document.positionAt(start+'course__text'.length));
    vscodeMock.window.activeTextEditor=source;
    await registered.get('codingTools.smartCopy')();
    assert.equal(clipboard,'course__text');
    const css=makeEditor('.course {}\n.course__title {}\n.course__link {}','css');
    vscodeMock.window.activeTextEditor=css;
    await registered.get('codingTools.smartPaste')();
    const updated=css.document.text;
    assert.ok(updated.indexOf('.course__title')<updated.indexOf('.course__text'));
    assert.ok(updated.indexOf('.course__text')<updated.indexOf('.course__link'));
    assert.match(updated,/\.course__text \{/);
  });
  await test('a unique matching rule navigates without changing source CSS', async () => {
    const html=makeEditor('<div class="card"></div>','html');
    html.selection=new Selection(new Position(0,13),new Position(0,13));
    vscodeMock.window.activeTextEditor=html;
    await registered.get('codingTools.copyClassName')();
    const css=makeEditor('.title {}\n.card { color: blue; }','css');
    vscodeMock.window.activeTextEditor=css;
    const old=css.document.text;
    await registered.get('codingTools.smartPaste')();
    assert.equal(css.document.text,old);
    assert.equal(css.document.offsetAt(css.selection.active),css.document.text.indexOf('.card'));
  });
  await test('copying normal HTML text pastes normally without a CSS conversion', async () => {
    const html=makeEditor('<p style="font-size:24px">title</p>','html');
    html.selection=new Selection(new Position(0,26),new Position(0,31));
    vscodeMock.window.activeTextEditor=html;
    await registered.get('codingTools.smartCopy')();
    const destination=makeEditor('body {font-family: }','css');
    destination.selection=new Selection(new Position(0,18),new Position(0,18));
    vscodeMock.window.activeTextEditor=destination;
    await registered.get('codingTools.smartPaste')();
    assert.ok(fallbackCommands.at(-1)==='editor.action.clipboardPasteAction');
  });
  await test('ambiguous existing base/media shows conditions rather than auto merging', async () => {
    const editor=makeEditor('.card {}\n@media (min-width: 768px) {.card {}}','css');
    editor.selection=new Selection(new Position(0,0),new Position(0,0));
    vscodeMock.window.activeTextEditor=editor;
    await store.set('coding-tools.lastClassClipboard','card');
    clipboard='card';
    const original=vscodeMock.window.showQuickPick;
    let options=[];
    vscodeMock.window.showQuickPick=async(items)=>{options=items;return items[0]};
    try {await registered.get('codingTools.smartPaste')();} finally {vscodeMock.window.showQuickPick=original;}
    const display=confirmationPanels.at(-1).webview.html;
    assert.match(display, /既存へ移動/);
    assert.match(display, /既存の条件内に追加/);
    assert.match(display, /ArrowRight/);
    assert.match(display, /ArrowLeft/);
    assert.match(display, /ArrowDown/);
    assert.match(display, /ArrowUp/);
    assert.match(display, /Enter/);
    assert.equal(editor.document.text,'.card {}\n@media (min-width: 768px) {.card {}}');
  });
  await test('explicit CSS location command does not paste random text', async()=>{
    const editor=makeEditor('<p></p>','html');vscodeMock.window.activeTextEditor=editor;
    clipboard='font-family: serif;';
    await registered.get('codingTools.placeCss')();
    assert.equal(editor.document.text,'<p></p>');
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
  for(const s of context.subscriptions) s.dispose?.();
  await require('node:fs/promises').rm(context.globalStorageUri.fsPath,{recursive:true,force:true});
  console.log(`\nAll tests passed.`);
})().catch((err)=>{console.error(err);process.exitCode=1;});
