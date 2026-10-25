'use strict';
const assert=require('node:assert/strict');
const p=require('../placement');
let passed=0;
function t(name,fn){fn();passed++;console.log('✓',name)}
t('Basic HTML sibling order chooses between title and link',()=>{
 const css='.course {padding:10px;}\n.course__title {}\n.course__link {}';
 const plan=p.candidates(css,'.course__text',{offset:0,neighbors:{before:'course__title',after:'course__link'}});
 assert.equal(plan.preferred,'insert');
 const ins=p.formatInsert(css,'.course__text',plan.anchor);
 const updated=css.slice(0,ins.offset)+ins.text+css.slice(ins.offset);
 assert.ok(updated.indexOf('.course__title')<updated.indexOf('.course__text'));
 assert.ok(updated.indexOf('.course__text')<updated.indexOf('.course__link'));
});
t('Same selector in root and media must not auto-choose an existing one',()=>{
 const css='.card {}\n@media (min-width: 768px) {.card {display:flex;}}';
 const plan=p.candidates(css,'.card',{offset:0});
 assert.equal(plan.allExact.length,2);assert.equal(plan.preferred,'existing');
});
t('One existing selector in current scope can be navigated to',()=>{
 const plan=p.candidates('.card {}','.card',{offset:0});
 assert.equal(plan.allExact.length,1);assert.equal(plan.preferred,'existing');
});
t('Media scopes stay separated',()=>{
 const css='.list{}\n@media (min-width: 768px){.list{}}';
 const plan=p.candidates(css,'.list',{offset:css.indexOf('.list', 15)});
 assert.equal(plan.allExact.length,2);
 assert.equal(p.scopeLabel(plan.exactHere[0]),'@media (min-width: 768px)');
});
t('Sibling + placed after item base and before positional exceptions',()=>{
 const css='.list__item {}\n.list__item:nth-child(odd) {}';
 const plan=p.candidates(css,'.list__item + .list__item',{offset:0});
 const ins=p.formatInsert(css,'.list__item + .list__item',plan.anchor);
 const update=css.slice(0,ins.offset)+ins.text+css.slice(ins.offset);
 assert.ok(update.indexOf('.list__item +')>update.indexOf('.list__item {}'));
 assert.ok(update.indexOf('.list__item +')<update.indexOf(':nth-child'));
});
t('Pseudo class grouped with related selectors',()=>{
 const plan=p.candidates('.button {}\n.button--large {}','.button:hover',{offset:0});
 assert.equal(plan.confident,true);
});
t('Media/Container/Layer/Supports paths are not flattened or merged',()=>{
 const css='@layer components {\n@supports (display:grid) {\n@media (min-width: 700px){.card {}}\n}\n}\n@container (min-width: 400px) {.card {}}';
 const tree=p.parseCss(css);
 assert.equal(tree.invalid,false);
 const items=p.rules(tree).filter(r=>r.prelude==='.card');
 assert.equal(items.length,2);assert.notEqual(p.scopeKey(items[0]),p.scopeKey(items[1]));
});
t('Comma inside :is() is not a separate rule',()=>{
 assert.equal(p.ruleHasExact(p.rules(p.parseCss('.card:is(h2, h3), .link {}'))[0],'.card:is(h2, h3)'),true);
});
t('Comments / strings with braces do not confuse scanner',()=>{
 const tree=p.parseCss('/* { */.card {content:"}";}');
 assert.equal(tree.invalid,false); assert.equal(p.rules(tree).length,1);
});
t('Syntax errors safely disable automatic placement',()=>{
 assert.equal(p.candidates('.card { color:red;', '.new',{offset:0}).safe,false);
});
t('Only safe CSS selector snippets qualify',()=>{
 assert.equal(p.selectorFromClipboard('font-size: 24px;',null),null);
 assert.equal(p.selectorFromClipboard('title string',null),null);
 assert.equal(p.selectorFromClipboard('card','card'),'.card');
 assert.equal(p.selectorFromClipboard('.item + .item',null),'.item + .item');
 assert.equal(p.selectorFromClipboard('p:nth-of-type(2)',null),'p:nth-of-type(2)');
});
t('Generate new media only with valid rule',()=>{
 assert.equal(p.wrapNewMedia('.card {}','.title','@media (min-width: 768px)')!==null,true);
 assert.equal(p.wrapNewMedia('.card {}','.title','@media foo {bad}') ,null);
});
console.log(`Placement tests passed: ${passed}`);
