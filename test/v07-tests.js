 'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const settings=require('../settings');
const history=require('../history');
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
    assert.equal(docs.filter(x=>x.endsWith('.svg')).length,9);
    const test_svg=await fs.readFile(path.join(__dirname,'..','docs','07-internal-settings.svg'),'utf8');
    assert.match(test_svg,/@keyframes/);
    assert.match(test_svg,/360/);
    const source=await fs.readFile(path.join(__dirname,'..','settings.js'),'utf8');
    assert.match(source,/globalState/);
    assert.doesNotMatch(source,/getConfiguration\(/);
    console.log('v07-tests: passed');
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
