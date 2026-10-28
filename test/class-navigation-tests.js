'use strict';
const assert=require('node:assert/strict');
const {classAtSelection,sameClass,registerClassContext}=require('../src/class-navigation');
const pkg=require('../package.json');
function editor(text,languageId,at,end=at){
  const selection={anchor:{offset:at},active:{offset:end}};
  return {document:{languageId,getText:()=>text,offsetAt:p=>p.offset},selection,selections:[selection]};
}
for(const [text,lang] of [['<p class="a b"></p><i class="a"></i><b class="a"></b>','html'],['.a {} .b {} @media screen { .a {} } .a:hover {}','css']]){
  const token=lang==='css'?'.a':'a';const first=lang==='css'?text.indexOf(token):text.indexOf('class="a')+7,second=lang==='css'?text.indexOf(token,first+token.length):text.indexOf('class="a',first+1)+7,last=lang==='css'?text.lastIndexOf(token):text.lastIndexOf('class="a')+7;
  const e=editor(text,lang,first);
  assert.equal(classAtSelection(e).name,'a');
  assert.equal(sameClass(e,1).start,second);
  assert.equal(sameClass(e,-1).start,last);
  assert.equal(sameClass(editor(text,lang,last),1).start,first);
  assert.equal(sameClass(editor(text,lang,second),-1).start,first);
  assert.equal(sameClass(editor(text,lang,first,first+token.length),1).start,second);
}
assert.equal(sameClass(editor('.single {}','css',2),1),null);
assert.equal(classAtSelection(editor('text','plaintext',1)),null);
assert.equal(classAtSelection(editor('.a {}','css',4)),null);
assert.equal(classAtSelection(editor('.a {}','css',0,5)),null);
assert.equal(classAtSelection(editor('<div className={styles.a}>','typescriptreact',23)),null);
const multi=editor('.a {}','css',1);multi.selections.push(multi.selection);assert.equal(classAtSelection(multi),null);
const handlers={},calls=[],disposable={dispose(){}};
const mock={window:{activeTextEditor:editor('.a {}','css',1),onDidChangeTextEditorSelection:cb=>(handlers.selection=cb,disposable),onDidChangeActiveTextEditor:cb=>(handlers.active=cb,disposable)},workspace:{onDidChangeTextDocument:cb=>(handlers.text=cb,disposable)},commands:{executeCommand:(...args)=>calls.push(args)}};
const context={subscriptions:[]};registerClassContext(mock,context);
assert.deepEqual(calls.at(-1),['setContext','codingTools.classAtCursor',true]);
handlers.selection();assert.equal(calls.length,1);
mock.window.activeTextEditor=editor('.a {}','css',4);handlers.selection();
assert.equal(calls.at(-1)[2],false);
context.subscriptions.at(-1).dispose();assert.equal(calls.at(-1)[2],false);
for(const [key,command] of [['ctrl+2','nextClass'],['ctrl+1','previousClass'],['ctrl+tab','nextSameClass'],['ctrl+shift+tab','previousSameClass']]){
  const binding=pkg.contributes.keybindings.find(k=>k.key===key&&k.command==='codingTools.'+command);
  assert.ok(binding,key);
  for(const guard of ['codingTools.classAtCursor','!suggestWidgetVisible','!inSnippetMode','!editorTabMovesFocus'])assert.ok(binding.when.includes(guard));
}
for(const [command,key,mac] of [['previousClass','ctrl+1','cmd+1'],['nextClass','ctrl+2','cmd+2']]){
  const entries=pkg.contributes.keybindings.filter(k=>k.command==='codingTools.'+command);
  assert.equal(entries.length,1,'Exactly one default binding per class movement command');
  assert.equal(entries[0].key,key);assert.equal(entries[0].mac,mac);
}
console.log('class-navigation-tests: same-file forward/backward/wrap, context and guarded keys passed');
