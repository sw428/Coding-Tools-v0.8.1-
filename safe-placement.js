'use strict';

/** Fail-closed safety gate for structural CSS insertion.
 * It never modifies old text; it validates a single empty rule, both parsed
 * documents, and preservation of existing semantic CSS nodes.
 * Only standard CSS syntax is supported. SCSS/LESS are intentionally excluded.
 */
const postcss = require('./vendor/postcss');
const placement = require('./placement');

function parse(text) {
  try { return { root:postcss.parse(text,{from:undefined}) }; }
  catch (error) { return { error:error.reason || error.message }; }
}
function flattened(root){
  const items=[];
  root.walk(node=>{
    if(node.type==='rule') items.push({type:'rule',value:node.selector,at:node.source?.start?.offset,node});
    else if(node.type==='atrule') items.push({type:'at',value:node.name+' '+node.params,at:node.source?.start?.offset,node});
    else if(node.type==='decl') items.push({type:'decl',value:node.prop+':'+node.value+':'+(node.important?'important':''),at:node.source?.start?.offset,node});
    else if(node.type==='comment') items.push({type:'comment',value:node.text,at:node.source?.start?.offset,node});
  });
  return items;
}
function reject(reason){return {ok:false,reason};}

/** Preflight runs before any WorkspaceEdit and returns a preview string. */
function preflight(before, selector, insertion, languageId='css'){
  if(languageId!=='css') return reject('安全版の自動配置はCSS専用です。SCSS/LESSには挿入しません。');
  if(typeof before!=='string'||!insertion||!Number.isInteger(insertion.offset)||typeof insertion.text!=='string') return reject('挿入位置を特定できません。');
  if(insertion.offset<0||insertion.offset>before.length) return reject('挿入位置がCSSの範囲外です。');
  if(!placement.isSafeSelector(selector))return reject('CSSセレクタを安全に解析できません。');
  if(before.length>2_000_000)return reject('CSSファイルが2MBを超えるため、安全解析を中止します。');
  const starting=parse(before);
  if(starting.error)return reject('変更前のCSS構文に問題があるため中止: '+starting.error);
  // The scanner must agree that the bracing is balanced. Its limits are
  // intentionally conservative; unknown syntaxes are not automatically edited.
  if(placement.parseCss(before).invalid)return reject('CSSのブロック構造を解析できません。');
  const addition=parse(insertion.text);
  if(addition.error)return reject('挿入するCSSに構文エラーがあります: '+addition.error);
  const added=flattened(addition.root);
  const newRules=added.filter(x=>x.type==='rule');
  const newAt=added.filter(x=>x.type==='at');
  if(newRules.length!==1||newRules[0].value.trim()!==selector.trim() ||
      newRules[0].node.nodes.length!==0 ||
      added.some(x=>x.type==='decl'||x.type==='comment') ||
      newAt.length>1 ||
      newAt.some(x=>x.node.name!=='media'))
    return reject('追加できるのは空のCSSルール1件（または新規@media内の1件）だけです。');
  if(newAt.length && (addition.root.nodes.length!==1 || addition.root.nodes[0].type!=='atrule'))
    return reject('新しい@mediaの構造が不明確です。');
  const after=before.slice(0,insertion.offset)+insertion.text+before.slice(insertion.offset);
  const ending=parse(after);
  if(ending.error)return reject('挿入後にCSS構文エラーが生じるため中止: '+ending.error);
  if(placement.parseCss(after).invalid)return reject('挿入後のブロック構造が不明確です。');

  const original=flattened(starting.root);
  const subsequent=flattened(ending.root);
  const zoneStart=insertion.offset;
  const zoneEnd=insertion.offset+insertion.text.length;
  // The added rule must actually be recognised at the inserted location.
  // The original nodes must survive, in the same order, with matching parent
  // ancestry (so a wrongly nested insertion cannot silently change scope).
  const newItems=subsequent.filter(x=>x.at>=zoneStart && x.at<zoneEnd);
  const addedSignatures=newItems.map(x=>x.type+':'+x.value);
  const expected=added.map(x=>x.type+':'+x.value);
  if(addedSignatures.length!==expected.length || expected.some((v,i)=>addedSignatures[i]!==v))
    return reject('追加されたルールの構造を確認できません。');
  const oldItems=subsequent.filter(x=>!(x.at>=zoneStart&&x.at<zoneEnd));
  const describe = entry => {
    const path=[];let node=entry.node.parent;
    while(node&&node.type!=='root'){
      path.unshift(node.type==='atrule'?'@'+node.name+' '+node.params:node.type==='rule'?node.selector:node.type);
      node=node.parent;
    }
    return entry.type+':'+entry.value+' ['+path.join(' / ')+']';
  };
  if(original.length!==oldItems.length || original.some((x,i)=>describe(x)!==describe(oldItems[i])))
    return reject('既存ルールの構造・順序が変わるため中止します。');
  return {ok:true,after, addedRule:selector, delta:insertion.text};
}
module.exports={preflight};
