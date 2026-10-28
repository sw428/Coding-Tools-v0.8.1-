'use strict';

/** Conservative, dependency-free CSS structure scanner and insertion planner.
 * We never rewrite/move existing rules. Uncertain positions return choices.
 * Not a full CSS/SCSS parser; callers must handle "unsafe" conservatively.
 */
function mask(source) {
  const chars = source.split('');
  let quote = '', comment = false, escape = false;
  for (let i = 0; i < chars.length; i++) {
    const c = source[i], n = source[i + 1];
    if (comment) {
      if (c === '*' && n === '/') { chars[i] = chars[i+1] = ' '; i++; comment = false; }
      else if (c !== '\r' && c !== '\n') chars[i] = ' ';
    } else if (quote) {
      if (escape) { escape = false; if (c !== '\r' && c !== '\n') chars[i] = ' '; continue; }
      if (c === '\\') { escape = true; chars[i] = ' '; continue; }
      if (c === quote) quote = '';
      if (c !== '\r' && c !== '\n') chars[i] = ' ';
    } else if (c === '/' && n === '*') { chars[i] = chars[i+1] = ' '; i++; comment = true; }
    else if (c === '"' || c === "'") { quote = c; chars[i] = ' '; }
  }
  return chars.join('');
}

function parseCss(text) {
  const clean = mask(text);
  const root = {type:'root', start:0, brace:-1, end:text.length, children:[], parent:null};
  let parent = root, from = 0, invalid = false, depth = 0;
  for (let i=0; i<clean.length; i++) {
    const c=clean[i];
    if (c==='(' || c==='[') depth++;
    if ((c===')' || c===']') && depth) depth--;
    if (depth) continue;
    if (c === '{') {
      // Leading comments belong to the original text, not to the selector.
      const start = from + Math.max(0,clean.slice(from,i).search(/\S/));
      const prelude = text.slice(start,i).trim();
      const type = prelude.startsWith('@') ? 'at' : 'rule';
      // invalid declaration object / unknown block: never edit inside automatically
      const node = {type, prelude, start, brace:i, end:null, parent, children:[]};
      parent.children.push(node); parent=node; from=i+1;
    } else if (c === ';') { from=i+1; }
    else if (c === '}') {
      if (parent===root) { invalid=true; continue; }
      parent.end=i+1; parent=parent.parent; from=i+1;
    }
  }
  if (parent!==root || depth!==0) invalid=true;
  return {root, invalid};
}

function flatten(tree) {
  const nodes=[];
  (function walk(node) { for (const child of node.children) { nodes.push(child); walk(child); } })(tree.root);
  return nodes;
}
function scope(node) {
  const at=[]; let cur=node;
  while (cur && cur.type!=='root') {
    if (cur.type==='at') at.unshift(cur);
    cur=cur.parent;
  }
  return at;
}
function scopeKey(node) { return scope(node).map(n=>n.prelude.replace(/\s+/g,' ').trim()).join(' |> '); }
function effectiveContainer(node) { let cur=node.parent; while(cur && cur.type!=='root' && cur.type!=='at')cur=cur.parent; return cur; }
function scopeLabel(node) { return scopeKey(node) || '基本（@media 外）'; }
function rules(tree) { return flatten(tree).filter(n=>n.type==='rule' && n.end!==null); }
function atRules(tree, kind) { return flatten(tree).filter(n=>n.type==='at' && n.end!==null && n.prelude.startsWith('@'+kind)); }
function normalize(s) {return s.replace(/\s+/g,' ').trim();}
function exactSelectors(rule) {
  const parts=[];let from=0,depth=0;
  for(let i=0;i<rule.prelude.length;i++) {
    const c=rule.prelude[i];
    if(c==='('||c==='[')depth++;
    else if((c===')'||c===']')&&depth)depth--;
    else if(c===','&&!depth){parts.push(normalize(rule.prelude.slice(from,i)));from=i+1;}
  }
  parts.push(normalize(rule.prelude.slice(from)));
  return parts;
}
function ruleHasExact(rule, target) { return exactSelectors(rule).includes(normalize(target)); }

