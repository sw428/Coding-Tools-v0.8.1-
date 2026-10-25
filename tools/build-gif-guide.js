'use strict';
// Windows / Node.js only. System.Drawing is supplied by Windows PowerShell.
// These are illustrative animations, never a recording of the VS Code extension host.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(__dirname,'gif-guide-manifest.json'),'utf8'));
const dest = path.join(root,'docs','media','gif');
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = [...new Set(source.demos.map(d=>d.category))];
function guide(prefix){
 const nav=categories.map((name,i)=>'<a href="#category-'+i+'">'+escape(name)+'</a>').join('');
 const sections=categories.map((name,i)=>'<section class="category" id="category-'+i+'"><h2>'+escape(name)+'</h2>'+source.demos.filter(d=>d.category===name).map(d=>{
  const file=d.id+'-'+d.slug;
  const key=d.key==='コマンドパレットから実行'?'コマンドパレットから「'+(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).contributes.commands.find(c=>c.command===d.commands[0])?.title||d.title)+'」を実行':d.key;
  return '<details name="coding-tools-operation" id="operation-'+d.id+'"'+(d.id==='01'?' open':'')+'><summary><span class="number">'+d.id+'</span><span>'+escape(d.title)+'</span><span class="expand" aria-hidden="true">＋</span></summary><div class="body"><p class="description">'+escape(d.description)+'</p><div class="keys"><span>Windows</span><kbd>'+escape(key)+'</kbd></div>'+(d.mac!==d.key?'<div class="keys"><span>Mac</span><kbd>'+escape(d.mac)+'</kbd></div>':'')+'<ol class="steps">'+d.steps.map(s=>'<li>'+escape(s.action)+'</li>').join('')+'</ol><picture><source media="(prefers-reduced-motion: reduce)" srcset="'+prefix+file+'.png"><img src="'+prefix+file+'.gif" width="1120" height="700" loading="'+(d.id==='01'?'eager':'lazy')+'" alt="'+escape(d.title)+'。'+escape(d.description)+'"></picture><div class="caption"><span>GIFは自動で繰り返します。</span><a href="'+prefix+file+'.gif" target="_blank" rel="noopener">GIFを単独で開く ↗</a></div>'+(d.note?'<p class="note">'+escape(d.note)+'</p>':'')+'</div></details>';
 }).join('')+'</section>').join('');
 return '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Coding Tools｜1操作ずつ見るGIFガイド</title><style>\n'+
 '*{box-sizing:border-box}html{scroll-padding-top:20px}body{margin:0;background:#f0f4fa;color:#192e4b;font:16px/1.75 system-ui,"Meiryo UI",sans-serif}header,main,footer{max-width:1168px;margin:auto;padding:28px 24px}header{padding-top:48px;padding-bottom:16px}.eyebrow{color:#235eb3;font-size:14px;font-weight:700;letter-spacing:.06em}h1{font-size:clamp(25px,4vw,38px);line-height:1.4;margin:9px 0 14px}p{margin:10px 0}.intro{color:#425770}.meta{font-size:14px;color:#63758c}.notice{padding:12px 16px;border-left:3px solid #8097b5;background:#e6edf7;font-size:14px;color:#3d536d}.nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.nav a{background:#fff;border:1px solid #cbd7e7;border-radius:20px;padding:6px 15px;text-decoration:none;color:#285c9c;font-size:14px}.category{margin:0 0 38px}.category h2{font-size:22px;margin:0 0 14px}details{background:white;border:1px solid #d2dce9;border-radius:12px;margin:9px 0;overflow:hidden}details[open]{border-color:#7198d4;box-shadow:0 6px 18px #1d4b8220}summary{display:flex;align-items:center;gap:14px;padding:17px 20px;cursor:pointer;font-weight:650;line-height:1.5;list-style:none}summary::-webkit-details-marker{display:none}summary:hover{background:#f5f8fd}summary:focus-visible,a:focus-visible{outline:3px solid #2474d6;outline-offset:-3px}.number{font:700 14px/1.6 Consolas,monospace;background:#eaf1fc;color:#245da7;border-radius:6px;padding:3px 9px}.expand{margin-left:auto;font-size:22px;color:#56718f}details[open] .expand{transform:rotate(45deg)}.body{padding:0 20px 20px}.description{margin:0 0 13px;color:#3d526c}.steps{margin:16px 0 8px;padding-left:24px;color:#425770;font-size:15px}.steps li{margin:6px 0}.keys{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:6px 0;font-size:14px}.keys>span{width:64px;color:#64768e}kbd{font:inherit;color:#24466d;background:#edf3fb;padding:3px 9px;border-radius:5px;overflow-wrap:anywhere}picture{display:block;margin-top:16px}img{display:block;width:100%;height:auto;background:#1e1e1e;border:1px solid #cdd9e8;border-radius:7px}.caption{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:#63758c;margin:8px 0}.caption a{color:#285da9}.note{font-size:14px;color:#536781;background:#f2f5fa;padding:10px 13px;border-radius:6px}footer{padding-top:0;color:#62748a;font-size:13px}@media(max-width:600px){header,main,footer{padding-left:14px;padding-right:14px}header{padding-top:28px}summary{padding:14px 12px;gap:9px}.body{padding:0 10px 14px}.keys>span{width:60px}}\n'+
 '</style></head><body><header><div class="eyebrow">CODING TOOLS · GIF GUIDE</div><h1>1操作ずつ、動きで見る。</h1><p class="intro">見たい操作の見出しを開くと、そのGIFが再生されます。操作前 → キーやボタン → 結果を、1本ずつ確認できます。</p><p class="meta">全'+source.demos.length+'本 · v'+escape(source.version)+' β · '+escape(source.date)+'</p><p class="notice">すべて操作説明用の仮想画面です。実機録画や動作確認の記録ではありません。キーは初期割り当ての例です。</p><nav class="nav" aria-label="操作の種類">'+nav+'</nav></header><main>'+sections+'</main><footer>動きを減らす設定では静止画を表示します。動きを見たい場合は「GIFを単独で開く」を選んでください。</footer></body></html>\n';
}
fs.mkdirSync(dest,{recursive:true});
if (!process.argv.includes('--docs-only')) execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'render-gif-guide.ps1'),'-Manifest',path.join(__dirname,'gif-guide-manifest.json'),'-OutputDirectory',dest],{cwd:root,stdio:'inherit',windowsHide:true});
fs.writeFileSync(path.join(root,'docs','visual-guide.html'),guide('media/gif/'));
fs.writeFileSync(path.join(dest,'index.html'),guide(''));

