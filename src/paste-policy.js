'use strict';
const postcss = require('./vendor/postcss');
const placement = require('./placement');

function validateComment(text, key) {
  if (typeof text !== 'string' || text.length > 2000) return { error: '登録コメントは2000文字以内のCSSコメントにしてください。' };
  try {
    const root = postcss.parse(text);
    if (root.nodes.length !== 1 || root.nodes[0].type !== 'comment') throw new Error();
    return { key, text: text.trim(), value: root.nodes[0].text };
  } catch (_) { return { error: `「${key}」には /* ... */ 形式のCSSコメントを1つ登録してください。` }; }
}
const commentKey = text => text.trim().replace(/\s+/g, ' ').toLowerCase();

function registeredComment(context, options) {
  if (!options.pasteFields.includes('section')) return null;
  const s = context?.structure;
  // Partial source trees must not create section comments in the wrong group.
  if (s?.status !== 'source' || !s.sectioning) return null;
  const nodes = [...s.sectioning.ancestors, ...s.sectioning.regions].sort((a, b) => b.start - a.start);
  const selector = (context.kind === 'id' ? '#' : '.') + context.name;
  if(Object.hasOwn(options.comments,selector))return validateComment(options.comments[selector],selector);
  if(options.pasteFields.includes('overview') && s.overview?.sharedAcrossRegions)return null;
  for (const node of nodes) {
    const keys = [node.id && '#' + node.id, ...node.classes.map(c => '.' + c), node.tag].filter(Boolean);
    for (const key of keys) if (Object.hasOwn(options.comments, key)) {
      return {...validateComment(options.comments[key], key),region:node};
    }
  }
  // Aside/article/nav remain structural information. Automatic heading comments
  // are reserved for the three boundaries used by this workflow.
  const node=nodes.find(n=>['section','header','footer'].includes(n.tag));
  if(node && options.commentTemplate){
    if(!options.commentTemplate.includes('{name}'))return {error:'コメント書式には領域名を入れる {name} を含めてください。'};
    const name=(['header','footer'].includes(node.tag)?node.tag:node.classes[0]||node.id||node.tag)
      .replace(/\*\//g,'* /').replace(/[\r\n]/g,' ').slice(0,128);
    return {...validateComment(options.commentTemplate.replaceAll('{name}',name),'sectionCommentTemplate'),region:node};
  }
  return null;
}

function sameScopeComment(node, scope) {
  const parents = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type !== 'atrule') return false;
    parents.unshift('@' + p.name + ' ' + p.params);
  }
  return parents.join(' |> ').replace(/\s+/g, ' ').trim() === scope.replace(/\s+/g, ' ').trim();
}

function commentGroup(css, comment, scope, range=null) {
  if (!comment || comment.error) return null;
  try {
    const root = postcss.parse(css), comments = [];
    root.walkComments(node => { if (sameScopeComment(node, scope) && (!range || node.source.start.offset>=range.start && node.source.end.offset<=range.end)) comments.push(node); });
    const found = comments.filter(node => commentKey(node.text) === commentKey(comment.value));
    // Repeated markers are ambiguous; do not claim a unique section range.
    if (found.length !== 1) return { exists: found.length > 0 };
    const node = found[0], index = comments.indexOf(node);
    return { exists: true, start: node.source.end.offset,
      end: comments[index + 1]?.parent===node.parent ? comments[index + 1].source.start.offset : node.parent.type==='root'?css.length:node.parent.source.end.offset-1 };
  } catch (_) { return null; }
}

function existingCommentGroups(css, scope = '', range=null) {
  try {
    const root = postcss.parse(css), comments = [];
    root.walkComments(node => { if (sameScopeComment(node, scope) && (!range || node.source.start.offset>=range.start && node.source.end.offset<=range.end)) comments.push(node); });
    return comments.map((node, index) => ({
      label: node.text.replace(/\s+/g, ' ').trim().slice(0, 100) || '空のコメント',
      value:node.text,headingStart:node.source.start.offset,
      start: node.source.end.offset,
      end: comments[index + 1]?.parent===node.parent ? comments[index + 1].source.start.offset : node.parent.type==='root'?css.length:node.parent.source.end.offset-1,
      line: node.source.start.line,
    }));
  } catch (_) { return []; }
}

function placementOptions(context, options, offset, css, scope = '') {
  const enabled = new Set(options.pasteFields), s = context?.structure;
  // Source relationships are hints only when the whole source scan succeeded.
  const shared=enabled.has('overview') && s?.overview?.sharedAcrossRegions;
  const relations = s?.status === 'source' && !shared ? s : null;
  const comment = registeredComment(context, options);
  const group = commentGroup(css, comment, scope);
  return { offset, neighbors: enabled.has('neighbors') && !shared && context?.kind !== 'id' ? context || {} : {}, useNaming: enabled.has('naming'),
    siblingClasses: enabled.has('siblings') && relations?.siblings ? {
      before: relations.siblings.previous?.classes || [], after: relations.siblings.next?.classes || [],
    } : null,
    parentClasses: enabled.has('parent') ? relations?.parent?.classes || [] : [],
    sectionRange: group?.start != null ? group : null,
    comment, commentExists: group?.exists === true };
}

function withSectionComment(css, insertion, container, comment) {
  if (!comment || comment.error) return { insertion, commentText: null };
  const group = commentGroup(css, comment, placement.scopeKey(container), {start:container.brace+1,end:container.type==='root'?css.length:container.end-1});
  if (group?.exists) return { insertion, commentText: null };
  const eol = css.includes('\r\n') ? '\r\n' : '\n';
  // Put the registered comment immediately before the one new empty rule.
  const match = /^(\s*)([.#][\s\S]*)$/.exec(insertion.text);
  if (!match) return { insertion, commentText: null };
  const indent = /(?:^|\n)([ \t]*)$/.exec(match[1])?.[1] || '';
  const rendered = comment.text.replace(/\r?\n/g, eol + indent);
  const text = match[1] + rendered + eol + eol + indent + match[2];
  return { insertion: { ...insertion, text }, commentText: postcss.parse(rendered).first.text };
}

module.exports = { validateComment, commentKey, registeredComment, commentGroup, existingCommentGroups, placementOptions, withSectionComment };
