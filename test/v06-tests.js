'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const history=require('../history');
const settings=require('../settings');
async function main(){
  const values=new Map();
  const ctx={globalState:{get:(k,f)=>values.has(k)?values.get(k):f,update:async(k,v)=>{values.set(k,v);}},globalStorageUri:{fsPath:await fs.mkdtemp(path.join(os.tmpdir(),'ct-v06-'))}};
  try {
    for(const x of settings.OPTIONS)assert.equal(settings.enabled(ctx,x.key),true);
    await settings.setEnabled(ctx,'save',false);
    assert.equal(settings.enabled(ctx,'save'),false);
    assert.equal(settings.enabled(ctx,'operation'),true);
    const uri={fsPath:path.join(ctx.globalStorageUri.fsPath,'style.css'),toString(){return pathToFileURL(this.fsPath).href;}};
    const now=new Date('2026-10-25T00:00:00Z');
    const old=new Date('2026-07-01T00:00:00Z');
    for(const stage of ['operation','save','push']){
      const entry=await history.record(ctx,{stage,before:'a',after:'b',action:stage,sourceUri:uri,now});
      assert.ok(entry.diffPath.includes(history.STAGES[stage].dir));
    }
    const oldOp=await history.record(ctx,{stage:'operation',before:'a',after:'b',action:'old',sourceUri:uri,now:old});
    const logs=await history.entries(ctx);
    assert.equal(logs.length,4);
    assert.deepEqual(new Set(logs.map(x=>x.stage)),new Set(['operation','save','push']));
    await history.prune(ctx,new Date('2026-10-26T00:00:00Z'));
    assert.equal((await history.entries(ctx)).length,3);
    await assert.rejects(fs.access(oldOp.diffPath));
    console.log('v06-tests: passed');
  }finally{await fs.rm(ctx.globalStorageUri.fsPath,{force:true,recursive:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
