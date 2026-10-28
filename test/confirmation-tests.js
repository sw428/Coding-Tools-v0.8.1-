'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {showConfirmation, escapeHtml} = require('../src/confirmation');

function stubPanel() {
  const panel = {disposed:false};
  panel.webview={
    html:'',
    onDidReceiveMessage(cb){panel.message=cb;}
  };
  panel.onDidDispose=cb=>panel.disposeCb=cb;
  panel.dispose=()=>{if(!panel.disposed){panel.disposed=true;panel.disposeCb();}};
  const vscode={ViewColumn:{Active:1},window:{createWebviewPanel(){return panel;}}};
  return {vscode,panel};
}

function scriptFor(panel) {
  const match=panel.webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline keyboard script exists');
  return match[1];
}

function createKeyboard(panel, count) {
  const rows=Array.from({length:count},()=>({
    classes:new Set(),
    attrs:{},
    classList:{toggle(name, enabled){if(enabled)this.parent.classes.add(name);else this.parent.classes.delete(name);}},
    setAttribute(k,v){this.attrs[k]=v;},
    querySelector(){return this.indicator;},
    scrollIntoView(){},
    addEventListener(k,cb){this.click=cb;},
    indicator:{textContent:''}
  }));
  rows.forEach(r=>r.classList.parent=r);
  const state={status:{textContent:''}, keydown:null, messages:[],buttons:{}};
  for(const id of ['confirm','cancel'])state.buttons[id]={addEventListener(_event,handler){this.click=handler;}};
  const document={
    querySelectorAll(){return rows;},
    getElementById(id){return id==='status'?state.status:state.buttons[id];},
    addEventListener(name,fn){if(name==='keydown')state.keydown=fn;},
    body:{focus(){}}
  };
  vm.runInNewContext(scriptFor(panel),{
    document,
    acquireVsCodeApi(){return {postMessage(msg){state.messages.push(msg);panel.message(msg);}}}
  });
  const press = (key, shiftKey=false) => {
    let prevented=false;
    state.keydown({key,shiftKey,preventDefault(){prevented=true;}});
    assert.equal(prevented,true,`Key ${key} prevented`);
  };
  return {press,rows,state};
}

(async()=>{
  assert.equal(escapeHtml('<script onload="x">'), '&lt;script onload=&quot;x&quot;&gt;');
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{title:'CSS追加',items:[{label:'既存に移動'},{label:'@mediaへ追加'}]});
    const {press,rows}=createKeyboard(panel,2);
    assert.equal(rows[0].attrs['aria-checked'],'true');
    assert.equal(rows[1].attrs['aria-checked'],'false');
    press('ArrowDown');
    assert.equal(rows[0].attrs['aria-checked'],'true','moving focus does not toggle choice');
    press('ArrowRight');
    assert.equal(rows[0].attrs['aria-checked'],'false','other option auto OFF');
    assert.equal(rows[1].attrs['aria-checked'],'true','focused option ON');
    press('Enter');
    const result=await pending;
    assert.equal(result.label,'@mediaへ追加');
    assert.equal(panel.disposed,true);
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'1'},{label:'2'}]});
    const {press,rows,state}=createKeyboard(panel,2);
    press('ArrowLeft');
    assert.equal(rows[0].attrs['aria-checked'],'false');
    press('Enter');
    assert.equal(state.messages.length,0,'Enter with everything OFF does nothing');
    press('ArrowDown');
    press('ArrowRight');
    press('Enter');
    assert.equal((await pending).label,'2');
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'1'}]});
    const {press}=createKeyboard(panel,1);
    press('Escape');
    assert.equal(await pending,null);
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'<img onerror=alert(1)>'}]});
    assert.ok(panel.webview.html.includes('&lt;img onerror=alert(1)&gt;'));
    panel.message({type:'confirm',index:22});
    assert.equal(panel.disposed,false,'invalid index ignored');
    panel.dispose();
    assert.equal(await pending,null);
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'基本ルール'},{label:'@media 768px'},{label:'@media 1200px'}]});
    const {press,rows,state}=createKeyboard(panel,3);
    press('Tab');assert.equal(rows[1].attrs['aria-checked'],'true');
    press('Tab');assert.equal(rows[2].attrs['aria-checked'],'true');
    press('Tab');assert.equal(rows[0].attrs['aria-checked'],'true');
    press('Tab',true);assert.equal(rows[2].attrs['aria-checked'],'true');
    assert.equal(state.messages.length,0,'Selecting with Tab must not execute');
    press('Enter');assert.equal((await pending).label,'@media 1200px');
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'基本ルール'},{label:'既存@media'}]});
    const {rows,state}=createKeyboard(panel,2);
    rows[1].click();assert.equal(state.messages.length,0);
    state.buttons.confirm.click();assert.equal((await pending).label,'既存@media');
  }
  {
    const {vscode,panel}=stubPanel();
    const pending=showConfirmation(vscode,{items:[{label:'基本ルール'}]});
    const {state}=createKeyboard(panel,1);state.buttons.cancel.click();assert.equal(await pending,null);
  }
  console.log('Confirmation keyboard and mouse tests passed: 7');
})().catch(e=>{console.error(e);process.exitCode=1;});
