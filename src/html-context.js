'use strict';

// M03: a snapshot of the HTML source, not the browser's runtime DOM.
// Unknown/incomplete markup is marked partial; consumers must not assume that
// browser repairs, template expansion or computed CSS have been evaluated.
const { findHtmlClasses, findHtmlIds } = require('./selectors');
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const SECTIONING = new Set(['article', 'aside', 'nav', 'section']);
const STRUCTURAL = new Set(['main', 'header', 'footer', 'body']);
const MAX_SOURCE = 2_000_000;
const MAX_ELEMENTS = 10_000;
const MAX_DEPTH = 128;
const MAX_RELATED = 32;

function readTag(text, start) {
  const match = /^<(\/?)([a-zA-Z][\w:-]*)\b/.exec(text.slice(start));
  if (!match) return null;
  let at = start + match[0].length;
  const attrs = Object.create(null);
  const classes = [];
  let dynamic = false;
  while (at < text.length) {
    while (/\s/.test(text[at] || '') && at < text.length) at++;
    if (text[at] === '>' || text.startsWith('/>', at)) {
      return { tag: match[2].toLowerCase(), closing: !!match[1], start,
        openEnd: at + (text[at] === '/' ? 2 : 1), selfClosing: text[at] === '/', attrs, classes, dynamic };
    }
    const name = /^[^\s=/>"'<{}]+/.exec(text.slice(at));
    if (!name) return null;
    const key = name[0].toLowerCase();
    at += name[0].length;
    while (at < text.length && /\s/.test(text[at])) at++;
    let value = '', valueStart = at, literal = true;
    if (text[at] === '=') {
      at++;
      while (at < text.length && /\s/.test(text[at])) at++;
      if (text[at] === '"' || text[at] === "'") {
        const quote = text[at++];
        valueStart = at;
        const end = text.indexOf(quote, at);
        if (end < 0) return null;
        value = text.slice(at, end);
        at = end + 1;
      } else if (text[at] === '{') {
        // Skip JSX expressions without treating their strings as attributes.
        literal = false;
        let depth = 1, quote = '';
        at++;
        for (; at < text.length && depth; at++) {
          const ch = text[at];
          if (quote) {
            if (ch === '\\') at++;
            else if (ch === quote) quote = '';
          } else if ('"\'`'.includes(ch)) quote = ch;
          else if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        if (depth) return null;
      } else {
        valueStart = at;
        while (at < text.length && !/[\s>]/.test(text[at])) at++;
        value = text.slice(valueStart, at);
      }
    }
    if (!literal || /[{}]|<\?|<%/.test(value) || /^(?:v-|:|@)/.test(key)) dynamic = true;
    if (!Object.hasOwn(attrs, key) && literal) {
      attrs[key] = value;
      if ((key === 'class' || key === 'classname') && !/[{}]|<\?|<%/.test(value)) {
        for (const token of value.matchAll(/\S+/g)) classes.push({ name: token[0], start: valueStart + token.index, end: valueStart + token.index + token[0].length });
      }
    }
  }
  return null;
}

function sourceTree(text, languageId) {
  const root = { tag: '#document', children: [], parent: null };
  const stack = [root], nodes = [], issues = new Set();
  if (languageId !== 'html') issues.add('template-source');
  let at = 0;
  while (at < text.length) {
    const start = text.indexOf('<', at);
    if (start < 0) break;
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4);
      if (end < 0) { issues.add('unclosed-comment'); break; }
      at = end + 3; continue;
    }
    if (/^<!doctype\b/i.test(text.slice(start))) {
      const end = text.indexOf('>', start);
      if (end < 0) { issues.add('incomplete-tag'); break; }
      at = end + 1; continue;
    }
    if (text.startsWith('<?', start) || text.startsWith('<%', start)) {
      issues.add('template-source');
      const delimiter = text[start + 1] === '?' ? '?>' : '%>';
      const end = text.indexOf(delimiter, start + 2);
      if (end < 0) break;
      at = end + 2; continue;
    }
    const node = readTag(text, start);
    if (!node) { issues.add('unsupported-markup'); at = start + 1; continue; }
    at = node.openEnd;
    if (node.closing) {
      let index = stack.length - 1;
      while (index > 0 && stack[index].tag !== node.tag) index--;
      if (!index) { issues.add('unmatched-closing-tag'); continue; }
      if (index !== stack.length - 1) issues.add('implicit-or-mismatched-close');
      for (let i = index; i < stack.length; i++) stack[i].end = at;
      stack.length = index;
      continue;
    }
    if (nodes.length >= MAX_ELEMENTS || stack.length > MAX_DEPTH) throw new Error('structure-limit');
    node.parent = stack.at(-1);
    node.children = [];
    node.end = node.openEnd;
    node.parent.children.push(node);
    nodes.push(node);
    if (node.dynamic || node.tag === 'template') issues.add('template-source');
    if (node.tag === 'table' || node.tag === 'svg' || node.tag === 'math') issues.add('browser-tree-rules');
    if (RAW.has(node.tag)) {
      const close = new RegExp('</' + node.tag + '\\s*>', 'ig');
      close.lastIndex = at;
      const found = close.exec(text);
      if (!found) { node.end = text.length; issues.add('unclosed-raw-text'); break; }
      node.end = at = close.lastIndex;
    } else if (!VOID.has(node.tag) && !node.selfClosing) stack.push(node);
    else if (node.selfClosing && !VOID.has(node.tag) && languageId === 'html') issues.add('nonvoid-self-close');
  }
  if (stack.length > 1) {
    issues.add('unclosed-element');
    for (const node of stack.slice(1)) node.end = text.length;
  }
  return { nodes, issues: [...issues] };
}

