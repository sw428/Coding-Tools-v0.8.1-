'use strict';
const assert=require('node:assert/strict');
const p=require('../src/placement');
const safe=require('../src/safe-placement');
let passed=0;
const t=(name,fn)=>{fn();console.log('✓',name);passed++;};
function direct(before,selector,at=before.length,container=null){
  const tree=p.parseCss(before);
  const insertion=p.formatInsert(before,selector,{offset:at,container:container||tree.root});
  return safe.preflight(before,selector,insertion);
}
t('Root insertion: exactly one empty rule while preserving declarations',()=>{
  const before='.card { color: red; }\n.card:hover { color: blue; }\n';
  const result=direct(before,'.card__title');
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.after.includes('color: red'),true);
  assert.equal(result.after.includes('.card__title {'),true);
});
t('Insert within media without rewriting media conditions',()=>{
  const before='@media (min-width: 768px) {\n  .card { display:grid; }\n}\n';
  const at=p.atRules(p.parseCss(before),'media')[0];
  const result=direct(before,'.card__title',at.end-1,at);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(result.after.indexOf('.card__title')<result.after.indexOf('}\n',result.after.indexOf('.card__title')));
});
t('New @media with one empty rule only',()=>{
  const before='.card {display:block;}\n';
  const addition=p.wrapNewMedia(before,'.card','@media (min-width: 900px)');
  const result=safe.preflight(before,'.card',addition);
  assert.equal(result.ok,true,JSON.stringify(result));
});
t('Syntax errors in original stylesheet prevent edit',()=>{
  assert.equal(direct('.card { color:red;','.new').ok,false);
  assert.equal(direct('.card { color:; }','.new').ok,true); // valid CSS syntax despite questionable value
});
t('Unsafe insertion into declaration rejected before applying',()=>{
  const before='.card {color:red; }';
  const insertion={offset:before.indexOf('red')+1,text:'\n.new {}\n'};
  assert.equal(safe.preflight(before,'.new',insertion).ok,false);
});
t('Reject declarations, comments, second rule, and selector injection',()=>{
  const before='.card {}';
  for(const text of ['.new {color:red;}','.new {}\n.extra {}','/* note */ .new {}','.new {color: red;}']){
    assert.equal(safe.preflight(before,'.new',{offset:before.length,text}).ok,false,text);
  }
  assert.equal(safe.preflight(before,'.new {bad}',{offset:before.length,text:'.new {}'}).ok,false);
});
t('Abort SCSS and LESS (fail closed)',()=>{
  assert.equal(safe.preflight('.a {}','.b',{offset:5,text:'.b {}'},'scss').ok,false);
  assert.equal(safe.preflight('.a {}','.b',{offset:5,text:'.b {}'},'less').ok,false);
});
t('Malformed inserted syntax is rejected',()=>{
  assert.equal(safe.preflight('.a {}','.b',{offset:5,text:'.b {'}).ok,false);
});
t('No CSS declaration values are changed by safe insertion',()=>{
  const before='@layer components {\n .card { display: flex; }\n}\n';
  const at=p.atRules(p.parseCss(before),'layer')[0];
  const result=direct(before,'.card__title',at.end-1,at);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(result.after.includes('display: flex;'));
});
t('Root insertion does not accidentally nest in @media',()=>{
  const before='@media (min-width: 768px) {.card {}}\n';
  const result=direct(before,'.new');
  assert.equal(result.ok,true,JSON.stringify(result));
});
console.log(`Safe placement passed: ${passed}`);
