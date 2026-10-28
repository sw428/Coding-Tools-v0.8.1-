'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
const binds=pkg.contributes.keybindings||[];
const reserved=new Set(['ctrl+c','ctrl+v','cmd+c','cmd+v']);
for(const entry of binds){
  for(const key of ['key','mac','linux','win']){
    if(entry[key])assert.ok(!reserved.has(entry[key].toLowerCase()),`native ${entry[key]} overridden by ${entry.command}`);
  }
}
for(const id of ['codingTools.copy1','codingTools.paste1','codingTools.copy2','codingTools.paste2']){
  assert.ok(pkg.contributes.commands.some(x=>x.command===id),`${id} must remain available`);
}
assert.ok(binds.some(e=>e.command==='codingTools.copy1'));
assert.ok(binds.some(e=>e.command==='codingTools.paste1'));
assert.ok(pkg.contributes.commands.some(c=>c.command==='codingTools.jumpBetweenHtmlCss'));
assert.ok(!binds.some(e=>e.command==='codingTools.jumpBetweenHtmlCss'),'The derived command has no unsolicited default key');
assert.ok(!binds.some(e=>e.key==='f12'),'Native Go to Definition must remain available');
assert.ok(pkg.description.includes('β'), 'description must identify the beta release');
for(const {command} of pkg.contributes.commands){
  assert.ok(pkg.contributes.menus.commandPalette.some(item=>item.command===command&&item.when==='false'),'Palette entry visible: '+command);
}
console.log('native-shortcuts-tests: passed');

for(const n of [1,2]){
  const entries=binds.filter(e=>e.command==='codingTools.paste'+n);
  assert.ok(entries.some(e=>e.when==='editorTextFocus'&&!e.args));
  assert.ok(entries.some(e=>e.when==='inputFocus && !editorTextFocus'&&e.args?.target==='input'));
}

for(const n of [1,2]){
 const entries=binds.filter(k=>k.command==='codingTools.paste'+n);
 for(const [when,target] of [['searchInputBoxFocus','workspaceSearch'],['findInputFocussed','editorSearch']])assert.ok(entries.some(k=>k.when===when&&k.args?.target===target));
}
