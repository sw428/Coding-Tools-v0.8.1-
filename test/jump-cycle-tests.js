'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const jump=require('../src/cross-navigation');
const pkg=require('../package.json');
const src=`<section class="course"><h2 class="course__title">A</h2><p class="course__body">B</p></section>`;
const good=`.course {} .course__title {} .course__body {}`;
const weak=`.other {} .course__title {} .unrelated {}`;
const source={filename:'/work/index.html',text:src,languageId:'html',start:src.indexOf('course__title')};
const targets=[
  {filename:'/work/other.css',languageId:'css',destination:'css',content:weak,start:weak.indexOf('.course__title'),name:'course__title'},
  {filename:'/work/style.css',languageId:'css',destination:'css',content:good,start:good.indexOf('.course__title'),name:'course__title'},
];
const ranked=jump.rankCandidates(source,targets);
assert.equal(ranked[0].filename,'/work/style.css','matching neighboring classes must rank first');
assert.equal(ranked.length,2,'other candidates are retained');
const binds=pkg.contributes.keybindings;
const escape=binds.find(x=>x.command==='codingTools.endJumpCycle');
assert.equal(escape.key,'escape');assert.ok(escape.when.includes('codingTools.jumpCycle'));
assert.ok(!binds.some(x=>['codingTools.cycleNextJump','codingTools.cyclePreviousJump'].includes(x.command)),'Class navigation owns Tab; jump candidates use their status bar button');
assert.ok(!pkg.contributes.keybindings.some(x=>['ctrl+c','ctrl+v','cmd+c','cmd+v'].includes(x.key?.toLowerCase())));
const extension=fs.readFileSync(path.join(__dirname,'../src/extension.js'),'utf8');
assert.ok(extension.includes('jumpSession={candidates:ranked'));
assert.ok(!extension.includes('const pick = await vscode.window.showQuickPick(options'),'jump must not show a selection menu');
assert.ok(extension.includes('clearJumpSession();'));
console.log('✓ Direct editor navigation, contextual ranking, status-bar cycle, Esc, no modal');
