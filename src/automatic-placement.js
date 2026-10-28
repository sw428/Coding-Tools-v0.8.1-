'use strict';
const placement=require('./placement');
const policy=require('./paste-policy');

function eligible(node){
  if(node.type==='root')return true;
  for(let cur=node;cur.type!=='root';cur=cur.parent){
    if(cur.type!=='at'||!/^@(media|supports|container|layer)\b/.test(cur.prelude))return false;
  }
  return true;
}
function safeAnchor(tree,container,anchor){
  const same=anchor?.container && anchor.container.type===container.type && anchor.container.start===container.start && anchor.container.end===container.end;
  return same && !placement.flatten(tree).some(n=>
    n!==container && n.brace<anchor.offset && anchor.offset<n.end-1);
}
function groupAnchor(tree,container,group,proposed){
  if(safeAnchor(tree,container,proposed) && proposed.offset>=group.start && proposed.offset<=group.end)return {...proposed,container};
  const direct=container.children.filter(n=>n.start>=group.start && n.end<=group.end);
  return {offset:direct.length?direct.at(-1).end:group.start,container};
}
function nearest(groups,offset){
  return [...groups].sort((a,b)=>{
    const distance=g=>offset>=g.start&&offset<=g.end?0:Math.min(Math.abs(offset-g.start),Math.abs(offset-g.end));
    return distance(a)-distance(b)||a.headingStart-b.headingStart;
  })[0];
}
function provisional(context,options){
  const shared=options.pasteFields.includes('overview') && context?.structure?.status==='source' && context.structure.overview?.sharedAcrossRegions;
  const name=shared?'共通':options.pasteFields.includes('naming')?(context?.name||'未分類').split('__')[0]:'未分類';
  const safe=name.replace(/\*\//g,'* /').replace(/[\r\n]/g,' ').slice(0,128);
  const template=options.provisionalTemplate||'/* 仮置き: {name}\n--------------------------------*/';
  return policy.validateComment(template.replaceAll('{name}',safe),'provisionalCommentTemplate');
}
function nextRegionOffset(context,options,comment,groups){
  const overview=context?.structure?.overview;
  if(!options.pasteFields.includes('overview') || !comment?.region || !overview)return null;
  for(const region of overview.regions){
    if(region.start<=comment.region.start)continue;
    const info={name:'',structure:{status:'source',sectioning:{ancestors:region.tag==='section'?[region]:[],regions:['header','footer'].includes(region.tag)?[region]:[]}}};
    const marker=policy.registeredComment(info,options);
    if(!marker||marker.error)continue;
    const matching=groups.filter(g=>policy.commentKey(g.value)===policy.commentKey(marker.value));
    if(matching.length===1)return matching[0].headingStart;
  }
  return null;
}

function automaticPlacement(css,selector,context,options,{offset=css.length,configuredScope=null}={}){
  context=context?.name?context:{...context,name:placement.baseClass(selector)};
  const tree=placement.parseCss(css);
  if(tree.invalid)return {kind:'error',reason:'CSSの括弧が対応していないため、自動挿入を中止します'};
  const cursor=placement.treeAtOffset(tree,offset);
  let container=eligible(cursor)?cursor:tree.root;
  if(configuredScope!==null){
    const scopes=[tree.root,...placement.flatten(tree).filter(n=>n.type==='at'&&eligible(n))].filter(n=>placement.scopeKey(n)===configuredScope);
    if(scopes.length===1)container=scopes[0];
  }
  const scope=placement.scopeKey(container);
  const exact=placement.rules(tree).filter(r=>r.parent===container&&placement.ruleHasExact(r,selector));
  if(exact.length){
    exact.sort((a,b)=>Math.abs(a.start-offset)-Math.abs(b.start-offset)||a.start-b.start);
    return {kind:'jump',rule:exact[0],reason:'同じ適用範囲にある既存ルール'};
  }
  const at=container.type==='root'?0:container.brace+1;
  const plan=placement.candidates(css,selector,policy.placementOptions(context,options,at,css,scope));
  let comment=policy.registeredComment(context,options);
  if(comment?.error && options.addComments)return {kind:'error',reason:comment.error};
  const groups=policy.existingCommentGroups(css,scope,{start:container.brace+1,end:container.type==='root'?css.length:container.end-1});
  const matches=comment&&!comment.error?groups.filter(g=>policy.commentKey(g.value)===policy.commentKey(comment.value)):[];
  let anchor,reason=plan.reason,temporary=false;
  if(matches.length){
    const group=nearest(matches,offset);
    const scoped=placement.candidates(css,selector,{...policy.placementOptions(context,options,at,css,scope),sectionRange:group});
    anchor=groupAnchor(tree,container,group,scoped.anchor);
    reason=scoped.reason||'対応するコメントのまとまり';
  }else if(comment && options.addComments){
    const next=nextRegionOffset(context,options,comment,groups);
    const firstQuery=container.type==='root'?container.children.find(n=>n.type==='at'&&/^@(media|supports|container|layer)\b/.test(n.prelude)):null;
    anchor={offset:next??firstQuery?.start??(container.type==='root'?css.length:container.end-1),container};
    reason='コピー元の領域の目印を作成';
  }else{
    const shared=options.pasteFields.includes('overview')&&context?.structure?.overview?.sharedAcrossRegions;
    const confident=plan.confident && safeAnchor(tree,container,plan.anchor);
    const inferred=!shared&&confident?groups.filter(g=>plan.anchor.offset>=g.start&&plan.anchor.offset<=g.end):[];
    if(inferred.length===1){
      anchor=groupAnchor(tree,container,inferred[0],plan.anchor);comment=null;
    }else if(!options.requireCommentGroup){
      anchor=confident?plan.anchor:{offset:container.type==='root'?css.length:container.end-1,container};comment=null;
    }else if(options.addComments){
      comment=provisional(context,options);temporary=true;
      if(comment.error)return {kind:'error',reason:comment.error};
      const existing=groups.filter(g=>policy.commentKey(g.value)===policy.commentKey(comment.value));
      if(existing.length)anchor=groupAnchor(tree,container,nearest(existing,offset),null);
      else{
        const firstQuery=container.type==='root'?container.children.find(n=>n.type==='at'&&/^@(media|supports|container|layer)\b/.test(n.prelude)):null;
        anchor={offset:firstQuery?.start??(container.type==='root'?css.length:container.end-1),container};
      }
      reason='仮置きの目印の下へ追加';
    }else return {kind:'error',reason:'コメント追加がOFFのため、目印を作成できません。CSSは変更していません。'};
  }
  const insertion=placement.formatInsert(css,selector,anchor);
  const prepared=policy.withSectionComment(css,insertion,container,options.addComments?comment:null);
  return {kind:'insert',...prepared,reason,temporary,scope};
}
module.exports={automaticPlacement};
