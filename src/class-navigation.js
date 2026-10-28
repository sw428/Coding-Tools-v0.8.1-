'use strict';
const {findCssClasses,findHtmlClasses}=require('./selectors');
const CSS=new Set(['css','scss','less']);
const HTML=new Set(['html','vue','php','javascriptreact','typescriptreact']);
function classes(document){
  if(CSS.has(document.languageId))return findCssClasses(document.getText());
  if(HTML.has(document.languageId))return findHtmlClasses(document.getText());
  return [];
}
function classAtSelection(editor){
  if(!editor||editor.selections.length!==1)return null;
  const doc=editor.document,selection=editor.selection;
  const a=doc.offsetAt(selection.anchor),b=doc.offsetAt(selection.active);
  const start=Math.min(a,b),end=Math.max(a,b);
  const token=classes(doc).find(c=>start===end?c.start<=start&&start<c.end:
    c.end===end&&(c.start===start||CSS.has(doc.languageId)&&c.start+1===start))||null;
  return token && !/[{}<>]/.test(token.name) && !(CSS.has(doc.languageId)&&doc.getText()[token.end]==='\\')?token:null;
}
function sameClass(editor,direction){
  const current=classAtSelection(editor);
  if(!current)return null;
  const matches=classes(editor.document).filter(c=>c.name===current.name);
  const next=direction<0?matches.filter(c=>c.start<current.start).at(-1)||matches.at(-1):matches.find(c=>c.start>current.start)||matches[0];
  return next.start===current.start?null:next;
}
function registerClassContext(vscode,context){
  let last;
  const update=()=>{
    const on=!!classAtSelection(vscode.window.activeTextEditor);
    if(on!==last){last=on;void vscode.commands.executeCommand('setContext','codingTools.classAtCursor',on);}
  };
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(update),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument(update),
    {dispose(){void vscode.commands.executeCommand('setContext','codingTools.classAtCursor',false);}}
  );
  update();
}
module.exports={classAtSelection,sameClass,registerClassContext};