function baseClass(selector) {
  const match=selector.match(/\.(-?[_a-zA-Z\u0080-\uFFFF][\w\-\u0080-\uFFFF]*)/);
  return match ? match[1] : null;
}
function category(selector) {
  if (/(?:\s|\+|~|>)(?:\.|#|[a-z*\[])/.test(selector.trim().replace(/^\.[\w-]+/,''))) return 1;
  if (/:nth-(?:child|of-type)|:(?:first|last|only)-(?:child|of-type)/.test(selector)) return 2;
  if (/:hover|:focus|:active|:disabled|:checked|:has\(|:not\(|:is\(|:where\(|:focus-visible|\.is-/.test(selector)) return 4;
  if (/::(?:before|after|marker)|:(?:before|after)\b/.test(selector)) return 3;
  return 0;
}
function isSafeSelector(text) {
  const s=text.trim();
  // CSS selector fragments copied from HTML or stylesheet. Don't inject declarations/blocks.
  return !!s && s.length<300 && !/[{};\r\n]/.test(s) && /^([.#][\w-]+|[a-z][\w-]*(?:\.|\[|:|\s|>|\+|~))[\s\S]*$/i.test(s);
}
function selectorFromClipboard(text, knownClass) {
  if (knownClass && text.trim()===knownClass) return '.'+knownClass;
  if (isSafeSelector(text) && /^[.#]/.test(text.trim())) return text.trim();
  // A copied type selector with an explicit pseudoclass (e.g. p:nth-of-type(2))
  // is eligible for the explicit Ctrl+Alt+P workflow, never intercepted by Ctrl+V.
  if(isSafeSelector(text) && /^[a-z][\w-]*(?:[:\[])/i.test(text.trim())) return text.trim();
  return null;
}
function indentation(text, atNode) {
  if (!atNode || atNode.type==='root') return '';
  const from=text.lastIndexOf('\n',atNode.start-1)+1;
  const ws=/^[ \t]*/.exec(text.slice(from,atNode.start))[0];
  const child=text.slice(atNode.brace+1, atNode.end-1).match(/(?:^|\n)([ \t]+)\S/);
  return child ? child[1] : ws + (ws.includes('\t') ? '\t' : '  ');
}
function lineEnding(text) { return text.includes('\r\n')?'\r\n':'\n'; }
function insertText(text, atOffset, selector, container) {
  const eol=lineEnding(text), indent=indentation(text,container);
  const line=indent+selector+' {'+eol+indent+'}';
  const before=text.slice(0,atOffset), after=text.slice(atOffset);
  // Append adjacent to an existing rule at a structural boundary.
  const pre=before && !/\n\s*$/.test(before) ? eol+eol : before && !/\n\s*\n\s*$/.test(before) ? eol : '';
  const post=after && !/^\s*\n/.test(after) ? eol+eol : eol;
  return {offset:atOffset, text:pre+line+post};
}

function treeAtOffset(tree, offset) {
  let found=tree.root;
  for (const n of flatten(tree)) if (n.type==='at' && n.brace < offset && offset <= n.end-1) {
    if ((n.end-n.start) < (found.end-found.start)) found=n;
  }
  return found;
}
function candidates(text, selector, options={}) {
  const tree=parseCss(text);
  if (tree.invalid) return {safe:false,reason:'CSSの括弧が対応していないため、自動挿入を中止します',tree,items:[]};
  const all=rules(tree), allExact=all.filter(r=>ruleHasExact(r,selector));
  const current=options.offset==null ? tree.root : treeAtOffset(tree,options.offset);
  const scopeFilter=n=>scopeKey(n)===scopeKey(current);
  let inScope=all.filter(scopeFilter);
  if (options.sectionRange) inScope=inScope.filter(r=>r.start>=options.sectionRange.start && r.end<=options.sectionRange.end);
  const exactHere=allExact.filter(scopeFilter);
  const className=baseClass(selector);
  const part=className && className.includes('__') ? className.split('__')[0] : null;
  const family=className && className.includes('--') ? className.split('--')[0] : className;
  let related=options.useNaming===false?[]:inScope.filter(r=> {
    const names=[...r.prelude.matchAll(/\.(-?[_a-zA-Z\u0080-\uFFFF][\w\-\u0080-\uFFFF]*)/g)].map(m=>m[1]);
    return names.some(n=>n===family || n===className || (part && (n===part || n.startsWith(part+'__'))) || (family && n.startsWith(family+'--')));
  });
  const neighborClasses=options.neighbors||{};
  const before=neighborClasses.before && inScope.find(r=>ruleHasExact(r,'.'+neighborClasses.before));
  const after=neighborClasses.after && inScope.find(r=>ruleHasExact(r,'.'+neighborClasses.after));
  const uniqueRule=names=>{
    const matches=inScope.filter(r=>names.some(name=>ruleHasExact(r,'.'+name)));
    return matches.length===1?matches[0]:null;
  };
  const siblingBefore=uniqueRule(options.siblingClasses?.before||[]);
  const siblingAfter=uniqueRule(options.siblingClasses?.after||[]);
  const parentRule=uniqueRule(options.parentClasses||[]);
  let anchor=null, why='', confident=false;
  if (before && after && before.end<=after.start && before.parent===after.parent) {
    anchor={offset:before.end,container:effectiveContainer(before)};
    why='HTMLで前後にあるクラスのCSSルール間'; confident=true;
  } else if (siblingBefore && siblingAfter && siblingBefore.end<=siblingAfter.start && siblingBefore.parent===siblingAfter.parent) {
    anchor={offset:siblingBefore.end,container:effectiveContainer(siblingBefore)};
    why='HTMLで前後の兄弟要素にあるクラスのCSSルール間';confident=true;
  } else if (siblingBefore && !siblingAfter) {
    anchor={offset:siblingBefore.end,container:effectiveContainer(siblingBefore)};
    why='HTMLで直前の兄弟要素にあるクラスのCSSルール後';confident=true;
  } else if (siblingAfter && !siblingBefore) {
    anchor={offset:siblingAfter.start,container:effectiveContainer(siblingAfter)};
    why='HTMLで直後の兄弟要素にあるクラスのCSSルール前';confident=true;
  } else if (related.length) {
    // The same logical family must be contiguous; otherwise ordering is uncertain.
    const indices=related.map(r=>inScope.indexOf(r));
    const contiguous=Math.max(...indices)-Math.min(...indices)+1===related.length;
    if (contiguous && related.every(r=>effectiveContainer(r)===effectiveContainer(related[0]))) {
      const rank=category(selector);
      const prev=related.filter(r=>category(r.prelude)<=rank);
      const where=(prev.length ? prev.at(-1) : related[0]);
      anchor={offset:prev.length ? where.end : where.start,container:effectiveContainer(where)};
      why=part ? `.${part} に関連するセレクタ群の中` : '同じ部品の基本・関係・位置・状態の並び';
      confident=true;
    } else why='関連ルールが離れているため、挿入位置を確定できない';
  }
  if (!anchor && parentRule) {
    anchor={offset:parentRule.end,container:effectiveContainer(parentRule)};
    why='HTMLの親要素にあるクラスのCSSルール後';confident=true;
  }
  if (!anchor && options.sectionRange) {
    const direct=inScope.filter(rule=>rule.parent===current);
    anchor={offset:direct.length?direct.at(-1).end:options.sectionRange.start,container:current};
    why='登録済みのセクションコメントの範囲内';confident=true;
  }
  if (!anchor && inScope.length===0 && current.type==='at' && current.prelude.startsWith('@media')) {
    anchor={offset:current.end-1,container:current};why='選択中のメディアクエリ末尾';confident=true;
  }
  if (!anchor && all.length===0 && current.type==='root') {
    anchor={offset:text.length,container:tree.root};why='空のスタイルシート末尾';confident=true;
  }
  if (!anchor && current.type==='at' && current.prelude.startsWith('@media')) {
    anchor={offset:current.end-1,container:current};why='現在カーソルがあるメディアクエリ末尾';confident=false;
  }
  return {safe:true,tree,current,exactHere,allExact,related,anchor,reason:why,confident,
    // A unique matching rule in same scope is always the safest suggestion.
    preferred:exactHere.length===1?'existing':allExact.length?'choose':anchor&&confident?'insert':'choose'};
}
function insertionAtEndOfScope(text,scopeNode) {
  const root=scopeNode.type==='root';
  const offset=root ? text.length : scopeNode.end-1;
  return insertText(text,offset,null,scopeNode);
}
function formatInsert(text,selector,anchor) {return insertText(text,anchor.offset,selector,anchor.container);}
function wrapNewMedia(text,selector,media) {
  if (!/^@media\s+[^{};\r\n]+$/.test(media.trim())) return null;
  const eol=lineEnding(text);
  const insert=(text.endsWith(eol)||!text ? '' : eol) + eol + media.trim()+' {'+eol+'  '+selector+' {'+eol+'  }'+eol+'}'+eol;
  return {offset:text.length,text:insert};
}
module.exports={parseCss,flatten,rules,atRules,scope,scopeKey,scopeLabel,ruleHasExact,baseClass,category,selectorFromClipboard,isSafeSelector,candidates,formatInsert,insertText,wrapNewMedia,treeAtOffset};
