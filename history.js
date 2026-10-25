'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./settings');

const ROOT_FOLDER = 'coding-tools-history';
const STAGES = { operation: { dir: '01_操作履歴', days: 30 }, save: { dir: '02_保存履歴', days: 90 }, push: { dir: '03_Git履歴', days: 90 } };
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ENTRY_PATTERN = /^(\d{8}T\d{6}\.\d{3})-([a-f0-9]{6})\.(diff|json)$/;

function folder(context) {
  return path.join(context.globalStorageUri.fsPath, ROOT_FOLDER);
}

function isoFileStamp(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

function month(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function expiry(now, days = 30) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
function stageDir(root, stage, date) {
  if (!STAGES[stage]) throw new Error('Unknown history stage: '+stage);
  return path.join(root, STAGES[stage].dir, month(date));
}

// One contiguous, line-oriented unified diff with three lines of context.
// This records the exact changed lines; no full-copy backup of the source.
function unifiedDiff(before, after, name) {
  if (before === after) return null;
  const old = before.replace(/\r\n/g, '\n').split('\n');
  const fresh = after.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < old.length && start < fresh.length && old[start] === fresh[start]) start++;
  let tail = 0;
  while (tail < old.length - start && tail < fresh.length - start &&
    old[old.length - tail - 1] === fresh[fresh.length - tail - 1]) tail++;
  const beforeStart = Math.max(0, start - 3);
  const beforeEnd = old.length - tail;
  const afterEnd = fresh.length - tail;
  const endContext = Math.min(tail, 3);
  const beforeCount = beforeEnd - beforeStart + endContext;
  const afterCount = afterEnd - beforeStart + endContext;
  const output = [
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -${beforeStart + 1},${beforeCount} +${beforeStart + 1},${afterCount} @@`,
  ];
  for (let i = beforeStart; i < start; i++) output.push(' ' + old[i]);
  for (let i = start; i < beforeEnd; i++) output.push('-' + old[i]);
  for (let i = start; i < afterEnd; i++) output.push('+' + fresh[i]);
  for (let i = 0; i < endContext; i++) output.push(' ' + old[beforeEnd + i]);
  return output.join('\n') + '\n';
}

async function record(context, { before, after, action, sourceUri, targetLine = 0, now = new Date(), stage = 'operation' }) {
  if (before === after) return null;
  const name = path.basename(sourceUri?.fsPath || sourceUri?.path || 'untitled.txt');
  const contents = unifiedDiff(before, after, name);
  if (!contents) return null;
  const root = folder(context);
  const dir = stageDir(root, stage, now);
  await fs.mkdir(dir, { recursive: true });
  const stem = isoFileStamp(now) + '-' + crypto.randomBytes(3).toString('hex');
  const diffPath = path.join(dir, stem + '.diff');
  const metaPath = path.join(dir, stem + '.json');
  const entry = {
    createdAt: now.toISOString(),
    action,
    sourceUri: sourceUri?.toString() || '',
    sourceName: name,
    targetLine,
    stage,
    diffPath,
    metaPath,
  };
  await fs.writeFile(diffPath, contents, { flag: 'wx', encoding: 'utf8' });
  try {
    await fs.writeFile(metaPath, JSON.stringify(entry, null, 2) + '\n', { flag: 'wx', encoding: 'utf8' });
  } catch (error) {
    await fs.unlink(diffPath).catch(() => {});
    throw error;
  }
  return entry;
}

// Git push and other trusted patch sources can be recorded without changing
// the editor. The patch may be empty for a push that has no outgoing changes.
async function recordPatch(context, { patch, action, sourceUri, sourceName, stage, details = {}, now = new Date() }) {
  const dir = stageDir(folder(context), stage, now);
  await fs.mkdir(dir, { recursive: true });
  const stem = isoFileStamp(now) + '-' + crypto.randomBytes(3).toString('hex');
  const diffPath = path.join(dir, stem + '.diff');
  const metaPath = path.join(dir, stem + '.json');
  const entry = {
    createdAt: now.toISOString(), action, stage, sourceUri: sourceUri?.toString() || '',
    sourceName: sourceName || 'Git', targetLine: 0, diffPath, metaPath,
    details
  };
  await fs.writeFile(diffPath, patch || '# Git push 成功。差分はありません（または初回pushで比較基準がありません）。\n', { flag: 'wx', encoding: 'utf8' });
  try {
    await fs.writeFile(metaPath, JSON.stringify(entry, null, 2)+'\n', { flag: 'wx', encoding: 'utf8' });
  } catch (error) {
    await fs.unlink(diffPath).catch(()=>{});
    throw error;
  }
  return entry;
}

async function entries(context) {
  const root=folder(context);
  const results=[];
  for(const [stage,conf] of Object.entries(STAGES)) {
    const branch=path.join(root,conf.dir);
    let months=[];
    try{months=await fs.readdir(branch,{withFileTypes:true});}
    catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const d of months) {
      if(!d.isDirectory()||!MONTH_PATTERN.test(d.name))continue;
      const location=path.join(branch,d.name);
      for(const file of await fs.readdir(location)) {
        if(!ENTRY_PATTERN.test(file)||!file.endsWith('.json'))continue;
        try {
          const metaPath=path.join(location,file);
          const info=JSON.parse(await fs.readFile(metaPath,'utf8'));
          const diffPath=path.join(location,file.slice(0,-5)+'.diff');
          await fs.access(diffPath);
          const created=new Date(info.createdAt);
          if(!Number.isFinite(created.getTime()))continue;
          results.push({
            createdAt:info.createdAt, action:String(info.action||'編集'),stage,
            details:info.details||{}, sourceName:String(info.sourceName||'(unknown)'),
            sourceUri:String(info.sourceUri||''),targetLine:Number.isInteger(info.targetLine)?info.targetLine:0,
            diffPath,metaPath,month:d.name
          });
        }catch(_){/* skip broken entries */}
      }
    }
  }
  return results.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

async function prune(context,now=new Date()) {
  const root=folder(context);
  let removed=0;
  for(const [stage,conf] of Object.entries(STAGES)) {
    const branch=path.join(root,conf.dir);
    let dirs=[];
    try{dirs=await fs.readdir(branch,{withFileTypes:true});}
    catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const d of dirs) {
      if(!d.isDirectory()||!MONTH_PATTERN.test(d.name))continue;
      const directory=path.join(branch,d.name);
      for(const file of await fs.readdir(directory)) {
        const m=ENTRY_PATTERN.exec(file);
        if(!m)continue;
        const stamp=m[1];
        const date=new Date(Number(stamp.slice(0,4)),Number(stamp.slice(4,6))-1,Number(stamp.slice(6,8)),
          Number(stamp.slice(9,11)),Number(stamp.slice(11,13)),Number(stamp.slice(13,15)),Number(stamp.slice(16,19)));
        if(!Number.isFinite(date.getTime())||date>=expiry(now,settings.retentionDays(context,stage)))continue;
        await fs.unlink(path.join(directory,file)).catch(e=>{if(e.code!=='ENOENT')throw e;});
        removed++;
      }
      if((await fs.readdir(directory)).length===0)await fs.rmdir(directory).catch(()=>{});
    }
  }
  return removed;
}

module.exports={ROOT_FOLDER,STAGES,folder,month,expiry,stageDir,unifiedDiff,record,recordPatch,entries,prune};