function describe(node) {
  if (!node || node.tag === '#document') return null;
  return { tag: node.tag, id: node.attrs.id || null, classes: node.classes.map(c => c.name),
    role: node.attrs.role || null, start: node.start, openEnd: node.openEnd, end: node.end };
}

function overviewFor(nodes, name, kind = 'class') {
  const boundary = node => ['section', 'header', 'footer'].includes(node.tag);
  const regionFor = node => {
    for (let cur=node;cur?.tag!=='#document';cur=cur.parent) if(boundary(cur)) return cur;
    return null;
  };
  const occurrences=[];
  const regions=new Set();
  let occurrenceCount=0;
  for(const node of nodes) for(const token of (kind === 'id' ? [{name:node.attrs.id,start:node.start}] : node.classes)) if(token.name===name){
    const region=regionFor(node);
    regions.add(region?.start??null);
    occurrenceCount++;
    if(occurrences.length<128)occurrences.push({start:token.start,region:describe(region)});
  }
  const boundaries=nodes.filter(boundary);
  return {occurrenceCount,regionCount:regions.size,sharedAcrossRegions:regions.size>1,
    occurrences,occurrencesTruncated:occurrenceCount>occurrences.length,
    regions:boundaries.slice(0,256).map(describe),regionsTruncated:boundaries.length>256};
}

function structureFor(text, token, languageId, kind = 'class') {
  const { nodes, issues } = sourceTree(text, languageId);
  const node = nodes.find(n => kind === 'id'
    ? n.attrs.id === token.name && n.start < token.start && token.end <= n.openEnd
    : n.classes.some(c => c.start === token.start && c.end === token.end && c.name === token.name));
  if (!node) return { status: 'unavailable', basis: 'html-source', issues: ['class-element-not-found'] };
  const ancestors = [];
  for (let parent = node.parent; parent?.tag !== '#document'; parent = parent.parent) ancestors.unshift(parent);
  const path = [...ancestors, node];
  const sections = path.filter(n => SECTIONING.has(n.tag));
  const regions = path.filter(n => STRUCTURAL.has(n.tag));
  const siblings = node.parent.children;
  const index = siblings.indexOf(node);
  let roleKind = 'element';
  if (SECTIONING.has(node.tag)) roleKind = 'section';
  else if (STRUCTURAL.has(node.tag)) roleKind = 'structural-region';
  else if (/^h[1-6]$/.test(node.tag)) roleKind = 'heading';
  else if (node.children.length) roleKind = 'container';
  return {
    status: issues.length ? 'partial' : 'source', basis: 'html-source', issues,
    overview: overviewFor(nodes,token.name,kind),
    element: describe(node), parent: describe(node.parent), ancestors: ancestors.map(describe),
    children: node.children.slice(0, MAX_RELATED).map(describe), childCount: node.children.length,
    childrenTruncated: node.children.length > MAX_RELATED,
    siblings: { previous: describe(siblings[index - 1]), next: describe(siblings[index + 1]), index, count: siblings.length },
    sectioning: { current: describe(sections.at(-1)), ancestors: sections.map(describe), regions: regions.map(describe) },
    placementRole: { kind: roleKind, basis: 'html-source', section: describe(sections.at(-1)),
      region: describe(regions.at(-1)), siblingIndex: index, siblingCount: siblings.length,
      cssLayout: null },
  };
}

function htmlCopyContext(text, { name, kind = 'class', start, end = start, source = null, languageId = 'html', documentVersion = null }) {
  const type = kind === 'id' ? {kind:'id'} : {};
  if (text.length > MAX_SOURCE) return { schemaVersion: 1, name, ...type, before: null, after: null, source,
    structure: { status: 'unavailable', basis: 'html-source', issues: ['source-limit'] } };
  const names = kind === 'id' ? findHtmlIds(text) : findHtmlClasses(text);
  const current = names.findIndex(item => item.name === name && (start === end
    ? item.start <= start && start < item.end : item.start === start && item.end === end));
  if (current < 0) return null;
  const prefix = kind === 'class' && name.includes('__') ? name.split('__')[0] + '__' : null;
  let before = null, after = null;
  if (prefix) {
    for (let i = current - 1; i >= 0; i--) if (names[i].name.startsWith(prefix)) { before = names[i].name; break; }
    for (let i = current + 1; i < names.length; i++) if (names[i].name.startsWith(prefix)) { after = names[i].name; break; }
  }
  let structure;
  try { structure = structureFor(text, names[current], languageId, kind); }
  catch (error) { if (error.message !== 'structure-limit') throw error;
    structure = { status: 'unavailable', basis: 'html-source', issues: ['structure-limit'] }; }
  return { schemaVersion: 1, name, ...type, before, after, source, languageId, documentVersion,
    token: { start: names[current].start, end: names[current].end }, structure };
}

module.exports = { htmlCopyContext };
