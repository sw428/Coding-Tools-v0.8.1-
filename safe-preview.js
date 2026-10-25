'use strict';

/** Read-only virtual CSS documents for a temporary VS Code side-by-side diff. */
const scheme='coding-tools-safe-preview';
const documents=new Map();
let sequence=0;
function register(vscode, context){
  const provider={provideTextDocumentContent(uri){return documents.get(uri.toString())||'';}};
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme,provider));
}
async function show(vscode, before, after, selector){
  const id=++sequence;
  const a=vscode.Uri.from({scheme,path:`/preview-${id}-before.css`});
  const b=vscode.Uri.from({scheme,path:`/preview-${id}-after.css`});
  documents.set(a.toString(),before);
  documents.set(b.toString(),after);
  // Avoid an unbounded long-lived cache while keeping open diff tabs readable.
  if(documents.size>60){const first=[...documents.keys()].slice(0,documents.size-60);for(const key of first)documents.delete(key);}
  await vscode.commands.executeCommand('vscode.diff',a,b,`Coding Tools 安全確認：${selector}（変更前 ⇄ 変更後）`,{preview:true});
}
module.exports={register,show};
