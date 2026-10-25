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
for(const id of ['codingTools.smartCopy','codingTools.smartPaste','codingTools.copy1','codingTools.paste1']){
  assert.ok(pkg.contributes.commands.some(x=>x.command===id),`${id} must remain available`);
}
assert.ok(binds.some(e=>e.command==='codingTools.copy1'));
assert.ok(binds.some(e=>e.command==='codingTools.paste1'));
assert.ok(pkg.description.includes('β'), 'description must identify the beta release');
console.log('native-shortcuts-tests: passed');
