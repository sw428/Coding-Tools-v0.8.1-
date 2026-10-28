'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const history=require('../src/history');

async function run(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'coding-tools-test-'));
  const context={globalStorageUri:{fsPath:root}};
  try {
    assert.match(history.unifiedDiff('.a {}\n','.a {color:red;}\n','style.css'),/^-\.a \{\}/m);
    assert.match(history.unifiedDiff('.a {}\n','.a {color:red;}\n','style.css'),/^\+\.a \{color:red;\}/m);
    assert.equal(history.unifiedDiff('abc','abc','a.txt'),null);
    const file=path.join(root,'style.css');
    const uri={fsPath:file,toString(){return pathToFileURL(file).href}};
    const d1=new Date('2023-10-24T12:00:00Z');
    const d2=new Date('2026-10-05T12:00:00Z');
    const d3=new Date('2026-10-25T01:10:00Z');
    const old=await history.record(context,{before:'a\n',after:'b\n',action:'保存枠1の貼り付け',sourceUri:uri,now:d1});
    const borderline=await history.record(context,{before:'b\n',after:'c\n',action:'通常の貼り付け',sourceUri:uri,now:d2});
    const fresh=await history.record(context,{before:'c\n',after:'d\n',action:'CSSへ追加：.card',sourceUri:uri,now:d3,targetLine:7});
    assert.equal((await history.entries(context)).length,3);
    assert.equal((await history.entries(context))[0].targetLine,7);
    assert.equal((await fs.readFile(fresh.diffPath,'utf8')).includes('+d'),true);
    const removed=await history.prune(context,new Date('2026-10-25T12:00:00Z'));
    assert.equal(removed,2);
    assert.equal((await history.entries(context)).length,2);
    await assert.rejects(fs.access(old.diffPath));
    await fs.access(borderline.diffPath);
    await fs.access(fresh.metaPath);
    assert.equal(history.month(new Date(2026,9,31)), '2026-10');
    assert.equal(history.expiry(new Date(2024,1,29),30).getMonth(),0);
    console.log('history-tests: passed');
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