function markdownGuide(){
 let text='# Coding Tools｜GIFで詳しく見る使い方\n\n';
 text+='[1操作ずつ見るブラウザ版](visual-guide.html)\n\n';
 text+='全'+source.demos.length+'本のGIFです。各操作に、使うキー・手順・結果をまとめています。画面のコードは操作例です。\n\n';
 text+='## いつでも開くには\n\n';
 text+='- このリポジトリのREADMEにある「GIFで使い方を見る」から開けます。\n';
 text+='- VS Codeではこのファイルを開き、Markdownプレビューで読めます（Windows: Ctrl + Shift + V / Mac: Cmd + Shift + V）。\n';
 text+='- 更新版のCoding Toolsでは、エクスプローラーの「Coding Tools 設定」→「GIFで使い方を確認」から開けます。設定欄上部の本のアイコンからも開けます。\n';
 text+='- コマンドパレットから「Coding Tools: GIFで使い方ガイドを開く（1操作ずつ）」でも開けます。\n\n';
 text+='コマンドパレットはWindowsでは Ctrl + Shift + P、Macでは Cmd + Shift + P で開きます。表示された検索欄にコマンド名を入力してください。\n\n';
 text+='## 操作前の準備\n\n';
 text+='1. Coding Toolsを有効にします。\n2. HTMLとCSSが入ったフォルダーをVS Codeで開きます。\n3. 移動・コピー・貼り付けの操作では、対象のエディタをクリックしてからキーを押します。\n4. GIF内のcardなどは例です。自分のファイルでは、自分のクラス名に読み替えてください。\n\n';
 text+='操作説明用の仮想画面です。実機録画や動作検証の記録ではありません。キーは初期割り当てです。自分で変更した場合は、変更後のキーを使ってください。\n\n';
 text+='通常のCtrl + C / Ctrl + Vは標準のままです。GIFで使う専用コマンドと区別してください。\n\n';
 for(const category of categories){
  text+='## '+category+'\n\n';
  for(const d of source.demos.filter(d=>d.category===category)){
   const command=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).contributes.commands.find(c=>c.command===d.commands[0]);
   text+='### '+d.id+' '+d.title+'\n\n'+d.description+'\n\n';
   if(d.key==='コマンドパレットから実行')text+='**開き方：** コマンドパレットで「Coding Tools: '+(command?.title||d.title)+'」を実行します。\n\n';
   else {text+='**Windows：** '+d.key+'\n\n';if(d.mac!==d.key)text+='**Mac：** '+d.mac+'\n\n';}
   d.steps.forEach((s,i)=>{text+=(i+1)+'. '+s.action+'。\n';});
   text+='\n![操作GIF：'+d.title+'](media/gif/'+d.id+'-'+d.slug+'.gif)\n\n';
   if(d.note)text+='**補足：** '+d.note+'\n\n';
  }
 }
 text+='## 困ったとき\n\n';
 text+='- GIFが動かない：ブラウザ版を開き、「GIFを単独で開く」を選んでください。ブラウザやOSの「動きを減らす」が有効な場合、ガイド内では静止画になります。\n';
 text+='- キーが反応しない：HTML/CSSのエディタにカーソルを戻し、キーボードショートカット一覧で割り当てと競合を確認してください。\n';
 text+='- ジャンプできない：HTMLとCSSを含むフォルダーをVS Codeで開き、クラス名全体を選ぶか、そのクラス名にカーソルを置いてください。\n';
 text+='- 貼り付け枠が空：先に同じ番号のコピー操作を実行してください。\n';
 text+='- CSS追加が止まる：CSS構文と対応形式を確認してください。SCSS/LESSの自動配置は対象外です。\n';
 text+='- 履歴が出ない：記録の設定をONにし、対象の編集・保存・Coding Tools経由のpushを行ってください。コピーだけでは差分履歴は増えません。\n';
 return text;
}
fs.writeFileSync(path.join(root,'docs','GIF_GUIDE.md'),markdownGuide());


