'use strict';
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const path = require('node:path');
const history = require('./history');
const settings = require('./settings');
const run = promisify(execFile);
async function git(cwd,args) {
  const {stdout}=await run('git',args,{cwd,timeout:120000,maxBuffer:12*1024*1024,windowsHide:true});
  return stdout.trimEnd();
}
function registerGitPushHistory(vscode,context,refresh) {
  context.subscriptions.push(vscode.commands.registerCommand('codingTools.pushAndLog',async()=>{
    const folder=vscode.workspace.workspaceFolders?.[0];
    if(!folder||folder.uri.scheme!=='file') {
      vscode.window.showWarningMessage('Git pushを実行するにはローカルのワークスペースを開いてください。');return;
    }
    const cwd=folder.uri.fsPath;
    try {
      const repo=await git(cwd,['rev-parse','--show-toplevel']);
      const branch=await git(repo,['branch','--show-current']);
      if(!branch)throw new Error('ブランチを特定できません（detached HEAD）。');
      let upstreamBefore='';
      try {upstreamBefore=await git(repo,['rev-parse','@{upstream}']);}catch(_){/* first push */}
      const head=await git(repo,['rev-parse','HEAD']);
      const choice=await vscode.window.showWarningMessage(`Git pushを実行しますか？ ${branch}` ,{modal:true},'実行');
      if(choice!=='実行')return;
      const output=await git(repo,['push']);
      if(settings.enabled(context,'push')) {
        const patch=upstreamBefore ? await git(repo,['diff','--no-ext-diff',upstreamBefore,head]) : '';
        await history.recordPatch(context,{stage:'push',patch,action:`Git push成功: ${branch}`,
          sourceUri:vscode.Uri.file(path.join(repo,'.git')),sourceName:path.basename(repo),
          details:{repo,branch,head,upstreamBefore,output}});
        await history.prune(context);
        refresh();
      }
      vscode.window.showInformationMessage(`Coding Tools: Git push成功 (${branch})`);
    }catch(e){vscode.window.showErrorMessage(`Coding Tools: Git pushが完了していません／履歴を記録できません: ${e.message}`);}
  }));
}
module.exports={registerGitPushHistory};
