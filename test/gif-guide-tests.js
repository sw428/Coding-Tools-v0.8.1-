'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const pkg = require('../package.json');
const manifest = require('../tools/gif-guide-manifest.json');
const guide = fs.readFileSync(path.join(root,'docs/visual-guide.html'),'utf8');
const covered = new Set(manifest.demos.flatMap(d=>d.commands));
for(const {command} of pkg.contributes.commands) assert.ok(covered.has(command),'Missing demo: '+command);
assert.equal(new Set(manifest.demos.map(d=>d.id)).size,manifest.demos.length);
for(const demo of manifest.demos){
 const file=path.join(root,'docs/media/gif',demo.id+'-'+demo.slug+'.gif');
 const data=fs.readFileSync(file);
 assert.equal(data.subarray(0,6).toString(),'GIF89a');
 assert.ok(data.includes(Buffer.from('NETSCAPE2.0')),'GIF must loop: '+file);
 assert.equal(data.at(-1),0x3b);
 assert.ok(guide.includes(demo.id+'-'+demo.slug+'.gif'));
}
let command;
let panel;
let reveals=0;
const disposable={dispose(){}};
class Emitter { constructor(){this.event=()=>disposable;} fire(){} dispose(){} }
const vscode={
 EventEmitter:Emitter, StatusBarAlignment:{Right:1}, ViewColumn:{One:1},
 Uri:{file:p=>({fsPath:p,toString:()=>p})},
 commands:{executeCommand:async()=>{},registerCommand(id,handler){if(id==='codingTools.openVisualGuide')command=handler;return disposable;}},
 workspace:{onDidChangeTextDocument:()=>disposable},
 window:{onDidChangeTextEditorSelection:()=>disposable,onDidChangeActiveTextEditor:()=>disposable,
  createStatusBarItem:()=>({show(){},hide(){},dispose(){}}),
  createWebviewPanel(_id,_title,_column,options){panel={options,dispose(){},onDidDispose(){},reveal(){reveals++;},webview:{cspSource:'test-resource:',asWebviewUri:uri=>'test-resource:'+uri.fsPath.replaceAll('\\','/')}};return panel;},
  showWarningMessage:message=>{throw Error(message);}
 }
};
const mocks={vscode,'./safe-preview':{register(){}},'./settings':{registerSettingsUI(){}},
 './history-view':{makeHistoryUI:()=>({refresh(){}})},'./save-history':{startSaveHistory(){}},
 './git-push-history':{registerGitPushHistory(){}},'./history':{prune:async()=>{}}};
const sandbox={module:{exports:{}},require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id.startsWith('.')?path.join(root,id):id),
 setInterval:()=>({unref(){}}),clearInterval(){},TextDecoder};
vm.runInNewContext(fs.readFileSync(path.join(root,'extension.js'),'utf8'),sandbox,{filename:'extension.js'});
(async()=>{
 sandbox.module.exports.activate({extensionPath:root,subscriptions:[]});
 await command();
 const html=panel.webview.html;
 const resources=[...html.matchAll(/(?:src|srcset|href)="(test-resource:[^"]+)"/g)];
 assert.equal(resources.length,manifest.demos.length*3,'GIF, poster and standalone link must all resolve in Webview');
 for(const [,uri] of resources)assert.ok(fs.existsSync(uri.replace('test-resource:','')),'Missing resource: '+uri);
 assert.ok(html.includes('img-src test-resource: data:'));
 assert.equal(panel.options.enableScripts,false,'GIF guide should work without scripts');
 assert.equal(panel.options.retainContextWhenHidden,true);
 await command();
 assert.equal(reveals,1,'Opening the guide again must reuse its tab');
 console.log('gif-guide-tests: '+manifest.demos.length+' GIFs, '+covered.size+' commands, '+resources.length+' Webview resource references passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