// VS Code displays README.md in the extension's Details tab.
// Keep the embedded demos in sync with the same manifest as the full guide.
function extensionDetailsGuide(){
 let text='## GIFで使い方を見る\n\n';
 text+='拡張機能の「詳細」で、各GIFと1行説明をそのまま確認できます。全'+source.demos.length+'本です。\n\n';
 text+='操作説明用の仮想画面です。実機録画ではありません。\n\n';
 text+='キーや詳しい手順は、コマンド「Coding Tools: GIFで使い方ガイドを開く（1操作ずつ）」から確認できます。\n\n';
 for(const category of categories){
  text+='### '+category+'\n\n';
  for(const d of source.demos.filter(d=>d.category===category)){
   text+='#### '+d.id+' '+d.title+'\n\n';
   text+='![操作GIF：'+d.title+']('+source.readmeImageBaseUrl+d.id+'-'+d.slug+'.gif)\n\n';
   text+=d.description.replace(/\s*\n\s*/g,' ')+'\n\n';
  }
 }
 return text.trimEnd();
}
const readmePath=path.join(root,'README.md');
const readme=fs.readFileSync(readmePath,'utf8');
const detailsStart='<!-- BEGIN EXTENSION GIF DETAILS -->';
const detailsEnd='<!-- END EXTENSION GIF DETAILS -->';
const startIndex=readme.indexOf(detailsStart);
const endIndex=readme.indexOf(detailsEnd);
if(startIndex===-1||endIndex<startIndex)throw new Error('README extension GIF details markers are missing.');
fs.writeFileSync(readmePath,readme.slice(0,startIndex)+detailsStart+'\n'+extensionDetailsGuide()+'\n'+readme.slice(endIndex));

console.log('Guide replaced with '+source.demos.length+' single-operation GIFs.');
